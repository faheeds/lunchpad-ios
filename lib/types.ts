export type School = {
  id: string;
  name: string;
  timezone: string;
};

export type MenuOption = {
  id: string;
  name: string;
  optionType: string;
  priceDeltaCents: number;
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
  menuItemId: string;
  itemName: string;
  basePriceCents: number;
  additions: string[];
  removals: string[];
  allergyNotes?: string;
  lineTotalCents: number;
};

export type Child = {
  id: string;
  schoolId: string;
  schoolName: string;
  studentName: string;
  grade: string;
  allergyNotes: string;
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
  additions: string[];
  removals: string[];
  isActive: boolean;
};

export type WeeklyPlansBundle = {
  children: WeeklyChild[];
  deliveryDates: WeeklyDeliveryDate[];
  plans: WeeklyPlan[];
};
