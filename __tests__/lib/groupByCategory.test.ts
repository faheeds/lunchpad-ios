import { groupItemsByCategory } from "../../lib/groupByCategory";

describe("groupItemsByCategory", () => {
  test("groups items by category, preserving first-appearance order (server already sorted)", () => {
    // Server sends items pre-sorted by the restaurant's configured
    // category order -- "Burgers, Rice, Comfort, Salads" is not
    // alphabetical, so this test deliberately uses an input order that
    // ISN'T alphabetical to confirm grouping doesn't silently re-sort.
    const items = [
      { id: "1", category: "Burgers & Sandwiches" },
      { id: "2", category: "Rice Plates" },
      { id: "3", category: "Burgers & Sandwiches" },
      { id: "4", category: "Comfort Favorites" },
      { id: "5", category: "Salads with Protein" },
    ];
    const sections = groupItemsByCategory(items);
    expect(sections.map((s) => s.title)).toEqual([
      "Burgers & Sandwiches",
      "Rice Plates",
      "Comfort Favorites",
      "Salads with Protein",
    ]);
    expect(sections[0].data.map((i) => i.id)).toEqual(["1", "3"]);
  });

  test("items with no category land in a single Other bucket", () => {
    const items = [
      { id: "1", category: null },
      { id: "2", category: "Burgers & Sandwiches" },
      { id: "3", category: undefined },
    ];
    const sections = groupItemsByCategory(items);
    const other = sections.find((s) => s.title === "Other");
    expect(other?.data.map((i) => i.id)).toEqual(["1", "3"]);
  });

  test("treats a whitespace-only category the same as no category", () => {
    const items = [{ id: "1", category: "   " }];
    const sections = groupItemsByCategory(items);
    expect(sections).toEqual([{ title: "Other", data: [{ id: "1", category: "   " }] }]);
  });

  test("returns an empty array for an empty item list", () => {
    expect(groupItemsByCategory([])).toEqual([]);
  });

  test("does not merge or reorder categories that first appear out of alphabetical order", () => {
    const items = [
      { id: "1", category: "Zebra" },
      { id: "2", category: "Apple" },
    ];
    const sections = groupItemsByCategory(items);
    expect(sections.map((s) => s.title)).toEqual(["Zebra", "Apple"]);
  });
});
