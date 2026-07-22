import { buildModifyPlan } from "../../lib/modify";
import type { MenuItem, OrderHistoryItem } from "../../lib/types";

function makeMenuItem(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id: "item-1",
    slug: "item-1",
    name: "Burger",
    description: null,
    imageUrl: null,
    basePriceCents: 800,
    options: [],
    ...overrides,
  };
}

function makeOrderHistoryItem(
  items: OrderHistoryItem["items"],
): OrderHistoryItem {
  return {
    id: "order-1",
    orderNumber: "ORD-001",
    status: "PAID",
    deliveryDate: "2026-08-01",
    schoolName: "FSS Kitchen",
    totalCents: 800,
    createdAt: "2026-07-01T12:00:00Z",
    items,
  };
}

function makeMenuItemWithSizes(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    ...makeMenuItem(),
    sizes: [
      { id: "sz-1", name: "Small", priceCents: 700 },
      { id: "sz-2", name: "Large", priceCents: 1000 },
    ],
    ...overrides,
  };
}

describe("buildModifyPlan", () => {
  // ── Happy path — all matched ───────────────────────────────────────────────

  test("single matching item goes to matched, not unmatched", () => {
    const menu = [makeMenuItem({ name: "Burger" })];
    const order = makeOrderHistoryItem([
      { name: "Burger", lineTotalCents: 800, additions: [], removals: [] },
    ]);
    const plan = buildModifyPlan(order, menu);
    expect(plan.matched).toHaveLength(1);
    expect(plan.unmatched).toHaveLength(0);
  });

  test("matched item carries the order's additions through", () => {
    const menu = [makeMenuItem({ name: "Burger" })];
    const order = makeOrderHistoryItem([
      { name: "Burger", lineTotalCents: 900, additions: ["Extra Cheese", "Bacon"], removals: [] },
    ]);
    const plan = buildModifyPlan(order, menu);
    expect(plan.matched[0].additions).toEqual(["Extra Cheese", "Bacon"]);
  });

  test("matched item carries the order's removals through", () => {
    const menu = [makeMenuItem({ name: "Burger" })];
    const order = makeOrderHistoryItem([
      { name: "Burger", lineTotalCents: 700, additions: [], removals: ["Onion", "Pickles"] },
    ]);
    const plan = buildModifyPlan(order, menu);
    expect(plan.matched[0].removals).toEqual(["Onion", "Pickles"]);
  });

  test("matched[0].menuItem is the correct MenuItem object", () => {
    const burger = makeMenuItem({ id: "burger-123", name: "Burger" });
    const menu = [burger];
    const order = makeOrderHistoryItem([
      { name: "Burger", lineTotalCents: 800, additions: [], removals: [] },
    ]);
    const plan = buildModifyPlan(order, menu);
    expect(plan.matched[0].menuItem.id).toBe("burger-123");
    expect(plan.matched[0].menuItem.name).toBe("Burger");
  });

  test("multiple matched items preserve order-item order, not menu order", () => {
    const fries = makeMenuItem({ id: "fries-1", name: "Fries" });
    const burger = makeMenuItem({ id: "burger-1", name: "Burger" });
    // Menu has Fries first, order has Burger first — matched must follow order order
    const menu = [fries, burger];
    const order = makeOrderHistoryItem([
      { name: "Burger", lineTotalCents: 800, additions: [], removals: [] },
      { name: "Fries", lineTotalCents: 300, additions: [], removals: [] },
    ]);
    const plan = buildModifyPlan(order, menu);
    expect(plan.matched).toHaveLength(2);
    expect(plan.matched[0].menuItem.id).toBe("burger-1");
    expect(plan.matched[1].menuItem.id).toBe("fries-1");
  });

  // ── Mixed — some matched, some not ────────────────────────────────────────

  test("one matching and one not: matched.length === 1, unmatched.length === 1", () => {
    const menu = [makeMenuItem({ name: "Burger" })];
    const order = makeOrderHistoryItem([
      { name: "Burger", lineTotalCents: 800, additions: [], removals: [] },
      { name: "Deleted Item", lineTotalCents: 500, additions: [], removals: [] },
    ]);
    const plan = buildModifyPlan(order, menu);
    expect(plan.matched).toHaveLength(1);
    expect(plan.unmatched).toHaveLength(1);
  });

  test("unmatched[0].name is the name of the item not on the menu", () => {
    const menu = [makeMenuItem({ name: "Burger" })];
    const order = makeOrderHistoryItem([
      { name: "Burger", lineTotalCents: 800, additions: [], removals: [] },
      { name: "Ghost Item", lineTotalCents: 500, additions: [], removals: [] },
    ]);
    const plan = buildModifyPlan(order, menu);
    expect(plan.unmatched[0].name).toBe("Ghost Item");
  });

  // ── All unmatched ──────────────────────────────────────────────────────────

  test("no menu matches at all: matched is empty, unmatched has all order items", () => {
    const menu = [makeMenuItem({ name: "Salad" })];
    const order = makeOrderHistoryItem([
      { name: "Burger", lineTotalCents: 800, additions: [], removals: [] },
      { name: "Fries", lineTotalCents: 300, additions: [], removals: [] },
    ]);
    const plan = buildModifyPlan(order, menu);
    expect(plan.matched).toHaveLength(0);
    expect(plan.unmatched).toHaveLength(2);
    expect(plan.unmatched.map((u) => u.name)).toEqual(["Burger", "Fries"]);
  });

  // ── Empty cases ────────────────────────────────────────────────────────────

  test("order with no items: both arrays empty", () => {
    const menu = [makeMenuItem()];
    const order = makeOrderHistoryItem([]);
    const plan = buildModifyPlan(order, menu);
    expect(plan.matched).toHaveLength(0);
    expect(plan.unmatched).toHaveLength(0);
  });

  test("menu with no items: all order items go to unmatched", () => {
    const menu: MenuItem[] = [];
    const order = makeOrderHistoryItem([
      { name: "Burger", lineTotalCents: 800, additions: [], removals: [] },
    ]);
    const plan = buildModifyPlan(order, menu);
    expect(plan.matched).toHaveLength(0);
    expect(plan.unmatched).toHaveLength(1);
    expect(plan.unmatched[0].name).toBe("Burger");
  });

  // ── Adversarial ────────────────────────────────────────────────────────────

  test("case-sensitive: 'burger' does not match menu item named 'Burger'", () => {
    const menu = [makeMenuItem({ name: "Burger" })];
    const order = makeOrderHistoryItem([
      { name: "burger", lineTotalCents: 800, additions: [], removals: [] },
    ]);
    const plan = buildModifyPlan(order, menu);
    expect(plan.matched).toHaveLength(0);
    expect(plan.unmatched).toHaveLength(1);
    expect(plan.unmatched[0].name).toBe("burger");
  });

  test("no implicit trim: 'Burger ' (trailing space) does not match 'Burger'", () => {
    const menu = [makeMenuItem({ name: "Burger" })];
    const order = makeOrderHistoryItem([
      { name: "Burger ", lineTotalCents: 800, additions: [], removals: [] },
    ]);
    const plan = buildModifyPlan(order, menu);
    expect(plan.matched).toHaveLength(0);
    expect(plan.unmatched).toHaveLength(1);
  });

  test("duplicate order item name: both match independently, matched.length === 2", () => {
    const burger = makeMenuItem({ id: "burger-1", name: "Burger" });
    const menu = [burger];
    const order = makeOrderHistoryItem([
      { name: "Burger", lineTotalCents: 800, additions: [], removals: [] },
      { name: "Burger", lineTotalCents: 800, additions: ["Cheese"], removals: [] },
    ]);
    const plan = buildModifyPlan(order, menu);
    expect(plan.matched).toHaveLength(2);
    expect(plan.unmatched).toHaveLength(0);
    expect(plan.matched[0].menuItem.id).toBe("burger-1");
    expect(plan.matched[1].menuItem.id).toBe("burger-1");
    expect(plan.matched[0].additions).toEqual([]);
    expect(plan.matched[1].additions).toEqual(["Cheese"]);
  });

  test("order item with empty additions/removals: matched item has empty arrays", () => {
    const menu = [makeMenuItem({ name: "Burger" })];
    const order = makeOrderHistoryItem([
      { name: "Burger", lineTotalCents: 800, additions: [], removals: [] },
    ]);
    const plan = buildModifyPlan(order, menu);
    expect(plan.matched[0].additions).toEqual([]);
    expect(plan.matched[0].removals).toEqual([]);
  });

  test("additions passed through even when menu item has no matching option objects", () => {
    // buildModifyPlan passes history values through without filtering by menu options
    const menu = [makeMenuItem({ name: "Burger", options: [] })];
    const order = makeOrderHistoryItem([
      { name: "Burger", lineTotalCents: 1000, additions: ["Avocado", "Extra Patty"], removals: [] },
    ]);
    const plan = buildModifyPlan(order, menu);
    expect(plan.matched[0].additions).toEqual(["Avocado", "Extra Patty"]);
  });

  // ── Size picker contract ───────────────────────────────────────────────────
  //
  // buildModifyPlan does NOT pre-seed size or choice on matched items —
  // OrderHistoryItem carries no size or choice fields. The modal initialises
  // both as null and requires the customer to explicitly confirm them before
  // submission (same validation gate for both). These tests document that
  // the menuItem reference on matched items carries the sizes array the
  // modal needs to render the picker and enforce explicit selection.

  test("matched menuItem with sizes preserves sizes array (modal can render size picker)", () => {
    const menu = [makeMenuItemWithSizes({ name: "Burger" })];
    const order = makeOrderHistoryItem([
      { name: "Burger", lineTotalCents: 1000, additions: [], removals: [] },
    ]);
    const plan = buildModifyPlan(order, menu);
    expect(plan.matched).toHaveLength(1);
    expect(plan.matched[0].menuItem.sizes).toHaveLength(2);
    expect(plan.matched[0].menuItem.sizes![0].name).toBe("Small");
    expect(plan.matched[0].menuItem.sizes![1].name).toBe("Large");
  });

  test("matched menuItem without sizes has no sizes field (size picker correctly skipped)", () => {
    const menu = [makeMenuItem({ name: "Burger" })]; // no sizes field
    const order = makeOrderHistoryItem([
      { name: "Burger", lineTotalCents: 800, additions: [], removals: [] },
    ]);
    const plan = buildModifyPlan(order, menu);
    expect(plan.matched).toHaveLength(1);
    expect(plan.matched[0].menuItem.sizes).toBeUndefined();
  });

  test("adversarial: empty sizes array treated same as no sizes — picker skipped", () => {
    const menu = [makeMenuItem({ name: "Burger", sizes: [] })];
    const order = makeOrderHistoryItem([
      { name: "Burger", lineTotalCents: 800, additions: [], removals: [] },
    ]);
    const plan = buildModifyPlan(order, menu);
    expect(plan.matched).toHaveLength(1);
    // Modal checks (menuItem.sizes?.length ?? 0) > 0 before rendering the size picker;
    // empty array produces 0, so no picker is shown and no size is required.
    expect(plan.matched[0].menuItem.sizes).toHaveLength(0);
  });
});
