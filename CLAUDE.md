# LunchPad iOS — Claude Code Context

## What This Is
A native Expo React Native app (SDK 54) that is the iOS companion to the LunchPad web app.
Parents use it to browse menus, sign in with Apple, and place school lunch orders.

## Repos
- **This repo (iOS app):** `https://github.com/faheeds/lunchpad-ios`
- **Web app (Next.js):** `https://github.com/faheeds/lunchpad` — do NOT break existing web routes
- **Production:** `https://lunchpad.us` (apex marketing site) and `https://<slug>.lunchpad.us` (per-tenant ordering site)
- **Vercel project URL (legacy):** `https://lunchpad-five.vercel.app` — still resolves but the canonical surface is lunchpad.us

## Tech Stack
- Expo SDK 54, Expo Router (file-based), React Native 0.81.5
- TypeScript
- `expo-secure-store` — JWT + school code/base URL persistence
- `expo-apple-authentication` — Apple Sign In
- `npm install --legacy-peer-deps` required (peer dep conflict between @types/react 18 vs RN 0.81.5)

## Project Structure
```
app/
  (auth)/
    index.tsx        — School code entry screen (first screen)
    sign-in.tsx      — Apple Sign In screen
  (app)/
    index.tsx        — Home / delivery dates list
    order.tsx        — Order placement screen
    orders.tsx       — Order history
    account.tsx      — Account / profile
lib/
  api.ts             — All API calls + SecureStore helpers + validateSchoolCode
  auth.ts            — Apple Sign In flow
  types.ts           — Shared TypeScript types
```

## Key Architecture Decisions

### School Code / Base URL
Parents enter a school code or full URL (e.g. `lunchpad-five.vercel.app` or `lunch.localbiggerburger.com`).
`validateSchoolCode()` in `lib/api.ts` hits `/api/mobile/native/info` on the resolved base URL.
The resolved base URL is stored in SecureStore (`lunchpad_base_url`) so all subsequent API calls go to the right tenant.

### Auth
Bearer JWT — not cookies. The web app mobile endpoints accept `Authorization: Bearer <token>`.
Apple Sign In posts to `/api/mobile/native/auth/apple` which returns a JWT stored in SecureStore (`lunchpad_jwt`).

### Per-tenant scoping (important)
Every parent account is scoped to a single restaurant. Same Apple ID at two
restaurants = two distinct ParentUser records — no data leakage between
tenants. The JWT issued by `/api/mobile/native/auth/apple` embeds
`restaurantId`, and every protected route (`requireMobileAuth` /
`getMobileAuth` server-side) verifies the token's tenant matches the host.

Practical implications for the iOS app:
- The user MUST sign in on the tenant subdomain they want to use. The
  school code flow already handles this (`validateSchoolCode` resolves
  the base URL and stores it in SecureStore).
- If the user changes school codes after signing in (i.e. switches
  tenants), the next authenticated API call will return 401 because the
  JWT's tenant doesn't match the new host. `apiGet` / `apiPost` in
  `lib/api.ts` auto-clear the JWT on 401, which routes the user back to
  sign-in via the auth gate.
- Existing tokens minted before per-tenant scoping was deployed are
  hydrated server-side from the DB, so they keep working until they
  naturally expire (90 days for native tokens).

### Web App Mobile API Routes
All under `/api/mobile/native/`:
- `GET  /info` — validates restaurant exists, returns name/slug
- `POST /auth/apple` — exchanges Apple identity token for JWT
- `GET  /delivery-dates` — available delivery dates with menu items
- `GET  /account` — parent profile
- `GET  /orders` — order history
- `POST /order` — create order, returns Stripe Checkout URL
- `GET  /order/success` — post-payment redirect handler
- `GET  /order/cancel` — cancelled payment redirect handler
- `GET  /account/children` — saved children profiles
- `POST /account/children` — add child

### Stripe Checkout
The app opens the Stripe Checkout URL in the device browser.
After payment, Stripe redirects to `/api/mobile/native/order/success?orderId=...`
which then deep-links back to the app via `lunchpad://` scheme.

## Current Status (as of May 2026)
- School code entry screen ✅
- Apple Sign In ✅ (compatible with per-tenant scoping — no app changes needed)
- Delivery dates list — built, needs end-to-end test on real device
- Order placement screen — built, needs end-to-end test
- Stripe checkout flow — built, needs end-to-end test
- Order history — built, needs end-to-end test
- Deep link back after payment — built, needs end-to-end test
- EAS Build / TestFlight — initial build submitted, pipeline needs end-to-end verification (#7)
- 401 auto-handling — `lib/api.ts` clears JWT on 401 so users gracefully bounce to sign-in
- Backend per-tenant scoping landed — iOS app already targets tenant subdomains so no breakage

## Pending / Next Steps
1. End-to-end smoke test on a real device against `<slug>.lunchpad.us`:
   school code → Apple Sign In → browse menu → place order → Stripe → deep link back.
2. Refresh EAS Build with the latest `lib/api.ts` (401 handling) and submit to TestFlight.
3. If a new tenant is needed for testing, the wildcard `*.lunchpad.us` is configured —
   any newly-created restaurant via the web signup auto-registers the subdomain.
4. Apple Developer account for signing: `faheed@live.com` (NOT the gmail).

## Known Gotchas
- **File writes from Claude sandbox get truncated** on Windows-mounted paths. Always use bash heredoc
  (`cat > file << 'ENDOFFILE'`) rather than the Write/Edit tools for files > ~100 lines.
- **Git index.lock** gets left behind on Windows — delete with `Remove-Item .git\index.lock` in PowerShell.
- **npm install** requires `--legacy-peer-deps` due to @types/react peer conflict with RN 0.81.5.
- The sandbox cannot push to GitHub (proxy restriction) — always push from PowerShell on the host machine.
