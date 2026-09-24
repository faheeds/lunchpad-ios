// No React imports — pure function only, easily testable.

type MinimalDate = {
  id: string;
  schoolId: string;
  deliveryDate: string;
  menuItems: { id: string }[];
};

/**
 * Resolves which delivery date to use for a given person's cart line
 * when adding a specific menu item — their OWN school's date for the
 * same calendar day, but only if this same item is actually available
 * there. Never the date the customer happened to be browsing.
 *
 * Many restaurants run the same menu across every school they serve —
 * confirmed directly against real data: the same menu item can be
 * available on two different schools' delivery dates for the same
 * calendar day. This is what makes it possible to pick several kids at
 * different schools for one item, in one customize action, rather than
 * requiring a separate trip to each school's own menu.
 *
 * Returns null if this person's school has no delivery date for this
 * day, or has one but doesn't offer this particular item — the caller
 * should treat that person as ineligible for this item, not silently
 * substitute a different date/school.
 */
export function resolveDateForPerson(
  personSchoolId: string,
  menuItemId: string,
  sameDayDatesBySchool: Map<string, MinimalDate>,
): MinimalDate | null {
  const theirDate = sameDayDatesBySchool.get(personSchoolId);
  if (!theirDate) return null;
  const hasItem = theirDate.menuItems.some((mi) => mi.id === menuItemId);
  return hasItem ? theirDate : null;
}

/**
 * Builds the schoolId -> delivery date map used by resolveDateForPerson,
 * from the full set of open delivery dates and the one currently being
 * viewed (used to identify "the same calendar day" via exact timestamp
 * match, since each school has its own DeliveryDate row for that day).
 */
export function buildSameDayDatesBySchool<T extends MinimalDate>(
  allDates: T[],
  referenceDeliveryDateIso: string,
): Map<string, T> {
  const map = new Map<string, T>();
  for (const d of allDates) {
    if (d.deliveryDate === referenceDeliveryDateIso) {
      map.set(d.schoolId, d);
    }
  }
  return map;
}
