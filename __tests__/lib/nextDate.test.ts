import { pickNextDate } from "../../lib/nextDate";

describe("pickNextDate", () => {
  test("prefers a date matching a child's school over the first date in the list", () => {
    const dates = [
      { id: "date-bellevue", schoolId: "school-bellevue" },
      { id: "date-redmond", schoolId: "school-redmond" },
    ];
    // Parent's children are all at Redmond, but Bellevue sorts first —
    // exactly the real scenario that produced a wrong order.
    const result = pickNextDate(dates, ["school-redmond"]);
    expect(result?.id).toBe("date-redmond");
  });

  test("falls back to the first date when there are no child school IDs (guest / no saved children)", () => {
    const dates = [
      { id: "date-bellevue", schoolId: "school-bellevue" },
      { id: "date-redmond", schoolId: "school-redmond" },
    ];
    const result = pickNextDate(dates, []);
    expect(result?.id).toBe("date-bellevue");
  });

  test("falls back to the first date when none of the dates match any known child school", () => {
    const dates = [
      { id: "date-bellevue", schoolId: "school-bellevue" },
      { id: "date-redmond", schoolId: "school-redmond" },
    ];
    // Parent's child is at a third school with no delivery date today.
    const result = pickNextDate(dates, ["school-microsoft"]);
    expect(result?.id).toBe("date-bellevue");
  });

  test("returns undefined for an empty dates list, regardless of child schools", () => {
    expect(pickNextDate([], ["school-redmond"])).toBeUndefined();
    expect(pickNextDate([], [])).toBeUndefined();
  });

  test("with children at multiple schools, matches whichever comes first in the given order", () => {
    const dates = [
      { id: "date-bellevue", schoolId: "school-bellevue" },
      { id: "date-redmond", schoolId: "school-redmond" },
    ];
    // Parent has children at both schools — either is "correct" in
    // principle, but the result should be deterministic (first match in
    // the given order), not effectively random.
    const result = pickNextDate(dates, ["school-bellevue", "school-redmond"]);
    expect(result?.id).toBe("date-bellevue");
  });

  test("a single child's school, when it's not first in the list, is still found (not just checking index 0)", () => {
    const dates = [
      { id: "date-a", schoolId: "school-a" },
      { id: "date-b", schoolId: "school-b" },
      { id: "date-c", schoolId: "school-c" },
    ];
    const result = pickNextDate(dates, ["school-c"]);
    expect(result?.id).toBe("date-c");
  });
});
