// No React imports — pure functions only so QA can test them.

export const CAROUSEL_MAX_PHOTOS = 5;
export const CAROUSEL_INTERVAL_MS = 4500;
export const CAROUSEL_RESUME_DELAY_MS = 3000;

/**
 * Extract up to maxPhotos photo URLs from menu items, skipping items with
 * no imageUrl.
 *
 * Operator-curated selection takes priority: when one or more items for
 * this delivery date are flagged `featuredOnLanding` (the same flag that
 * drives the web homepage's "This Week's Menu" grid -- see app/page.tsx in
 * the web repo), only those are shown, ordered by `sortOrder`. This lets an
 * operator control the carousel from the same admin checkbox on both web
 * and iOS. When nothing is flagged, falls back to server order (chef's
 * intended order) so tenants who haven't opted in keep today's behavior.
 */
export function getCarouselPhotos(
  menuItems: Array<{ imageUrl?: string | null; featuredOnLanding?: boolean; sortOrder?: number }>,
  maxPhotos: number = CAROUSEL_MAX_PHOTOS,
): string[] {
  const withPhotos = menuItems.filter(
    (item): item is typeof item & { imageUrl: string } => !!item.imageUrl,
  );
  const featured = withPhotos.filter((item) => item.featuredOnLanding);

  const ordered =
    featured.length > 0
      ? [...featured].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      : withPhotos;

  return ordered.slice(0, maxPhotos).map((item) => item.imageUrl);
}

/**
 * Return the next carousel index, wrapping around.
 * Returns 0 for total <= 1 (safe no-op).
 */
export function nextCarouselIndex(current: number, total: number): number {
  if (total <= 1) return 0;
  return (current + 1) % total;
}
