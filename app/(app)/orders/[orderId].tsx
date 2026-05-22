/**
 * Order detail screen — tapped from order history.
 * Shows order contents, status, and modify/cancel actions if before cutoff.
 */

import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Linking,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { fetchOrders, fetchDeliveryDates, apiDelete } from "../../../lib/api";
import { formatPrice } from "../../../lib/store";
import { useTheme } from "../../../lib/theme";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${DAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

export default function OrderDetail() {
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const theme = useTheme();

  const { data: orders, isLoading: loadingOrders } = useQuery({
    queryKey: ["orders"],
    queryFn: fetchOrders,
    retry: false,
  });

  const { data: deliveryDates } = useQuery({
    queryKey: ["delivery-dates"],
    queryFn: fetchDeliveryDates,
    retry: false,
  });

  const [isModifying, setIsModifying] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const order = orders?.find((o) => o.id === orderId);
  const deliveryDate = deliveryDates?.find((d) => d.deliveryDate === order?.deliveryDate);

  const isBeforeCutoff = () => {
    if (!deliveryDate) return false;
    return new Date() < new Date(deliveryDate.cutoffAt);
  };

  const canModify = order && order.status === "PAID" && isBeforeCutoff();
  const canCancel = order && order.status === "PAID" && isBeforeCutoff();

  async function handleModify() {
    Alert.alert(
      "Modify order",
      "Modify functionality is coming soon. For now, please contact the restaurant before the cutoff.",
      [{ text: "OK", onPress: () => {} }]
    );
  }

  async function handleCancel() {
    if (!order) return;

    Alert.alert(
      "Cancel order",
      `Are you sure you want to cancel order #${order.orderNumber.slice(-6)}?`,
      [
        { text: "Keep order", style: "cancel" },
        {
          text: "Cancel order",
          style: "destructive",
          onPress: async () => {
            try {
              setIsCancelling(true);
              // Try to call cancel endpoint if it exists
              try {
                await apiDelete(`/api/mobile/native/orders/${order.id}`);
              } catch (err) {
                // If endpoint doesn't exist, show error with contact info
                const contactEmail = theme.restaurant?.contactEmail;
                throw new Error(
                  contactEmail
                    ? `Cancel endpoint not yet available. Please email ${contactEmail} to cancel this order.`
                    : "Unable to cancel. Please contact the restaurant."
                );
              }

              // Invalidate queries to refresh order list
              await queryClient.invalidateQueries({ queryKey: ["orders"] });

              // Show success and go back
              Alert.alert("Order cancelled", "Your order has been cancelled.", [
                { text: "OK", onPress: () => router.back() },
              ]);
            } catch (err) {
              Alert.alert(
                "Failed to cancel",
                err instanceof Error ? err.message : "Please try again or contact the restaurant."
              );
            } finally {
              setIsCancelling(false);
            }
          },
        },
      ]
    );
  }

  if (loadingOrders) {
    return (
      <View style={[styles.container, { backgroundColor: theme.dark }]}>
        <SafeAreaView style={styles.center}>
          <ActivityIndicator size="large" color={theme.primary} />
        </SafeAreaView>
      </View>
    );
  }

  if (!order) {
    return (
      <View style={[styles.container, { backgroundColor: theme.dark }]}>
        <SafeAreaView style={styles.center}>
          <Text style={[styles.errorText, { color: theme.textSecondary }]}>
            Order not found
          </Text>
          <TouchableOpacity
            style={[styles.backBtn, { borderColor: theme.border }]}
            onPress={() => router.back()}
          >
            <Text style={[styles.backBtnText, { color: theme.primary }]}>Go back</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    );
  }

  const statusColor =
    order.status === "PAID"
      ? theme.success
      : order.status === "REFUNDED"
        ? theme.danger
        : order.status === "CANCELLED"
          ? theme.textMuted
          : theme.warning;

  const statusLabel =
    order.status === "PAID"
      ? "Confirmed"
      : order.status === "PENDING"
        ? "Pending"
        : order.status === "REFUNDED"
          ? "Refunded"
          : "Cancelled";

  const contactEmail = theme.restaurant?.contactEmail;

  return (
    <View style={[styles.container, { backgroundColor: theme.dark }]}>
      <SafeAreaView>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButtonWrapper}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <Ionicons name="chevron-back" size={24} color={theme.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.textPrimary, fontFamily: theme.fontDisplay }]}>
            Order details
          </Text>
          <View style={{ width: 24 }} />
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Status section */}
        <View style={[styles.section, { backgroundColor: theme.surface }]}>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: `${statusColor}22` },
              ]}
            >
              <Text style={[styles.statusText, { color: statusColor }]}>
                {statusLabel}
              </Text>
            </View>
            <View style={styles.statusInfo}>
              <Text style={[styles.orderRef, { color: theme.textMuted }]}>
                Order #{order.orderNumber.slice(-6)}
              </Text>
              <Text style={[styles.statusDate, { color: theme.textSecondary }]}>
                {formatDate(order.createdAt)}
              </Text>
            </View>
            <Text style={[styles.totalAmount, { color: theme.textPrimary }]}>
              {formatPrice(order.totalCents)}
            </Text>
          </View>
        </View>

        {/* Delivery info */}
        <View style={[styles.section, { backgroundColor: theme.surface }]}>
          <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>
            Delivery details
          </Text>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>
              School
            </Text>
            <Text style={[styles.detailValue, { color: theme.textPrimary }]}>
              {order.schoolName}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>
              Delivery date
            </Text>
            <Text style={[styles.detailValue, { color: theme.textPrimary }]}>
              {formatDate(order.deliveryDate)}
            </Text>
          </View>
          {deliveryDate && (
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>
                Order cutoff
              </Text>
              <Text style={[styles.detailValue, { color: theme.textPrimary }]}>
                {formatTime(deliveryDate.cutoffAt)}
              </Text>
            </View>
          )}
        </View>

        {/* Order items */}
        <View style={[styles.section, { backgroundColor: theme.surface }]}>
          <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>
            Items
          </Text>
          {order.items.map((item, idx) => (
            <View key={idx} style={[styles.itemRow, { borderBottomColor: theme.border }]}>
              <View style={styles.itemInfo}>
                <Text style={[styles.itemName, { color: theme.textPrimary }]}>
                  {item.name}
                </Text>
                {(item.additions.length > 0 || item.removals.length > 0) && (
                  <Text style={[styles.customizations, { color: theme.textSecondary }]}>
                    {item.additions.length > 0 && `+ ${item.additions.join(", ")}`}
                    {item.additions.length > 0 && item.removals.length > 0 && " • "}
                    {item.removals.length > 0 && `− ${item.removals.join(", ")}`}
                  </Text>
                )}
              </View>
              <Text style={[styles.itemPrice, { color: theme.textPrimary }]}>
                {formatPrice(item.lineTotalCents)}
              </Text>
            </View>
          ))}
        </View>

        {/* Actions */}
        {(canModify || canCancel) && (
          <View style={[styles.section, { backgroundColor: theme.surface, gap: 10 }]}>
            {canModify && (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: theme.primary }]}
                onPress={handleModify}
                disabled={isModifying}
                accessibilityRole="button"
                accessibilityLabel="Modify order"
              >
                {isModifying ? (
                  <ActivityIndicator color={theme.textOnPrimary} />
                ) : (
                  <Text style={[styles.actionBtnText, { color: theme.textOnPrimary }]}>
                    Modify order
                  </Text>
                )}
              </TouchableOpacity>
            )}
            {canCancel && (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: theme.danger + "22", borderWidth: 1, borderColor: theme.danger }]}
                onPress={handleCancel}
                disabled={isCancelling}
                accessibilityRole="button"
                accessibilityLabel="Cancel order"
              >
                {isCancelling ? (
                  <ActivityIndicator color={theme.danger} />
                ) : (
                  <Text style={[styles.actionBtnText, { color: theme.danger }]}>
                    Cancel order
                  </Text>
                )}
              </TouchableOpacity>
            )}
            {contactEmail && (
              <TouchableOpacity
                style={[styles.contactBtn, { backgroundColor: theme.dark }]}
                onPress={() => Linking.openURL(`mailto:${contactEmail}`)}
                accessibilityRole="button"
                accessibilityLabel={`Email ${theme.restaurant?.name || "the restaurant"}`}
              >
                <Ionicons name="mail-outline" size={16} color={theme.textSecondary} />
                <Text style={[styles.contactBtnText, { color: theme.textSecondary }]}>
                  Contact {theme.restaurant?.name || "restaurant"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {!canModify && !canCancel && order.status === "PAID" && (
          <View style={[styles.section, { backgroundColor: theme.surface }]}>
            <Text style={[styles.infoText, { color: theme.textSecondary }]}>
              This order is past the modification cutoff. To make changes, please contact the restaurant.
            </Text>
            {contactEmail && (
              <TouchableOpacity
                style={[styles.contactBtn, { backgroundColor: theme.dark }]}
                onPress={() => Linking.openURL(`mailto:${contactEmail}`)}
                accessibilityRole="button"
                accessibilityLabel={`Email ${theme.restaurant?.name || "the restaurant"}`}
              >
                <Ionicons name="mail-outline" size={16} color={theme.textSecondary} />
                <Text style={[styles.contactBtnText, { color: theme.textSecondary }]}>
                  Contact {theme.restaurant?.name || "restaurant"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backButtonWrapper: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 16,
  },
  section: {
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  statusBadge: {
    borderRadius: 100,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusText: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  statusInfo: {
    flex: 1,
    gap: 2,
  },
  orderRef: {
    fontSize: 13,
    fontWeight: "700",
    fontFamily: "Menlo",
  },
  statusDate: {
    fontSize: 13,
  },
  totalAmount: {
    fontSize: 18,
    fontWeight: "800",
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "transparent",
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: "500",
  },
  detailValue: {
    fontSize: 14,
    fontWeight: "600",
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 12,
  },
  itemInfo: {
    flex: 1,
    gap: 4,
  },
  itemName: {
    fontSize: 15,
    fontWeight: "600",
  },
  customizations: {
    fontSize: 13,
    fontWeight: "400",
  },
  itemPrice: {
    fontSize: 15,
    fontWeight: "700",
  },
  actionBtn: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnText: {
    fontSize: 15,
    fontWeight: "700",
  },
  contactBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 10,
    paddingVertical: 12,
  },
  contactBtnText: {
    fontSize: 14,
    fontWeight: "600",
  },
  infoText: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 16,
    marginBottom: 16,
  },
  backBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  backBtnText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
