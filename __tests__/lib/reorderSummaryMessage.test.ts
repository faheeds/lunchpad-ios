import { reorderSummaryMessage } from "../../lib/reorder";
import type { ReorderMissing } from "../../lib/reorder";

function m(reason: ReorderMissing["reason"]): ReorderMissing {
  return { name: "Pizza", reason };
}

const DATE = "Monday, Jul 28";

describe("reorderSummaryMessage", () => {
  // ── All not-on-menu ──────────────────────────────────────────────────────────

  // 1
  it("includes the formatted date when all items are not-on-menu", () => {
    const result = reorderSummaryMessage([m("not-on-menu"), m("not-on-menu")], DATE);
    expect(result).toContain(DATE);
  });

  // 2
  it("does not mention selections when all items are not-on-menu", () => {
    const result = reorderSummaryMessage([m("not-on-menu")], DATE);
    expect(result.toLowerCase()).not.toContain("selection");
  });

  // ── All requires-size ────────────────────────────────────────────────────────

  // 3
  it("does not include the date when all items require-size", () => {
    const result = reorderSummaryMessage([m("requires-size"), m("requires-size")], DATE);
    expect(result).not.toContain(DATE);
  });

  // 4
  it("mentions selection/manual action when all items require-size", () => {
    const result = reorderSummaryMessage([m("requires-size")], DATE);
    expect(result.toLowerCase()).toMatch(/selection|manual/);
  });

  // ── All requires-choice ──────────────────────────────────────────────────────

  // 5a
  it("does not include the date when all items require-choice", () => {
    const result = reorderSummaryMessage([m("requires-choice"), m("requires-choice")], DATE);
    expect(result).not.toContain(DATE);
  });

  // 5b
  it("mentions selection/manual action when all items require-choice", () => {
    const result = reorderSummaryMessage([m("requires-choice")], DATE);
    expect(result.toLowerCase()).toMatch(/selection|manual/);
  });

  // ── Mixed reasons ────────────────────────────────────────────────────────────

  // 6
  it("does not include the date for a mix of not-on-menu and requires-size", () => {
    const result = reorderSummaryMessage([m("not-on-menu"), m("requires-size")], DATE);
    expect(result).not.toContain(DATE);
  });

  // 7
  it("does not include the date for a mix of not-on-menu and requires-choice", () => {
    const result = reorderSummaryMessage([m("not-on-menu"), m("requires-choice")], DATE);
    expect(result).not.toContain(DATE);
  });

  // 8
  it("returns neutral wording for a mix of all three reason types", () => {
    const result = reorderSummaryMessage(
      [m("not-on-menu"), m("requires-size"), m("requires-choice")],
      DATE,
    );
    expect(result).not.toContain(DATE);
    // Should not claim everything is unavailable
    expect(result.toLowerCase()).not.toBe(
      `none of these items are available on ${DATE.toLowerCase()}.`,
    );
  });

  // ── Boundary / adversarial ───────────────────────────────────────────────────

  // 9 — single item, not-on-menu
  it("includes the date for a single not-on-menu item", () => {
    const result = reorderSummaryMessage([m("not-on-menu")], DATE);
    expect(result).toContain(DATE);
  });

  // 10 — single item, requires-choice
  it("mentions selection for a single requires-choice item and omits the date", () => {
    const result = reorderSummaryMessage([m("requires-choice")], DATE);
    expect(result).not.toContain(DATE);
    expect(result.toLowerCase()).toMatch(/selection|manual/);
  });

  // 11 — two requires-size items (all non-menu reasons, no date)
  it("does not include the date when two items both require-size", () => {
    const result = reorderSummaryMessage([m("requires-size"), m("requires-size")], DATE);
    expect(result).not.toContain(DATE);
  });

  // 12 — empty formattedDate string
  it("does not crash when formattedDate is an empty string", () => {
    expect(() => reorderSummaryMessage([m("not-on-menu")], "")).not.toThrow();
    expect(typeof reorderSummaryMessage([m("not-on-menu")], "")).toBe("string");
  });
});
