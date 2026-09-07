// No React imports — pure function only, easily testable.

/**
 * Resolves which saved child a cart line is effectively for: whatever
 * was explicitly assigned via the per-item picker, or — if nothing was
 * assigned — whichever saved child actually attends THIS item's own
 * school, rather than blindly falling back to a single globally-selected
 * eater shared by every item regardless of its school.
 *
 * A cart can span multiple schools (different items for different kids
 * at different campuses), so a single global fallback is exactly how an
 * untouched item could silently default to a child who doesn't attend
 * that item's school — confirmed as the real cause of a live checkout
 * rejection ("Hana is registered at a different location than the
 * delivery date selected for their item") for an item the user never
 * explicitly assigned at all.
 */
export function effectiveChildIdFor(
  item: { parentChildId?: string; schoolId: string },
  children: { id: string; schoolId: string }[],
  globalSelectedChildId: string | null,
): string | null {
  if (item.parentChildId) return item.parentChildId;
  const schoolMatch = children.find((c) => c.schoolId === item.schoolId);
  if (schoolMatch) return schoolMatch.id;
  return globalSelectedChildId;
}
