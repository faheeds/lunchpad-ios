/**
 * Connect — the tenant code step. Reframed from a bureaucratic gate into
 * a warm setup task: a clear heading, reassuring helper copy, and
 * operator-neutral language (school OR office).
 */

import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { validateSchoolCode, setSchoolCode, setStoredBaseUrl, getJWT } from "../../lib/api";
import { useRefreshTheme } from "../../lib/theme-context";
import { useTheme } from "../../lib/theme";
import { BrandMark } from "../../components/BrandMark";
import { PrimaryButton } from "../../components/ui";

export default function ConnectScreen() {
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
        setError(
          "We couldn't find that. Try the full web address your school or office gave you — e.g. lunch.yourdomain.com.",
        );
        return;
      }
      await setSchoolCode(trimmed);
      if (baseUrl) await setStoredBaseUrl(baseUrl);
      // Refresh the theme so the next screen renders in the tenant's brand.
      await refreshTheme();

      const jwt = await getJWT();
      if (jwt) router.replace("/(app)");
      else router.replace("/(auth)/sign-in");
    } catch {
      setError("Couldn't connect. Check your internet and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[styles.fill, { backgroundColor: theme.dark }]}>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <SafeAreaView style={styles.fill}>
          <View style={styles.content}>
            <BrandMark size={48} radius={13} />
            <Text style={[styles.title, { color: theme.textPrimary, fontFamily: theme.fontDisplay }]}>
              Connect to your{"\n"}lunch program
            </Text>
            <Text style={[styles.sub, { color: theme.textSecondary }]}>
              Your school or office sent you a code or a web link. Enter it once — we&apos;ll remember it.
            </Text>

            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.textMuted }]}>CODE OR LINK</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.surface,
                    borderColor: error ? theme.danger : theme.border,
                    color: theme.textPrimary,
                  },
                ]}
                value={code}
                onChangeText={(t) => {
                  setCode(t);
                  setError("");
                }}
                placeholder="e.g. lunch.yourschool.com"
                placeholderTextColor={theme.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                keyboardType="url"
                returnKeyType="go"
                onSubmitEditing={handleContinue}
              />
              {error ? (
                <Text style={[styles.error, { color: theme.danger }]}>{error}</Text>
              ) : (
                <View style={styles.hintRow}>
                  <Ionicons name="lock-closed-outline" size={13} color={theme.textMuted} />
                  <Text style={[styles.hint, { color: theme.textMuted }]}>
                    Used only to load the right menu — nothing is shared.
                  </Text>
                </View>
              )}
            </View>

            <View style={{ flex: 1 }} />

            <PrimaryButton
              label="Continue"
              icon="arrow-forward"
              onPress={handleContinue}
              loading={loading}
              disabled={!code.trim()}
            />
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 28, paddingBottom: 16, gap: 14 },
  title: { fontSize: 27, fontWeight: "600", letterSpacing: -0.5, lineHeight: 32, marginTop: 8 },
  sub: { fontSize: 15, lineHeight: 22 },
  field: { gap: 8, marginTop: 8 },
  label: { fontSize: 11, fontWeight: "700", letterSpacing: 1.3 },
  input: { borderRadius: 14, borderWidth: 1.6, paddingHorizontal: 16, paddingVertical: 15, fontSize: 16 },
  error: { fontSize: 13, lineHeight: 18 },
  hintRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  hint: { fontSize: 12.5, flex: 1 },
});
