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
 *   `{ name, lineTotalCents, additions, removals }`. No menuItemId,
 *   no size, no choice. So the only way to recover the underlying
 *   MenuItem is a case-sensitive match by `name` against the current
 *   menu (strict equality is safest against false positives — a
 *   sound-alike item at a different price would be wrong).
 *
 * When a matched item requires a `size` or a `choice`, we cannot safely
 * clone: the original selection wasn't preserved. Same for items that
 * simply aren't on the current menu. All such lines go to `missing`
 * with a reason code so the UI can explain what happened.
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
      // Original choice wasn't preserved either.
      missing.push({ name: orderItem.name, reason: "requires-choice" });
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
