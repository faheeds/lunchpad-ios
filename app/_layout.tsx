import { useEffect } from "react";
import * as Font from "expo-font";
import * as Notifications from "expo-notifications";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Fraunces_800ExtraBold,
} from "@expo-google-fonts/fraunces";
import { ThemeProvider } from "../lib/theme-context";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { initSentry } from "../lib/sentry";
import { parsePushData } from "../lib/push-notifications";
import { isSignedIn } from "../lib/auth";

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
  const router = useRouter();

  useEffect(() => {
    Font.loadAsync({
      Fraunces_800ExtraBold,
    });
  }, []);

  useEffect(() => {
    async function checkColdLaunchNotification(): Promise<void> {
      if (!(await isSignedIn())) return;
      const lastNotificationResponse = await Notifications.getLastNotificationResponseAsync();
      if (lastNotificationResponse) {
        const data = lastNotificationResponse.notification.request.content.data as Record<string, unknown>;
        const route = parsePushData(data);
        if (route) {
          if (route.screen === "order") {
            if (route.orderId) {
              router.navigate(`/(app)/orders/${route.orderId}`);
            } else {
              router.navigate("/(app)/menu");
            }
          } else if (route.screen === "weekly") {
            router.navigate("/(app)/weekly-plan");
          }
        }
      }
    }
    checkColdLaunchNotification();
  }, [router]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(async (response: Notifications.NotificationResponse) => {
      if (!(await isSignedIn())) return;
      const data = response.notification.request.content.data as Record<string, unknown>;
      const route = parsePushData(data);
      if (route) {
        if (route.screen === "order") {
          if (route.orderId) {
            router.navigate(`/(app)/orders/${route.orderId}`);
          } else {
            router.navigate("/(app)/menu");
          }
        } else if (route.screen === "weekly") {
          router.navigate("/(app)/weekly-plan");
        }
      }
    });

    return () => subscription.remove();
  }, [router]);

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
