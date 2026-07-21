/**
 * Unit tests for planReorder + reorderMissingReasonLabel (lib/reorder.ts).
 *
 * Pure module. No mocks. Every happy-path case is paired with adversarial
 * coverage. See lib/reorder.ts for the contract:
 *
 *   - Match rule: strict case-sensitive `menuItem.name === orderItem.name`.
 *   - Missing reasons, checked in this order (impl-verified — see
 *     lib/reorder.ts lines 82-99):
 *       1. no name match             → "not-on-menu"
 *       2. `sizes.length > 0`        → "requires-size"
 *       3. `requiredChoices.length>0`→ "requires-choice"
 *   - Additions / removals carry across as-is on cloneable items.
 *   - lineTotalCents is RECOMPUTED via computeLineTotalCents(match,
 *     { additions }) against today's menu; the historical
 *     orderItem.lineTotalCents is IGNORED. removals are NOT passed to
 *     computeLineTotalCents.
 */

import { planReorder, reorderMissingReasonLabel } from "../../lib/reorder";
import type {
  MenuItem,
  MenuItemSize,
  MenuOption,
  OrderHistoryItem,
} from "../../lib/types";

// ── Fixtures ───────────────────────────────────────────────────────────────

const bacon: MenuOption = {
  id: "opt-bacon",
  name: "Bacon",
  optionType: "ADD",
  priceDeltaCents: 150,
};
const cheese: MenuOption = {
  id: "opt-cheese",
  name: "Cheese",
  optionType: "ADD_ON",
  priceDeltaCents: 100,
};
const avocado: MenuOption = {
  id: "opt-avocado",
  name: "Avocado",
  optionType: "ADD",
  priceDeltaCents: 200,
};
const noOnions: MenuOption = {
  id: "opt-no-onions",
  name: "No Onions",
  optionType: "REMOVE",
  priceDeltaCents: 0,
};
const jackpot: MenuOption = {
  id: "opt-jackpot",
  name: "Jackpot",
  optionType: "ADD",
  // Deliberately huge to test that big-but-finite additions do not NaN.
  priceDeltaCents: Number.MAX_SAFE_INTEGER - 1,
};

const medium: MenuItemSize = { id: "sz-m", name: "Medium", priceCents: 1200 };
const large: MenuItemSize = { id: "sz-l", name: "Large", priceCents: 1600 };

/** Simple cloneable item — no sizes, no requiredChoices. */
const fries: MenuItem = {
  id: "item-fries",
  slug: "fries",
  name: "Fries",
  description: null,
  imageUrl: null,
  basePriceCents: 500,
  options: [cheese, noOnions],
};

/** Same shape as `fries` — used to test additions/removals carry-across. */
const salad: MenuItem = {
  id: "item-salad",
  slug: "salad",
  name: "Salad",
  description: null,
  imageUrl: null,
  basePriceCents: 800,
  options: [bacon, cheese, noOnions],
};

/** Cloneable with a mega add-on for overflow-territory testing. */
const jackpotBox: MenuItem = {
  id: "item-jackpot",
  slug: "jackpot",
  name: "Jackpot Box",
  description: null,
  imageUrl: null,
  basePriceCents: 100,
  options: [jackpot],
};

/** Requires a size (has sizes). */
const burger: MenuItem = {
  id: "item-burger",
  slug: "burger",
  name: "Burger",
  description: null,
  imageUrl: null,
  basePriceCents: 1000,
  options: [bacon, cheese],
  sizes: [medium, large],
};

/** Requires a choice (no sizes). */
const bowl: MenuItem = {
  id: "item-bowl",
  slug: "bowl",
  name: "Bowl",
  description: null,
  imageUrl: null,
  basePriceCents: 900,
  options: [],
  requiredChoices: ["Beef", "Chicken", "Vegan"],
};

/** Requires BOTH size AND choice — priority test. */
const combo: MenuItem = {
  id: "item-combo",
  slug: "combo",
  name: "Combo",
  description: null,
  imageUrl: null,
  basePriceCents: 1100,
  options: [],
  sizes: [medium, large],
  requiredChoices: ["Beef", "Chicken"],
};

/** Helper — build an OrderHistoryItem quickly. */
function makeOrder(
  items: OrderHistoryItem["items"],
): OrderHistoryItem {
  return {
    id: "order-1",
    orderNumber: "0001",
    status: "PAID",
    deliveryDate: "2026-07-20",
    schoolName: "Test School",
    totalCents: items.reduce((s, i) => s + i.lineTotalCents, 0),
    createdAt: "2026-07-19T12:00:00Z",
    items,
  };
}

// ── Happy path ─────────────────────────────────────────────────────────────

describe("planReorder — happy path", () => {
  test("1. all items available → all cloneable, missing empty", () => {
    const order = makeOrder([
      { name: "Fries", lineTotalCents: 500, additions: [], removals: [] },
      { name: "Salad", lineTotalCents: 800, additions: [], removals: [] },
    ]);
    const plan = planReorder(order, [fries, salad]);
    expect(plan.cloneable).toHaveLength(2);
    expect(plan.missing).toHaveLength(0);
    expect(plan.cloneable[0].menuItem).toBe(fries);
    expect(plan.cloneable[1].menuItem).toBe(salad);
  });

  test("2. some items missing → matched cloneable, unmatched missing with not-on-menu", () => {
    const order = makeOrder([
      { name: "Fries", lineTotalCents: 500, additions: [], removals: [] },
      { name: "Milkshake", lineTotalCents: 400, additions: [], removals: [] },
    ]);
    const plan = planReorder(order, [fries]);
    expect(plan.cloneable).toHaveLength(1);
    expect(plan.cloneable[0].menuItem).toBe(fries);
    expect(plan.missing).toEqual([
      { name: "Milkshake", reason: "not-on-menu" },
    ]);
  });

  test("3. empty order → { cloneable: [], missing: [] }", () => {
    const order = makeOrder([]);
    const plan = planReorder(order, [fries, salad]);
    expect(plan).toEqual({ cloneable: [], missing: [] });
  });

  test("4. price changed since order → cloneable uses CURRENT menu price, not historical", () => {
    // Historical order carried 500 for Fries — but menu says the current
    // basePriceCents for Fries is 500. Bump the current menu to 700 and
    // confirm the cloneable reflects the CURRENT price.
    const friesToday: MenuItem = { ...fries, basePriceCents: 700 };
    const order = makeOrder([
      { name: "Fries", lineTotalCents: 500, additions: [], removals: [] },
    ]);
    const plan = planReorder(order, [friesToday]);
    expect(plan.cloneable).toHaveLength(1);
    expect(plan.cloneable[0].lineTotalCents).toBe(700);
    // And confirm the ignored historical 500 is not leaking through.
    expect(plan.cloneable[0].lineTotalCents).not.toBe(500);
  });

  test("5. item with additions → cloneable price = current base + addon delta", () => {
    const order = makeOrder([
      {
        name: "Salad",
        // Historical price would have been 800 + 150 (Bacon) = 950; but
        // we're going to recompute against the current menu regardless.
        lineTotalCents: 950,
        additions: ["Bacon"],
        removals: [],
      },
    ]);
    const plan = planReorder(order, [salad]);
    expect(plan.cloneable).toHaveLength(1);
    expect(plan.cloneable[0].lineTotalCents).toBe(800 + 150);
    expect(plan.cloneable[0].additions).toEqual(["Bacon"]);
  });

  test("6. item with removals → removals preserved on cloneable but price unaffected", () => {
    const order = makeOrder([
      {
        name: "Fries",
        lineTotalCents: 500,
        additions: [],
        removals: ["No Onions", "No Salt"],
      },
    ]);
    const plan = planReorder(order, [fries]);
    expect(plan.cloneable).toHaveLength(1);
    // Removals carried across verbatim.
    expect(plan.cloneable[0].removals).toEqual(["No Onions", "No Salt"]);
    // Price is base only — removals do NOT change the total (per contract).
    expect(plan.cloneable[0].lineTotalCents).toBe(500);
  });
});

// ── Adversarial ────────────────────────────────────────────────────────────

describe("planReorder — adversarial", () => {
  test("7. case-mismatched name is NOT matched → not-on-menu", () => {
    // Menu has "Burger" (capital B); history has "burger" (lower b).
    // Strict case-sensitive equality means the item is missing.
    const order = makeOrder([
      { name: "burger", lineTotalCents: 1000, additions: [], removals: [] },
    ]);
    const plan = planReorder(order, [burger]);
    expect(plan.cloneable).toHaveLength(0);
    expect(plan.missing).toEqual([{ name: "burger", reason: "not-on-menu" }]);
  });

  test("8. menu item with sizes.length > 0 → requires-size even on perfect name match", () => {
    const order = makeOrder([
      { name: "Burger", lineTotalCents: 1000, additions: [], removals: [] },
    ]);
    const plan = planReorder(order, [burger]);
    expect(plan.cloneable).toHaveLength(0);
    expect(plan.missing).toEqual([{ name: "Burger", reason: "requires-size" }]);
  });

  test("9. menu item with requiredChoices and no sizes → requires-choice", () => {
    const order = makeOrder([
      { name: "Bowl", lineTotalCents: 900, additions: [], removals: [] },
    ]);
    const plan = planReorder(order, [bowl]);
    expect(plan.cloneable).toHaveLength(0);
    expect(plan.missing).toEqual([{ name: "Bowl", reason: "requires-choice" }]);
  });

  test("10. sizes AND requiredChoices both present → size wins (priority per doc)", () => {
    // Impl priority (lib/reorder.ts): not-on-menu → requires-size →
    // requires-choice. The lead's spec says size wins over choice. Verify.
    const order = makeOrder([
      { name: "Combo", lineTotalCents: 1100, additions: [], removals: [] },
    ]);
    const plan = planReorder(order, [combo]);
    expect(plan.cloneable).toHaveLength(0);
    expect(plan.missing).toEqual([{ name: "Combo", reason: "requires-size" }]);
  });

  test("11. duplicate item names in a single order — both survive independently", () => {
    // Customer legitimately orders the same item twice with different
    // customizations. Both must clone; each with its own additions/removals.
    const order = makeOrder([
      {
        name: "Salad",
        lineTotalCents: 950,
        additions: ["Bacon"],
        removals: [],
      },
      {
        name: "Salad",
        lineTotalCents: 900,
        additions: ["Cheese"],
        removals: ["No Onions"],
      },
    ]);
    const plan = planReorder(order, [salad]);
    expect(plan.cloneable).toHaveLength(2);
    expect(plan.missing).toHaveLength(0);
    // First clone — Bacon.
    expect(plan.cloneable[0].additions).toEqual(["Bacon"]);
    expect(plan.cloneable[0].removals).toEqual([]);
    expect(plan.cloneable[0].lineTotalCents).toBe(800 + 150);
    // Second clone — Cheese + No Onions removal.
    expect(plan.cloneable[1].additions).toEqual(["Cheese"]);
    expect(plan.cloneable[1].removals).toEqual(["No Onions"]);
    expect(plan.cloneable[1].lineTotalCents).toBe(800 + 100);
  });

  test("12. menu contains DUPLICATE items with same name — first match wins (Array.prototype.find)", () => {
    // Two menu items both named "Fries" — theoretically possible if the
    // operator misnamed. Impl uses menuItems.find(mi => mi.name === ...)
    // which returns the FIRST match. Document the behavior.
    const friesA: MenuItem = { ...fries, id: "fries-A", basePriceCents: 500 };
    const friesB: MenuItem = { ...fries, id: "fries-B", basePriceCents: 999 };
    const order = makeOrder([
      { name: "Fries", lineTotalCents: 500, additions: [], removals: [] },
    ]);
    const plan = planReorder(order, [friesA, friesB]);
    expect(plan.cloneable).toHaveLength(1);
    // First match wins.
    expect(plan.cloneable[0].menuItem.id).toBe("fries-A");
    expect(plan.cloneable[0].lineTotalCents).toBe(500);
  });

  test("13. very large addon delta → no NaN, no negative overflow within MAX_SAFE_INTEGER", () => {
    // Historical order records a jackpot-priced item; we recompute using
    // today's menu and expect a large but finite, non-NaN, positive number.
    const order = makeOrder([
      {
        name: "Jackpot Box",
        lineTotalCents: 999,
        additions: ["Jackpot"],
        removals: [],
      },
    ]);
    const plan = planReorder(order, [jackpotBox]);
    expect(plan.cloneable).toHaveLength(1);
    const total = plan.cloneable[0].lineTotalCents;
    expect(Number.isFinite(total)).toBe(true);
    expect(Number.isNaN(total)).toBe(false);
    expect(total).toBeGreaterThan(0);
    // base 100 + (MAX_SAFE_INTEGER - 1) = MAX_SAFE_INTEGER + 99 in float
    // arithmetic; still finite, still >= MAX_SAFE_INTEGER.
    expect(total).toBeGreaterThanOrEqual(Number.MAX_SAFE_INTEGER - 1);
  });

  test("14. additions contains an addon id/name NOT on the menu → silently skipped in price", () => {
    // Server bug or drift: history references an addon that isn't on the
    // current menu item. Per computeLineTotalCents's "skip unknown" behavior
    // the price should ignore it (not throw, not NaN). Additions still
    // carry across verbatim on the cloneable.
    const order = makeOrder([
      {
        name: "Fries",
        lineTotalCents: 500,
        additions: ["Truffles"], // not an option on `fries`
        removals: [],
      },
    ]);
    const plan = planReorder(order, [fries]);
    expect(plan.cloneable).toHaveLength(1);
    // Price ignores the unknown addon.
    expect(plan.cloneable[0].lineTotalCents).toBe(500);
    // But the unknown addon is preserved on the cloneable for downstream
    // (kitchen notes / audit).
    expect(plan.cloneable[0].additions).toEqual(["Truffles"]);
  });

  test("mix: matched + not-on-menu + requires-size + requires-choice in one order", () => {
    // Sanity — all four outcomes coexist in a single order and each
    // ends up in the right bucket with the right reason.
    const order = makeOrder([
      { name: "Fries", lineTotalCents: 500, additions: [], removals: [] }, // clone
      { name: "Milkshake", lineTotalCents: 400, additions: [], removals: [] }, // not-on-menu
      { name: "Burger", lineTotalCents: 1000, additions: [], removals: [] }, // requires-size
      { name: "Bowl", lineTotalCents: 900, additions: [], removals: [] }, // requires-choice
    ]);
    const plan = planReorder(order, [fries, burger, bowl]);
    expect(plan.cloneable).toHaveLength(1);
    expect(plan.cloneable[0].menuItem).toBe(fries);
    expect(plan.missing).toEqual([
      { name: "Milkshake", reason: "not-on-menu" },
      { name: "Burger", reason: "requires-size" },
      { name: "Bowl", reason: "requires-choice" },
    ]);
  });

  test("empty menu on target date → every order item goes to missing (not-on-menu)", () => {
    const order = makeOrder([
      { name: "Fries", lineTotalCents: 500, additions: [], removals: [] },
      { name: "Salad", lineTotalCents: 800, additions: [], removals: [] },
    ]);
    const plan = planReorder(order, []);
    expect(plan.cloneable).toHaveLength(0);
    expect(plan.missing).toEqual([
      { name: "Fries", reason: "not-on-menu" },
      { name: "Salad", reason: "not-on-menu" },
    ]);
  });

  test("does NOT mutate the input order or menu", () => {
    // Guard against future edits — the function is documented as pure.
    const order = makeOrder([
      {
        name: "Salad",
        lineTotalCents: 950,
        additions: ["Bacon"],
        removals: ["No Onions"],
      },
    ]);
    const menu = [salad];
    const orderSnapshot = JSON.stringify(order);
    const menuSnapshot = JSON.stringify(menu);
    planReorder(order, menu);
    expect(JSON.stringify(order)).toBe(orderSnapshot);
    expect(JSON.stringify(menu)).toBe(menuSnapshot);
  });
});

// ── reorderMissingReasonLabel ──────────────────────────────────────────────

describe("reorderMissingReasonLabel", () => {
  test("15a. returns a non-empty string for each of the three valid reasons", () => {
    const a = reorderMissingReasonLabel("not-on-menu");
    const b = reorderMissingReasonLabel("requires-size");
    const c = reorderMissingReasonLabel("requires-choice");
    for (const s of [a, b, c]) {
      expect(typeof s).toBe("string");
      expect(s.length).toBeGreaterThan(0);
    }
  });

  test("15b. returns three distinct labels — no accidental duplicate copy", () => {
    const a = reorderMissingReasonLabel("not-on-menu");
    const b = reorderMissingReasonLabel("requires-size");
    const c = reorderMissingReasonLabel("requires-choice");
    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
    expect(a).not.toBe(c);
  });

  test("15c. defensive: passing an invalid literal returns undefined (no throw)", () => {
    // FINDING-worthy: the switch has no default. TS prevents this at
    // compile time, but at runtime an invalid literal falls off the end
    // and returns undefined. The function does NOT throw.
    const bogus = "not-a-real-reason" as unknown as
      | "not-on-menu"
      | "requires-size"
      | "requires-choice";
    let out: string | undefined;
    expect(() => {
      out = reorderMissingReasonLabel(bogus);
    }).not.toThrow();
    expect(out).toBeUndefined();
  });
});
