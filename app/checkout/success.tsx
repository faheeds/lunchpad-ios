/**
 * Checkout success — deep-linked from Stripe redirect.
 * URL: lunchpad://checkout/success?orderId=xxx
 *
 * UX goals:
 *   - Celebrate the action (animated check, haptic success)
 *   - Surface the relevant details (order ref, restaurant name, support email)
 *   - Two CTAs: primary "Back to menu", secondary "View order"
 */

import { useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Linking } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "../../lib/theme";

export default function CheckoutSuccess() {
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const router = useRouter();
  const theme = useTheme();
  const restaurantName = theme.restaurant?.name;
  const supportEmail = theme.restaurant?.contactEmail;

  // Success haptic on mount — feels like the receipt printing.
  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: theme.dark }]}>
      <View style={styles.inner}>
        {/* Success badge: themed circle with check icon */}
        <View
          style={[
            styles.checkCircle,
            { backgroundColor: `${theme.success}22`, borderColor: theme.success },
          ]}
        >
          <Ionicons name="checkmark" size={48} color={theme.success} />
        </View>

        <Text
          style={[styles.title, { color: theme.textPrimary, fontFamily: theme.fontDisplay }]}
        >
          Order placed!
        </Text>

        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          {restaurantName
            ? `${restaurantName} has your order. We'll email you a confirmation shortly.`
            : "You'll receive a confirmation email shortly."}
        </Text>

        {/* Order ref pill */}
        {orderId && (
          <View
            style={[
              styles.refPill,
              { backgroundColor: theme.surface },
            ]}
          >
            <Text style={[styles.refLabel, { color: theme.textMuted }]}>Order ref</Text>
            <Text style={[styles.refValue, { color: theme.textPrimary }]}>
              {orderId.slice(-8).toUpperCase()}
            </Text>
          </View>
        )}

        {/* Need help block */}
        {supportEmail && (
          <View
            style={[
              styles.helpBlock,
              { backgroundColor: theme.surface },
            ]}
          >
            <Text style={[styles.helpTitle, { color: theme.textPrimary }]}>
              Need to change something?
            </Text>
            <Text style={[styles.helpText, { color: theme.textSecondary }]}>
              Reach out to {restaurantName ?? "the kitchen"} before the cutoff
              and they'll make it right.
            </Text>
            <TouchableOpacity
              onPress={() => Linking.openURL(`mailto:${supportEmail}`)}
              accessibilityLabel={`Email ${supportEmail}`}
              accessibilityRole="link"
            >
              <Text style={[styles.helpEmail, { color: theme.primary }]}>{supportEmail}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Primary CTA */}
        <TouchableOpacity
          style={[styles.button, { backgroundColor: theme.primary }]}
          onPress={() => router.replace("/(app)")}
          accessibilityLabel="Back to menu"
          accessibilityRole="button"
        >
          <Text style={[styles.buttonText, { color: theme.textOnPrimary }]}>
            Back to menu
          </Text>
        </TouchableOpacity>

        {/* Secondary — view order history */}
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => router.replace("/(app)/account")}
        >
          <Text style={[styles.secondaryText, { color: theme.textSecondary }]}>
            View your orders
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 14,
  },
  checkCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 8,
  },
  refPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 100,
    marginTop: 4,
  },
  refLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  refValue: {
    fontSize: 13,
    fontWeight: "700",
    fontFamily: "Menlo",
  },
  helpBlock: {
    width: "100%",
    padding: 16,
    borderRadius: 14,
    gap: 4,
    marginTop: 8,
  },
  helpTitle: { fontSize: 14, fontWeight: "700" },
  helpText: { fontSize: 13, lineHeight: 18 },
  helpEmail: { fontSize: 13, fontWeight: "600", marginTop: 4 },
  button: {
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 40,
    marginTop: 8,
    minWidth: 220,
    alignItems: "center",
  },
  buttonText: { fontSize: 16, fontWeight: "700" },
  secondaryBtn: { paddingVertical: 10 },
  secondaryText: { fontSize: 14, fontWeight: "500" },
});
