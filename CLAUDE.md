# LunchPad iOS — Claude Code Context

## What This Is
A native Expo React Native app (SDK 54) that is the iOS companion to the LunchPad web app.
Customers use it to browse menus, sign in with Apple, and place school or office lunch orders.

## Repos
- **This repo (iOS app):** `https://github.com/faheeds/lunchpad-ios`
- **Web app (Next.js):** `https://github.com/faheeds/lunchpad` — do NOT break existing web routes
- **Production:** `https://lunchpad.us` (apex marketing site) and `https://<slug>.lunchpad.us` (per-tenant ordering site)
- The earlier `lunchpad-five.vercel.app` URL is deprecated — all new test tenants live on `*.lunchpad.us`.

## Tech Stack
- Expo SDK 54, Expo Router (file-based), React Native 0.81.5
- TypeScript
- `expo-secure-store` — JWT + school code/base URL persistence
- `expo-apple-authentication` — Apple Sign In
- `npm install --legacy-peer-deps` required (peer dep conflict between @types/react 18 vs RN 0.81.5)

## Project Structure
```
app/
  _layout.tsx                — Root layout / auth gate
  index.tsx                  — Root redirect
  (auth)/
    _layout.tsx              — Auth stack layout
    index.tsx                — School code entry screen (first screen)
    connect.tsx              — Connect / welcome funnel step
    sign-in.tsx              — Apple Sign In screen
  (app)/
    _layout.tsx              — Authenticated tab layout
    index.tsx                — Home / delivery dates storefront
    menu.tsx                 — Menu browse tab
    cart.tsx                 — Cart / order summary
    weekly-plan.tsx          — Weekly plan screen
    account.tsx              — Account / profile
    order/[dateId].tsx       — Order placement screen (per delivery date)
    orders/[orderId].tsx     — Order detail (history)
  checkout/
    success.tsx              — Stripe post-payment landing
lib/
  api.ts                     — All API calls + SecureStore helpers + validateSchoolCode
  auth.ts                    — Apple Sign In flow
  pricing.ts                 — Canonical line-item pricing (extracted in Ticket 1)
  store.ts                   — Client-side state / cache
  theme.ts                   — Editorial theme tokens
  types.ts                   — Shared TypeScript types
```

CI: two workflows live under `.github/workflows/` — `eng-agent.yml` (issue-driven engineering
agent that opens agent-authored PRs) and `agent-fix.yml` (reserved for the fix-loop workflow).

## Key Architecture Decisions

### School Code / Base URL
Customers enter a school code or full URL (e.g. `fsskitchen.lunchpad.us` or `lunch.localbiggerburger.com`).
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

### Native API contract — source of truth
The canonical native API contract lives in the web repo at `docs/mobile-api-contract.md` —
update THAT doc alongside any change to the routes under `app/api/mobile/native/` on the web
repo. This file lists the routes but is not the source of truth.

### Stripe Checkout
The app opens the Stripe Checkout URL in the device browser.
After payment, Stripe redirects to `/api/mobile/native/order/success?orderId=...`
which then deep-links back to the app via `lunchpad://` scheme.

## Current Status (as of July 2026)

### Shipped
- School code entry screen
- Apple Sign In (per-tenant scoping compatible)
- Delivery dates list / home storefront
- Order placement screen (per delivery date)
- Stripe checkout flow + deep link back after payment
- Order history + order detail view
- Editorial theme redesign (PR #20 — customer app brought up to the new visual system)
- App icon uses the LunchPad web logo
- 401 auto-handling — `lib/api.ts` clears JWT on 401 so users gracefully bounce to sign-in
- Backend per-tenant scoping — iOS already targets tenant subdomains, no breakage
- In-app account deletion (App Store guideline 5.1.1(v))
- Office-aware labels — Grade hidden for office locations
- Cutoff day (not just time) shown on date cards
- Weekly plan / add-eater cache refresh fix
- Jest test runner wired + `lib/pricing.ts` extracted with unit coverage (PR #21, Ticket 1)
- Multiple TestFlight builds shipped (buildNumber 31+)

## Parity backlog (Phase 2)
Product-level gaps between the iOS app and the web app that remain open:
- Reliable order cancellation
- Order modification (edit an existing order before cutoff)
- Reorder from history
- Child edit / delete
- Push notifications

## Pending / Next Steps
1. Sentry observability rollout (Ticket 2 — likely landing shortly after this doc PR).
2. End-to-end smoke test on a real device against `<slug>.lunchpad.us`:
   school code → Apple Sign In → browse menu → place order → Stripe → deep link back.
3. Verify the EAS pipeline against the latest post-Ticket-1 build.
4. Apple Developer account for signing: `faheed@live.com` (NOT the gmail).

## Lane rules — agents

Two lanes. Each agent owns specific files and must never touch the other lane's files. If dev
and QA need the same file, they coordinate through the lead — never in parallel.

**dev** → all source code: `app/`, `lib/`, `components/` (if any), `assets/`, `scripts/`,
config files (`app.json`, `eas.json`, `tsconfig.json`, `babel.config.js`), and CI workflow files
under `.github/` — implementation and infra, never test files.

**qa** → ALL test files (any `*.test.ts`/`*.test.tsx`, `jest.config.*`, and any `tests/` or
`__tests__/` directory) — QA owns test authorship end to end.

### QA lane — hard rules

QA owns every test file. Dev writes SOURCE CODE AND INFRA ONLY (including wiring a test
runner's config/package.json script) and never authors test *cases* — if dev believes a test is
needed, it describes the test case to the lead in plain language; the lead routes it to QA.

QA branches are named `qa/<short-desc>`, NOT `agent/<short-desc>`.

Every happy-path test needs at least one adversarial test (boundary, malformed input, race
condition). No flaky tests. No tests that hit production services (the live web API).

When a test fails, QA documents the disagreement between expected and actual behavior as a
finding — QA does not fix application code.

### Lead responsibilities

The lead agent (this session) reads incoming tickets, decides whether each requires dev work,
QA work, or both, and dispatches accordingly using this session's own subagent tooling rather
than doing both kinds of work directly in the main thread. The lead resolves conflicts when dev
and QA need the same file, and is responsible for opening/merging PRs whose scope spans both
lanes' commits.

## Known Gotchas
- **File writes from Claude sandbox get truncated** on Windows-mounted paths. Always use bash heredoc
  (`cat > file << 'ENDOFFILE'`) rather than the Write/Edit tools for files > ~100 lines.
- **Git index.lock** gets left behind on Windows — delete with `Remove-Item .git\index.lock` in PowerShell.
- **npm install** requires `--legacy-peer-deps` due to @types/react peer conflict with RN 0.81.5.
- The sandbox cannot push to GitHub (proxy restriction) — always push from PowerShell on the host machine.
