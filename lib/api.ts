import * as SecureStore from "expo-secure-store";

export const SCHOOL_CODE_KEY = "lunchpad_school_code";
export const BASE_URL_KEY = "lunchpad_base_url";
export const JWT_KEY = "lunchpad_jwt";

// ── Storage helpers ──────────────────────────────────────────────────────────

export const getSchoolCode = () => SecureStore.getItemAsync(SCHOOL_CODE_KEY);
export const setSchoolCode = (code: string) =>
  SecureStore.setItemAsync(SCHOOL_CODE_KEY, code.toLowerCase().trim());

/** Resolved base URL stored at validation time (e.g. https://fsskitchen.lunchpad.us) */
export const getStoredBaseUrl = () => SecureStore.getItemAsync(BASE_URL_KEY);
export const setStoredBaseUrl = (url: string) => SecureStore.setItemAsync(BASE_URL_KEY, url);
export const clearStoredBaseUrl = () => SecureStore.deleteItemAsync(BASE_URL_KEY);

export const getJWT = () => SecureStore.getItemAsync(JWT_KEY);
export const setJWT = (token: string) => SecureStore.setItemAsync(JWT_KEY, token);
export const clearJWT = () => SecureStore.deleteItemAsync(JWT_KEY);

// ── Base URL ─────────────────────────────────────────────────────────────────

/**
 * Returns the base URL for all API calls.
 * Prefers the stored resolved URL (set during school code validation).
 * Falls back to constructing from slug for backwards compatibility.
 */
export async function getBaseUrl(): Promise<string> {
  const stored = await getStoredBaseUrl();
  if (stored) return stored;
  const code = await getSchoolCode();
  if (!code) throw new Error("No school code saved");
  return `https://${code}.lunchpad.us`;
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

async function buildHeaders(auth = true): Promise<Record<string, string>> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) {
    const token = await getJWT();
    if (token) h["Authorization"] = `Bearer ${token}`;
  }
  return h;
}

/**
 * Common response handler. If the server returns 401, the JWT is no longer
 * valid against the current tenant — possible reasons:
 *   - Token expired
 *   - User changed school codes (token is for a different restaurant)
 *   - Backend rolled per-tenant scoping; old token's tenant doesn't match
 * In all cases the right move is to clear the JWT so the app's auth gate
 * routes the user back to sign-in. We re-throw the error so the caller
 * still sees the failure.
 */
async function handleResponse<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    await clearJWT();
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function apiGet<T>(path: string): Promise<T> {
  const base = await getBaseUrl();
  const res = await fetch(`${base}${path}`, { headers: await buildHeaders(true) });
  return handleResponse<T>(res);
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const base = await getBaseUrl();
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: await buildHeaders(true),
    body: JSON.stringify(body),
  });
  return handleResponse<T>(res);
}

export async function apiDelete<T>(path: string): Promise<T> {
  const base = await getBaseUrl();
  const res = await fetch(`${base}${path}`, {
    method: "DELETE",
    headers: await buildHeaders(true),
  });
  return handleResponse<T>(res);
}

// ── School code validation ───────────────────────────────────────────────────

/**
 * Validates a school code or restaurant URL.
 *
 * Accepts:
 *   - slug only:      "fsskitchen"             → https://fsskitchen.lunchpad.us
 *   - custom domain:  "lunch.localbiggerburger.com"  → https://lunch.localbiggerburger.com
 *   - full URL:       "https://..."            → used as-is
 *
 * Returns the resolved base URL so it can be stored for future API calls.
 */
export async function validateSchoolCode(
  input: string
): Promise<{ valid: boolean; restaurantName?: string; baseUrl?: string }> {
  const trimmed = input.toLowerCase().trim();

  let baseUrl: string;
  if (trimmed.startsWith("https://") || trimmed.startsWith("http://")) {
    baseUrl = trimmed.replace(/\/$/, "");
  } else if (trimmed.includes(".")) {
    baseUrl = `https://${trimmed}`;
  } else {
    baseUrl = `https://${trimmed}.lunchpad.us`;
  }

  try {
    const res = await fetch(`${baseUrl}/api/mobile/native/info`, {
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) return { valid: false };
    const data = await res.json();
    return { valid: true, restaurantName: data.name, baseUrl };
  } catch {
    return { valid: false };
  }
}

// ── Typed API calls ──────────────────────────────────────────────────────────

import type {
  DeliveryDateWithMenu,
  Parent,
  OrderHistoryItem,
  RestaurantMenu,
  WeeklyPlansBundle,
  WeeklyPlan,
} from "./types";

export const fetchDeliveryDates = () =>
  apiGet<DeliveryDateWithMenu[]>("/api/mobile/native/delivery-dates");

/** Full restaurant menu, grouped by category. Public — used by Menu tab. */
export async function fetchMenu(): Promise<RestaurantMenu> {
  // Menu is public; bypass the JWT header so guests can browse too.
  const base = await getBaseUrl();
  const res = await fetch(`${base}/api/mobile/native/menu`, {
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export const fetchAccount = () =>
  apiGet<Parent>("/api/mobile/native/account");

export const fetchOrders = () =>
  apiGet<OrderHistoryItem[]>("/api/mobile/native/orders");

export const signInWithApple = (identityToken: string, fullName?: { givenName?: string; familyName?: string }) =>
  apiPost<{ token: string }>("/api/mobile/native/auth/apple", { identityToken, fullName });

export const addChild = (data: {
  schoolId: string;
  studentName: string;
  grade: string;
  allergyNotes?: string;
}) => apiPost("/api/mobile/native/account/children", data);

// ── Weekly plan ──────────────────────────────────────────────────────────────

export const fetchWeeklyPlans = () =>
  apiGet<WeeklyPlansBundle>("/api/mobile/native/weekly-plans");

export const upsertWeeklyPlan = (data: {
  parentChildId: string;
  weekday: number;
  menuItemId: string;
  choice?: string;
  additions?: string[];
  removals?: string[];
}) => apiPost<WeeklyPlan>("/api/mobile/native/weekly-plans", data);

export const deleteWeeklyPlan = (planId: string) =>
  apiDelete<{ ok: true }>(`/api/mobile/native/weekly-plans/${planId}`);

export const createWeeklyCheckout = () =>
  apiPost<{ checkoutUrl: string; batchId: string; totalCents: number }>(
    "/api/mobile/native/weekly-checkout",
    {},
  );

export const createOrder = (data: {
  deliveryDateId: string;
  schoolId: string;
  studentName: string;
  grade: string;
  parentName: string;
  parentEmail: string;
  allergyNotes?: string;
  /** Each item is one unit. The iOS cart store expands `quantity` into
   *  N entries before calling this so the server sees one row per unit.
   *  `choice` carries the operator-defined required pick-one when the
   *  menu item has `requiredChoices`. */
  items: { menuItemId: string; choice?: string; additions?: string[]; removals?: string[] }[];
}) => apiPost<{ checkoutUrl: string; orderId: string }>("/api/mobile/native/order", data);
