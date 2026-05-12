# EAS Build pipeline verification (iOS)

Tracks task #7. Confirms the iOS build/submit flow end-to-end: source change
→ EAS Build → TestFlight → device. Run this once after any major dependency
bump (Expo SDK, React Native, signing cert rotation) or before a public
TestFlight invite wave.

## Pre-flight

| Item                                              | Where to check                      |
| ------------------------------------------------- | ----------------------------------- |
| `eas-cli` installed, logged in                    | `eas whoami` returns the right user |
| Apple developer account active (`faheed@live.com`)| developer.apple.com/account         |
| App Store Connect app entry exists, Bundle ID right | App Store Connect → My Apps        |
| EAS Build credentials configured                  | `eas credentials --platform ios`    |
| `eas.json` build profiles unchanged since last green | `git diff main -- eas.json`      |

## Steps

### 1. Bump version

In `app.json` increment `expo.version` (semver) and `expo.ios.buildNumber`
(integer, must be strictly greater than the last submitted build).

### 2. Trigger an EAS build

From `C:\Faheed Code\lunchpad-ios`:

```bash
npm install --legacy-peer-deps
eas build --platform ios --profile production
```

Build runs in EAS cloud — typically 15–25 minutes. Output ends with a
hosted URL for the `.ipa` artifact.

### 3. Submit to TestFlight

```bash
eas submit --platform ios --latest
```

Reuses the just-built artifact. Apple processes it server-side
(15–30 min) and emails when ready for testers.

### 4. Install on a device

- Open TestFlight on the test iPhone
- Confirm the new build number appears at the top of the LunchPad row
- Tap **Install** and wait for the badge to flip to **Open**

### 5. Smoke-test the build on device

End-to-end happy path:

1. Launch app. School-code entry screen renders without a flash of
   white or fonts loading visibly.
2. Enter `fsskitchen` → school code resolves, "FS's Kitchen" name shows.
3. Apple Sign In. Confirm with Face ID. JWT lands, you reach Home.
4. Browse delivery dates list. Pick the next available date.
5. Add a menu item with a required choice + a size + an add-on. Verify
   the cart line shows all three correctly.
6. Checkout → Stripe Safari View opens. Use test card `4242 4242 4242 4242`.
7. Stripe success → app deep-links back via `lunchpad://` scheme to the
   order success screen. Confirm order appears in Orders tab.
8. Cancel the test order from the order detail. Verify a refund event
   shows in the web admin (`lunchpad.us/admin/orders/<id>`) within a
   minute.
9. Sign out, then sign back in with the same Apple ID. Confirm session
   restores cleanly (JWT in SecureStore is durable).

### 6. Tear-down

Refund the test order if not already cancelled, archive it in the web
admin so it doesn't clutter the operator dashboard.

## What "verified" looks like

- All 9 device-side checks pass without a force-restart or stuck screen
- No red error toasts during the flow
- Order, refund, and deep-link round-trips show up in the web admin
- New build number is visible under TestFlight builds at App Store Connect

## Common failures and recovery

| Symptom                             | Likely cause                       | Fix                                                         |
| ----------------------------------- | ---------------------------------- | ----------------------------------------------------------- |
| `eas build` rejects credentials     | Cert/profile rotated since setup   | `eas credentials --platform ios`, regenerate                |
| TestFlight install button is grey   | Build still processing             | Wait; check `App Store Connect → TestFlight` for `Ready`   |
| App crashes on launch               | Native module mismatch (often Sentry / RN) | `eas build --clear-cache --platform ios`           |
| Apple Sign In errors instantly      | Capability removed in cert refresh | App Store Connect → app → Signing → re-add capability       |
| Deep link doesn't return to app     | URL scheme dropped from `app.json` | Re-add `scheme: "lunchpad"` and rebuild                     |

## Re-run cadence

- After any Expo SDK bump
- After any major `react-native` / `expo-router` upgrade
- Before adding a new tester wave
- Quarterly as a routine sanity check
