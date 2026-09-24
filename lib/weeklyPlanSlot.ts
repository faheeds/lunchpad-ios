import type { WeeklyPlan, WeeklyDeliveryDate, OrderHistoryItem } from "./types";

export type SlotClassification =
  | { kind: "empty" }
  | { kind: "drafted"; plans: WeeklyPlan[] }
  | { kind: "ordered"; order: OrderHistoryItem };

/**
 * Classify a single weekday slot.
 *
 * Priority: if a non-cancelled order matches this slot for the active child,
 * the slot is "ordered" regardless of whether a draft plan also exists
 * (plans are cleared server-side on checkout, but handle defensively).
 *
 * Match requires BOTH parentChildId === activeChildId AND
 * deliveryDateId === date.id. If either field is absent on the order
 * (pre-rollout records), the order is skipped — never crash on missing fields.
 */
export function classifySlot(
  date: WeeklyDeliveryDate,
  plans: WeeklyPlan[],
  orders: OrderHistoryItem[],
  activeChildId: string,
): SlotClassification {
  const order =
    orders.find(
      (o) =>
        o.parentChildId != null &&
        o.parentChildId === activeChildId &&
        o.deliveryDateId != null &&
        o.deliveryDateId === date.id &&
        o.status !== "CANCELLED",
    ) ?? null;

  if (order) return { kind: "ordered", order };
  if (plans.length > 0) return { kind: "drafted", plans };
  return { kind: "empty" };
}

/**
 * Count how many slots are "done" (drafted or ordered).
 * A slot that has BOTH a plan and an order is counted once.
 */
export function countDoneSlots(
  slots: Array<{ plans: WeeklyPlan[]; order: OrderHistoryItem | null }>,
): number {
  return slots.filter((s) => s.order !== null || s.plans.length > 0).length;
}
