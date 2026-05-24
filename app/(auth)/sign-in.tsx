/**
 * Sign In — shown once the tenant is connected. Apple Sign In is the
 * App Store requirement (guideline 4.8); here it's framed by the three
 * concrete things the customer gets. Guest is demoted to a quiet link.
 */

import { useState, type ComponentProps } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as AppleAuthentication from "expo-apple-authentication";
import { useRouter } from "expo-router";
import { appleSignIn } from "../../lib/auth";
import { useTheme } from "../../lib/theme";
import { BrandMark } from "../../components/BrandMark";
import { Card } from "../../components/ui";

type IconName = ComponentProps<typeof Ionicons>["name"];

const BENEFITS: { icon: IconName; label: string }[] = [
  { icon: "people-outline", label: "Save every eater's profile" },
  { icon: "repeat-outline", label: "Reorder a favourite in one tap" },
  { icon: "calendar-outline", label: "Plan the whole week at once" },
];

export default function SignInScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const theme = useTheme();
  const restaurantName = theme.restaurant?.name;

  async function handleAppleSignIn() {
    setLoading(true);
    setError("");
    try {
      await appleSignIn();
      router.replace("/(app)");
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code !== "ERR_REQUEST_CANCELED") setError("Sign in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[styles.fill, { backgroundColor: theme.dark }]}>
      <SafeAreaView style={styles.fill}>
        <View style={styles.content}>
          <View style={styles.header}>
            <BrandMark size={56} radius={16} />
            <Text style={[styles.title, { color: theme.textPrimary, fontFamily: theme.fontDisplay }]}>
              {restaurantName ? `Welcome to ${restaurantName}` : "Welcome to LunchPad"}
            </Text>
          </View>

          <Card style={styles.benefits}>
            {BENEFITS.map((bnf, i) => (
              <View
                key={bnf.label}
                style={[
                  styles.benefitRow,
                  i < BENEFITS.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border },
                ]}
              >
                <View style={[styles.benefitIcon, { backgroundColor: `${theme.primary}1a` }]}>
                  <Ionicons name={bnf.icon} size={17} color={theme.primary} />
                </View>
                <Text style={[styles.benefitText, { color: theme.textPrimary }]}>{bnf.label}</Text>
              </View>
            ))}
          </Card>

          <View style={styles.actions}>
            {loading ? (
              <ActivityIndicator color={theme.primary} size="large" style={{ height: 52 }} />
            ) : (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={14}
                style={styles.appleButton}
                onPress={handleAppleSignIn}
              />
            )}
            {error ? <Text style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}
            <TouchableOpacity
              onPress={() => router.replace("/(app)")}
              style={styles.guest}
              accessibilityRole="button"
              accessibilityLabel="Continue without signing in"
            >
              <Text style={[styles.guestText, { color: theme.textMuted }]}>Just browsing →</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.privacy, { color: theme.textMuted }]}>
            Your information is only used to manage your lunch orders.
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 24, paddingVertical: 24, gap: 24, justifyContent: "center" },
  header: { alignItems: "center", gap: 14 },
  title: { fontSize: 25, fontWeight: "600", textAlign: "center", letterSpacing: -0.4 },
  benefits: { paddingHorizontal: 16, paddingVertical: 2 },
  benefitRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13 },
  benefitIcon: { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  benefitText: { fontSize: 14, fontWeight: "500", flex: 1 },
  actions: { gap: 14, alignItems: "center" },
  appleButton: { width: "100%", height: 52 },
  error: { fontSize: 13, textAlign: "center" },
  guest: { paddingVertical: 8 },
  guestText: { fontSize: 14, fontWeight: "600" },
  privacy: { fontSize: 12.5, textAlign: "center", paddingHorizontal: 20 },
});
