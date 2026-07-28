/**
 * Tests for lib/heroCarousel — getCarouselPhotos and nextCarouselIndex.
 *
 * Both functions are pure and synchronous; no mocks, no timers, no network.
 */

import {
  getCarouselPhotos,
  nextCarouselIndex,
  CAROUSEL_MAX_PHOTOS,
} from "../../lib/heroCarousel";

// ---------------------------------------------------------------------------
// getCarouselPhotos — happy paths
// ---------------------------------------------------------------------------

describe("getCarouselPhotos — happy paths", () => {
  it("returns URLs from items that have imageUrl", () => {
    const items = [{ imageUrl: "https://cdn/a.jpg" }, { imageUrl: "https://cdn/b.jpg" }];
    expect(getCarouselPhotos(items)).toEqual(["https://cdn/a.jpg", "https://cdn/b.jpg"]);
  });

  it("preserves the original order of items", () => {
    const items = [
      { imageUrl: "https://cdn/first.jpg" },
      { imageUrl: "https://cdn/second.jpg" },
      { imageUrl: "https://cdn/third.jpg" },
    ];
    const result = getCarouselPhotos(items);
    expect(result[0]).toBe("https://cdn/first.jpg");
    expect(result[1]).toBe("https://cdn/second.jpg");
    expect(result[2]).toBe("https://cdn/third.jpg");
  });

  it("returns empty array for empty menuItems input", () => {
    expect(getCarouselPhotos([])).toEqual([]);
  });

  it("returns all URLs when count is less than CAROUSEL_MAX_PHOTOS", () => {
    const items = [{ imageUrl: "https://cdn/a.jpg" }, { imageUrl: "https://cdn/b.jpg" }];
    const result = getCarouselPhotos(items);
    expect(result).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// getCarouselPhotos — filtering
// ---------------------------------------------------------------------------

describe("getCarouselPhotos — filtering", () => {
  it("skips items where imageUrl is null", () => {
    const items = [{ imageUrl: null }, { imageUrl: "https://cdn/real.jpg" }];
    expect(getCarouselPhotos(items)).toEqual(["https://cdn/real.jpg"]);
  });

  it("skips items where imageUrl is undefined", () => {
    const items = [{ imageUrl: undefined }, { imageUrl: "https://cdn/real.jpg" }];
    expect(getCarouselPhotos(items)).toEqual(["https://cdn/real.jpg"]);
  });

  it("skips items with no imageUrl key at all", () => {
    const items = [{} as { imageUrl?: string | null }, { imageUrl: "https://cdn/real.jpg" }];
    expect(getCarouselPhotos(items)).toEqual(["https://cdn/real.jpg"]);
  });

  it("returns empty array when all items have no imageUrl", () => {
    const items = [{ imageUrl: null }, { imageUrl: undefined }, {}  as { imageUrl?: string | null }];
    expect(getCarouselPhotos(items)).toEqual([]);
  });

  it("handles mixed items, returning only real URLs in order", () => {
    const items = [
      { imageUrl: "https://cdn/a.jpg" },
      { imageUrl: null },
      { imageUrl: "https://cdn/b.jpg" },
      { imageUrl: undefined },
      { imageUrl: "https://cdn/c.jpg" },
    ];
    expect(getCarouselPhotos(items)).toEqual([
      "https://cdn/a.jpg",
      "https://cdn/b.jpg",
      "https://cdn/c.jpg",
    ]);
  });
});

// ---------------------------------------------------------------------------
// getCarouselPhotos — capping
// ---------------------------------------------------------------------------

describe("getCarouselPhotos — capping", () => {
  it("caps at CAROUSEL_MAX_PHOTOS (5) by default", () => {
    const items = Array.from({ length: 8 }, (_, i) => ({ imageUrl: `https://cdn/${i}.jpg` }));
    const result = getCarouselPhotos(items);
    expect(result).toHaveLength(CAROUSEL_MAX_PHOTOS);
    expect(result).toHaveLength(5);
  });

  it("does not include the 6th photo even when all 8 have valid imageUrls", () => {
    const items = Array.from({ length: 8 }, (_, i) => ({ imageUrl: `https://cdn/${i}.jpg` }));
    const result = getCarouselPhotos(items);
    expect(result).not.toContain("https://cdn/5.jpg");
  });

  it("respects a custom maxPhotos smaller than the array length", () => {
    const items = Array.from({ length: 6 }, (_, i) => ({ imageUrl: `https://cdn/${i}.jpg` }));
    expect(getCarouselPhotos(items, 3)).toHaveLength(3);
  });

  it("custom maxPhotos = 0 returns empty array", () => {
    const items = [{ imageUrl: "https://cdn/a.jpg" }];
    expect(getCarouselPhotos(items, 0)).toEqual([]);
  });

  it("custom maxPhotos larger than available photos returns only available", () => {
    const items = [{ imageUrl: "https://cdn/a.jpg" }, { imageUrl: "https://cdn/b.jpg" }];
    expect(getCarouselPhotos(items, 10)).toHaveLength(2);
  });

  it("CAROUSEL_MAX_PHOTOS constant is 5", () => {
    expect(CAROUSEL_MAX_PHOTOS).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// nextCarouselIndex — happy paths
// ---------------------------------------------------------------------------

describe("nextCarouselIndex — happy paths", () => {
  it("advances from 0 to 1", () => {
    expect(nextCarouselIndex(0, 3)).toBe(1);
  });

  it("advances from a middle index to the next", () => {
    expect(nextCarouselIndex(2, 5)).toBe(3);
  });

  it("wraps from the last index back to 0", () => {
    expect(nextCarouselIndex(4, 5)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// nextCarouselIndex — edge cases / adversarial
// ---------------------------------------------------------------------------

describe("nextCarouselIndex — edge cases", () => {
  it("total = 1 always returns 0 (single photo, no cycling)", () => {
    expect(nextCarouselIndex(0, 1)).toBe(0);
  });

  it("total = 0 returns 0 without throwing (safe no-op)", () => {
    expect(() => nextCarouselIndex(0, 0)).not.toThrow();
    expect(nextCarouselIndex(0, 0)).toBe(0);
  });

  it("total = 2, current = 1 wraps to 0 (binary boundary)", () => {
    expect(nextCarouselIndex(1, 2)).toBe(0);
  });

  it("large total: current = 99 wraps to 0", () => {
    expect(nextCarouselIndex(99, 100)).toBe(0);
  });

  it("large total: mid-range step advances correctly", () => {
    expect(nextCarouselIndex(50, 100)).toBe(51);
  });
});

// ---------------------------------------------------------------------------
// Integration: full-cycle traversal
// ---------------------------------------------------------------------------

describe("getCarouselPhotos + nextCarouselIndex integration", () => {
  it("cycling through all indices visits every photo exactly once before returning to 0", () => {
    const items = Array.from({ length: 4 }, (_, i) => ({ imageUrl: `https://cdn/${i}.jpg` }));
    const photos = getCarouselPhotos(items);
    expect(photos).toHaveLength(4);

    const visited: number[] = [];
    let idx = 0;
    // Advance photos.length times — should return to 0
    for (let step = 0; step < photos.length; step++) {
      visited.push(idx);
      idx = nextCarouselIndex(idx, photos.length);
    }
    // All 4 distinct indices visited
    expect(visited).toEqual([0, 1, 2, 3]);
    // After a full cycle we're back at 0
    expect(idx).toBe(0);
  });
});
