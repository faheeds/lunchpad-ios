import { useEffect } from "react";
import * as Font from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Fraunces_800ExtraBold,
} from "@expo-google-fonts/fraunces";
import { ThemeProvider } from "../lib/theme-context";

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
  );
}
