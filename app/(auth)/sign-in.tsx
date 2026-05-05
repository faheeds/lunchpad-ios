/**
 * Sign In — shown after school code is validated.
 * Sign in with Apple (required by App Store guideline 4.8).
 */

import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { useRouter } from "expo-router";
import { appleSignIn } from "../../lib/auth";

export default function SignInScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleAppleSignIn() {
    setLoading(true);
    setError("");
    try {
      await appleSignIn();
      router.replace("/(app)");
    } catch (err: unknown) {
      // User cancelled — no error message needed
      const code = (err as { code?: string }).code;
      if (code !== "ERR_REQUEST_CANCELED") {
        setError("Sign in failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  function handleGuest() {
    router.replace("/(app)");
  }

  return (
    <View style={styles.container}>
      <View style={styles.inner}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <Text style={styles.icon}>🍽️</Text>
          </View>
          <Text style={styles.title}>Welcome to LunchPad</Text>
          <Text style={styles.subtitle}>
            Sign in to save your children's profiles and view order history.
          </Text>
        </View>

        {/* Sign in button */}
        <View style={styles.buttonsContainer}>
          {loading ? (
            <ActivityIndicator color="#f59e0b" size="large" />
          ) : (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={
                AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
              }
              buttonStyle={
                AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
              }
              cornerRadius={12}
              style={styles.appleButton}
              onPress={handleAppleSignIn}
            />
          )}

          {!!error && <Text style={styles.errorText}>{error}</Text>}

          {/* Guest option */}
          <TouchableOpacity onPress={handleGuest} style={styles.guestButton}>
            <Text style={styles.guestText}>Continue as guest →</Text>
          </TouchableOpacity>
        </View>

        {/* Privacy note */}
        <Text style={styles.privacyNote}>
          Your information is only used to manage your lunch orders.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  inner: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "center",
    gap: 40,
  },
  header: {
    alignItems: "center",
    gap: 12,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#f59e0b22",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  icon: {
    fontSize: 40,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: "#f1f5f9",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    color: "#94a3b8",
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 16,
  },
  buttonsContainer: {
    gap: 16,
    alignItems: "center",
  },
  appleButton: {
    width: "100%",
    height: 52,
  },
  errorText: {
    fontSize: 13,
    color: "#f87171",
    textAlign: "center",
  },
  guestButton: {
    paddingVertical: 12,
  },
  guestText: {
    fontSize: 15,
    color: "#64748b",
    fontWeight: "500",
  },
  privacyNote: {
    fontSize: 12,
    color: "#475569",
    textAlign: "center",
    paddingHorizontal: 24,
  },
});
