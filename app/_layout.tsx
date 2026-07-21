import { useEffect } from "react";
import * as Font from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Fraunces_800ExtraBold,
} from "@expo-google-fonts/fraunces";
import { ThemeProvider } from "../lib/theme-context";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { initSentry } from "../lib/sentry";

// Initialize Sentry as early as possible — at module load, before React
// mounts anything — so a crash during the first render is still captured.
// `initSentry` no-ops silently when `EXPO_PUBLIC_SENTRY_DSN` is unset
// (local dev), so it's safe to call unconditionally.
//
// NOTE: native-side Sentry integration (Xcode source map upload, dSYM
// upload, EAS release step) is NOT wired here — it needs a
// `SENTRY_AUTH_TOKEN` in EAS secrets plus a `sentry.properties` file.
// See `sentry.properties.example` at the repo root for the shape.
initSentry();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

export default function RootLayout() {
  useEffect(() => {
    Font.loadAsync({
      Fraunces_800ExtraBold,
    });
  }, []);

  return (
    // ErrorBoundary is the outermost element so it catches even provider
    // failures. Its fallback UI uses raw RN + inline styles so it renders
    // without ThemeProvider/fonts.
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        {/* ThemeProvider lives above the navigator so every screen — auth,
            app tabs, checkout success — has access to the active
            restaurant's brand. Wrapped inside QueryClientProvider so the
            provider itself could choose to use react-query for its fetch
            if we ever swap the implementation. */}
        <ThemeProvider>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(app)" />
            <Stack.Screen name="checkout" />
          </Stack>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
