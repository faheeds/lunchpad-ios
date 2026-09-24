/**
 * Unit tests for computeLineTotalCents. Pure function — no mocks needed.
 *
 * Doc contract (from lib/pricing.ts):
 *   base   = size match on item.sizes → sz.priceCents ELSE item.basePriceCents
 *   addons = sum priceDeltaCents for each option whose NAME is in `additions`
 *            AND whose optionType is "ADD" or "ADD_ON"
 *   total  = base + addons
 */

import { computeLineTotalCents } from "../../lib/pricing";
import type { MenuItem, MenuOption, MenuItemSize } from "../../lib/types";

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
  optionType: "ADD_ON", // alternate backend spelling
  priceDeltaCents: 100,
};
const avocado: MenuOption = {
  id: "opt-avocado",
  name: "Avocado",
  optionType: "ADD",
  priceDeltaCents: 200,
};
// Not an add-on type — options like this must be ignored by pricing.
const noOnions: MenuOption = {
  id: "opt-no-onions",
  name: "No Onions",
  optionType: "REMOVE",
  priceDeltaCents: 0,
};
// Negative delta — the doc says removals via negative delta are supported
// mathematically even if the app doesn't currently apply them.
const discount: MenuOption = {
  id: "opt-discount",
  name: "Loyalty Discount",
  optionType: "ADD",
  priceDeltaCents: -100,
};
const bigNegative: MenuOption = {
  id: "opt-big-neg",
  name: "Manager Comp",
  optionType: "ADD",
  priceDeltaCents: -99999,
};

const medium: MenuItemSize = { id: "sz-m", name: "Medium", priceCents: 1200 };
const large: MenuItemSize = { id: "sz-l", name: "Large", priceCents: 1600 };

const burger: MenuItem = {
  id: "item-burger",
  slug: "burger",
  name: "Burger",
  description: null,
  imageUrl: null,
  basePriceCents: 1000,
  options: [bacon, cheese, avocado, noOnions, discount, bigNegative],
  sizes: [medium, large],
};

const sizeless: MenuItem = {
  id: "item-fries",
  slug: "fries",
  name: "Fries",
  description: null,
  imageUrl: null,
  basePriceCents: 500,
  options: [cheese],
  // no sizes field at all
};

// ── Happy path ─────────────────────────────────────────────────────────────

describe("computeLineTotalCents — happy path", () => {
  test("returns basePriceCents when no options passed", () => {
    expect(computeLineTotalCents(burger)).toBe(1000);
  });

  test("returns basePriceCents when options is an empty object", () => {
    expect(computeLineTotalCents(burger, {})).toBe(1000);
  });

  test("size override replaces basePriceCents", () => {
    expect(computeLineTotalCents(burger, { size: "Medium" })).toBe(1200);
    expect(computeLineTotalCents(burger, { size: "Large" })).toBe(1600);
  });

  test("adds a single ADD-type addon", () => {
    expect(computeLineTotalCents(burger, { additions: ["Bacon"] })).toBe(
      1000 + 150,
    );
  });

  test("adds a single ADD_ON-type addon (alternate spelling)", () => {
    expect(computeLineTotalCents(burger, { additions: ["Cheese"] })).toBe(
      1000 + 100,
    );
  });

  test("multiple addons stack", () => {
    expect(
      computeLineTotalCents(burger, {
        additions: ["Bacon", "Cheese", "Avocado"],
      }),
    ).toBe(1000 + 150 + 100 + 200);
  });

  test("size override + multiple addons combined", () => {
    expect(
      computeLineTotalCents(burger, {
        size: "Large",
        additions: ["Bacon", "Cheese"],
      }),
    ).toBe(1600 + 150 + 100);
  });
});

// ── Adversarial ────────────────────────────────────────────────────────────

describe("computeLineTotalCents — adversarial", () => {
  test("unknown size id falls back to basePriceCents (does not throw)", () => {
    expect(() =>
      computeLineTotalCents(burger, { size: "XXL-does-not-exist" }),
    ).not.toThrow();
    expect(
      computeLineTotalCents(burger, { size: "XXL-does-not-exist" }),
    ).toBe(1000);
  });

  test("size specified but item has no sizes array — falls back to base", () => {
    expect(computeLineTotalCents(sizeless, { size: "Medium" })).toBe(500);
  });

  test("unknown addon name is silently skipped", () => {
    expect(() =>
      computeLineTotalCents(burger, { additions: ["Truffles"] }),
    ).not.toThrow();
    expect(computeLineTotalCents(burger, { additions: ["Truffles"] })).toBe(
      1000,
    );
  });

  test("mix of known + unknown addon names sums only the known ones", () => {
    expect(
      computeLineTotalCents(burger, {
        additions: ["Bacon", "Truffles", "Cheese"],
      }),
    ).toBe(1000 + 150 + 100);
  });

  test("option present on item but NOT an add-on type is ignored", () => {
    // "No Onions" is a REMOVE-type; must not price.
    expect(computeLineTotalCents(burger, { additions: ["No Onions"] })).toBe(
      1000,
    );
  });

  test("duplicates in additions are DE-DUPED (Set-based match, not counted twice)", () => {
    // FINDING-worthy: current impl builds a Set(additions) and iterates
    // item.options once, so "Bacon" listed twice still adds 150 exactly once.
    expect(
      computeLineTotalCents(burger, { additions: ["Bacon", "Bacon"] }),
    ).toBe(1000 + 150);
  });

  test("empty additions array leaves base untouched", () => {
    expect(computeLineTotalCents(burger, { additions: [] })).toBe(1000);
  });

  test("explicit null size behaves like undefined (base price)", () => {
    expect(computeLineTotalCents(burger, { size: null })).toBe(1000);
  });

  test("explicit undefined size behaves like omitted (base price)", () => {
    expect(computeLineTotalCents(burger, { size: undefined })).toBe(1000);
  });

  test("empty-string size does not match any size and falls through to base", () => {
    expect(computeLineTotalCents(burger, { size: "" })).toBe(1000);
  });

  test("negative priceDeltaCents addon is applied (subtracts from base)", () => {
    expect(
      computeLineTotalCents(burger, { additions: ["Loyalty Discount"] }),
    ).toBe(1000 - 100);
  });

  test("addon large enough to drive total negative RETURNS a negative number (no clamp)", () => {
    // FINDING: pricing.ts does not clamp — a bad backend payload can
    // produce a negative line total. Documented, not fixed.
    const result = computeLineTotalCents(burger, {
      additions: ["Manager Comp"],
    });
    expect(result).toBe(1000 - 99999);
    expect(result).toBeLessThan(0);
  });

  test("size match is case-sensitive — 'medium' does NOT match 'Medium'", () => {
    // Implementation uses strict === via find(). Casing matters.
    expect(computeLineTotalCents(burger, { size: "medium" })).toBe(1000);
  });

  test("addon name match is case-sensitive", () => {
    // Implementation uses Set.has on strings; case matters.
    expect(computeLineTotalCents(burger, { additions: ["bacon"] })).toBe(1000);
  });

  test("size override applies even when additions is undefined", () => {
    expect(computeLineTotalCents(burger, { size: "Medium" })).toBe(1200);
  });
});
