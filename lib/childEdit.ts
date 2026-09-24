/**
 * Partial-update helpers for editing an existing saved eater ("child").
 *
 * The PATCH /api/mobile/native/account/children/{id} endpoint honors
 * partial-update semantics: fields that are OMITTED from the request
 * body are left unchanged server-side. Sending `{ grade: "" }` would
 * actually clobber the stored grade — so the edit form must send only
 * the fields the user actually changed.
 *
 * `diffChildForm` takes a snapshot of the form values as they were
 * pre-filled (i.e. the current server state, from the user's POV) and
 * the form values at submit time, and returns the minimal payload:
 *   - a field is included only if its trimmed value differs from the
 *     trimmed pre-fill snapshot
 *   - `allergyNotes` is serialized as an empty string when the user
 *     deliberately cleared it — the server treats "" as "no notes"
 *
 * Pure — no React, no fetch, no SecureStore. Safe for unit tests.
 */

export type ChildFormSnapshot = {
  studentName: string;
  grade: string;
  allergyNotes: string;
};

export type PartialChildInput = {
  studentName?: string;
  grade?: string;
  allergyNotes?: string;
};

export function diffChildForm(
  original: ChildFormSnapshot,
  updated: ChildFormSnapshot,
): PartialChildInput {
  const patch: PartialChildInput = {};
  const nextName = updated.studentName.trim();
  const nextGrade = updated.grade.trim();
  const nextAllergy = updated.allergyNotes.trim();
  if (nextName !== original.studentName.trim()) {
    patch.studentName = nextName;
  }
  if (nextGrade !== original.grade.trim()) {
    patch.grade = nextGrade;
  }
  if (nextAllergy !== original.allergyNotes.trim()) {
    patch.allergyNotes = nextAllergy;
  }
  return patch;
}
