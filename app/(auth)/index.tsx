/**
 * Welcome — the first screen a new customer sees. Value-first: a warm
 * full-bleed canvas, the LunchPad promise, and one clear way forward.
 * Replaces the old code-entry form as the app's cover.
 */

import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "../../lib/theme";
import { BrandMark } from "../../components/BrandMark";

const CREAM = "#F1E8D6";

export default function WelcomeScreen() {
  const router = useRouter();
  const theme = useTheme();

  return (
    <View style={[styles.fill, { backgroundColor: theme.primary }]}>
      <SafeAreaView style={styles.fill}>
        <View style={styles.content}>
          <View style={{ flex: 1 }} />

          <View style={styles.brandRow}>
            <BrandMark size={34} radius={9} />
            <Text style={[styles.wordmark, { color: CREAM }]}>LUNCHPAD</Text>
          </View>

          <Text style={[styles.headline, { color: CREAM, fontFamily: theme.fontDisplay }]}>
            Lunch, handled — for the whole week.
          </Text>
          <Text style={styles.sub}>
            Order from your school or office kitchen in a tap.
          </Text>

          <TouchableOpacity
            style={[styles.primary, { backgroundColor: theme.accent }]}
            onPress={() => router.push("/(auth)/connect")}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Get started"
          >
            <Text style={styles.primaryText}>Get started</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondary}
            onPress={() => router.push("/(auth)/connect")}
            accessibilityRole="button"
            accessibilityLabel="I already have a code"
          >
            <Text style={styles.secondaryText}>I already have a code</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 28, paddingBottom: 28 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 16 },
  wordmark: { fontSize: 14, fontWeight: "700", letterSpacing: 2 },
  headline: { fontSize: 34, fontWeight: "600", letterSpacing: -0.5, lineHeight: 41 },
  sub: { fontSize: 15, lineHeight: 22, marginTop: 12, marginBottom: 26, color: "rgba(241,232,214,0.78)" },
  primary: { borderRadius: 15, paddingVertical: 16, alignItems: "center" },
  primaryText: { fontSize: 16, fontWeight: "700", color: "#FFFFFF" },
  secondary: { paddingVertical: 14, alignItems: "center", marginTop: 4 },
  secondaryText: { fontSize: 14, fontWeight: "600", color: "rgba(241,232,214,0.85)" },
});
