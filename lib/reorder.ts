/**
 * Reorder from history — plan a fresh cart from a past order.
 *
 * Pure module. Given an OrderHistoryItem and the menu items available on
 * a chosen target delivery date, produce two lists:
 *
 *   - `cloneable`: line items we can safely re-add to the cart with
 *                  today's canonical price (recomputed via
 *                  `computeLineTotalCents` — see the note about pricing
 *                  drift at the bottom of this comment).
 *   - `missing`:   line items we can't safely re-add and must ask the
 *                  user to add manually.
 *
 * Why this can't be a simple menuItemId lookup:
 *   `OrderHistoryItem.items` is deliberately minimal — it carries only
 *   `{ name, lineTotalCents, additions, removals }`. No menuItemId and
 *   no size. Choice IS recoverable: the web backend stores required-choice
 *   selections by prepending the chosen value into the additions array, so
 *   `orderItem.additions` already contains the original choice. We
 *   disambiguate using `MenuItem.requiredChoices` — any addition that
 *   matches is the recovered choice; we strip it before forwarding to the
 *   cart so it travels as `choice`, not as a plain add-on.
 *
 *   Size is NOT recoverable from history: `sizeName` is a real separate
 *   field on the web side but is not currently exposed by
 *   GET /api/mobile/native/orders. That's a separate coordinated fix
 *   across both repos.
 *
 *   So the only way to recover the underlying MenuItem is a case-sensitive
 *   match by `name` against the current menu (strict equality is safest
 *   against false positives — a sound-alike item at a different price would
 *   be wrong).
 *
 * When a matched item requires a `size` we cannot safely clone: the
 * original size selection isn't available from the history endpoint.
 * Required-choice items ARE handled — see above. Items simply not on
 * the current menu go to `missing` as well.
 *
 * Pricing drift is expected and silent: we ignore the historical
 * `lineTotalCents` and re-price from the current menu. If the base
 * price or an add-on delta changed since the original order, the user
 * sees today's number, not yesterday's. That's the correct behavior —
 * we can't charge yesterday's price on today's checkout.
 *
 * Removals survive as kitchen instructions per `lib/pricing.ts`'s doc
 * (removals aren't priced). We forward them as-is on the cloneable
 * line but do not pass them to `computeLineTotalCents` (which doesn't
 * accept a `removals` field today).
 */

import type { MenuItem, OrderHistoryItem } from "./types";
import { computeLineTotalCents } from "./pricing";

export type ReorderMissingReason =
  | "not-on-menu"
  | "requires-size"
  | "requires-choice";

export type ReorderCloneable = {
  menuItem: MenuItem;
  /** Recovered required-choice value (stripped from additions before
   *  pricing so it isn't double-counted as a plain add-on). */
  choice?: string;
  additions: string[];
  removals: string[];
  /** Recomputed against the CURRENT menu — do not carry across the
   *  historical `lineTotalCents`. */
  lineTotalCents: number;
};

export type ReorderMissing = {
  name: string;
  reason: ReorderMissingReason;
};

export type ReorderPlan = {
  cloneable: ReorderCloneable[];
  missing: ReorderMissing[];
};

/**
 * Given the historical order and the target-date menu, split every
 * line item into either `cloneable` (safe to re-add) or `missing`
 * (needs manual attention).
 *
 * Match is exact / case-sensitive on `item.name === orderItem.name`.
 * See the module docstring for why strict equality is the right call.
 */
export function planReorder(
  order: OrderHistoryItem,
  menuItems: MenuItem[],
): ReorderPlan {
  const cloneable: ReorderCloneable[] = [];
  const missing: ReorderMissing[] = [];

  for (const orderItem of order.items) {
    const match = menuItems.find((mi) => mi.name === orderItem.name);

    if (!match) {
      missing.push({ name: orderItem.name, reason: "not-on-menu" });
      continue;
    }

    if ((match.sizes?.length ?? 0) > 0) {
      // Original size wasn't preserved on the history record — can't clone.
      missing.push({ name: orderItem.name, reason: "requires-size" });
      continue;
    }

    if ((match.requiredChoices?.length ?? 0) > 0) {
      // The web backend prepends the chosen value into the additions array
      // (choice ? [choice, ...additions] : additions), so the original
      // selection is recoverable: find the first addition that appears in
      // requiredChoices.
      const recoveredChoice = orderItem.additions.find(
        (a) => match.requiredChoices!.includes(a),
      );
      if (!recoveredChoice) {
        // No match — data inconsistency, or requiredChoices changed since
        // the original order was placed.
        missing.push({ name: orderItem.name, reason: "requires-choice" });
        continue;
      }
      // Strip the choice value from additions before pricing and before
      // forwarding to the cart — it must travel as `choice`, not as a
      // plain add-on. (Pricing note: even if it weren't stripped, the
      // pricing function only counts ADD/ADD_ON option types, and required
      // choices are not in that set, so it wouldn't inflate the total.
      // Stripping is still required for semantic correctness — the cart's
      // `choice` field and `additions` field are distinct.)
      const additionsWithoutChoice = orderItem.additions.filter(
        (a) => a !== recoveredChoice,
      );
      cloneable.push({
        menuItem: match,
        choice: recoveredChoice,
        additions: additionsWithoutChoice,
        removals: orderItem.removals,
        lineTotalCents: computeLineTotalCents(match, {
          additions: additionsWithoutChoice,
        }),
      });
      continue;
    }

    // Safe to clone. Recompute the per-unit total against today's menu.
    // Pass only `additions` — `computeLineTotalCents` doesn't (yet) accept
    // a removals field, and per lib/pricing.ts removals are kitchen
    // instructions, not price deltas.
    const lineTotalCents = computeLineTotalCents(match, {
      additions: orderItem.additions,
    });

    cloneable.push({
      menuItem: match,
      additions: orderItem.additions,
      removals: orderItem.removals,
      lineTotalCents,
    });
  }

  return { cloneable, missing };
}

/**
 * Block-level summary shown in the reorder panel when no items could be
 * cloned automatically (nothingCloneable). Derives wording from the actual
 * reasons so we never say "not available" for items that are on the menu
 * but need a manual selection.
 *
 * @param missing  The plan.missing array (guaranteed non-empty at call site).
 * @param formattedDate  Pre-formatted delivery date string (e.g. "Monday, Jul 28")
 *                       — only used in the not-on-menu case.
 */
export function reorderSummaryMessage(
  missing: ReorderMissing[],
  formattedDate: string,
): string {
  const allNotOnMenu = missing.every((m) => m.reason === "not-on-menu");
  const noneNotOnMenu = missing.every((m) => m.reason !== "not-on-menu");

  if (allNotOnMenu) {
    return `None of these items are available on ${formattedDate}.`;
  }
  if (noneNotOnMenu) {
    return "These items need a selection before adding — please add them from the menu.";
  }
  // Mixed: some not-on-menu, some require manual selection
  return "Some items aren't on this menu, and others need a manual selection — please review the list above.";
}

/**
 * Human-readable reason label for a missing item — used by the UI so we
 * only spell the copy once.
 */
export function reorderMissingReasonLabel(reason: ReorderMissingReason): string {
  switch (reason) {
    case "not-on-menu":
      return "not available on this date";
    case "requires-size":
      return "requires selecting a size — please add manually";
    case "requires-choice":
      return "requires a pick-one selection — please add manually";
    default: {
      // Exhaustiveness guard — if a new ReorderMissingReason variant is
      // added without updating this switch, the following assignment
      // becomes a compile-time error.
      const _exhaustive: never = reason;
      return "Please add manually";
    }
  }
}
