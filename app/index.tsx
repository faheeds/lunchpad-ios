/**
 * Root entry point — checks auth state and redirects immediately.
 * Expo Router loads "/" first; this decides where to send the user.
 */

import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { getSchoolCode, getJWT } from "../lib/api";

export default function RootIndex() {
  const router = useRouter();

  useEffect(() => {
    async function redirect() {
      const code = await getSchoolCode();
      if (!code) {
        router.replace("/(auth)");
        return;
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
