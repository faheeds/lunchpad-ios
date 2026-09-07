import { effectiveChildIdFor } from "../../lib/effectiveChild";

const HANA_REDMOND = { id: "hana", schoolId: "school-redmond" };
const HUDA_BELLEVUE = { id: "huda", schoolId: "school-bellevue" };

describe("effectiveChildIdFor", () => {
  test("uses the explicit per-item assignment when one exists, regardless of anything else", () => {
    const item = { parentChildId: "hana", schoolId: "school-bellevue" };
    expect(effectiveChildIdFor(item, [HANA_REDMOND, HUDA_BELLEVUE], "huda")).toBe("hana");
  });

  test("with no explicit assignment, prefers a child whose own school matches the item's school", () => {
    const item = { schoolId: "school-bellevue" };
    // Global selection is Hana (Redmond), but the item is a Bellevue
    // item -- should NOT silently default to the mismatched global
    // selection when a correctly-matching child exists.
    expect(effectiveChildIdFor(item, [HANA_REDMOND, HUDA_BELLEVUE], "hana")).toBe("huda");
  });

  test("reproduces the exact real bug scenario: an untouched item must not default to a wrong-school global selection", () => {
    // This is the literal scenario that produced a real, confusing
    // checkout rejection: cart browsed at Bellevue, global eater
    // defaulted to a Redmond child, item never explicitly assigned.
    const bellevueItem = { schoolId: "school-bellevue" };
    const result = effectiveChildIdFor(bellevueItem, [HANA_REDMOND, HUDA_BELLEVUE], "hana");
    expect(result).not.toBe("hana"); // must not resolve to the Redmond child for a Bellevue item
    expect(result).toBe("huda");
  });

  test("falls back to the global selection only when no child matches the item's school at all", () => {
    const item = { schoolId: "school-nowhere" };
    expect(effectiveChildIdFor(item, [HANA_REDMOND, HUDA_BELLEVUE], "hana")).toBe("hana");
  });

  test("returns null when there is no explicit assignment, no matching child, and no global selection", () => {
    const item = { schoolId: "school-nowhere" };
    expect(effectiveChildIdFor(item, [HANA_REDMOND, HUDA_BELLEVUE], null)).toBeNull();
  });

  test("with multiple children at the same matching school, picks the first one deterministically", () => {
    const secondBellevueChild = { id: "another-bellevue-kid", schoolId: "school-bellevue" };
    const item = { schoolId: "school-bellevue" };
    expect(
      effectiveChildIdFor(item, [HUDA_BELLEVUE, secondBellevueChild], null),
    ).toBe("huda");
  });
});
