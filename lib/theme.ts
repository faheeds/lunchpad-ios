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
 *   dark     — app background (now light in editorial theme)
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
export type TypographyScale = {
  /** Label sizes — for badges, small labels, uppercase section headers. Scales with system. */
  labelSmall: { fontSize: number; lineHeight: number };
  labelRegular: { fontSize: number; lineHeight: number };

  /** Body sizes — for body copy, list items. Scales with system. */
  bodySmall: { fontSize: number; lineHeight: number };
  body: { fontSize: number; lineHeight: number };
  bodyLarge: { fontSize: number; lineHeight: number };

  /** Display sizes — for section titles, modals, large headings. */
  displaySmall: { fontSize: number; lineHeight: number };
  display: { fontSize: number; lineHeight: number };
  displayLarge: { fontSize: number; lineHeight: number };
};

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

  // Typography family. Display font is Fraunces (serif) for editorial
  // feel; body is system default. Display is reserved for headlines and
  // the brand wordmark; body is used everywhere else.
  fontDisplay: string;   // Fraunces serif for editorial wordmark
  fontBody: string;      // System — paragraphs, labels

  // Typography scale — responsive sizes that respect iOS Dynamic Type.
  // All values auto-scale when the system text size changes. Use instead of
  // hardcoded fontSize values in StyleSheet.create(). e.g., use
  // `theme.type.body.fontSize` instead of `fontSize: 15`.
  type: TypographyScale;

  // Logos / heroes (URLs may be null even after resolution if tenant didn't upload one)
  logoUrl: string | null;
  heroImageUrl: string | null;
};

// ── Neutral LunchPad defaults ────────────────────────────────────────────────
// Editorial light theme: warm cream background, deep green primary, clay accent,
// Used when no tenant is connected (e.g. the school code entry screen before
// validation) OR as a fallback when a tenant has a brand field unset.

const NEUTRAL_TYPE_SCALE: TypographyScale = {
  labelSmall: { fontSize: 13, lineHeight: 14 },
  labelRegular: { fontSize: 13, lineHeight: 16 },
  bodySmall: { fontSize: 13, lineHeight: 18 },
  body: { fontSize: 15, lineHeight: 21 },
  bodyLarge: { fontSize: 16, lineHeight: 23 },
  displaySmall: { fontSize: 18, lineHeight: 22 },
  display: { fontSize: 22, lineHeight: 26 },
  displayLarge: { fontSize: 28, lineHeight: 32 },
};

const NEUTRAL_THEME: Theme = {
  restaurant: null,

  primary: "#2C4031",            // deep green — editorial primary
  accent: "#C0673E",             // clay — editorial accent
  dark: "#F6F1E6",               // warm cream — light background
  surface: "#FFFFFF",            // white — card background
  surfaceElevated: "#FEFBF6",    // pale cream — modals / raised

  textPrimary: "#211D15",        // deep ink — primary text
  textSecondary: "#5B5651",      // warm gray — secondary text
  textMuted: "#8A8580",          // muted warm gray — labels, placeholders
  textOnPrimary: "#FFFFFF",      // white text on green CTA

  danger: "#DC2626",             // red — errors, warnings
  success: "#059669",            // green — confirmations, paid
  warning: "#D97706",            // amber — allergy chips, sold-out

  border: "#E3DBC6",             // hairline — subtle dividers
  divider: "#DEE2CF",            // sage — section dividers

  // Fraunces for display (serif), System for body
  fontDisplay: "Fraunces_800ExtraBold",
  fontBody: "System",

  type: NEUTRAL_TYPE_SCALE,

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
 * Per-tenant brand colors override the primary and accent; surfaces,
 * backgrounds, and text colors stay on the editorial light palette.
 */
export function buildTheme(brand: RestaurantBrand | null): Theme {
  if (!brand) return NEUTRAL_THEME;

  const primary = brand.primaryColor ?? NEUTRAL_THEME.primary;
  const accent = brand.accentColor ?? NEUTRAL_THEME.accent;
  const dark = NEUTRAL_THEME.dark;
  const bodyText = brand.bodyTextColor ?? NEUTRAL_THEME.textPrimary;

  return {
    restaurant: brand,
    primary,
    accent,
    dark,
    // Surfaces stay on the editorial light palette (white/cream).
    // Most restaurants will use the light background with brand-colored
    // accents only (buttons, badges, headings).
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

    // Typography stays on Fraunces/System unless we later bundle a
    // restaurant's custom face. Tenant-set displayFont strings (e.g.
    // "Oswald") are passed through so a future build can opt into the
    // restaurant's web font by bundling the matching .ttf.
    fontDisplay: NEUTRAL_THEME.fontDisplay,
    fontBody: NEUTRAL_THEME.fontBody,

    type: NEUTRAL_TYPE_SCALE,

    logoUrl: brand.logoUrl,
    heroImageUrl: brand.heroImageUrl,
  };
}

/**
 * Pick a foreground (text) color that has enough contrast against a given
 * background. Used so a button labeled with `theme.primary` as bg always
 * has readable text on it. Cheap luminance check — not full WCAG ratio
 * math, but good enough for the contrast band we care about.
 * Light backgrounds get dark text; dark backgrounds get white text.
 */
function contrastForeground(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return "#211D15";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  // Relative luminance approximation (WCAG-ish)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#211D15" : "#FFFFFF";
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
