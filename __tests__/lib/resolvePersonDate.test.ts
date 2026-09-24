import { resolveDateForPerson, buildSameDayDatesBySchool } from "../../lib/resolvePersonDate";

const SEP8 = "2026-09-08T18:00:00.000Z";
const SEP9 = "2026-09-09T18:00:00.000Z";

const REDMOND_SEP8 = {
  id: "date-redmond-sep8",
  schoolId: "school-redmond",
  deliveryDate: SEP8,
  menuItems: [{ id: "item-burger" }, { id: "item-tenders" }],
};
const BELLEVUE_SEP8 = {
  id: "date-bellevue-sep8",
  schoolId: "school-bellevue",
  deliveryDate: SEP8,
  // Confirmed real scenario: same restaurant, same item available at
  // both schools for the same day, but NOT identical menus --
  // "item-tenders" is Redmond-only here.
  menuItems: [{ id: "item-burger" }],
};
const REDMOND_SEP9 = {
  id: "date-redmond-sep9",
  schoolId: "school-redmond",
  deliveryDate: SEP9,
  menuItems: [{ id: "item-burger" }],
};

const ALL_DATES = [REDMOND_SEP8, BELLEVUE_SEP8, REDMOND_SEP9];

describe("buildSameDayDatesBySchool", () => {
  test("includes only dates matching the exact reference timestamp, one per school", () => {
    const map = buildSameDayDatesBySchool(ALL_DATES, SEP8);
    expect(map.size).toBe(2);
    expect(map.get("school-redmond")?.id).toBe("date-redmond-sep8");
    expect(map.get("school-bellevue")?.id).toBe("date-bellevue-sep8");
  });

  test("a school with no date on the reference day is simply absent from the map", () => {
    const map = buildSameDayDatesBySchool([REDMOND_SEP9], SEP8);
    expect(map.size).toBe(0);
  });
});

describe("resolveDateForPerson", () => {
  const sameDayMap = buildSameDayDatesBySchool(ALL_DATES, SEP8);

  test("resolves a person to their OWN school's date, not the date being browsed", () => {
    // This is the real, confirmed scenario: browsing from Bellevue's
    // burger, but resolving for a Redmond-schooled kid should return
    // Redmond's own date, not Bellevue's.
    const result = resolveDateForPerson("school-redmond", "item-burger", sameDayMap);
    expect(result?.id).toBe("date-redmond-sep8");
  });

  test("a genuinely restaurant-wide item resolves correctly for a person at a DIFFERENT school too", () => {
    const result = resolveDateForPerson("school-bellevue", "item-burger", sameDayMap);
    expect(result?.id).toBe("date-bellevue-sep8");
  });

  test("returns null when the item isn't available at the person's own school, even if their school has a date that day", () => {
    // Bellevue has a Sep 8 date, but doesn't offer item-tenders.
    const result = resolveDateForPerson("school-bellevue", "item-tenders", sameDayMap);
    expect(result).toBeNull();
  });

  test("returns null when the person's school has no delivery date at all for this day", () => {
    const result = resolveDateForPerson("school-nowhere", "item-burger", sameDayMap);
    expect(result).toBeNull();
  });
});
