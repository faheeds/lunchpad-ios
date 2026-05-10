/**
 * Root entry point — checks auth state and redirects immediately.
 * Expo Router loads "/" first; this decides where to send the user.
 *
 * Bootstrap also validates the stored school code against the server's
 * /info endpoint. If the stored code points at a tenant that no longer
 * exists or whose subdomain isn't registered (common after a TestFlight
 * upgrade across breaking backend changes), we clear local state and
 * send the user back to the school-code entry screen instead of letting
 * them land on a home screen that will silently fail to load data.
 */

import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import {
  getSchoolCode,
  getJWT,
  getStoredBaseUrl,
  clearStoredBaseUrl,
  clearJWT,
  validateSchoolCode,
  setSchoolCode,
} from "../lib/api";
import * as SecureStore from "expo-secure-store";

const SCHOOL_CODE_KEY = "lunchpad_school_code";

async function clearLocalState(): Promise<void> {
  // Wipe everything — school code, base URL, JWT — so the user lands on a
  // clean school-code entry screen.
  await SecureStore.deleteItemAsync(SCHOOL_CODE_KEY);
  await clearStoredBaseUrl();
  await clearJWT();
}

export default function RootIndex() {
  const router = useRouter();

  useEffect(() => {
    async function redirect() {
      const code = await getSchoolCode();
      if (!code) {
        router.replace("/(auth)");
        return;
      }

      // Validate the stored code against the live tenant. validateSchoolCode
      // hits /api/mobile/native/info on the resolved host — if it 404s or
      // the subdomain doesn't resolve (DEPLOYMENT_NOT_FOUND), we treat the
      // stored state as poisoned and reset.
      const stored = await getStoredBaseUrl();
      const probeInput = stored ?? code;
      const probe = await validateSchoolCode(probeInput);
      if (!probe.valid) {
        await clearLocalState();
        router.replace("/(auth)");
        return;
      }
      // Refresh stored values from the validation result so they stay in
      // sync if the slug or domain has migrated.
      if (probe.baseUrl) {
        await setSchoolCode(code);
      }

      const jwt = await getJWT();
      if (!jwt) {
        router.replace("/(auth)/sign-in");
        return;
      }
      router.replace("/(app)");
    }
    redirect();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: "#0f172a", alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator color="#f59e0b" size="large" />
    </View>
  );
}
