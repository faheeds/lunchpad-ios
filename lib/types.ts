export type School = {
  id: string;
  name: string;
  timezone: string;
  /** "SCHOOL" or "OFFICE" — drives school-vs-office wording in the app. */
  locationType?: "SCHOOL" | "OFFICE";
};

export type MenuOption = {
  id: string;
  name: string;
  optionType: string;
  priceDeltaCents: number;
};

export type MenuItemSize = {
  id: string;
  name: string;
  priceCents: number;
};

export type MenuItem = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  basePriceCents: number;
  options: MenuOption[];
  /** Optional — present on the Menu tab response, may be absent on the
   *  delivery-dates response. Empty array for items without tags. */
  dietaryTags?: string[];
  /** Pick-one selections the customer MUST resolve before adding the
   *  item to their cart (e.g. Beef / Crispy Chicken / Vegan for a
   *  Build-Your-Own-Burger). When non-empty, the order modal renders a
   *  required-choice picker and the "Add to cart" button stays disabled
   *  until one is chosen. Empty / undefined = no required choice. */
  requiredChoices?: string[];
  /** Size variants with absolute per-size prices. When non-empty, the
   *  customer MUST pick a size before adding to cart. For the exact
   *  base + size + add-on pricing algorithm see `lib/pricing.ts`
   *  (`computeLineTotalCents`) — the single source of truth for
   *  every price shown in the app. */
  sizes?: MenuItemSize[];
};

/** Menu tab response — grouped by category. */
export type MenuCategory = {
  title: string;
  items: MenuItem[];
};

export type RestaurantMenu = {
  restaurantName: string;
  categories: MenuCategory[];
};

export type DeliveryDateWithMenu = {
  id: string;
  schoolId: string;
  deliveryDate: string;
  cutoffAt: string;
  orderingOpen: boolean;
  school: School;
  soldOut: string[];
  menuItems: MenuItem[];
};

export type CartItem = {
  /** Stable id for this cart line — derived from menuItemId + size +
   *  choice + customizations so two distinct configurations of the same
   *  item are separate lines, but an exact re-add of the same combo
   *  bumps `quantity` on the existing line instead of duplicating. */
  cartKey: string;
  menuItemId: string;
  itemName: string;
  basePriceCents: number;
  /** Operator-defined pick-one selection (e.g. "Beef" or "Chicken"). Only
   *  present when the menu item has `requiredChoices`. The backend
   *  validates this against the item's `requiredChoices` list and
   *  rejects checkout if missing. */
  choice?: string;
  /** Selected size name (e.g. "Medium", "12-inch"). Only present when
   *  the menu item has size variants. The backend rejects checkout if
   *  the item has sizes but no size is sent. */
  size?: string;
  additions: string[];
  removals: string[];
  allergyNotes?: string;
  /** Per-unit total for this configured line. Computed by
   *  `computeLineTotalCents` in `lib/pricing.ts` — do not recompute
   *  inline. Multiply by `quantity` for the cart-line subtotal. */
  lineTotalCents: number;
  /** Number of identical units of this configuration. Always ≥ 1. */
  quantity: number;
};

/** Build a deterministic key from a cart-item configuration. Same options
 *  in a different order still hash to the same key so we don't end up
 *  with sibling lines that should be one. Includes both `size` and
 *  `choice` so Beef-Medium and Beef-Large are separate cart lines. */
export function buildCartKey(
  menuItemId: string,
  size: string | undefined,
  choice: string | undefined,
  additions: string[],
  removals: string[],
): string {
  const a = [...additions].sort().join("|");
  const r = [...removals].sort().join("|");
  return `${menuItemId}::${size ?? ""}::${choice ?? ""}::${a}::${r}`;
}

export type Child = {
  id: string;
  schoolId: string;
  schoolName: string;
  studentName: string;
  grade: string;
  allergyNotes: string;
  locationType?: "SCHOOL" | "OFFICE";
};

export type Parent = {
  id: string;
  email: string;
  name: string | null;
  children: Child[];
};

export type OrderHistoryItem = {
  id: string;
  orderNumber: string;
  status: string;
  deliveryDate: string;
  schoolName: string;
  totalCents: number;
  createdAt: string;
  items: { name: string; lineTotalCents: number; additions: string[]; removals: string[] }[];
  /** Which child this order is for — present on orders placed after this
   *  field was added to the web endpoint. Absent on historical orders. */
  parentChildId?: string;
  /** Which delivery date slot this order occupies — used to cross-reference
   *  against weekly plan slots. Absent on pre-rollout orders. */
  deliveryDateId?: string;
};

// ── Weekly plan bundle ───────────────────────────────────────────────────────
// Mirrors /api/mobile/native/weekly-plans GET response.

export type WeeklyChild = {
  id: string;
  schoolId: string;
  schoolName: string;
  studentName: string;
  grade: string;
};

export type WeeklyDeliveryDate = {
  id: string;
  schoolId: string;
  deliveryDate: string;
  cutoffAt: string;
  school: School;
  menuItems: MenuItem[];
};

export type WeeklyPlan = {
  id: string;
  parentChildId: string;
  weekday: number;
  menuItemId: string;
  menuItemName: string;
  choice: string | null;
  size: string | null;
  additions: string[];
  removals: string[];
  isActive: boolean;
};

export type WeeklyPlansBundle = {
  children: WeeklyChild[];
  deliveryDates: WeeklyDeliveryDate[];
  plans: WeeklyPlan[];
};

/** A single result from GET /api/mobile/native/restaurants/search on the web app. */
export type RestaurantSearchResult = {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
};
