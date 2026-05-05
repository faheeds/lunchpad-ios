# LunchPad iOS — Claude Code Context

## What This Is
A native Expo React Native app (SDK 54) that is the iOS companion to the LunchPad web app.
Parents use it to browse menus, sign in with Apple, and place school lunch orders.

## Repos
- **This repo (iOS app):** `https://github.com/faheeds/lunchpad-ios`
- **Web app (Next.js):** `https://github.com/faheeds/lunchpad` — do NOT break existing web routes
- **Vercel deployment:** `https://lunchpad-five.vercel.app` (production)

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
- Apple Sign In ✅
- Delivery dates list — built, needs testing
- Order placement screen — built, needs testing
- Stripe checkout flow — built, needs end-to-end testing
- Order history — built, needs testing
- Deep link back after payment — built, needs testing
- EAS Build / TestFlight — not yet set up

## Pending / Next Steps
1. Set `RESTAURANT_SLUG` env var in Vercel (Settings → Environment Variables) to the LBB restaurant slug,
   then redeploy — this makes `lunchpad-five.vercel.app` resolve the restaurant for the app.
2. Test full flow in Expo Go: school code → sign in → browse menu → order → Stripe → deep link back.
3. Set up EAS Build for TestFlight distribution (`eas.json` already scaffolded).
4. Apple Developer account for signing: `faheed@live.com` (NOT the gmail).

## Known Gotchas
- **File writes from Claude sandbox get truncated** on Windows-mounted paths. Always use bash heredoc
  (`cat > file << 'ENDOFFILE'`) rather than the Write/Edit tools for files > ~100 lines.
- **Git index.lock** gets left behind on Windows — delete with `Remove-Item .git\index.lock` in PowerShell.
- **npm install** requires `--legacy-peer-deps` due to @types/react peer conflict with RN 0.81.5.
- The sandbox cannot push to GitHub (proxy restriction) — always push from PowerShell on the host machine.
