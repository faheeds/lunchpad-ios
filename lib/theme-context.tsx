/**
 * ThemeProvider — fetches the current restaurant's branding on mount,
 * caches it in SecureStore for instant cold-start renders, and exposes
 * the resolved Theme via React Context.
 *
 * Mount this once at the root layout. Every screen consumes it through
 * `useTheme()` from `lib/theme.ts`. Screens that mutate the active
 * tenant (e.g. after school-code entry) call `useRefreshTheme()` to
 * trigger a fresh `/info` fetch and re-render the whole app in the new
 * brand without a cold restart.
 */

import { createContext, useEffect, useState, useCallback, useContext, useMemo, useRef } from "react";
import * as SecureStore from "expo-secure-store";
import { NEUTRAL, buildTheme, type RestaurantBrand, type Theme } from "./theme";
import { getStoredBaseUrl, getSchoolCode } from "./api";

const THEME_CACHE_KEY = "lunchpad_brand_cache_v1";

type ThemeContextValue = {
  theme: Theme;
  refresh: () => Promise<void>;
};

export const ThemeContext = createContext<ThemeContextValue>({
  theme: NEUTRAL,
  refresh: async () => {},
});

/**
 * Hits /api/mobile/native/info on whatever host the user has saved. The
 * server returns the full brand surface. We don't surface fetch errors
 * here — if the call fails, the cached or neutral theme stays in place
 * and the rest of the app keeps working.
 */
async function fetchBrand(): Promise<RestaurantBrand | null> {
  try {
    const baseUrl = await getStoredBaseUrl();
    const code = await getSchoolCode();
    if (!baseUrl && !code) return null;
    const target = baseUrl ?? `https://${code}.lunchpad.us`;
    const res = await fetch(`${target}/api/mobile/native/info`, {
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<RestaurantBrand> & {
      id?: string;
      name?: string;
      slug?: string;
    };
    if (!data.id || !data.name || !data.slug) return null;
    return {
      id: data.id,
      name: data.name,
      slug: data.slug,
      logoUrl: data.logoUrl ?? null,
      heroImageUrl: data.heroImageUrl ?? null,
      primaryColor: data.primaryColor ?? null,
      accentColor: data.accentColor ?? null,
      darkColor: data.darkColor ?? null,
      heroTitleColor: data.heroTitleColor ?? null,
      heroAccentColor: data.heroAccentColor ?? null,
      bodyTextColor: data.bodyTextColor ?? null,
      displayFont: data.displayFont ?? null,
      bodyFont: data.bodyFont ?? null,
      contactEmail: data.contactEmail ?? null,
      contactPhone: data.contactPhone ?? null,
    };
  } catch {
    return null;
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(NEUTRAL);
  const mounted = useRef(true);

  // Persist the live brand to SecureStore so the next cold-start renders
  // the right colors on its first frame.
  const cacheBrand = useCallback(async (brand: RestaurantBrand) => {
    try {
      await SecureStore.setItemAsync(THEME_CACHE_KEY, JSON.stringify(brand));
    } catch {
      // cache write is best-effort
    }
  }, []);

  const refresh = useCallback(async () => {
    const fresh = await fetchBrand();
    if (!mounted.current) return;
    if (fresh) {
      setTheme(buildTheme(fresh));
      await cacheBrand(fresh);
    } else {
      // No tenant resolved — fall back to neutral. This is the right
      // behavior after sign-out (school code cleared) so the next user
      // doesn't see the previous tenant's brand bleed through.
      setTheme(NEUTRAL);
    }
  }, [cacheBrand]);

  useEffect(() => {
    mounted.current = true;

    async function bootstrap() {
      // 1. Hydrate from cache — instant first paint with last-known brand.
      try {
        const cached = await SecureStore.getItemAsync(THEME_CACHE_KEY);
        if (cached && mounted.current) {
          const brand = JSON.parse(cached) as RestaurantBrand;
          setTheme(buildTheme(brand));
        }
      } catch {
        // cache miss — proceed with neutral
      }

      // 2. Refresh from server in the background.
      await refresh();
    }

    bootstrap();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  const value = useMemo(() => ({ theme, refresh }), [theme, refresh]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Imperatively refresh the active brand. Call after school-code entry
 * so the new tenant's colors apply without an app restart.
 */
export function useRefreshTheme(): () => Promise<void> {
  return useContext(ThemeContext).refresh;
}

export async function clearThemeCache(): Promise<void> {
  await SecureStore.deleteItemAsync(THEME_CACHE_KEY);
}
