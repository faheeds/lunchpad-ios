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
 *   return `${menuItemId}::${size ?? ""}::${choice ?? ""}::${a}::${r}`;
 *
 * So: additions/removals are order-independent (sorted before join), but
 * NOT de-duplicated. undefined and null both collapse to "".
 */

import { buildCartKey } from "../../lib/types";

describe("buildCartKey — happy path (merge cases)", () => {
  test("identical item + size + choice + additions + removals produces identical keys", () => {
    const k1 = buildCartKey("item-1", "Medium", "Beef", ["Bacon", "Cheese"], ["Onions"]);
    const k2 = buildCartKey("item-1", "Medium", "Beef", ["Bacon", "Cheese"], ["Onions"]);
    expect(k1).toBe(k2);
  });

  test("no size, no choice, no additions, no removals — deterministic key", () => {
    const k1 = buildCartKey("item-1", undefined, undefined, [], []);
    const k2 = buildCartKey("item-1", undefined, undefined, [], []);
    expect(k1).toBe(k2);
  });
});

describe("buildCartKey — happy path (separation cases)", () => {
  test("different menuItemIds produce different keys", () => {
    const k1 = buildCartKey("item-1", "Medium", "Beef", [], []);
    const k2 = buildCartKey("item-2", "Medium", "Beef", [], []);
    expect(k1).not.toBe(k2);
  });

  test("different sizes on same item produce different keys", () => {
    const k1 = buildCartKey("item-1", "Medium", "Beef", [], []);
    const k2 = buildCartKey("item-1", "Large", "Beef", [], []);
    expect(k1).not.toBe(k2);
  });

  test("different choices on same item produce different keys", () => {
    const k1 = buildCartKey("item-1", "Medium", "Beef", [], []);
    const k2 = buildCartKey("item-1", "Medium", "Chicken", [], []);
    expect(k1).not.toBe(k2);
  });

  test("different addition SETS produce different keys", () => {
    const k1 = buildCartKey("item-1", "Medium", "Beef", ["Bacon"], []);
    const k2 = buildCartKey("item-1", "Medium", "Beef", ["Cheese"], []);
    expect(k1).not.toBe(k2);
  });

  test("different removal SETS produce different keys", () => {
    const k1 = buildCartKey("item-1", "Medium", "Beef", [], ["Onions"]);
    const k2 = buildCartKey("item-1", "Medium", "Beef", [], ["Pickles"]);
    expect(k1).not.toBe(k2);
  });
});

describe("buildCartKey — adversarial", () => {
  test("additions in different ORDER but same SET produce the same key (order-independent)", () => {
    const k1 = buildCartKey("item-1", "Medium", "Beef", ["Bacon", "Cheese", "Avocado"], []);
    const k2 = buildCartKey("item-1", "Medium", "Beef", ["Avocado", "Bacon", "Cheese"], []);
    const k3 = buildCartKey("item-1", "Medium", "Beef", ["Cheese", "Avocado", "Bacon"], []);
    expect(k1).toBe(k2);
    expect(k2).toBe(k3);
  });

  test("removals in different ORDER but same SET produce the same key", () => {
    const k1 = buildCartKey("item-1", "Medium", "Beef", [], ["Onions", "Pickles"]);
    const k2 = buildCartKey("item-1", "Medium", "Beef", [], ["Pickles", "Onions"]);
    expect(k1).toBe(k2);
  });

  test("undefined size and null-equivalent-empty-string size collapse to the SAME key (FINDING)", () => {
    // FINDING: buildCartKey uses `size ?? ""` — so `undefined` and `""` both
    // become "". That means a caller who passes an explicit empty string
    // size will merge into the same cart line as a caller who passed
    // undefined. Not obviously a bug — the CartItem type has size as
    // `string | undefined` (no null in the signature), so an empty string
    // shouldn't occur in practice, but this coalescence is worth flagging.
    const k1 = buildCartKey("item-1", undefined, undefined, [], []);
    const k2 = buildCartKey("item-1", "", undefined, [], []);
    expect(k1).toBe(k2);
  });

  test("undefined choice and empty-string choice collapse to the SAME key (same FINDING)", () => {
    const k1 = buildCartKey("item-1", "Medium", undefined, [], []);
    const k2 = buildCartKey("item-1", "Medium", "", [], []);
    expect(k1).toBe(k2);
  });

  test("empty additions array and (empty additions) both produce empty middle segment", () => {
    // Sanity check that "no additions" always resolves identically.
    const k1 = buildCartKey("item-1", "Medium", "Beef", [], []);
    const k2 = buildCartKey("item-1", "Medium", "Beef", [], []);
    expect(k1).toBe(k2);
    // And the key contains the expected empty segment between the last two "::".
    expect(k1).toBe("item-1::Medium::Beef::::");
  });

  test("duplicates in additions are NOT de-duped by buildCartKey (FINDING)", () => {
    // FINDING: buildCartKey sorts but does NOT dedupe. So [Bacon] and
    // [Bacon, Bacon] produce DIFFERENT keys and would end up as two separate
    // cart lines. pricing.ts uses a Set and dedupes, but the store keys off
    // this string — so a caller who accidentally passes duplicate addition
    // names would get non-merging lines. Documented, not fixed.
    const k1 = buildCartKey("item-1", "Medium", "Beef", ["Bacon"], []);
    const k2 = buildCartKey("item-1", "Medium", "Beef", ["Bacon", "Bacon"], []);
    expect(k1).not.toBe(k2);
  });

  test("does NOT mutate the caller's additions or removals arrays", () => {
    // Impl uses [...additions].sort() so the copy is sorted, not the input.
    // Guard against future edits that drop the spread.
    const additions = ["Cheese", "Bacon", "Avocado"];
    const removals = ["Pickles", "Onions"];
    const additionsSnapshot = [...additions];
    const removalsSnapshot = [...removals];
    buildCartKey("item-1", "Medium", "Beef", additions, removals);
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
    const kOne = buildCartKey("item-1", undefined, undefined, ["A|B"], []);
    const kTwo = buildCartKey("item-1", undefined, undefined, ["A", "B"], []);
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
    const k1 = buildCartKey("item-1::Medium", undefined, undefined, [], []);
    const k2 = buildCartKey("item-1", "Medium", undefined, [], []);
    // Whether these collide depends on how many "::" segments align.
    // Currently they don't (choice/additions/removals differ in position),
    // but the test just documents the current outcome for future readers.
    expect(k1).not.toBe(k2);
  });
});
