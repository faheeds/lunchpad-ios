// No React imports — pure function only so it's easily testable and
// reusable anywhere the app needs to pick "the" next delivery date.

/**
 * Picks the delivery date to treat as "next lunch" on the Home screen.
 *
 * Prefers a date at a school one of the parent's own saved children
 * actually attends, over just the first result in the given order.
 * Without this preference, a parent whose children are at "Redmond"
 * would silently see "Bellevue" as their next lunch on any day both
 * campuses have a delivery date, since the backing API sorts same-day
 * ties alphabetically by school name — found via a real cross-campus
 * order created from exactly this scenario.
 *
 * Falls back to the first date in the given order when there are no
 * child school IDs to prefer (guests, or accounts with no saved
 * children yet), preserving the original behavior for those cases.
 */
export function pickNextDate<T extends { schoolId: string }>(
  dates: T[],
  childSchoolIds: Iterable<string>,
): T | undefined {
  const schoolIdSet = new Set(childSchoolIds);
  if (schoolIdSet.size > 0) {
    const match = dates.find((d) => schoolIdSet.has(d.schoolId));
    if (match) return match;
  }
  return dates[0];
}
