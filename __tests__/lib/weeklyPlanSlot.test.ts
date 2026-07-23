/**
 * Tests for lib/weeklyPlanSlot — classifySlot and countDoneSlots.
 *
 * Both functions are pure; no mocks needed.
 * Requires lib/weeklyPlanSlot.ts from the dev branch
 * (agent/weekly-plan-order-awareness) to be present before running.
 */

import { classifySlot, countDoneSlots } from "../../lib/weeklyPlanSlot";
import type {
  WeeklyDeliveryDate,
  WeeklyPlan,
  OrderHistoryItem,
} from "../../lib/types";

// ── Minimal stubs ─────────────────────────────────────────────────────────────

function makeDate(id: string): WeeklyDeliveryDate {
  return {
    id,
    schoolId: "school-1",
    deliveryDate: "2026-07-28",
    cutoffAt: "2026-07-27T17:00:00Z",
    school: { id: "school-1", name: "Test School", timezone: "America/Chicago" },
    menuItems: [],
  };
}

function makePlan(parentChildId: string, weekday = 1): WeeklyPlan {
  return {
    id: "plan-1",
    parentChildId,
    weekday,
    menuItemId: "item-1",
    menuItemName: "Pizza",
    choice: null,
    size: null,
    additions: [],
    removals: [],
    isActive: true,
  };
}

function makeOrder(overrides: Partial<OrderHistoryItem> = {}): OrderHistoryItem {
  return {
    id: "order-1",
    orderNumber: "ORD-001",
    status: "COMPLETED",
    deliveryDate: "2026-07-28",
    schoolName: "Test School",
    totalCents: 899,
    createdAt: "2026-07-22T10:00:00Z",
    items: [{ name: "Pizza", lineTotalCents: 899, additions: [], removals: [] }],
    parentChildId: "child-1",
    deliveryDateId: "date-1",
    ...overrides,
  };
}

const DATE = makeDate("date-1");
const CHILD_ID = "child-1";

// ── classifySlot ──────────────────────────────────────────────────────────────

describe("classifySlot", () => {
  // 1. Empty slot
  it("returns empty when no plans and no orders", () => {
    const result = classifySlot(DATE, [], [], CHILD_ID);
    expect(result).toEqual({ kind: "empty" });
  });

  // 2. Drafted slot
  it("returns drafted with plans when plans exist and no matching order", () => {
    const plan = makePlan(CHILD_ID);
    const result = classifySlot(DATE, [plan], [], CHILD_ID);
    expect(result.kind).toBe("drafted");
    if (result.kind === "drafted") expect(result.plans).toEqual([plan]);
  });

  // 3. Ordered slot — matching parentChildId + deliveryDateId, not cancelled
  it("returns ordered when a non-cancelled order matches child and date", () => {
    const order = makeOrder();
    const result = classifySlot(DATE, [], [order], CHILD_ID);
    expect(result.kind).toBe("ordered");
    if (result.kind === "ordered") expect(result.order).toBe(order);
  });

  // 4. Ordered wins over draft
  it("returns ordered (not drafted) when both a plan and a matching order exist", () => {
    const plan = makePlan(CHILD_ID);
    const order = makeOrder();
    const result = classifySlot(DATE, [plan], [order], CHILD_ID);
    expect(result.kind).toBe("ordered");
  });

  // 5. Missing deliveryDateId (undefined) — must not crash
  it("does not match order with deliveryDateId: undefined", () => {
    const order = makeOrder({ deliveryDateId: undefined });
    const result = classifySlot(DATE, [], [order], CHILD_ID);
    expect(result.kind).toBe("empty");
  });

  // 6. deliveryDateId: null — same as undefined, must not crash
  it("does not match order with deliveryDateId: null", () => {
    // Cast through unknown to satisfy TypeScript since the field is optional
    const order = makeOrder({ deliveryDateId: undefined });
    (order as Record<string, unknown>).deliveryDateId = null;
    const result = classifySlot(DATE, [], [order], CHILD_ID);
    expect(result.kind).toBe("empty");
  });

  // 7. Wrong child — matching date but different parentChildId
  it("does not classify slot as ordered when parentChildId does not match", () => {
    const order = makeOrder({ parentChildId: "child-OTHER" });
    const result = classifySlot(DATE, [], [order], CHILD_ID);
    expect(result.kind).toBe("empty");
  });

  // 8. Cancelled order — must not count
  it("does not classify slot as ordered when status is CANCELLED", () => {
    const order = makeOrder({ status: "CANCELLED" });
    const result = classifySlot(DATE, [], [order], CHILD_ID);
    expect(result.kind).toBe("empty");
  });

  // 9. Multiple orders — only the matching one is used
  it("finds the correct order when multiple orders exist", () => {
    const wrongDate = makeOrder({ deliveryDateId: "date-OTHER", id: "order-wrong" });
    const wrongChild = makeOrder({ parentChildId: "child-OTHER", id: "order-wrong-child" });
    const correct = makeOrder({ id: "order-correct" });
    const result = classifySlot(DATE, [], [wrongDate, wrongChild, correct], CHILD_ID);
    expect(result.kind).toBe("ordered");
    if (result.kind === "ordered") expect(result.order.id).toBe("order-correct");
  });

  // 10. parentChildId: undefined on order — must not crash or spuriously match
  it("does not match order with parentChildId: undefined", () => {
    const order = makeOrder({ parentChildId: undefined });
    const result = classifySlot(DATE, [], [order], CHILD_ID);
    expect(result.kind).toBe("empty");
  });
});

// ── countDoneSlots ────────────────────────────────────────────────────────────

type Slot = { plans: WeeklyPlan[]; order: OrderHistoryItem | null };

describe("countDoneSlots", () => {
  // 11. All empty
  it("returns 0 for all-empty slots", () => {
    const slots: Slot[] = [
      { plans: [], order: null },
      { plans: [], order: null },
    ];
    expect(countDoneSlots(slots)).toBe(0);
  });

  // 12. All drafted
  it("counts all slots when every slot has a plan", () => {
    const plan = makePlan(CHILD_ID);
    const slots: Slot[] = [
      { plans: [plan], order: null },
      { plans: [plan], order: null },
      { plans: [plan], order: null },
    ];
    expect(countDoneSlots(slots)).toBe(3);
  });

  // 13. All ordered
  it("counts all slots when every slot has an order", () => {
    const order = makeOrder();
    const slots: Slot[] = [
      { plans: [], order },
      { plans: [], order },
    ];
    expect(countDoneSlots(slots)).toBe(2);
  });

  // 14. Mixed — empty, drafted, ordered
  it("counts only done slots in a mixed array", () => {
    const plan = makePlan(CHILD_ID);
    const order = makeOrder();
    const slots: Slot[] = [
      { plans: [], order: null },    // empty
      { plans: [plan], order: null }, // drafted
      { plans: [], order },          // ordered
      { plans: [], order: null },    // empty
    ];
    expect(countDoneSlots(slots)).toBe(2);
  });

  // 15. Slot with both plan and order — counted once, not twice
  it("counts a slot with both a plan and an order as 1", () => {
    const plan = makePlan(CHILD_ID);
    const order = makeOrder();
    const slots: Slot[] = [{ plans: [plan], order }];
    expect(countDoneSlots(slots)).toBe(1);
  });

  // 16. Empty array
  it("returns 0 for an empty slots array", () => {
    expect(countDoneSlots([])).toBe(0);
  });
});
