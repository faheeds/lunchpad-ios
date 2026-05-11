/**
 * School Code Entry — first screen every parent sees.
 * Enter e.g. "fsskitchen" → validates against the live API → saves to SecureStore.
 */

import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { validateSchoolCode, setSchoolCode, setStoredBaseUrl, getJWT } from "../../lib/api";
import { useRefreshTheme } from "../../lib/theme-context";
import { useTheme } from "../../lib/theme";
import { BrandMark } from "../../components/BrandMark";

export default function SchoolCodeScreen() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const refreshTheme = useRefreshTheme();
  const theme = useTheme();

  async function handleContinue() {
    const trimmed = code.toLowerCase().trim();
    if (!trimmed) return;

    setLoading(true);
    setError("");

    try {
      const { valid, baseUrl } = await validateSchoolCode(trimmed);
      if (!valid) {
        setError("Not found. Try your full URL (e.g. lunch.yourdomain.com) or check with your school.");
        return;
      }

      await setSchoolCode(trimmed);
      if (baseUrl) await setStoredBaseUrl(baseUrl);

      // Refresh the theme so the next screen renders in the new tenant's
      // brand colors/logo immediately, not after an app restart.
      await refreshTheme();

      // If already signed in, go straight to app
      const jwt = await getJWT();
      if (jwt) {
        router.replace("/(app)");
      } else {
        router.push("/(auth)/sign-in");
      }
    } catch {
      setError("Couldn't connect. Check your internet and try again.");
    } finally {
      setLoading(false);
    }
  }

  // Theme is neutral on first visit (no tenant connected yet) but tracks
  // the current tenant if the user comes back here via "Change school".

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.dark }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.inner}>
        {/* Logo + wordmark. BrandMark renders the active restaurant's
            uploaded logo if present, else the bundled LunchPad icon —
            no more emoji placeholder. */}
        <View style={styles.logoContainer}>
          <BrandMark size={72} radius={18} />
          <Text
            style={[
              styles.appName,
              { color: theme.textPrimary, fontFamily: theme.fontDisplay },
            ]}
          >
            {theme.restaurant?.name ?? "LunchPad"}
          </Text>
          <Text style={[styles.tagline, { color: theme.textSecondary }]}>
            {theme.restaurant ? "Lunch ordering, simplified." : "School lunch, simplified."}
          </Text>
        </View>

        {/* Card */}
        <View style={[styles.card, { backgroundColor: theme.surface }]}>
          <Text
            style={[
              styles.cardTitle,
              { color: theme.textPrimary, fontFamily: theme.fontDisplay },
            ]}
          >
            Connect to your lunch program
          </Text>
          <Text style={[styles.cardSubtitle, { color: theme.textSecondary }]}>
            Enter the code or the full address your school or office gave you (e.g. lunch.yourdomain.com).
          </Text>

          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.dark,
                borderColor: theme.surfaceElevated,
                color: theme.textPrimary,
              },
            ]}
            value={code}
            onChangeText={(t) => { setCode(t); setError(""); }}
            placeholder="e.g. lunch.yourschool.com"
            placeholderTextColor={theme.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            keyboardType="url"
            returnKeyType="go"
            onSubmitEditing={handleContinue}
          />

          {!!error && <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text>}

          <TouchableOpacity
            style={[
              styles.button,
              { backgroundColor: theme.primary },
              (!code.trim() || loading) && styles.buttonDisabled,
            ]}
            onPress={handleContinue}
            disabled={!code.trim() || loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={theme.textOnPrimary} />
            ) : (
              <Text style={[styles.buttonText, { color: theme.textOnPrimary }]}>Continue →</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
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
    gap: 32,
  },
  logoContainer: {
    alignItems: "center",
    gap: 8,
  },
  logoBox: {
    width: 72,
    height: 72,
    borderRadius: 18,
    backgroundColor: "#f59e0b",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  logoText: {
    fontSize: 36,
  },
  appName: {
    fontSize: 32,
    fontWeight: "800",
    color: "#f1f5f9",
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 15,
    color: "#94a3b8",
  },
  card: {
    backgroundColor: "#1e293b",
    borderRadius: 20,
    padding: 24,
    gap: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#f1f5f9",
  },
  cardSubtitle: {
    fontSize: 14,
    color: "#94a3b8",
    lineHeight: 20,
  },
  input: {
    backgroundColor: "#0f172a",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#334155",
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 17,
    color: "#f1f5f9",
    marginTop: 4,
  },
  errorText: {
    fontSize: 13,
    color: "#f87171",
  },
  button: {
    backgroundColor: "#f59e0b",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
  },
});
