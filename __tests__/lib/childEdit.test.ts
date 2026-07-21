/**
 * Unit tests for diffChildForm (lib/childEdit.ts).
 *
 * Pure module. No mocks. Contract per lib/childEdit.ts:
 *   - Field is included in the returned patch only if its trimmed value
 *     differs from the trimmed original.
 *   - `allergyNotes` intentionally cleared to `""` IS sent (deliberate clear).
 *   - Every field is trimmed on both sides before comparison.
 *
 * Happy paths are paired with adversarial coverage (whitespace, case, empty
 * baselines, MAX-safe-length strings).
 */

import { diffChildForm } from "../../lib/childEdit";
import type { ChildFormSnapshot } from "../../lib/childEdit";

// ── Helpers ────────────────────────────────────────────────────────────────

function snap(overrides: Partial<ChildFormSnapshot> = {}): ChildFormSnapshot {
  return {
    studentName: "Alice",
    grade: "3",
    allergyNotes: "Peanuts",
    ...overrides,
  };
}

// ── Happy path ─────────────────────────────────────────────────────────────

describe("diffChildForm — happy path", () => {
  test("1. no change → returns {}", () => {
    const original = snap();
    const updated = snap();
    expect(diffChildForm(original, updated)).toEqual({});
  });

  test("2. name changed → returns { studentName } only", () => {
    const original = snap({ studentName: "Alice" });
    const updated = snap({ studentName: "Alicia" });
    const patch = diffChildForm(original, updated);
    expect(patch).toEqual({ studentName: "Alicia" });
    // Explicit: grade + allergyNotes MUST NOT be present.
    expect(patch).not.toHaveProperty("grade");
    expect(patch).not.toHaveProperty("allergyNotes");
  });

  test("3. grade changed → returns { grade } only", () => {
    const original = snap({ grade: "3" });
    const updated = snap({ grade: "4" });
    const patch = diffChildForm(original, updated);
    expect(patch).toEqual({ grade: "4" });
    expect(patch).not.toHaveProperty("studentName");
    expect(patch).not.toHaveProperty("allergyNotes");
  });

  test("4. allergyNotes changed from filled to different filled → returns { allergyNotes } only", () => {
    const original = snap({ allergyNotes: "Peanuts" });
    const updated = snap({ allergyNotes: "Peanuts, Dairy" });
    const patch = diffChildForm(original, updated);
    expect(patch).toEqual({ allergyNotes: "Peanuts, Dairy" });
    expect(patch).not.toHaveProperty("studentName");
    expect(patch).not.toHaveProperty("grade");
  });

  test("5. all three changed → returns all three fields", () => {
    const original = snap({
      studentName: "Alice",
      grade: "3",
      allergyNotes: "Peanuts",
    });
    const updated = snap({
      studentName: "Bob",
      grade: "5",
      allergyNotes: "Shellfish",
    });
    expect(diffChildForm(original, updated)).toEqual({
      studentName: "Bob",
      grade: "5",
      allergyNotes: "Shellfish",
    });
  });

  test("6. allergyNotes cleared (filled → empty) → returns { allergyNotes: '' } (deliberate clear)", () => {
    // Per the dev's contract: sending `{ allergyNotes: "" }` is the way to
    // tell the server "the user cleared this field, wipe the stored value."
    // Omitting the key would leave the server's stored notes untouched.
    const original = snap({ allergyNotes: "Peanuts" });
    const updated = snap({ allergyNotes: "" });
    const patch = diffChildForm(original, updated);
    expect(patch).toEqual({ allergyNotes: "" });
    // Sanity: the key IS actually present in the object (Object.hasOwn true)
    // — not just undefined-with-a-key. The server needs to see the key to
    // treat this as a clear.
    expect(Object.prototype.hasOwnProperty.call(patch, "allergyNotes")).toBe(true);
    expect(patch.allergyNotes).toBe("");
  });
});

// ── Adversarial ────────────────────────────────────────────────────────────

describe("diffChildForm — adversarial", () => {
  test("7. whitespace-only change ('Alice' → 'Alice  ') → NOT flagged (trim comparison)", () => {
    const original = snap({ studentName: "Alice" });
    const updated = snap({ studentName: "Alice  " });
    expect(diffChildForm(original, updated)).toEqual({});
  });

  test("8. original trimmed vs updated with leading spaces ('Alice' → '  Alice') → NOT flagged", () => {
    const original = snap({ studentName: "Alice" });
    const updated = snap({ studentName: "  Alice" });
    expect(diffChildForm(original, updated)).toEqual({});
  });

  test("9. case-only change ('Alice' → 'alice') → flagged (post-trim strings differ)", () => {
    // The diff intentionally does NOT case-fold. Even a lowercase-only edit
    // is a legit user change (some parents record kids' preferred casing).
    const original = snap({ studentName: "Alice" });
    const updated = snap({ studentName: "alice" });
    expect(diffChildForm(original, updated)).toEqual({ studentName: "alice" });
  });

  test("10. grade '' → 'K' (first-time-set) → returns { grade: 'K' }", () => {
    // Child was originally created at an office location with no grade,
    // then user backfills the grade after they moved to a school tenant.
    const original = snap({ grade: "" });
    const updated = snap({ grade: "K" });
    expect(diffChildForm(original, updated)).toEqual({ grade: "K" });
  });

  test("11. empty snapshot vs empty snapshot → {} (no keys, valid state)", () => {
    const original: ChildFormSnapshot = {
      studentName: "",
      grade: "",
      allergyNotes: "",
    };
    const updated: ChildFormSnapshot = {
      studentName: "",
      grade: "",
      allergyNotes: "",
    };
    expect(diffChildForm(original, updated)).toEqual({});
  });

  test("12. allergyNotes '' → '' → NOT flagged (no change even though empty)", () => {
    // Guard: the deliberate-clear branch must not fire when the original
    // was ALREADY empty. Otherwise every idempotent save would spuriously
    // patch an empty string.
    const original = snap({ allergyNotes: "" });
    const updated = snap({ allergyNotes: "" });
    const patch = diffChildForm(original, updated);
    expect(patch).toEqual({});
    expect(Object.prototype.hasOwnProperty.call(patch, "allergyNotes")).toBe(false);
  });

  test("13. long strings at MAX-safe boundary → correct diff, no throw, no NaN", () => {
    const bigA = "A".repeat(1000);
    const bigB = "A".repeat(999) + "B";
    const original = snap({ studentName: bigA, allergyNotes: bigA });
    const updated = snap({ studentName: bigB, allergyNotes: bigA });
    let patch;
    expect(() => {
      patch = diffChildForm(original, updated);
    }).not.toThrow();
    expect(patch).toEqual({ studentName: bigB });
  });

  test("14. whitespace-only change on allergyNotes ('Peanuts' → ' Peanuts ') → NOT flagged", () => {
    // Belt + braces for allergyNotes specifically since it has the extra
    // deliberate-clear branch — the trim guard must still fire here.
    const original = snap({ allergyNotes: "Peanuts" });
    const updated = snap({ allergyNotes: " Peanuts " });
    expect(diffChildForm(original, updated)).toEqual({});
  });

  test("15. all three whitespace-only-changed → returns {} (all trim to same)", () => {
    // Combined guard — no field should be flagged.
    const original = snap({
      studentName: "Alice",
      grade: "3",
      allergyNotes: "Peanuts",
    });
    const updated = snap({
      studentName: "  Alice",
      grade: " 3 ",
      allergyNotes: "Peanuts  ",
    });
    expect(diffChildForm(original, updated)).toEqual({});
  });

  test("16. updated values are stored trimmed (not the raw padded input)", () => {
    // When a value IS flagged, verify the stored value is the trimmed one
    // — not the caller's padded input. Prevents leading/trailing spaces
    // from leaking to the server.
    const original = snap({ studentName: "Alice" });
    const updated = snap({ studentName: "  Bob  " });
    expect(diffChildForm(original, updated)).toEqual({ studentName: "Bob" });
  });

  test("17. does NOT mutate the input snapshots", () => {
    // Guard against future edits — function is documented as pure.
    const original = snap({ studentName: "  Alice  " });
    const updated = snap({ studentName: "Bob" });
    const originalSnapshot = JSON.stringify(original);
    const updatedSnapshot = JSON.stringify(updated);
    diffChildForm(original, updated);
    expect(JSON.stringify(original)).toBe(originalSnapshot);
    expect(JSON.stringify(updated)).toBe(updatedSnapshot);
  });
});
