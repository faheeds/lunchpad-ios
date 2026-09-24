/**
 * Line-item pricing — the canonical per-unit total for a MenuItem in a
 * given configuration. Extracted from what used to be three inline copies
 * (order screen, weekly-plan customize modal, weekly-plan resolvePlanPrice)
 * so behavior stays lock-step across surfaces.
 *
 * Algorithm:
 *   base   = if a size is selected and the item has that size → that
 *            size's `priceCents`. Otherwise → the item's `basePriceCents`.
 *   addons = sum of `priceDeltaCents` for every option whose `name` is
 *            in `additions` AND whose `optionType` is one of
 *            "ADD" | "ADD_ON" (both spellings exist in the wild — the
 *            backend uses both across older and newer restaurants).
 *   total  = base + addons
 *
 * Removals are intentionally NOT priced today. Every call site that
 * currently tracks a `removals` array uses it to send instructions to
 * the kitchen, not to discount the line. If removal discounts are ever
 * introduced they belong here — not scattered back inline in the screens.
 */

import type { MenuItem } from "./types";

/** Option shapes that count as an add-on. Matches the filter used
 *  everywhere else in the app. */
const ADD_ON_TYPES = new Set(["ADD", "ADD_ON"]);

export type LineItemPricingOptions = {
  /** Selected size name (must match a `MenuItemSize.name` on `item`).
   *  When absent (undefined/null) OR when the item has no matching size,
   *  the item's `basePriceCents` is used. */
  size?: string | null;
  /** Names of options the customer has added on. Options not present on
   *  `item.options`, or present but not of an add-on type, are ignored. */
  additions?: readonly string[];
};

/**
 * Per-unit price in cents for one configured line of `item`. Pure — the
 * same inputs always yield the same output; no side effects.
 *
 * Multiply the result by cart-line quantity to get the line total.
 */
export function computeLineTotalCents(
  item: MenuItem,
  options: LineItemPricingOptions = {},
): number {
  const { size, additions } = options;

  // Base: size override if resolvable, else the item's base price.
  const sizeMatch =
    size && item.sizes ? item.sizes.find((sz) => sz.name === size) : undefined;
  const base = sizeMatch ? sizeMatch.priceCents : item.basePriceCents;

  // Add-ons: sum priceDeltaCents for every option whose name the caller
  // selected AND that is actually an add-on type on this item.
  let addOnTotal = 0;
  if (additions && additions.length > 0) {
    const picked = new Set(additions);
    for (const opt of item.options) {
      if (picked.has(opt.name) && ADD_ON_TYPES.has(opt.optionType)) {
        addOnTotal += opt.priceDeltaCents;
      }
    }
  }

  return base + addOnTotal;
}
