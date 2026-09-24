/**
 * Unit tests for apiPatch, editChild, and deleteChild (lib/api.ts).
 *
 * These functions call `fetch` and read from `expo-secure-store`, so both
 * are mocked at the module boundary. The 401 auto-clear-JWT contract in
 * `handleResponse` is verified via the SecureStore.deleteItemAsync mock.
 *
 * We also verify the Sentry `reportError` policy from Ticket 2:
 *   - 401 → NOT reported (expected auth path)
 *   - 5xx → REPORTED
 *
 * Note on path building: editChild/deleteChild URL-encode the `id` to
 * safely inject it into the path. Tests verify that spaces encode to %20
 * and slashes to %2F, preventing URL injection or malformed paths.
 */

// ── Mocks: must be declared before the SUT import ─────────────────────────

const mockGetItemAsync = jest.fn<Promise<string | null>, [string]>();
const mockSetItemAsync = jest.fn<Promise<void>, [string, string]>();
const mockDeleteItemAsync = jest.fn<Promise<void>, [string]>();

jest.mock("expo-secure-store", () => ({
  getItemAsync: (key: string) => mockGetItemAsync(key),
  setItemAsync: (key: string, value: string) => mockSetItemAsync(key, value),
  deleteItemAsync: (key: string) => mockDeleteItemAsync(key),
}));

const mockReportError = jest.fn<void, [unknown, Record<string, unknown>?]>();

jest.mock("../../lib/sentry", () => ({
  reportError: (err: unknown, ctx?: Record<string, unknown>) =>
    mockReportError(err, ctx),
  initSentry: jest.fn(),
  isSentryEnabled: () => false,
}));

// SUT — imported AFTER the mocks above are registered.
import {
  apiPatch,
  editChild,
  deleteChild,
  deleteWeeklyPlan,
  BASE_URL_KEY,
  JWT_KEY,
} from "../../lib/api";

// ── Test fixtures / helpers ────────────────────────────────────────────────

const BASE_URL = "https://fsskitchen.lunchpad.us";
const JWT = "test-jwt-token";

/** Wire SecureStore mocks to return a valid base URL + JWT by default. */
function primeSecureStore(): void {
  mockGetItemAsync.mockImplementation(async (key: string) => {
    if (key === BASE_URL_KEY) return BASE_URL;
    if (key === JWT_KEY) return JWT;
    return null;
  });
}

/** Build a Response with the given status + body. */
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

let fetchSpy: jest.SpyInstance<Promise<Response>, [RequestInfo | URL, RequestInit?]>;

beforeEach(() => {
  jest.clearAllMocks();
  primeSecureStore();
  fetchSpy = jest.spyOn(global, "fetch") as unknown as jest.SpyInstance<
    Promise<Response>,
    [RequestInfo | URL, RequestInit?]
  >;
});

afterEach(() => {
  fetchSpy.mockRestore();
});

// ── apiPatch ───────────────────────────────────────────────────────────────

describe("apiPatch", () => {
  test("14. calls fetch with PATCH, correct URL, headers, and JSON body", async () => {
    fetchSpy.mockResolvedValue(jsonResponse(200, { ok: true }));

    const result = await apiPatch<{ ok: boolean }>("/foo", { a: 1 });

    expect(result).toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/foo`);
    expect(init).toBeDefined();
    expect(init!.method).toBe("PATCH");
    const headers = init!.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["Authorization"]).toBe(`Bearer ${JWT}`);
    expect(init!.body).toBe(JSON.stringify({ a: 1 }));
  });

  test("apiPatch omits Authorization header when no JWT is stored", async () => {
    // Adversarial: JWT missing. Should still PATCH, just without the auth
    // header. This is the "signed out" edge — request will most likely 401
    // server-side, but that's not this test's concern.
    mockGetItemAsync.mockImplementation(async (key: string) => {
      if (key === BASE_URL_KEY) return BASE_URL;
      return null; // no JWT
    });
    fetchSpy.mockResolvedValue(jsonResponse(200, { ok: true }));

    await apiPatch("/foo", { a: 1 });
    const headers = fetchSpy.mock.calls[0][1]!.headers as Record<string, string>;
    expect(headers["Authorization"]).toBeUndefined();
    expect(headers["Content-Type"]).toBe("application/json");
  });
});

// ── editChild ──────────────────────────────────────────────────────────────

describe("editChild", () => {
  test("15. targets the right path with PATCH and only the changed fields in the body", async () => {
    fetchSpy.mockResolvedValue(jsonResponse(200, { ok: true }));

    await editChild("child-abc", { studentName: "Alice" });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/api/mobile/native/account/children/child-abc`);
    expect(init!.method).toBe("PATCH");
    // Body must NOT include grade or allergyNotes if the caller didn't set them.
    expect(init!.body).toBe(JSON.stringify({ studentName: "Alice" }));
    const parsed = JSON.parse(init!.body as string);
    expect(parsed).toEqual({ studentName: "Alice" });
    expect(parsed).not.toHaveProperty("grade");
    expect(parsed).not.toHaveProperty("allergyNotes");
  });

  test("16. no-op patch: editChild(id, {}) still PATCHes with body '{}'", async () => {
    // Per partial-update semantics, an empty patch is legal — server treats
    // it as a no-op. Verify the helper doesn't shortcut / skip the fetch.
    fetchSpy.mockResolvedValue(jsonResponse(200, { ok: true }));

    await editChild("child-abc", {});

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const init = fetchSpy.mock.calls[0][1];
    expect(init!.method).toBe("PATCH");
    expect(init!.body).toBe("{}");
  });

  test("editChild forwards allergyNotes: '' verbatim (deliberate clear)", async () => {
    // Belt + braces — pairs with diffChildForm test 6. The api helper must
    // NOT strip the empty string.
    fetchSpy.mockResolvedValue(jsonResponse(200, { ok: true }));

    await editChild("child-abc", { allergyNotes: "" });

    const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
    expect(body).toEqual({ allergyNotes: "" });
    expect(Object.prototype.hasOwnProperty.call(body, "allergyNotes")).toBe(true);
  });
});

// ── deleteChild ────────────────────────────────────────────────────────────

describe("deleteChild", () => {
  test("17. targets the right path with DELETE method", async () => {
    fetchSpy.mockResolvedValue(jsonResponse(200, { ok: true }));

    const result = await deleteChild("child-abc");
    expect(result).toEqual({ ok: true });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/api/mobile/native/account/children/child-abc`);
    expect(init!.method).toBe("DELETE");
    // DELETE requests don't carry a body — verify the helper doesn't send one.
    expect(init!.body).toBeUndefined();
    // But it SHOULD still send the auth header.
    const headers = init!.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe(`Bearer ${JWT}`);
  });
});

// ── 401 auto-clear-JWT ─────────────────────────────────────────────────────

describe("401 handling — auto-clears JWT and rejects", () => {
  test("18a. apiPatch on 401 → deleteItemAsync(JWT_KEY) called + promise rejects", async () => {
    fetchSpy.mockResolvedValue(jsonResponse(401, { error: "Unauthorized" }));

    await expect(apiPatch("/foo", { a: 1 })).rejects.toThrow();

    // The JWT_KEY (lunchpad_jwt) must have been cleared.
    expect(mockDeleteItemAsync).toHaveBeenCalledWith(JWT_KEY);
    // And Sentry must NOT have been called (401 is expected auth flow).
    expect(mockReportError).not.toHaveBeenCalled();
  });

  test("18b. deleteChild on 401 → deleteItemAsync(JWT_KEY) called + rejects", async () => {
    fetchSpy.mockResolvedValue(jsonResponse(401, { error: "Unauthorized" }));

    await expect(deleteChild("child-abc")).rejects.toThrow();

    expect(mockDeleteItemAsync).toHaveBeenCalledWith(JWT_KEY);
    expect(mockReportError).not.toHaveBeenCalled();
  });

  test("18c. editChild on 401 → deleteItemAsync(JWT_KEY) called + rejects", async () => {
    fetchSpy.mockResolvedValue(jsonResponse(401, { error: "Unauthorized" }));

    await expect(editChild("child-abc", { studentName: "Alice" })).rejects.toThrow();

    expect(mockDeleteItemAsync).toHaveBeenCalledWith(JWT_KEY);
    expect(mockReportError).not.toHaveBeenCalled();
  });
});

// ── 500 reporting ──────────────────────────────────────────────────────────

describe("5xx handling — reportError is called and promise rejects", () => {
  test("19a. apiPatch on 500 → reportError called + rejects; JWT NOT cleared", async () => {
    fetchSpy.mockResolvedValue(jsonResponse(500, { error: "Server exploded" }));

    await expect(apiPatch("/foo", { a: 1 })).rejects.toThrow();

    // Sentry MUST see the 5xx per the policy in handleResponse.
    expect(mockReportError).toHaveBeenCalledTimes(1);
    const [, ctx] = mockReportError.mock.calls[0];
    expect(ctx).toMatchObject({
      status: 500,
      path: "/foo",
      method: "PATCH",
    });
    // JWT clear is a 401-only path.
    expect(mockDeleteItemAsync).not.toHaveBeenCalled();
  });

  test("19b. deleteChild on 500 → reportError called with DELETE method tag", async () => {
    fetchSpy.mockResolvedValue(jsonResponse(500, { error: "Server exploded" }));

    await expect(deleteChild("child-abc")).rejects.toThrow();

    expect(mockReportError).toHaveBeenCalledTimes(1);
    const [, ctx] = mockReportError.mock.calls[0];
    expect(ctx).toMatchObject({
      status: 500,
      path: "/api/mobile/native/account/children/child-abc",
      method: "DELETE",
    });
  });
});

// ── Path building — FINDING territory ──────────────────────────────────────

describe("path building — id interpolation", () => {
  test("20. editChild URL-encodes the id in the path", async () => {
    // editChild must URL-encode the id to prevent malformed URLs if the id
    // contains special characters like spaces or slashes.
    fetchSpy.mockResolvedValue(jsonResponse(200, { ok: true }));

    await editChild("child abc", { studentName: "Alice" });

    const [url] = fetchSpy.mock.calls[0];
    // Space is encoded to %20.
    expect(url).toBe(`${BASE_URL}/api/mobile/native/account/children/child%20abc`);
    expect(url).toContain("%20");
  });

  test("20b. deleteChild URL-encodes the id in the path", async () => {
    fetchSpy.mockResolvedValue(jsonResponse(200, { ok: true }));

    await deleteChild("child/abc");

    const [url] = fetchSpy.mock.calls[0];
    // Slash is encoded to %2F, preventing URL path injection.
    expect(url).toBe(`${BASE_URL}/api/mobile/native/account/children/child%2Fabc`);
    expect(url).toContain("%2F");
  });

  test("20c. deleteWeeklyPlan URL-encodes the planId in the path", async () => {
    // Same pattern as editChild/deleteChild above — deleteWeeklyPlan was
    // fixed in the same PR (Issue #31 called out this exact function by
    // name as needing the same treatment) but had no test coverage of
    // its own. Added here to close that gap.
    fetchSpy.mockResolvedValue(jsonResponse(200, { ok: true }));

    await deleteWeeklyPlan("plan/abc def");

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/api/mobile/native/weekly-plans/plan%2Fabc%20def`);
    expect(url).toContain("%2F");
    expect(url).toContain("%20");
  });
});
