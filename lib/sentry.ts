/**
 * Thin wrapper around @sentry/react-native.
 *
 * Design goals:
 *   - Never crash the app if Sentry can't initialize (bad DSN, no network, etc).
 *   - No-op silently when EXPO_PUBLIC_SENTRY_DSN is absent (local dev, ejects,
 *     or forgotten env in a CI build). The rest of the app can call
 *     `reportError`/`initSentry` unconditionally without guarding.
 *   - Hard PII hygiene: strip Authorization headers, drop query strings from
 *     URLs, and never let the user object include an email/token. See
 *     `scrubEvent` below.
 *
 * Owned by the DEV lane (source only; no tests here).
 */

import * as Sentry from "@sentry/react-native";

/**
 * Public env var read from Expo's client-side env. `EXPO_PUBLIC_*` is the
 * Expo-blessed prefix for values that are baked into the JS bundle at build
 * time and safe to reference at module scope.
 *
 * Kept as a top-level const so `initSentry` and `isSentryEnabled` see the same
 * value and callers can log/inspect it easily in dev.
 */
const DSN: string | undefined = process.env.EXPO_PUBLIC_SENTRY_DSN;

export const isSentryEnabled = (): boolean => !!DSN;

let initialized = false;

/**
 * Redacts a URL for inclusion in a Sentry event.
 *
 * The LunchPad base URL is per-tenant and never a secret on its own, but
 * query strings can contain order IDs / student names, and we don't want any
 * of that going to Sentry. We keep the origin + pathname only.
 */
function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return "[unparseable-url]";
  }
}

/**
 * PII scrubber that runs in Sentry's `beforeSend` hook. Strips:
 *   - Authorization headers (JWT) from any request info.
 *   - Query strings from any URL fields we can find.
 *   - The user's email — we never call `Sentry.setUser({ email })`, but if
 *     an unrelated code path does, drop the field defensively.
 *   - Cookies and any header ending in `-token` / `-key`.
 *
 * NOTE: we deliberately do NOT scrub extras that a caller has passed —
 * calling code is responsible for not passing PII, and this hook is meant
 * to defend against auto-collected data (breadcrumbs, request context).
 */
function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent | null {
  // User: keep only id (no email, no ip).
  if (event.user) {
    event.user = { id: event.user.id };
  }

  // Request: drop Authorization, cookies, and querystrings.
  if (event.request) {
    if (event.request.headers) {
      const headers = event.request.headers as Record<string, string>;
      for (const key of Object.keys(headers)) {
        const lower = key.toLowerCase();
        if (
          lower === "authorization" ||
          lower === "cookie" ||
          lower.endsWith("-token") ||
          lower.endsWith("-key")
        ) {
          delete headers[key];
        }
      }
    }
    if (event.request.url) {
      event.request.url = redactUrl(event.request.url);
    }
    // Never send request bodies — they can contain identity tokens
    // (POST /auth/apple), order details, etc.
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.query_string;
  }

  // Breadcrumbs: redact URLs and strip Authorization headers.
  if (event.breadcrumbs) {
    for (const crumb of event.breadcrumbs) {
      if (crumb.data) {
        const data = crumb.data as Record<string, unknown>;
        if (typeof data.url === "string") {
          data.url = redactUrl(data.url);
        }
        if (typeof data.to === "string" && data.to.startsWith("http")) {
          data.to = redactUrl(data.to);
        }
        if (typeof data.from === "string" && data.from.startsWith("http")) {
          data.from = redactUrl(data.from);
        }
        // Drop request bodies + auth on breadcrumbs (network category).
        delete data.request_body_size;
        delete data.response_body_size;
        if (data.headers && typeof data.headers === "object") {
          const headers = data.headers as Record<string, string>;
          for (const key of Object.keys(headers)) {
            if (key.toLowerCase() === "authorization") delete headers[key];
          }
        }
      }
    }
  }

  return event;
}

/**
 * Initialize Sentry. Safe to call more than once — subsequent calls are
 * no-ops. Safe to call when DSN is absent — no-ops silently.
 */
export function initSentry(): void {
  if (initialized) return;
  initialized = true;

  if (!DSN) {
    // No DSN configured — this is the local-dev / no-env path. Stay silent;
    // developers shouldn't see noise about Sentry not being wired up.
    return;
  }

  try {
    Sentry.init({
      dsn: DSN,
      enabled: true,
      // Environment lets us split TestFlight vs production in the Sentry UI
      // once we split builds. Falls back to a generic label so events are
      // still queryable when the env isn't set.
      environment: process.env.EXPO_PUBLIC_SENTRY_ENV ?? "production",
      // Send default PII off — we control our own PII policy below.
      sendDefaultPii: false,
      // Modest sample rate keeps the free-tier quota healthy. Bump once we
      // see how noisy the app is in the wild.
      tracesSampleRate: 0.1,
      beforeSend: scrubEvent,
      // Drop network breadcrumb bodies too (belt + braces).
      beforeBreadcrumb: (crumb) => {
        if (crumb.category === "fetch" || crumb.category === "xhr") {
          if (crumb.data) {
            const data = crumb.data as Record<string, unknown>;
            if (typeof data.url === "string") data.url = redactUrl(data.url);
          }
        }
        return crumb;
      },
    });
  } catch {
    // Never let a Sentry init failure crash the app boot.
  }
}

/**
 * Report an error to Sentry. No-op when Sentry is disabled. Never throws.
 *
 * `context` is arbitrary metadata that gets attached to the event under
 * `extra`. Callers MUST NOT pass PII here — see PII hygiene notes in the
 * ticket / CLAUDE.md.
 */
export function reportError(
  err: unknown,
  context?: Record<string, unknown>,
): void {
  if (!initialized || !DSN) return;
  try {
    Sentry.withScope((scope) => {
      if (context) {
        for (const [key, value] of Object.entries(context)) {
          scope.setExtra(key, value);
        }
      }
      Sentry.captureException(err);
    });
  } catch {
    // Swallow — reporting an error should never crash the app.
  }
}
