/**
 * Unit tests for searchRestaurants (lib/api.ts).
 *
 * Doc contract (from lib/api.ts):
 *   - Always hits the fixed apex domain (lunchpad.us), never a stored
 *     per-tenant baseUrl — there is no tenant context yet at this point.
 *   - Empty/whitespace-only query short-circuits to [] with no network call.
 *   - Any failure (network error, non-2xx, bad JSON, non-array body) returns
 *     [] rather than throwing, so a flaky search never blocks manual entry.
 *
 * fetch is mocked globally per test; reportError is mocked to a no-op so
 * failure-path tests don't require Sentry to be initialized.
 */

import { searchRestaurants } from "../../lib/api";

jest.mock("../../lib/sentry", () => ({
  reportError: jest.fn(),
}));

const mockFetch = jest.fn();

beforeEach(() => {
  mockFetch.mockReset();
  (global as unknown as { fetch: typeof fetch }).fetch = mockFetch;
});

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  };
}

const SAMPLE_RESULT = {
  id: "cmroizoeq000056i7eimgskqt",
  slug: "emptycup",
  name: "EmptyCup",
  logoUrl: "https://example.com/logo.jpg",
  primaryColor: "#e84623",
};

describe("searchRestaurants", () => {
  test("empty query short-circuits to [] without calling fetch", async () => {
    const result = await searchRestaurants("");
    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("whitespace-only query short-circuits to [] without calling fetch", async () => {
    const result = await searchRestaurants("   ");
    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("hits the fixed apex domain, not a per-tenant host", async () => {
    mockFetch.mockResolvedValue(jsonResponse([SAMPLE_RESULT]));
    await searchRestaurants("empty");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://lunchpad.us/api/mobile/native/restaurants/search?q=empty");
  });

  test("URL-encodes the query", async () => {
    mockFetch.mockResolvedValue(jsonResponse([]));
    await searchRestaurants("bob's burgers");
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain(encodeURIComponent("bob's burgers"));
  });

  test("trims the query before sending", async () => {
    mockFetch.mockResolvedValue(jsonResponse([]));
    await searchRestaurants("  empty  ");
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://lunchpad.us/api/mobile/native/restaurants/search?q=empty");
  });

  test("returns the parsed array on a successful response", async () => {
    mockFetch.mockResolvedValue(jsonResponse([SAMPLE_RESULT]));
    const result = await searchRestaurants("empty");
    expect(result).toEqual([SAMPLE_RESULT]);
  });

  test("returns [] on a non-2xx response, does not throw", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: "server error" }, false, 500));
    const result = await searchRestaurants("empty");
    expect(result).toEqual([]);
  });

  test("returns [] when fetch itself rejects (network failure), does not throw", async () => {
    mockFetch.mockRejectedValue(new Error("Network request failed"));
    await expect(searchRestaurants("empty")).resolves.toEqual([]);
  });

  test("returns [] when the response body is not an array (malformed backend payload)", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ unexpected: "shape" }));
    const result = await searchRestaurants("empty");
    expect(result).toEqual([]);
  });

  test("returns [] when response.json() itself throws (invalid JSON body)", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("Unexpected token in JSON");
      },
    });
    const result = await searchRestaurants("empty");
    expect(result).toEqual([]);
  });

  test("reports failures to Sentry via reportError with useful context", async () => {
    const { reportError } = require("../../lib/sentry");
    mockFetch.mockRejectedValue(new Error("boom"));
    await searchRestaurants("empty");
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ context: "searchRestaurants" }),
    );
  });
});
