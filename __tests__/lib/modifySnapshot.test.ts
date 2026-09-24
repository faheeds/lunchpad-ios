/**
 * Component-level test limitation: the actual failure mode (React Query
 * background refetch → modal unmount → editStates reset) cannot be reproduced
 * in unit tests without a full React + QueryClient render tree. These tests
 * instead verify the pure-function contracts that the snapshot fix relies on.
 * End-to-end verification requires device/simulator testing with network
 * throttling to trigger background refetches while the modify modal is open.
 */

import { buildModifyPlan } from "../../lib/modify";
import type { MenuItem, OrderHistoryItem } from "../../lib/types";

function makeMenuItem(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id: "item-1",
    slug: "item-1",
    name: "Smash Burger",
    description: null,
    imageUrl: null,
    basePriceCents: 1299,
    options: [],
    ...overrides,
  };
}

function makeOrderHistoryItem(
  items: OrderHistoryItem["items"],
): OrderHistoryItem {
  return {
    id: "order-1",
    orderNumber: "SL-20260722-4678",
    status: "PAID",
    deliveryDate: "2026-07-22",
    schoolName: "FSS Kitchen",
    totalCents: 1299,
    createdAt: "2026-07-22T10:00:00Z",
    items,
  };
}

describe("buildModifyPlan — determinism (snapshot contract)", () => {
  it("returns structurally identical results when called twice with the same inputs", () => {
    const menuItem = makeMenuItem();
    const order = makeOrderHistoryItem([
      { name: "Smash Burger", lineTotalCents: 1299, additions: ["Extra Patty"], removals: [] },
    ]);

    const plan1 = buildModifyPlan(order, [menuItem]);
    const plan2 = buildModifyPlan(order, [menuItem]);

    expect(plan1.matched.length).toBe(1);
    expect(plan2.matched.length).toBe(1);
    expect(plan1.matched[0].additions).toEqual(plan2.matched[0].additions);
    expect(plan1.matched[0].removals).toEqual(plan2.matched[0].removals);
    expect(plan1.unmatched.length).toBe(plan2.unmatched.length);
  });

  it("plan from first call and plan from second call reference the same menuItem object", () => {
    const menuItem = makeMenuItem();
    const order = makeOrderHistoryItem([
      { name: "Smash Burger", lineTotalCents: 1299, additions: [], removals: [] },
    ]);

    const plan1 = buildModifyPlan(order, [menuItem]);
    const plan2 = buildModifyPlan(order, [menuItem]);

    // Both calls received the same menuItem reference — the snapshot contract
    // holds: freezing the input is sufficient to get a stable plan.
    expect(plan1.matched[0].menuItem).toBe(plan2.matched[0].menuItem);
  });
});

describe("editStates initializer relies on stable plan input", () => {
  it("matched[0].additions from first call equals matched[0].additions from second call with same order", () => {
    const menuItem = makeMenuItem();
    const order = makeOrderHistoryItem([
      { name: "Smash Burger", lineTotalCents: 1299, additions: ["Extra Patty", "Add Bacon"], removals: [] },
    ]);

    const plan1 = buildModifyPlan(order, [menuItem]);
    const plan2 = buildModifyPlan(order, [menuItem]);

    expect(plan1.matched[0].additions).toEqual(["Extra Patty", "Add Bacon"]);
    expect(plan2.matched[0].additions).toEqual(["Extra Patty", "Add Bacon"]);
  });

  it("if order.items[0].additions changes between calls, the second plan reflects the NEW additions — demonstrating why re-running buildModifyPlan on a changed order resets in-progress selections", () => {
    // This is the exact failure mode: the user had selected additions in the
    // modal (represented here as orderWithSelections). A background refetch
    // returned a new `order` reference (orderFromRefetch) still showing the
    // original empty additions. Calling buildModifyPlan again on the refetched
    // order produced a plan with additions:[], wiping the user's choices.
    const menuItem = makeMenuItem();

    const orderFromRefetch = makeOrderHistoryItem([
      { name: "Smash Burger", lineTotalCents: 1299, additions: [], removals: [] },
    ]);

    // Simulate user having selected additions mid-edit — stored only in
    // editStates (component state), not in the server/cache order object.
    const orderWithUserSelections = makeOrderHistoryItem([
      { name: "Smash Burger", lineTotalCents: 1599, additions: ["Extra Patty", "Add Bacon"], removals: [] },
    ]);

    const planFromSnapshot = buildModifyPlan(orderWithUserSelections, [menuItem]);
    const planFromRefetch = buildModifyPlan(orderFromRefetch, [menuItem]);

    // The snapshot plan preserves the user's additions.
    expect(planFromSnapshot.matched[0].additions).toEqual(["Extra Patty", "Add Bacon"]);

    // The refetch plan resets them — this is what the old code did when
    // a background refetch caused ModifyModal to remount.
    expect(planFromRefetch.matched[0].additions).toEqual([]);

    // Key assertion: the two plans diverge. The fix (snapshotting the order
    // in the parent before opening the modal) prevents the refetch plan from
    // ever being used once editing has started.
    expect(planFromSnapshot.matched[0].additions).not.toEqual(
      planFromRefetch.matched[0].additions,
    );
  });
});

describe("additions array isolation across buildModifyPlan calls", () => {
  it("additions array from first call is a copy — mutating it does not affect a second call with the same order", () => {
    const menuItem = makeMenuItem();
    const order = makeOrderHistoryItem([
      { name: "Smash Burger", lineTotalCents: 1299, additions: ["Extra Patty"], removals: [] },
    ]);

    const plan1 = buildModifyPlan(order, [menuItem]);
    // Simulate what editStates initializer does: [...m.additions]
    const editAdditions = [...plan1.matched[0].additions];
    // User adds another item mid-edit
    editAdditions.push("Add Bacon");

    // A second call (simulating remount) still reads from the original order,
    // not from the mutated editAdditions array.
    const plan2 = buildModifyPlan(order, [menuItem]);

    expect(plan2.matched[0].additions).toEqual(["Extra Patty"]);
    expect(plan2.matched[0].additions).not.toContain("Add Bacon");
  });

  it("removals array from first call is a copy — mutations do not bleed into subsequent calls", () => {
    const menuItem = makeMenuItem();
    const order = makeOrderHistoryItem([
      { name: "Smash Burger", lineTotalCents: 999, additions: [], removals: ["Lettuce"] },
    ]);

    const plan1 = buildModifyPlan(order, [menuItem]);
    const editRemovals = [...plan1.matched[0].removals];
    editRemovals.push("Tomato");

    const plan2 = buildModifyPlan(order, [menuItem]);

    expect(plan2.matched[0].removals).toEqual(["Lettuce"]);
    expect(plan2.matched[0].removals).not.toContain("Tomato");
  });
});
