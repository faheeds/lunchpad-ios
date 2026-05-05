/**
 * Checkout success — deep-linked from Stripe redirect.
 * URL: lunchpad://checkout/success?orderId=xxx
 */

import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

export default function CheckoutSuccess() {
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.inner}>
        <Text style={styles.icon}>🎉</Text>
        <Text style={styles.title}>Order placed!</Text>
        <Text style={styles.subtitle}>
          You'll receive a confirmation email shortly. Your lunch will be
          delivered on the scheduled date.
        </Text>
        {orderId && (
          <Text style={styles.orderId}>Order ref: {orderId.slice(-8).toUpperCase()}</Text>
        )}
        <TouchableOpacity
          style={styles.button}
          onPress={() => router.replace("/(app)")}
        >
          <Text style={styles.buttonText}>Back to menu</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  inner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 16,
  },
  icon: { fontSize: 64 },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#f1f5f9",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    color: "#94a3b8",
    textAlign: "center",
    lineHeight: 22,
  },
  orderId: {
    fontSize: 13,
    color: "#475569",
    fontFamily: "monospace",
    marginTop: 8,
  },
  button: {
    backgroundColor: "#f59e0b",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginTop: 8,
  },
  buttonText: { fontSize: 16, fontWeight: "700", color: "#0f172a" },
});
