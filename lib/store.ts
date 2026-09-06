import { create } from "zustand";
import { buildCartKey, type CartItem } from "./types";

/** Input for adding an item — caller doesn't have to compute cartKey or
 *  set quantity; the store derives the key and starts qty at 1 (or
 *  increments if a matching line already exists). deliveryDateId and
 *  schoolId are passed as separate arguments to addItem (see below), not
 *  part of this input type, since every existing call site already
 *  passes them that way. */
type AddItemInput = Omit<CartItem, "cartKey" | "quantity" | "deliveryDateId" | "schoolId">;

type CartStore = {
  items: CartItem[];
  addItem: (item: AddItemInput, deliveryDateId: string, schoolId: string) => void;
  /** +1 to the quantity on an existing line. */
  incrementItem: (cartKey: string) => void;
  /** −1 to the quantity. Removes the line entirely when it hits 0. */
  decrementItem: (cartKey: string) => void;
  /** Drop a line regardless of its current quantity. */
  removeItem: (cartKey: string) => void;
  /** Assign a single cart line to a specific saved child, for the
   *  multi-child single-day checkout flow (cart.tsx). Does not affect
   *  any other line. */
  assignItemToChild: (cartKey: string, parentChildId: string) => void;
  clearCart: () => void;
  /** Sum of (per-unit total × quantity) across all lines. */
  total: () => number;
  /** Total number of units (sum of quantities), not number of lines. */
  count: () => number;
  /** Distinct schoolIds represented across all cart lines. Empty for an
   *  empty cart. Cart screens use this to decide whether to show
   *  per-school grouping (2+ schools) or the simpler single-school
   *  layout (0 or 1). */
  schoolIds: () => string[];
};

export const useCart = create<CartStore>((set, get) => ({
  items: [],

  addItem: (input, deliveryDateId, schoolId) =>
    set((state) => {
      const cartKey = buildCartKey(
        input.menuItemId,
        input.size,
        input.choice,
        input.additions,
        input.removals,
        deliveryDateId,
      );
      // Adding from a different school's menu no longer wipes the cart —
      // each line carries its own deliveryDateId/schoolId, so a cart can
      // genuinely hold items for children at more than one school at
      // once. buildCartKey already includes deliveryDateId, so the exact
      // same menu item added from two different schools naturally stays
      // two separate lines rather than colliding into one.
      const existing = state.items.findIndex((i) => i.cartKey === cartKey);
      if (existing >= 0) {
        // Same item + same customizations + same delivery date → bump
        // quantity instead of adding a duplicate row.
        const items = [...state.items];
        items[existing] = { ...items[existing], quantity: items[existing].quantity + 1 };
        return { items };
      }
      return {
        items: [...state.items, { ...input, cartKey, deliveryDateId, schoolId, quantity: 1 }],
      };
    }),

  incrementItem: (cartKey) =>
    set((state) => ({
      items: state.items.map((i) =>
        i.cartKey === cartKey ? { ...i, quantity: i.quantity + 1 } : i,
      ),
    })),

  decrementItem: (cartKey) =>
    set((state) => {
      const items: CartItem[] = [];
      for (const i of state.items) {
        if (i.cartKey !== cartKey) {
          items.push(i);
          continue;
        }
        if (i.quantity > 1) {
          items.push({ ...i, quantity: i.quantity - 1 });
        }
        // else: drop the line entirely
      }
      return { items };
    }),

  removeItem: (cartKey) =>
    set((state) => ({ items: state.items.filter((i) => i.cartKey !== cartKey) })),

  assignItemToChild: (cartKey, parentChildId) =>
    set((state) => ({
      items: state.items.map((i) =>
        i.cartKey === cartKey ? { ...i, parentChildId } : i,
      ),
    })),

  clearCart: () => set({ items: [] }),

  total: () =>
    get().items.reduce((sum, item) => sum + item.lineTotalCents * item.quantity, 0),

  count: () => get().items.reduce((sum, item) => sum + item.quantity, 0),

  schoolIds: () => [...new Set(get().items.map((i) => i.schoolId))],
}));

// Format cents as $X.XX
export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
