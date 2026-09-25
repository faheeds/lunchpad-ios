// No React imports — pure function only, same pattern as lib/nextDate.ts.

/**
 * Groups the flat delivery-dates list (one entry per school/location per
 * calendar day) into one entry per calendar day.
 *
 * The backend's /delivery-dates response has one row per (deliveryDate,
 * schoolId) pair, so a restaurant serving two campuses on the same day
 * used to show up as two separate "Upcoming dates" cards for that day —
 * confusing when they're really the same day, just two pickup locations.
 * This groups them so the Home screen shows one card per day, and the
 * caller can prompt for a location only when a day actually has more
 * than one.
 *
 * Relies on the API's existing sort (deliveryDate asc, then school name
 * asc) to keep both the day order and the within-day location order
 * stable — it does not re-sort.
 */
export function groupDatesByDay<T extends { deliveryDate: string }>(
  dates: T[],
): { dayKey: string; entries: T[] }[] {
  const order: string[] = [];
  const byDay = new Map<string, T[]>();

  for (const d of dates) {
    // deliveryDate is an ISO timestamp (typically midnight UTC) — the
    // first 10 characters are the UTC calendar day, which matches how
    // the Home screen already renders these dates (fmtLong uses
    // getUTCDate/getUTCMonth/getUTCDay).
    const dayKey = d.deliveryDate.slice(0, 10);
    const existing = byDay.get(dayKey);
    if (existing) {
      existing.push(d);
    } else {
      byDay.set(dayKey, [d]);
      order.push(dayKey);
    }
  }

  return order.map((dayKey) => ({ dayKey, entries: byDay.get(dayKey)! }));
}

/** The single earliest cutoff across a day's entries — used to decide
 *  whether a multi-location day's card should show the "urgent" pill. */
export function earliestCutoff<T extends { cutoffAt: string }>(entries: T[]): string {
  return entries.reduce(
    (earliest, e) => (e.cutoffAt < earliest ? e.cutoffAt : earliest),
    entries[0].cutoffAt,
  );
}
