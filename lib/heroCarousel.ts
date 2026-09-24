// No React imports — pure functions only so QA can test them.

export const CAROUSEL_MAX_PHOTOS = 5;
export const CAROUSEL_INTERVAL_MS = 4500;
export const CAROUSEL_RESUME_DELAY_MS = 3000;

/**
 * Extract up to maxPhotos photo URLs from menu items, skipping items with
 * no imageUrl. Order is preserved (server order = chef's intended order).
 */
export function getCarouselPhotos(
  menuItems: Array<{ imageUrl?: string | null }>,
  maxPhotos: number = CAROUSEL_MAX_PHOTOS,
): string[] {
  const photos: string[] = [];
  for (const item of menuItems) {
    if (photos.length >= maxPhotos) break;
    if (item.imageUrl) photos.push(item.imageUrl);
  }
  return photos;
}

/**
 * Return the next carousel index, wrapping around.
 * Returns 0 for total <= 1 (safe no-op).
 */
export function nextCarouselIndex(current: number, total: number): number {
  if (total <= 1) return 0;
  return (current + 1) % total;
}
