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

type AddInput = Omit<CartItem, "cartKey" | "quantity" | "deliveryDateId" | "schoolId">;

function makeItem(overrides: Partial<AddInput> = {}): AddInput {
  return {
    menuItemId: "item-1",
    itemName: "Burger",
    basePriceCents: 1000,
    additions: [],
    removals: [],
    lineTotalCents: 1000,
    parentChildId: "child-1",
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

  test("removeItem on the only line zeroes totals and clears schoolIds", () => {
    useCart.getState().addItem(makeItem({ lineTotalCents: 500 }), "dd-1", "sch-1");
    const key = useCart.getState().items[0].cartKey;
    useCart.getState().removeItem(key);
    expect(useCart.getState().total()).toBe(0);
    expect(useCart.getState().count()).toBe(0);
    expect(useCart.getState().schoolIds()).toEqual([]);
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

  test("adding from a different delivery date no longer wipes the cart — items from both dates coexist", () => {
    // This behavior changed deliberately: cart items now carry their own
    // deliveryDateId/schoolId, so a cart can hold items for children at
    // different schools at once. What used to wipe the cart on a date
    // switch now just adds a second line alongside the first.
    useCart.getState().addItem(makeItem({ lineTotalCents: 999 }), "dd-1", "sch-1");
    useCart
      .getState()
      .addItem(
        makeItem({ menuItemId: "other", lineTotalCents: 250 }),
        "dd-2",
        "sch-2",
      );
    expect(useCart.getState().items).toHaveLength(2);
    expect(useCart.getState().total()).toBe(999 + 250);
    expect(useCart.getState().count()).toBe(2);
  });

  test("the exact same item added from two different delivery dates stays two separate lines, not merged", () => {
    useCart.getState().addItem(makeItem({ lineTotalCents: 500 }), "dd-1", "sch-1");
    useCart.getState().addItem(makeItem({ lineTotalCents: 500 }), "dd-2", "sch-2");
    expect(useCart.getState().items).toHaveLength(2);
    expect(useCart.getState().count()).toBe(2);
    expect(useCart.getState().items[0].schoolId).toBe("sch-1");
    expect(useCart.getState().items[1].schoolId).toBe("sch-2");
  });

  test("schoolIds() returns every distinct school represented in the cart", () => {
    useCart.getState().addItem(makeItem({ lineTotalCents: 500 }), "dd-1", "sch-redmond");
    useCart.getState().addItem(makeItem({ menuItemId: "other", lineTotalCents: 300 }), "dd-2", "sch-bellevue");
    expect(useCart.getState().schoolIds().sort()).toEqual(["sch-bellevue", "sch-redmond"]);
  });

  test("schoolIds() returns a single entry for a single-school cart, empty array for an empty cart", () => {
    expect(useCart.getState().schoolIds()).toEqual([]);
    useCart.getState().addItem(makeItem({ lineTotalCents: 500 }), "dd-1", "sch-1");
    expect(useCart.getState().schoolIds()).toEqual(["sch-1"]);
  });
});

// ── assignItemToChild (multi-child single-day checkout) ────────────────────

describe("useCart.assignItemToChild()", () => {
  test("assigns a parentChildId to the target line only", () => {
    useCart.getState().addItem(makeItem({ menuItemId: "burger", parentChildId: "child-original", lineTotalCents: 1099 }), "dd-1", "sch-1");
    useCart.getState().addItem(makeItem({ menuItemId: "tenders", parentChildId: "child-original", lineTotalCents: 999 }), "dd-1", "sch-1");
    const [burgerKey, tendersKey] = useCart.getState().items.map((i) => i.cartKey);

    useCart.getState().assignItemToChild(burgerKey, "child-hana");

    const items = useCart.getState().items;
    expect(items.find((i) => i.cartKey === burgerKey)?.parentChildId).toBe("child-hana");
    // The other line keeps its ORIGINAL assignment from creation time --
    // reassigning one line never touches any other line.
    expect(items.find((i) => i.cartKey === tendersKey)?.parentChildId).toBe("child-original");
  });

  test("reassigning the same line to a different child overwrites, doesn't duplicate", () => {
    useCart.getState().addItem(makeItem({ lineTotalCents: 500 }), "dd-1", "sch-1");
    const [key] = useCart.getState().items.map((i) => i.cartKey);

    useCart.getState().assignItemToChild(key, "child-hana");
    useCart.getState().assignItemToChild(key, "child-hiba");

    expect(useCart.getState().items).toHaveLength(1);
    expect(useCart.getState().items[0].parentChildId).toBe("child-hiba");
  });

  test("assigning to a nonexistent cartKey is a safe no-op", () => {
    useCart.getState().addItem(makeItem({ parentChildId: "child-original", lineTotalCents: 500 }), "dd-1", "sch-1");
    useCart.getState().assignItemToChild("does-not-exist", "child-hana");

    expect(useCart.getState().items).toHaveLength(1);
    expect(useCart.getState().items[0].parentChildId).toBe("child-original");
  });

  test("does not affect quantity, price, or other fields on the assigned line", () => {
    useCart.getState().addItem(makeItem({ lineTotalCents: 1099 }), "dd-1", "sch-1");
    const [key] = useCart.getState().items.map((i) => i.cartKey);

    useCart.getState().assignItemToChild(key, "child-hana");

    const item = useCart.getState().items[0];
    expect(item.lineTotalCents).toBe(1099);
    expect(item.quantity).toBe(1);
    expect(useCart.getState().total()).toBe(1099);
  });
});

// ── Draft roster (cart redesign) ──────────────────────────────────────────

import { isDraftChildId } from "../../lib/store";

describe("useCart draft roster", () => {
  test("addDraftChild adds to drafts and returns a usable id", () => {
    const id = useCart.getState().addDraftChild({
      studentName: "New Kid",
      schoolId: "school-1",
      grade: "3rd",
    });
    expect(useCart.getState().drafts).toHaveLength(1);
    expect(useCart.getState().drafts[0].id).toBe(id);
    expect(useCart.getState().drafts[0].studentName).toBe("New Kid");
  });

  test("every draft id is recognized by isDraftChildId, real ids are not", () => {
    const id = useCart.getState().addDraftChild({ studentName: "X", schoolId: "s", grade: "K" });
    expect(isDraftChildId(id)).toBe(true);
    expect(isDraftChildId("cmtkf8zce0001f9mgp3edruv3")).toBe(false); // a real cuid-style id
  });

  test("two drafts added in the same session get distinct ids", () => {
    const id1 = useCart.getState().addDraftChild({ studentName: "A", schoolId: "s", grade: "K" });
    const id2 = useCart.getState().addDraftChild({ studentName: "B", schoolId: "s", grade: "K" });
    expect(id1).not.toBe(id2);
  });

  test("assignItemToChild works identically for a draft id as for a real child id", () => {
    useCart.getState().addItem(makeItem({ lineTotalCents: 500 }), "dd-1", "sch-1");
    const cartKey = useCart.getState().items[0].cartKey;
    const draftId = useCart.getState().addDraftChild({ studentName: "New Kid", schoolId: "sch-1", grade: "2nd" });
    useCart.getState().assignItemToChild(cartKey, draftId);
    expect(useCart.getState().items[0].parentChildId).toBe(draftId);
  });

  test("removeDraftChild removes the draft AND any cart line assigned to them (a line can't exist unassigned)", () => {
    useCart.getState().addItem(makeItem({ lineTotalCents: 500 }), "dd-1", "sch-1");
    const cartKey = useCart.getState().items[0].cartKey;
    const draftId = useCart.getState().addDraftChild({ studentName: "New Kid", schoolId: "sch-1", grade: "2nd" });
    useCart.getState().assignItemToChild(cartKey, draftId);

    useCart.getState().removeDraftChild(draftId);

    expect(useCart.getState().drafts).toHaveLength(0);
    expect(useCart.getState().items).toHaveLength(0);
  });

  test("removeDraftChild does not affect a line assigned to a DIFFERENT draft", () => {
    useCart.getState().addItem(makeItem({ lineTotalCents: 500 }), "dd-1", "sch-1");
    useCart.getState().addItem(makeItem({ menuItemId: "other", lineTotalCents: 300 }), "dd-1", "sch-1");
    const [key1, key2] = useCart.getState().items.map((i) => i.cartKey);
    const draftA = useCart.getState().addDraftChild({ studentName: "A", schoolId: "sch-1", grade: "K" });
    const draftB = useCart.getState().addDraftChild({ studentName: "B", schoolId: "sch-1", grade: "K" });
    useCart.getState().assignItemToChild(key1, draftA);
    useCart.getState().assignItemToChild(key2, draftB);

    useCart.getState().removeDraftChild(draftA);

    expect(useCart.getState().items.find((i) => i.cartKey === key1)).toBeUndefined();
    expect(useCart.getState().items.find((i) => i.cartKey === key2)?.parentChildId).toBe(draftB);
  });

  test("clearCart also clears drafts, not just items", () => {
    useCart.getState().addDraftChild({ studentName: "New Kid", schoolId: "sch-1", grade: "2nd" });
    useCart.getState().clearCart();
    expect(useCart.getState().drafts).toHaveLength(0);
  });

  test("the exact real bug: the same item added for two different children stays two separate lines", () => {
    // Reported directly: "I cannot order the same item for two different
    // children as it gets associated with the same child." Confirms the
    // fix at the store level, not just in buildCartKey's own unit tests.
    useCart.getState().addItem(makeItem({ parentChildId: "child-hana", lineTotalCents: 1099 }), "dd-1", "sch-1");
    useCart.getState().addItem(makeItem({ parentChildId: "child-hiba", lineTotalCents: 1099 }), "dd-1", "sch-1");

    expect(useCart.getState().items).toHaveLength(2);
    expect(useCart.getState().count()).toBe(2);
    expect(useCart.getState().items[0].parentChildId).toBe("child-hana");
    expect(useCart.getState().items[0].quantity).toBe(1);
    expect(useCart.getState().items[1].parentChildId).toBe("child-hiba");
    expect(useCart.getState().items[1].quantity).toBe(1);
  });

  test("adding the same item for the SAME child again still merges into one line, quantity 2", () => {
    useCart.getState().addItem(makeItem({ parentChildId: "child-hana", lineTotalCents: 1099 }), "dd-1", "sch-1");
    useCart.getState().addItem(makeItem({ parentChildId: "child-hana", lineTotalCents: 1099 }), "dd-1", "sch-1");

    expect(useCart.getState().items).toHaveLength(1);
    expect(useCart.getState().items[0].quantity).toBe(2);
    expect(useCart.getState().count()).toBe(2);
  });
});
