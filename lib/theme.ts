/**
 * Per-tenant theme. The iOS app reads the active restaurant's branding
 * (logo, colors, hero image, fonts) from `/api/mobile/native/info` and
 * threads it through React Context. Every screen consumes the theme via
 * `useTheme()` and styles itself in the restaurant's brand.
 *
 * When no restaurant is connected (apex / cold-start before validation)
 * the app uses the `NEUTRAL_THEME` defined below — calm LunchPad
 * platform branding rather than a random tenant's colors.
 *
 * Color tokens follow the web app's CSS variable names so a designer can
 * reason about both surfaces with the same vocabulary:
 *
 *   primary  — main brand color, used for buttons, badges, headings
 *   accent   — secondary color, used for highlights, "popular" pills, etc.
 *   dark     — dark surface, used as the app background
 *   bodyText — primary text color on light surfaces (cards)
 *
 * Plus iOS-specific tokens for surfaces, dividers, and the eight shades
 * we draw on across screens.
 */

import { useContext } from "react";
import { ThemeContext } from "./theme-context";

export type RestaurantBrand = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  heroImageUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  darkColor: string | null;
  heroTitleColor: string | null;
  heroAccentColor: string | null;
  bodyTextColor: string | null;
  displayFont: string | null;
  bodyFont: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
};

/**
 * Resolved theme — what every screen actually consumes. All fields are
 * guaranteed non-null; falls back to neutral defaults when the active
 * restaurant has a field unset.
 */
export type Theme = {
  /** The restaurant being displayed (or null when neutral mode). */
  restaurant: RestaurantBrand | null;

  // Core palette
  primary: string;       // accent / CTA / brand badge
  accent: string;        // secondary highlight
  dark: string;          // app background
  surface: string;       // card background
  surfaceElevated: string; // raised card / modal background

  // Text scale
  textPrimary: string;   // headers, body
  textSecondary: string; // captions, descriptions
  textMuted: string;     // labels, placeholders
  textOnPrimary: string; // text drawn on top of the primary color (button label)

  // Semantic
  danger: string;        // sign-out, errors, allergy warnings
  success: string;       // paid badges, confirmations
  warning: string;       // sold-out, allergy chips

  // Borders / dividers
  border: string;        // 1px lines between rows
  divider: string;       // section dividers

  // Typography family. Bundled iOS system fonts only (no remote font
  // loading at this stage). Display is reserved for headlines and the
  // brand wordmark; body is used everywhere else and falls back to the
  // system default.
  fontDisplay: string;   // e.g. "Avenir Next" — used for page titles, brand
  fontBody: string;      // e.g. "System" — paragraphs, labels

  // Logos / heroes (URLs may be null even after resolution if tenant didn't upload one)
  logoUrl: string | null;
  heroImageUrl: string | null;
};

// ── Neutral LunchPad defaults ────────────────────────────────────────────────
// Used when no tenant is connected (e.g. the school code entry screen before
// validation) OR as a fallback when a tenant has a brand field unset.

const NEUTRAL_THEME: Theme = {
  restaurant: null,

  primary: "#f59e0b",            // amber — LunchPad accent
  accent: "#fbbf24",             // lighter amber
  dark: "#0f172a",               // slate-900
  surface: "#1e293b",            // slate-800 — cards
  surfaceElevated: "#334155",    // slate-700 — modals / raised

  textPrimary: "#f1f5f9",        // slate-100
  textSecondary: "#94a3b8",      // slate-400 (passes AA on dark)
  textMuted: "#94a3b8",          // bumped one tier brighter for AA compliance
  textOnPrimary: "#0f172a",      // dark text on amber CTA

  danger: "#f87171",             // red-400
  success: "#34d399",            // emerald-400
  warning: "#fbbf24",            // amber-400

  border: "#1e293b",
  divider: "#334155",

  // iOS-native fonts. Avenir Next is shipped with iOS and reads as more
  // editorial than System SF, which gives headlines a "deliberate" feel
  // without bundling a custom .ttf. Falls back gracefully on any device.
  fontDisplay: "Avenir Next",
  fontBody: "System",

  logoUrl: null,
  heroImageUrl: null,
};

/**
 * Build a resolved Theme from a RestaurantBrand. Any field the restaurant
 * doesn't set falls back to the neutral palette so the screen still
 * renders (vs an undefined-color crash).
 *
 * Text-on-primary is computed by luminance: light text on dark primaries,
 * dark text on light primaries. Matches what the web does via lib/contrast.
 */
export function buildTheme(brand: RestaurantBrand | null): Theme {
  if (!brand) return NEUTRAL_THEME;

  const primary = brand.primaryColor ?? NEUTRAL_THEME.primary;
  const accent = brand.accentColor ?? NEUTRAL_THEME.accent;
  const dark = brand.darkColor ?? NEUTRAL_THEME.dark;
  const bodyText = brand.bodyTextColor ?? NEUTRAL_THEME.textPrimary;

  return {
    restaurant: brand,
    primary,
    accent,
    dark,
    // Surfaces shift slightly toward `dark` so they read as cards on top
    // of the app bg. Hardcoded slate-800/700 is fine for v1 — most
    // restaurants will use a dark bg with brand-colored accents only.
    surface: NEUTRAL_THEME.surface,
    surfaceElevated: NEUTRAL_THEME.surfaceElevated,

    textPrimary: NEUTRAL_THEME.textPrimary,
    textSecondary: NEUTRAL_THEME.textSecondary,
    textMuted: NEUTRAL_THEME.textMuted,
    textOnPrimary: contrastForeground(primary),

    danger: NEUTRAL_THEME.danger,
    success: NEUTRAL_THEME.success,
    warning: NEUTRAL_THEME.warning,

    border: NEUTRAL_THEME.border,
    divider: NEUTRAL_THEME.divider,

    // Typography stays on iOS-native fonts unless we later bundle the
    // restaurant's custom face. Tenant-set displayFont strings (e.g.
    // "Oswald") are passed through so a future build can opt into the
    // restaurant's web font by bundling the matching .ttf.
    fontDisplay: NEUTRAL_THEME.fontDisplay,
    fontBody: NEUTRAL_THEME.fontBody,

    logoUrl: brand.logoUrl,
    heroImageUrl: brand.heroImageUrl,
  };
}

/**
 * Pick a foreground (text) color that has enough contrast against a given
 * background. Used so a button labeled with `theme.primary` as bg always
 * has readable text on it. Cheap luminance check — not full WCAG ratio
 * math, but good enough for the contrast band we care about.
 */
function contrastForeground(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return "#ffffff";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  // Relative luminance approximation (WCAG-ish)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#0f172a" : "#ffffff";
}

export const NEUTRAL = NEUTRAL_THEME;

/**
 * Hook every screen uses. The context shape is `{ theme, refresh }` —
 * `useTheme()` returns just the theme, while components that need to
 * imperatively re-fetch the brand should use `useRefreshTheme` from
 * `lib/theme-context`.
 */
export function useTheme(): Theme {
  return useContext(ThemeContext).theme;
}
