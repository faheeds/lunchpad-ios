import type { OrderHistoryItem, MenuItem } from "./types";

export type MatchedItem = {
  menuItem: MenuItem;
  additions: string[];
  removals: string[];
};

export type UnmatchedItem = {
  name: string;
};

export type ModifyPlan = {
  matched: MatchedItem[];
  unmatched: UnmatchedItem[];
};

/**
 * Matches each order line item to a current menu item by exact name.
 * Returns matched items (have a known menuItemId) and unmatched (no longer on menu).
 */
export function buildModifyPlan(
  order: OrderHistoryItem,
  menuItems: MenuItem[],
): ModifyPlan {
  const matched: MatchedItem[] = [];
  const unmatched: UnmatchedItem[] = [];
  for (const item of order.items) {
    const menuItem = menuItems.find((m) => m.name === item.name);
    if (menuItem) {
      matched.push({ menuItem, additions: item.additions, removals: item.removals });
    } else {
      unmatched.push({ name: item.name });
    }
  }
  return { matched, unmatched };
}
