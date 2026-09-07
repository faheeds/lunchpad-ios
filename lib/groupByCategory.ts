// No React imports — pure function only, easily testable and reusable.

/**
 * Groups a list of menu items into sections by category, preserving the
 * order items already arrive in. The server (both /api/mobile/native/menu
 * and /api/mobile/native/delivery-dates) already sorts items by the
 * restaurant's configured category order before sending them, so this
 * function does no sorting of its own -- grouping via insertion order
 * (which a plain JS object/Map preserves) naturally produces sections in
 * the correct sequence as a side effect of the server-side sort, without
 * needing to duplicate that ordering logic on the client.
 *
 * Items with no category (or an empty/whitespace-only one) land in a
 * single "Other" bucket so they still render, matching the same
 * fallback used server-side.
 */
export function groupItemsByCategory<T extends { category?: string | null }>(
  items: T[],
): { title: string; data: T[] }[] {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const key = item.category?.trim() || "Other";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(item);
  }
  return Array.from(grouped.entries()).map(([title, data]) => ({ title, data }));
}
