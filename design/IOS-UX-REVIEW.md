# LunchPad iOS — Customer App Review & Redesign

*Principal Product + Principal UX/UI review · May 2026*
*Scope: the entire customer-facing iOS app — launch funnel, home, menu, ordering, cart, weekly plan, order history, account, checkout success.*

---

## 1. Executive summary

The LunchPad iOS app is functional, competently engineered, and already running on the editorial palette. Every screen works. But it currently reads as a **school-portal utility** — something you are handed a code for and tolerate — rather than a **lunch storefront** people look forward to opening.

That distinction matters. For a platform sold to restaurants catering multiple locations, this app is two things at once: the customer's daily touchpoint, and the operator's brand sitting in someone's pocket. It should feel as considered as the food.

Three issues hold it back, and none of them require re-architecting:

1. **It leads with friction.** The first screen is a code-entry form. A new user sees a text field before a single photo, price, or reason to care.
2. **The home screen is an operations calendar.** It lists delivery *dates*. Customers think in *people and meals*, not date rows — and nothing on the home screen is personalized or shows food.
3. **The highest-value feature is hidden.** Weekly checkout — bundling a whole week into one transaction — is a buried route reachable only through one easy-to-miss banner, and that banner disappears exactly when the list is empty. You noticed this yourself: *"the app does not have the weekly checkout option."*

The recommendation is a **reframe, not a rebuild**:

> **From** school portal **→** lunch storefront.
> **From** calendar of dates **→** a home that shows what matters: my people, my next deadline, what they loved last time.
> **From** buried weekly plan **→** a first-class destination.

All of it sits on a consistent editorial chassis the app already half-has. Effort is real but bounded — most screens are restructured, not rewritten.

---

## 2. The strategic reframe

### 2.1 From "school portal" to "lunch storefront"

Modern food apps — DoorDash, Sweetgreen, Olo-powered restaurant apps, CAVA — open on **food and value**. Imagery first, credentials later. They earn the right to ask for information by showing you something worth signing up for.

LunchPad does the opposite. The cold-start sequence is: splash → spinner → **a form labelled "School Code Entry."** The user has not seen a meal, a price, a kid's name, or a word about what this app is *for*. The code gate is structurally necessary for multi-tenancy — but right now it is the *cover of the book*, when it should be one quiet step inside a welcoming flow.

**Reframe:** a brief, warm **Welcome** screen leads (one captivating food image, one line of value, one button). The code step still happens — but as a friendly "Connect to your lunch program," not a bureaucratic gate. Sign-in follows naturally.

### 2.2 From "calendar of dates" to "a home that shows what matters"

The home tab — labelled "Order" — lists delivery **dates** grouped by school. That is the *operator's* mental model (a kitchen runs a calendar). The *customer's* mental model is: *"Who am I feeding, and what's the next deadline?"*

You explicitly asked for the app to "show things which matter." Today the home screen shows the same generic date list to everyone, with **zero food imagery** and **zero personalization** — even though the data to personalize it already exists in the app:

- `account.children` — the kids/eaters, by name, with allergies
- `orders` — order history, including what was ordered last
- `cutoffAt` on every delivery date — a real, time-boxed urgency signal
- `dietaryTags` / `allergyNotes` — safety-relevant filtering

None of it drives the home screen. A redesigned home should answer, above the fold: **who needs lunch, when the next cutoff is, and the fastest path to handle it** — including a one-tap reorder of a favourite.

### 2.3 From "buried weekly plan" to "first-class destination"

Weekly checkout is the platform's most differentiated, highest-average-order-value feature. In the app today it is:

- a **hidden route** (`weekly-plan`, `href: null`),
- reachable **only** via a single list-header banner on Home,
- and that banner is rendered *inside* the populated-list branch — so when there are **no open dates, the empty state shows and the weekly entry point vanishes entirely.**
- The banner copy is hardcoded *"Order all 5 days"* — but the platform is multi-tenant with Mon–Thu, Mon–Fri, and weekend operators.

That is why it feels missing. The fix is to treat weekly planning as a **primary destination** — a tab or a permanent, prominent home module — that is reachable in every state, with copy driven by the operator's actual schedule.

### 2.4 One more: the app still says "school" everywhere

The platform landing page positions LunchPad for restaurants serving **schools *and* offices**, and the web app was already genericized to be `operatorType`-aware. The iOS app lags: *"School Code Entry," "School lunch, simplified," "check with your school," "Change school," "Grade."* An office worker ordering catering is told to enter a *school* code. Language should adapt to the operator type — `school` / `office` / neutral "location," and `grade` becomes optional.

---

## 3. Screen-by-screen findings

Severity: **[P0]** ship-blocking polish / quick win · **[P1]** core reframe · **[P2]** depth & craft.

### Launch & bootstrap (`app/index.tsx`, `app.json`)
- **[P0] Off-brand flash on every cold launch.** The bootstrap screen is hardcoded `backgroundColor: #0f172a` (dark navy) with a `#f59e0b` amber spinner — the *pre-editorial* palette. `app.json`'s splash `backgroundColor` is the same stale `#0f172a`. So every launch flickers: splash (navy) → bootstrap (navy) → auth (cream). The user crosses two visual identities before reaching content.
- **[P1] No value framing.** Bootstrap is dead time. It could be a branded, calm hold — logo on cream — instead of a navy void.

### School-code entry (`(auth)/index.tsx`)
- **[P1] Friction-first.** A form is the first thing a human sees. No welcome, no imagery, no "what is this."
- **[P1] "School" language** throughout, despite multi-tenant office support.
- **[P2] The input asks for "code OR full URL"** in one field — a low-confidence ask. Most users have neither memorized; this needs reassurance ("your school or office sent this to you") and ideally a friendlier hook.

### Sign-in (`(auth)/sign-in.tsx`)
- **[P1] "Continue as guest" is a prominent dead end.** Guest mode silently disables saved kids, history, *and* weekly plans (weekly needs children). It is offered as a peer choice to Apple Sign In but quietly cripples the app. Either commit to a genuine browse-first guest mode or de-emphasize it to a small text link.
- **[P2] The value proposition for signing in is thin** — "save your kids' profiles and see order history." It could sell the *weekly plan* and *reorder* benefits.

### Home / "Order" tab (`(app)/index.tsx`)
- **[P1] It's a date list, not a storefront.** Date cards carry a date block + school name + item count + cutoff. **No food photography anywhere.** The only image is a decorative hero.
- **[P1] Zero personalization.** Children, last order, reorder, allergy-aware filtering — none surface.
- **[P0] Weekly CTA disappears in the empty state** (see 2.3).
- **[P2] Two header treatments** (hero vs. plain) make the screen feel like two different designs depending on whether the operator uploaded a hero image.
- **[P2] Empty state is a 📭 emoji.**

### Menu tab (`(app)/menu.tsx`) vs Order flow (`order/[dateId].tsx`)
- **[P1] The Menu and Order tabs overlap confusingly.** Menu tab = browse all food → tap item → *"Pick a date to order"* → bounces you to the Home tab carrying a `preselectedItemId`. Order flow = pick a date → see that date's menu. Two routes to the same food with a clumsy hand-off. A customer cannot tell which tab to use.
- **[P2] The bounce pattern** (`menu → home → order`) is fragile and disorienting — the user is thrown two screens sideways.

### Item detail modals (`order/[dateId].tsx`, `weekly-plan.tsx`)
- **[P2] Good bones, duplicated.** Two near-identical item-customization modals (size / required-choice / add-ons / removals) live in two files. Solid UX; should be one shared component.
- **[P2] Modal image is a flat 220px block** or a 🍽️ emoji when absent.

### Cart (`(app)/cart.tsx`)
- **[P1] Re-asks for information it already has.** Even signed-in users with saved children get a manual "Student" section and re-enter parent name + email every order. The saved-child chips help, but the default should be *"Aisha, Grade 3"* pre-filled, not a blank form.
- **[P2] Allergy notes** are buried in the manual fields; for a child with a saved allergy this is safety-critical and should be shown as a confirmed, visible chip.
- **[P2] No order summary fidelity** — no per-line imagery, no delivery date echoed at the top.

### Weekly plan (`(app)/weekly-plan.tsx`)
- **[P1] Buried** (see 2.3).
- **[P2] Strong screen otherwise** — data-driven weekday slots, per-child chips, running total. Worth promoting, not rebuilding.

### Account (`(app)/account.tsx`)
- **[P2] A long scroll of stacked cards** — profile, children, order history, change-school — with no hierarchy. Order history living *inside* Account means there is no first-class "my orders" surface.
- **[P2] Guest state** shows a sign-in nudge but the screen is otherwise empty.

### Checkout success (`checkout/success.tsx`)
- **[P2] Competent but a dead end.** Animated check, order ref, help block, "Back to menu." No "plan the rest of the week," no "order for another child," no add-to-calendar, no reorder hook. The single highest-intent moment in the app ends with a shrug.

### Cross-cutting craft issues
- **[P0] Emoji as UI** — 📭 🛒 🍽️ 👶 used for empty states and every missing food image. Emoji render inconsistently across iOS versions and read as unfinished in a premium product. Replace with iconography / simple illustration.
- **[P1] No shared screen chassis.** Every screen rolls its own header, title size, and back affordance. Inconsistent `SafeAreaView` usage. There is a `theme.type` scale — but screens hardcode `fontSize: 15` etc. and ignore it.
- **[P1] Fraunces (the editorial display serif) is used sporadically** — some titles, not others. The brand voice is inconsistent screen to screen.
- **[P2] Bare loading & error states** — a centered spinner or "Couldn't load X / Retry." No skeletons, no branded hold, no empty states that offer a path forward.
- **[P2] Dates render in UTC.** `formatDate` uses `getUTCDay()` / `getUTCDate()` rather than the school's timezone — a Friday delivery can display as "Thu" for users behind UTC. Functional, but the customer sees the wrong day.

---

## 4. Prioritized recommendations

### P0 — Quick wins, ship this week (low effort, removes embarrassment)
1. **Kill the off-brand flash.** Bootstrap screen and `app.json` splash → editorial cream `#F6F1E6` with the green mark and a green spinner. The launch sequence should be one continuous identity.
2. **Surface the weekly plan in every state.** Move the weekly entry point out of the list-header-only slot so it never disappears; fix the empty-state branch; drive the copy from the operator's real schedule.
3. **Genericize "school" → location-aware language** across auth, home, account. Match the web's `operatorType` model.
4. **Remove emoji-as-UI.** Replace with the icon set already in the app (Ionicons) and tasteful illustration for empty states / missing food images.

### P1 — The core reframe (the redesign)
5. **Redesign the launch funnel:** Welcome (value-first) → Connect (warm code step) → Sign-in (sell the real benefits).
6. **Redesign Home as a personalized storefront:** greeting + who you're feeding, the next cutoff as live urgency, a one-tap reorder, the weekly-plan module, *then* upcoming dates — as photo-forward cards.
7. **Build a shared screen chassis:** one `<Screen>` + `<ScreenHeader>` component, consistent title scale wired to `theme.type`, consistent back/safe-area handling.
8. **Resolve Menu vs Order:** make "Menu" a true browse surface and let "add to cart" pick a date inline (a date sheet), instead of bouncing across tabs.
9. **Cart: trust saved data.** Default to the saved child + saved parent info; show allergy as a confirmed chip; collapse the form to an editable summary.

### P2 — Depth & craft
10. Skeleton loaders + branded empty/error states everywhere.
11. Promote order history to its own surface; simplify Account.
12. Richer success screen: "plan the rest of the week," reorder, add-to-calendar.
13. One shared item-customization modal component.
14. Timezone-correct date formatting.

---

## 5. The proposed redesign

The redesign keeps the four-destination structure but reframes each surface. Editorial palette throughout: cream `#F6F1E6` canvas, white `#FFFFFF` cards, deep green `#2C4031` for primary action and brand, clay `#C0673E` for accents and urgency, Fraunces for display type.

### 5.1 Launch funnel — *value-first*

**Welcome.** Full-bleed warm image, the LunchPad / operator mark, one editorial line ("Lunch, handled — for the whole week."), one button: *Get started*. A quiet secondary link: *I have a code*.

**Connect.** The code step, reframed warm: "Connect to your lunch program — your school or office sent you a code or link." Large, confident input; reassuring helper text; recent-connection memory if they have used the app before.

**Sign-in.** Apple Sign In as the clear primary, selling the real payoff: *"Sign in to save your eaters, reorder in a tap, and plan the whole week at once."* Guest demoted to a small *Just browsing →* link.

### 5.2 Home — *the personalized storefront*

A scrollable home, top to bottom:

1. **Greeting header** — "Good morning, Faheed" + operator mark. Calm, cream, no competing hero.
2. **Next-up card** — the single most important thing: *"Aisha needs lunch for Thursday — order by Wed 9:00 AM."* A live countdown when the cutoff is near (clay). One primary button: *Choose Thursday's lunch*. If everything is handled: *"You're all set for this week."*
3. **Your eaters** — a row of child avatars; tap one to filter the whole home to that child.
4. **Plan the week** — a permanent, photo-rich module (not a fragile banner). Shows progress: *"3 of 4 days planned."* Always present, always reachable.
5. **Reorder** — "Order Aisha's usual again" — one tap from order history. The single biggest retention lever in food apps.
6. **Upcoming dates** — still here, but as photo-forward cards: a representative food image, the date, the cutoff as a chip, item count. The calendar becomes a *section*, not the whole screen.

### 5.3 Menu & ordering — *one coherent path*

"Menu" becomes a genuine browse-the-food surface — categories, photography, dietary filters. "Add" opens the item sheet; confirming asks **which date** inline via a date picker sheet — no cross-tab bounce. The date-scoped order flow stays for users who start from "I need Thursday handled."

### 5.4 Cart — *a summary, not a form*

For signed-in users: the cart opens as a clean review — items with thumbnails, the delivery date echoed at top, the eater pre-selected with their allergy shown as a confirmed chip, parent info pre-filled and collapsed behind *Edit*. Checkout is one confident button. Guests get the minimal form, clearly labelled.

### 5.5 Weekly plan — *promoted*

Reachable from the permanent home module and (recommended) a dedicated tab. The screen itself is already good; it gets the shared chassis, food imagery in the weekday slots, and a clearer "what's left to plan" progress header.

### 5.6 Success — *momentum, not a dead end*

Keep the celebration. Then offer the next action: *"Plan Aisha's Friday too"*, *Reorder for another eater*, *Add delivery days to calendar*. End on momentum.

### 5.7 Navigation

Recommended tabs: **Home · Menu · Weekly · Account.** The cart becomes a floating, contextual bar (it already behaves this way inside the order flow) rather than a permanent tab — standard for modern food apps and it frees a slot for Weekly.

---

## 6. Design system notes

The foundation exists in `lib/theme.ts`; it needs to be *enforced*.

- **Type scale.** Wire every screen to `theme.type` (`displayLarge` → `labelSmall`). Stop hardcoding `fontSize`. Fraunces for all display/headline text; system for body. One scale, applied consistently.
- **Components to extract:** `<Screen>` (safe-area + cream canvas), `<ScreenHeader>` (title + optional back + optional action), `<Card>`, `<FoodImage>` (image with branded fallback — *no emoji*), `<ItemSheet>` (the shared customization modal), `<Pill>` / `<Tag>`, `<PrimaryButton>` / `<SecondaryButton>`, `<EmptyState>` (illustration + message + action), `<Skeleton>`.
- **Imagery.** Food photography is the single biggest visual upgrade. Where an operator has not uploaded a photo, fall back to a warm, on-brand illustrated tile — never 🍽️.
- **Motion.** Keep the existing tasteful haptics and the success-screen spring. Add: skeleton shimmer on load, a subtle press-scale on cards, the cart-badge pulse (already good).
- **Urgency language.** Cutoffs are the app's most useful signal. Treat "order by" as a first-class, color-aware element (calm green when there's time, clay when it's close).

---

## 7. Suggested implementation phasing

| Phase | Scope | Notes |
|------|-------|-------|
| **0 — Quick wins** | P0 items: launch-flash fix, weekly always-reachable, de-school the copy, de-emoji | Low risk, immediately visible. Can ship before the rest. |
| **1 — Chassis** | `<Screen>`, `<ScreenHeader>`, type scale, `<Card>`, `<FoodImage>`, `<EmptyState>` | No visible redesign yet — sets up everything after to be consistent and fast. |
| **2 — Launch funnel** | Welcome → Connect → Sign-in | Self-contained; first thing new users see. |
| **3 — Home storefront** | The personalized home (greeting, next-up, eaters, weekly module, reorder, photo date cards) | The headline change. Depends on Phase 1. |
| **4 — Ordering & cart** | Menu/Order reconciliation, item sheet extraction, cart-as-summary | |
| **5 — Weekly, Account, Success** | Promote weekly, split out order history, momentum success screen | |

Each phase is a branch + PR + EAS build, type-checked, shippable on its own.

---

## 8. What this is *not*

This is not a rewrite. The data layer, API contract, navigation library, state store, and auth flow all stay. The Stripe/checkout/deep-link plumbing is untouched. What changes is **what the screens say, what they show first, and how consistently they say it** — the difference between an app people are issued and an app people open.

*Next: interactive mockups of the redesigned screens for your review before any implementation.*
