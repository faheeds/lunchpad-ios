/**
 * Unit tests for useCart total() and count() selectors.
 *
 * Zustand store — we drive it through its public API (addItem, incrementItem,
 * decrementItem, clearCart) rather than mutating internals, since the store
 * derives cartKey from buildCartKey.
 *
 * total() = sum of (item.lineTotalCents * item.quantity) across items
 * count() = sum of item.quantity across items
 */

import { useCart } from "../../lib/store";
import type { CartItem } from "../../lib/types";

// ── Helpers ────────────────────────────────────────────────────────────────

type AddInput = Omit<CartItem, "cartKey" | "quantity">;

function makeItem(overrides: Partial<AddInput> = {}): AddInput {
  return {
    menuItemId: "item-1",
    itemName: "Burger",
    basePriceCents: 1000,
    additions: [],
    removals: [],
    lineTotalCents: 1000,
    ...overrides,
  };
}

// Reset store between every test — zustand keeps a module-singleton store.
beforeEach(() => {
  useCart.getState().clearCart();
});

// ── Happy path ─────────────────────────────────────────────────────────────

describe("useCart.total() and count() — happy path", () => {
  test("empty cart returns total 0 and count 0", () => {
    expect(useCart.getState().total()).toBe(0);
    expect(useCart.getState().count()).toBe(0);
  });

  test("single item, quantity 1 gives total = lineTotalCents, count = 1", () => {
    useCart.getState().addItem(makeItem({ lineTotalCents: 1250 }), "dd-1", "sch-1");
    expect(useCart.getState().total()).toBe(1250);
    expect(useCart.getState().count()).toBe(1);
  });

  test("adding same item twice bumps quantity to 2", () => {
    const item = makeItem({ lineTotalCents: 500 });
    useCart.getState().addItem(item, "dd-1", "sch-1");
    useCart.getState().addItem(item, "dd-1", "sch-1");
    expect(useCart.getState().total()).toBe(1000);
    expect(useCart.getState().count()).toBe(2);
  });

  test("multiple distinct items — total sums, count sums", () => {
    useCart
      .getState()
      .addItem(
        makeItem({ menuItemId: "a", itemName: "A", lineTotalCents: 300 }),
        "dd-1",
        "sch-1",
      );
    useCart
      .getState()
      .addItem(
        makeItem({ menuItemId: "b", itemName: "B", lineTotalCents: 700 }),
        "dd-1",
        "sch-1",
      );
    useCart
      .getState()
      .addItem(
        makeItem({ menuItemId: "c", itemName: "C", lineTotalCents: 250 }),
        "dd-1",
        "sch-1",
      );
    expect(useCart.getState().total()).toBe(300 + 700 + 250);
    expect(useCart.getState().count()).toBe(3);
  });

  test("distinct items with repeated adds sum correctly", () => {
    const a = makeItem({ menuItemId: "a", itemName: "A", lineTotalCents: 100 });
    const b = makeItem({ menuItemId: "b", itemName: "B", lineTotalCents: 200 });
    useCart.getState().addItem(a, "dd-1", "sch-1");
    useCart.getState().addItem(a, "dd-1", "sch-1");
    useCart.getState().addItem(a, "dd-1", "sch-1"); // 3x A
    useCart.getState().addItem(b, "dd-1", "sch-1"); // 1x B
    expect(useCart.getState().total()).toBe(3 * 100 + 200);
    expect(useCart.getState().count()).toBe(4);
  });
});

// ── Adversarial ────────────────────────────────────────────────────────────

describe("useCart.total() and count() — adversarial", () => {
  test("free item (lineTotalCents === 0) contributes 0 to total, 1 to count", () => {
    useCart.getState().addItem(makeItem({ lineTotalCents: 0 }), "dd-1", "sch-1");
    expect(useCart.getState().total()).toBe(0);
    expect(useCart.getState().count()).toBe(1);
  });

  test("decrementing a qty-1 line drops the line — total and count go to 0", () => {
    useCart.getState().addItem(makeItem({ lineTotalCents: 500 }), "dd-1", "sch-1");
    const key = useCart.getState().items[0].cartKey;
    useCart.getState().decrementItem(key);
    expect(useCart.getState().items).toHaveLength(0);
    expect(useCart.getState().total()).toBe(0);
    expect(useCart.getState().count()).toBe(0);
  });

  test("removeItem on the only line clears delivery context and zeroes totals", () => {
    useCart.getState().addItem(makeItem({ lineTotalCents: 500 }), "dd-1", "sch-1");
    const key = useCart.getState().items[0].cartKey;
    useCart.getState().removeItem(key);
    expect(useCart.getState().total()).toBe(0);
    expect(useCart.getState().count()).toBe(0);
    expect(useCart.getState().deliveryDateId).toBeNull();
  });

  test("large but safe cart values stay within Number.MAX_SAFE_INTEGER", () => {
    // MAX_SAFE_INTEGER is 2^53 - 1 = 9007199254740991.
    // Using 1e12 cents * 1000 qty = 1e15 which is < MAX_SAFE_INTEGER.
    useCart
      .getState()
      .addItem(
        makeItem({ lineTotalCents: 1_000_000_000_000 }),
        "dd-1",
        "sch-1",
      );
    const key = useCart.getState().items[0].cartKey;
    for (let i = 0; i < 999; i++) {
      useCart.getState().incrementItem(key);
    }
    expect(useCart.getState().count()).toBe(1000);
    expect(useCart.getState().total()).toBe(1_000_000_000_000 * 1000);
    expect(Number.isSafeInteger(useCart.getState().total())).toBe(true);
  });

  test("sum of many high-value lines stays exact when kept under MAX_SAFE_INTEGER", () => {
    for (let i = 0; i < 10; i++) {
      useCart
        .getState()
        .addItem(
          makeItem({
            menuItemId: `item-${i}`,
            itemName: `Item ${i}`,
            lineTotalCents: 100_000_000_000_000,
          }),
          "dd-1",
          "sch-1",
        );
    }
    expect(useCart.getState().count()).toBe(10);
    expect(useCart.getState().total()).toBe(10 * 100_000_000_000_000);
    expect(Number.isSafeInteger(useCart.getState().total())).toBe(true);
  });

  test("beyond MAX_SAFE_INTEGER the total loses precision (unguarded — documented)", () => {
    // FINDING: total() has no overflow guard. If a pathological cart pushes
    // above 2^53, the JS number loses precision. Not a realistic user path,
    // but the helper is unguarded and this test documents that.
    useCart
      .getState()
      .addItem(
        makeItem({ lineTotalCents: Number.MAX_SAFE_INTEGER }),
        "dd-1",
        "sch-1",
      );
    const key = useCart.getState().items[0].cartKey;
    useCart.getState().incrementItem(key); // qty 2
    const t = useCart.getState().total();
    expect(Number.isSafeInteger(t)).toBe(false);
  });

  test("negative quantity is unreachable via the public API (documented)", () => {
    // The only quantity-mutating paths are addItem (+1), incrementItem (+1)
    // and decrementItem (-1 with drop-at-zero). Verify drop-at-zero holds
    // even under repeated decrements.
    useCart.getState().addItem(makeItem({ lineTotalCents: 100 }), "dd-1", "sch-1");
    const key = useCart.getState().items[0].cartKey;
    useCart.getState().decrementItem(key);
    useCart.getState().decrementItem(key); // no-op — line already gone
    useCart.getState().decrementItem(key); // no-op
    expect(useCart.getState().count()).toBe(0);
    expect(useCart.getState().total()).toBe(0);
  });

  test("no quantity-0 zombie lines after decrement", () => {
    useCart.getState().addItem(makeItem({ lineTotalCents: 100 }), "dd-1", "sch-1");
    const key = useCart.getState().items[0].cartKey;
    useCart.getState().decrementItem(key);
    const zombies = useCart.getState().items.filter((i) => i.quantity === 0);
    expect(zombies).toHaveLength(0);
  });

  test("switching delivery dates wipes prior lines — totals reflect only the new date", () => {
    useCart.getState().addItem(makeItem({ lineTotalCents: 999 }), "dd-1", "sch-1");
    // Different delivery date → cart resets, keeps only the new item.
    useCart
      .getState()
      .addItem(
        makeItem({ menuItemId: "other", lineTotalCents: 250 }),
        "dd-2",
        "sch-2",
      );
    expect(useCart.getState().items).toHaveLength(1);
    expect(useCart.getState().total()).toBe(250);
    expect(useCart.getState().count()).toBe(1);
  });
});
