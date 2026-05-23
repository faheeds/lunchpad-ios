/**
 * Checkout success — deep-linked from the Stripe redirect.
 *
 * Celebrates the order, then carries the customer into the next
 * valuable action (finish the week, order for another eater) instead of
 * dead-ending at "Back to menu".
 */

import { useEffect, useRef, type ComponentProps } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Linking,
  Animated,
  SafeAreaView,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "../../lib/theme";
import { useCart } from "../../lib/store";
import { Screen, Card, Eyebrow, SecondaryButton } from "../../components/ui";

type IconName = ComponentProps<typeof Ionicons>["name"];

function MomentumCard({
  icon,
  title,
  sub,
  onPress,
}: {
  icon: IconName;
  title: string;
  sub: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} accessibilityRole="button" accessibilityLabel={title}>
      <Card style={styles_m.card}>
        <View style={[styles_m.icon, { backgroundColor: `${theme.primary}1a` }]}>
          <Ionicons name={icon} size={19} color={theme.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles_m.title, { color: theme.textPrimary }]}>{title}</Text>
          <Text style={[styles_m.sub, { color: theme.textMuted }]}>{sub}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.accent} />
      </Card>
    </TouchableOpacity>
  );
}

export default function CheckoutSuccess() {
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const router = useRouter();
  const theme = useTheme();
  const s = styles(theme);
  const restaurantName = theme.restaurant?.name;
  const supportEmail = theme.restaurant?.contactEmail;
  const clearCart = useCart((st) => st.clearCart);

  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    clearCart();
    Animated.parallel([
      Animated.timing(opacityAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, tension: 50, friction: 8, useNativeDriver: true }),
    ]).start();
  }, [clearCart, opacityAnim, scaleAnim]);

  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll}>
          <Animated.View
            style={[
              s.check,
              {
                backgroundColor: `${theme.success}1f`,
                borderColor: theme.success,
                opacity: opacityAnim,
                transform: [{ scale: scaleAnim }],
              },
            ]}
          >
            <Ionicons name="checkmark" size={44} color={theme.success} />
          </Animated.View>

          <Text style={[s.title, { color: theme.textPrimary, fontFamily: theme.fontDisplay }]}>
            Order placed!
          </Text>
          <Text style={[s.sub, { color: theme.textSecondary }]}>
            {restaurantName
              ? `${restaurantName} has your order. A confirmation is on its way to your inbox.`
              : "You'll receive a confirmation email shortly."}
          </Text>

          {orderId ? (
            <View style={[s.refPill, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[s.refLabel, { color: theme.textMuted }]}>ORDER</Text>
              <Text style={[s.refValue, { color: theme.textPrimary }]}>
                {orderId.slice(-8).toUpperCase()}
              </Text>
            </View>
          ) : null}

          <View style={s.momentum}>
            <Eyebrow>Keep the momentum</Eyebrow>
            <MomentumCard
              icon="calendar-outline"
              title="Plan the rest of the week"
              sub="Bundle more days into one checkout"
              onPress={() => router.replace("/(app)/weekly-plan")}
            />
            <MomentumCard
              icon="people-outline"
              title="Order for another eater"
              sub="Set lunch up for everyone"
              onPress={() => router.replace("/(app)")}
            />
          </View>

          {supportEmail ? (
            <Card style={s.help}>
              <Text style={[s.helpTitle, { color: theme.textPrimary }]}>
                Need to change something?
              </Text>
              <Text style={[s.helpText, { color: theme.textSecondary }]}>
                Reach out to {restaurantName ?? "the kitchen"} before the cutoff and they&apos;ll
                make it right.
              </Text>
              <TouchableOpacity
                onPress={() => Linking.openURL(`mailto:${supportEmail}`)}
                accessibilityRole="link"
                accessibilityLabel={`Email ${supportEmail}`}
              >
                <Text style={[s.helpEmail, { color: theme.primary }]}>{supportEmail}</Text>
              </TouchableOpacity>
            </Card>
          ) : null}

          <SecondaryButton label="Done — back to home" onPress={() => router.replace("/(app)")} />
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}

const styles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    scroll: { paddingHorizontal: 24, paddingTop: 36, paddingBottom: 28, alignItems: "center", gap: 13 },
    check: {
      width: 88,
      height: 88,
      borderRadius: 44,
      borderWidth: 2,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 4,
    },
    title: { fontSize: 26, fontWeight: "600", textAlign: "center", letterSpacing: -0.5 },
    sub: { fontSize: 15, textAlign: "center", lineHeight: 22, paddingHorizontal: 6 },
    refPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 99,
      borderWidth: 1,
      marginTop: 2,
    },
    refLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1 },
    refValue: { fontSize: 12.5, fontWeight: "700", fontFamily: "Menlo" },
    momentum: { width: "100%", gap: 9, marginTop: 14 },
    help: { width: "100%", padding: 16, gap: 6, marginTop: 6 },
    helpTitle: { fontSize: 15, fontWeight: "700" },
    helpText: { fontSize: 14, lineHeight: 20 },
    helpEmail: { fontSize: 14, fontWeight: "700", marginTop: 4 },
  });

const styles_m = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 12, padding: 13 },
  icon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 13.5, fontWeight: "700" },
  sub: { fontSize: 12, marginTop: 1 },
});
