import { create } from "zustand";
import { buildCartKey, type CartItem } from "./types";

/** Input for adding an item — caller doesn't have to compute cartKey or
 *  set quantity; the store derives the key and starts qty at 1 (or
 *  increments if a matching line already exists). */
type AddItemInput = Omit<CartItem, "cartKey" | "quantity">;

type CartStore = {
  items: CartItem[];
  deliveryDateId: string | null;
  schoolId: string | null;
  addItem: (item: AddItemInput, deliveryDateId: string, schoolId: string) => void;
  /** +1 to the quantity on an existing line. */
  incrementItem: (cartKey: string) => void;
  /** −1 to the quantity. Removes the line entirely when it hits 0. */
  decrementItem: (cartKey: string) => void;
  /** Drop a line regardless of its current quantity. */
  removeItem: (cartKey: string) => void;
  clearCart: () => void;
  /** Sum of (per-unit total × quantity) across all lines. */
  total: () => number;
  /** Total number of units (sum of quantities), not number of lines. */
  count: () => number;
};

export const useCart = create<CartStore>((set, get) => ({
  items: [],
  deliveryDateId: null,
  schoolId: null,

  addItem: (input, deliveryDateId, schoolId) =>
    set((state) => {
      const cartKey = buildCartKey(input.menuItemId, input.additions, input.removals);
      // Switching delivery dates wipes the cart — different menus / different
      // kitchens. Start a fresh single-item cart on the new date.
      if (state.deliveryDateId && state.deliveryDateId !== deliveryDateId) {
        return {
          items: [{ ...input, cartKey, quantity: 1 }],
          deliveryDateId,
          schoolId,
        };
      }
      const existing = state.items.findIndex((i) => i.cartKey === cartKey);
      if (existing >= 0) {
        // Same item + same customizations → bump quantity instead of
        // adding a duplicate row.
        const items = [...state.items];
        items[existing] = { ...items[existing], quantity: items[existing].quantity + 1 };
        return { items, deliveryDateId, schoolId };
      }
      return {
        items: [...state.items, { ...input, cartKey, quantity: 1 }],
        deliveryDateId,
        schoolId,
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
      // If the cart is now empty, also clear delivery context so a fresh
      // cart can start on any date.
      if (items.length === 0) {
        return { items, deliveryDateId: null, schoolId: null };
      }
      return { items };
    }),

  removeItem: (cartKey) =>
    set((state) => {
      const items = state.items.filter((i) => i.cartKey !== cartKey);
      if (items.length === 0) {
        return { items, deliveryDateId: null, schoolId: null };
      }
      return { items };
    }),

  clearCart: () => set({ items: [], deliveryDateId: null, schoolId: null }),

  total: () =>
    get().items.reduce((sum, item) => sum + item.lineTotalCents * item.quantity, 0),

  count: () => get().items.reduce((sum, item) => sum + item.quantity, 0),
}));

// Format cents as $X.XX
export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
