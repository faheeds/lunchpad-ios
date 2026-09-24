/**
 * Unit tests for buildCartKey (lib/types.ts).
 *
 * Purpose of the function: derive a deterministic cart-line key so that two
 * "add to cart" actions with the same item + size + choice + additions +
 * removals produce the SAME key (and therefore merge into one line with
 * combined quantity), while any real difference produces a DIFFERENT key
 * (and therefore stays a separate line).
 *
 * The impl (see lib/types.ts) is:
 *   const a = [...additions].sort().join("|");
 *   const r = [...removals].sort().join("|");
 *   return `${menuItemId}::${size ?? ""}::${choice ?? ""}::${a}::${r}::${deliveryDateId}::${parentChildId}`;
 *
 * So: additions/removals are order-independent (sorted before join), but
 * NOT de-duplicated. undefined and null both collapse to "". Every test
 * below passes the same fixed deliveryDateId ("date-1") and parentChildId
 * ("child-1") unless it's specifically testing that a different one
 * changes the key — this preserves every original test's "same/different"
 * semantics exactly, since both are genuinely new dimensions added later
 * (deliveryDateId to support the same item ordered from more than one
 * school's menu, parentChildId to support the same item ordered for more
 * than one person, without either colliding into a single cart line).
 */

import { buildCartKey } from "../../lib/types";

describe("buildCartKey — happy path (merge cases)", () => {
  test("identical item + size + choice + additions + removals produces identical keys", () => {
    const k1 = buildCartKey("item-1", "Medium", "Beef", ["Bacon", "Cheese"], ["Onions"], "date-1", "child-1");
    const k2 = buildCartKey("item-1", "Medium", "Beef", ["Bacon", "Cheese"], ["Onions"], "date-1", "child-1");
    expect(k1).toBe(k2);
  });

  test("no size, no choice, no additions, no removals — deterministic key", () => {
    const k1 = buildCartKey("item-1", undefined, undefined, [], [], "date-1", "child-1");
    const k2 = buildCartKey("item-1", undefined, undefined, [], [], "date-1", "child-1");
    expect(k1).toBe(k2);
  });
});

describe("buildCartKey — happy path (separation cases)", () => {
  test("different menuItemIds produce different keys", () => {
    const k1 = buildCartKey("item-1", "Medium", "Beef", [], [], "date-1", "child-1");
    const k2 = buildCartKey("item-2", "Medium", "Beef", [], [], "date-1", "child-1");
    expect(k1).not.toBe(k2);
  });

  test("different sizes on same item produce different keys", () => {
    const k1 = buildCartKey("item-1", "Medium", "Beef", [], [], "date-1", "child-1");
    const k2 = buildCartKey("item-1", "Large", "Beef", [], [], "date-1", "child-1");
    expect(k1).not.toBe(k2);
  });

  test("different choices on same item produce different keys", () => {
    const k1 = buildCartKey("item-1", "Medium", "Beef", [], [], "date-1", "child-1");
    const k2 = buildCartKey("item-1", "Medium", "Chicken", [], [], "date-1", "child-1");
    expect(k1).not.toBe(k2);
  });

  test("different addition SETS produce different keys", () => {
    const k1 = buildCartKey("item-1", "Medium", "Beef", ["Bacon"], [], "date-1", "child-1");
    const k2 = buildCartKey("item-1", "Medium", "Beef", ["Cheese"], [], "date-1", "child-1");
    expect(k1).not.toBe(k2);
  });

  test("different removal SETS produce different keys", () => {
    const k1 = buildCartKey("item-1", "Medium", "Beef", [], ["Onions"], "date-1", "child-1");
    const k2 = buildCartKey("item-1", "Medium", "Beef", [], ["Pickles"], "date-1", "child-1");
    expect(k1).not.toBe(k2);
  });
});

describe("buildCartKey — adversarial", () => {
  test("additions in different ORDER but same SET produce the same key (order-independent)", () => {
    const k1 = buildCartKey("item-1", "Medium", "Beef", ["Bacon", "Cheese", "Avocado"], [], "date-1", "child-1");
    const k2 = buildCartKey("item-1", "Medium", "Beef", ["Avocado", "Bacon", "Cheese"], [], "date-1", "child-1");
    const k3 = buildCartKey("item-1", "Medium", "Beef", ["Cheese", "Avocado", "Bacon"], [], "date-1", "child-1");
    expect(k1).toBe(k2);
    expect(k2).toBe(k3);
  });

  test("removals in different ORDER but same SET produce the same key", () => {
    const k1 = buildCartKey("item-1", "Medium", "Beef", [], ["Onions", "Pickles"], "date-1", "child-1");
    const k2 = buildCartKey("item-1", "Medium", "Beef", [], ["Pickles", "Onions"], "date-1", "child-1");
    expect(k1).toBe(k2);
  });

  test("undefined size and null-equivalent-empty-string size collapse to the SAME key (FINDING)", () => {
    // FINDING: buildCartKey uses `size ?? ""` — so `undefined` and `""` both
    // become "". That means a caller who passes an explicit empty string
    // size will merge into the same cart line as a caller who passed
    // undefined. Not obviously a bug — the CartItem type has size as
    // `string | undefined` (no null in the signature), so an empty string
    // shouldn't occur in practice, but this coalescence is worth flagging.
    const k1 = buildCartKey("item-1", undefined, undefined, [], [], "date-1", "child-1");
    const k2 = buildCartKey("item-1", "", undefined, [], [], "date-1", "child-1");
    expect(k1).toBe(k2);
  });

  test("undefined choice and empty-string choice collapse to the SAME key (same FINDING)", () => {
    const k1 = buildCartKey("item-1", "Medium", undefined, [], [], "date-1", "child-1");
    const k2 = buildCartKey("item-1", "Medium", "", [], [], "date-1", "child-1");
    expect(k1).toBe(k2);
  });

  test("empty additions array and (empty additions) both produce empty middle segment", () => {
    // Sanity check that "no additions" always resolves identically.
    const k1 = buildCartKey("item-1", "Medium", "Beef", [], [], "date-1", "child-1");
    const k2 = buildCartKey("item-1", "Medium", "Beef", [], [], "date-1", "child-1");
    expect(k1).toBe(k2);
    // And the key contains the expected empty segment between the last two "::".
    expect(k1).toBe("item-1::Medium::Beef::::::date-1::child-1");
  });

  test("duplicates in additions are NOT de-duped by buildCartKey (FINDING)", () => {
    // FINDING: buildCartKey sorts but does NOT dedupe. So [Bacon] and
    // [Bacon, Bacon] produce DIFFERENT keys and would end up as two separate
    // cart lines. pricing.ts uses a Set and dedupes, but the store keys off
    // this string — so a caller who accidentally passes duplicate addition
    // names would get non-merging lines. Documented, not fixed.
    const k1 = buildCartKey("item-1", "Medium", "Beef", ["Bacon"], [], "date-1", "child-1");
    const k2 = buildCartKey("item-1", "Medium", "Beef", ["Bacon", "Bacon"], [], "date-1", "child-1");
    expect(k1).not.toBe(k2);
  });

  test("does NOT mutate the caller's additions or removals arrays", () => {
    // Impl uses [...additions].sort() so the copy is sorted, not the input.
    // Guard against future edits that drop the spread.
    const additions = ["Cheese", "Bacon", "Avocado"];
    const removals = ["Pickles", "Onions"];
    const additionsSnapshot = [...additions];
    const removalsSnapshot = [...removals];
    buildCartKey("item-1", "Medium", "Beef", additions, removals, "date-1", "child-1");
    expect(additions).toEqual(additionsSnapshot);
    expect(removals).toEqual(removalsSnapshot);
  });

  test("addition name containing the delimiter '|' CAN collide with a two-addition split (FINDING)", () => {
    // FINDING: the delimiter used inside additions is `|`. An addition name
    // that itself contains `|` can produce a key indistinguishable from two
    // separate additions. Because of the sort-then-join, the collision
    // depends on lexicographic ordering — a single addition "A|B" sorts to
    // "A|B" and a two-addition list ["A", "B"] sorts to ["A", "B"] then
    // joins to "A|B". Those collide exactly. Demonstrating with A and B:
    const kOne = buildCartKey("item-1", undefined, undefined, ["A|B"], [], "date-1", "child-1");
    const kTwo = buildCartKey("item-1", undefined, undefined, ["A", "B"], [], "date-1", "child-1");
    expect(kOne).toBe(kTwo);
    // Not currently exploitable — operators don't create option names with
    // "|" — but worth flagging as a fragile assumption.
  });

  test("segment delimiter '::' inside a value could collide across positions (potential FINDING)", () => {
    // Similar hazard: the segment delimiter is `::`. A menuItemId or size
    // value containing "::" could theoretically make two distinct
    // configurations map to the same key. In practice all IDs are cuids
    // and size names are short strings, but this is another fragile
    // assumption.
    const k1 = buildCartKey("item-1::Medium", undefined, undefined, [], [], "date-1", "child-1");
    const k2 = buildCartKey("item-1", "Medium", undefined, [], [], "date-1", "child-1");
    // Whether these collide depends on how many "::" segments align.
    // Currently they don't (choice/additions/removals differ in position),
    // but the test just documents the current outcome for future readers.
    expect(k1).not.toBe(k2);
  });
});

describe("buildCartKey — deliveryDateId (multi-school cart support)", () => {
  test("the exact same item/customization from two different delivery dates produces different keys", () => {
    // This is what lets the same menu item ordered from a Bellevue
    // child's delivery date and a Redmond child's delivery date stay as
    // two separate cart lines instead of colliding into one with a
    // combined quantity and only one (wrong, for the other child)
    // school.
    const k1 = buildCartKey("item-1", "Medium", "Beef", ["Bacon"], [], "date-bellevue", "child-1");
    const k2 = buildCartKey("item-1", "Medium", "Beef", ["Bacon"], [], "date-redmond", "child-1");
    expect(k1).not.toBe(k2);
  });

  test("the same item/customization from the same delivery date still merges (unaffected by adding this dimension)", () => {
    const k1 = buildCartKey("item-1", "Medium", "Beef", ["Bacon"], [], "date-redmond", "child-1");
    const k2 = buildCartKey("item-1", "Medium", "Beef", ["Bacon"], [], "date-redmond", "child-1");
    expect(k1).toBe(k2);
  });
});

describe("buildCartKey — parentChildId (the exact real bug: same item, two different kids)", () => {
  test("the exact same item ordered for two different children produces different keys", () => {
    // This is the real reported bug: "Classic Cheeseburger for Hana" and
    // "Classic Cheeseburger for Hiba" collided into one line with a
    // combined quantity and only one of them actually assigned. Without
    // parentChildId in the key, addItem's merge-by-cartKey logic can't
    // tell these two additions apart.
    const k1 = buildCartKey("item-1", "Medium", "Beef", [], [], "date-1", "child-hana");
    const k2 = buildCartKey("item-1", "Medium", "Beef", [], [], "date-1", "child-hiba");
    expect(k1).not.toBe(k2);
  });

  test("the same item for the same child still merges (a second one for Hana stays one line, quantity 2)", () => {
    const k1 = buildCartKey("item-1", "Medium", "Beef", [], [], "date-1", "child-hana");
    const k2 = buildCartKey("item-1", "Medium", "Beef", [], [], "date-1", "child-hana");
    expect(k1).toBe(k2);
  });

  test("a draft child's id (not just a real saved child's id) also differentiates the key", () => {
    const k1 = buildCartKey("item-1", "Medium", "Beef", [], [], "date-1", "draft:abc123");
    const k2 = buildCartKey("item-1", "Medium", "Beef", [], [], "date-1", "child-hana");
    expect(k1).not.toBe(k2);
  });
});
