import { create } from "zustand";
import type { CartItem } from "./types";

type CartStore = {
  items: CartItem[];
  deliveryDateId: string | null;
  schoolId: string | null;
  addItem: (item: CartItem, deliveryDateId: string, schoolId: string) => void;
  removeItem: (menuItemId: string) => void;
  clearCart: () => void;
  total: () => number;
  count: () => number;
};

export const useCart = create<CartStore>((set, get) => ({
  items: [],
  deliveryDateId: null,
  schoolId: null,

  addItem: (item, deliveryDateId, schoolId) =>
    set((state) => {
      // Switching dates clears the cart
      if (state.deliveryDateId && state.deliveryDateId !== deliveryDateId) {
        return { items: [item], deliveryDateId, schoolId };
      }
      const existing = state.items.findIndex(
        (i) => i.menuItemId === item.menuItemId
      );
      if (existing >= 0) {
        const items = [...state.items];
        items[existing] = item;
        return { items, deliveryDateId, schoolId };
      }
      return { items: [...state.items, item], deliveryDateId, schoolId };
    }),

  removeItem: (menuItemId) =>
    set((state) => ({
      items: state.items.filter((i) => i.menuItemId !== menuItemId),
    })),

  clearCart: () => set({ items: [], deliveryDateId: null, schoolId: null }),

  total: () =>
    get().items.reduce((sum, item) => sum + item.lineTotalCents, 0),

  count: () => get().items.length,
}));

// Format cents as $X.XX
export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
