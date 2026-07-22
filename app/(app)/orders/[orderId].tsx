/**
 * Order detail screen — tapped from order history.
 * Shows order contents, status, and modify/cancel actions if before cutoff.
 */

import { useMemo, useState } from "react";
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
  Modal,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import {
  fetchOrders,
  fetchDeliveryDates,
  apiDelete,
  modifyOrder,
  type ModifyOrderItem,
} from "../../../lib/api";
import { formatPrice, useCart } from "../../../lib/store";
import { computeLineTotalCents } from "../../../lib/pricing";
import { useTheme } from "../../../lib/theme";
import {
  planReorder,
  reorderMissingReasonLabel,
  type ReorderPlan,
} from "../../../lib/reorder";
import {
  buildModifyPlan,
  type ModifyPlan,
  type MatchedItem,
} from "../../../lib/modify";
import type { DeliveryDateWithMenu, OrderHistoryItem } from "../../../lib/types";

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
  const [reorderOpen, setReorderOpen] = useState(false);
  const [modifyOpen, setModifyOpen] = useState(false);
  // Snapshots captured at the moment the modify modal opens. Using live
  // React Query values directly in the render condition meant a background
  // refetch could transiently make `order` or `deliveryDate` falsy, which
  // unmounts the modal and resets editStates — silently wiping any
  // in-progress selections before the user hits Save.
  const [editOrder, setEditOrder] = useState<OrderHistoryItem | null>(null);
  const [editDeliveryDate, setEditDeliveryDate] = useState<DeliveryDateWithMenu | null>(null);

  const order = orders?.find((o) => o.id === orderId);
  const deliveryDate = deliveryDates?.find((d) => d.deliveryDate === order?.deliveryDate);

  const cartItems = useCart((st) => st.items);
  const cartDeliveryDateId = useCart((st) => st.deliveryDateId);
  const clearCart = useCart((st) => st.clearCart);
  const addItem = useCart((st) => st.addItem);

  const canReorder = !!order && order.items.length > 0;

  function beginReorder() {
    if (!order) return;
    // If the cart is non-empty and we're going to a different delivery
    // date, warn first — otherwise the zustand store silently wipes the
    // cart the first time we call addItem with a mismatched date.
    // We don't know the target date yet, but any non-empty cart is at
    // risk (in the worst case, the user picks the same date and this
    // dialog was cautious; that's a fine tradeoff for the safety net).
    if (cartItems.length > 0) {
      Alert.alert(
        "Replace current cart?",
        "You have items in your cart. Reordering will replace them. Continue?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Continue",
            style: "destructive",
            onPress: () => setReorderOpen(true),
          },
        ],
      );
      return;
    }
    setReorderOpen(true);
  }

  function handleReorderConfirm(
    targetDate: DeliveryDateWithMenu,
    plan: ReorderPlan,
  ) {
    if (plan.cloneable.length === 0) {
      setReorderOpen(false);
      return;
    }
    // Wipe the cart if it belonged to a different delivery date. The
    // store would do this on its own on the first addItem, but doing it
    // explicitly here keeps the code symmetric with the confirm dialog
    // above and avoids leaking any transient state.
    if (cartDeliveryDateId && cartDeliveryDateId !== targetDate.id) {
      clearCart();
    }
    for (const line of plan.cloneable) {
      addItem(
        {
          menuItemId: line.menuItem.id,
          itemName: line.menuItem.name,
          basePriceCents: line.menuItem.basePriceCents,
          additions: line.additions,
          removals: line.removals,
          lineTotalCents: line.lineTotalCents,
        },
        targetDate.id,
        targetDate.schoolId,
      );
    }
    setReorderOpen(false);
    router.push("/(app)/cart");
  }

  const isBeforeCutoff = () => {
    if (!deliveryDate) return false;
    return new Date() < new Date(deliveryDate.cutoffAt);
  };

  const canModify = order && order.status === "PAID" && isBeforeCutoff();
  const canCancel = order && order.status === "PAID" && isBeforeCutoff();

  function handleModify() {
    if (!order || !deliveryDate) return;
    setEditOrder(order);
    setEditDeliveryDate(deliveryDate);
    setModifyOpen(true);
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
              await apiDelete(`/api/mobile/native/orders/${order.id}`);
              await queryClient.invalidateQueries({ queryKey: ["orders"] });
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

        {/* Reorder — always available when there's at least one item, regardless of status */}
        {canReorder && (
          <View style={[styles.section, { backgroundColor: theme.surface }]}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: theme.primary }]}
              onPress={beginReorder}
              accessibilityRole="button"
              accessibilityLabel="Reorder these items"
            >
              <Text style={[styles.actionBtnText, { color: theme.textOnPrimary }]}>
                Reorder these items
              </Text>
            </TouchableOpacity>
          </View>
        )}

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

      {reorderOpen && order ? (
        <ReorderModal
          order={order}
          deliveryDates={deliveryDates ?? []}
          onClose={() => setReorderOpen(false)}
          onConfirm={handleReorderConfirm}
        />
      ) : null}
      {modifyOpen && editOrder && editDeliveryDate ? (
        <ModifyModal
          order={editOrder}
          deliveryDate={editDeliveryDate}
          orderId={editOrder.id}
          queryClient={queryClient}
          onClose={() => {
            setModifyOpen(false);
            setEditOrder(null);
            setEditDeliveryDate(null);
          }}
        />
      ) : null}
    </View>
  );
}

// ── Reorder modal ────────────────────────────────────────────────────────────

/**
 * Modal that walks the user through reorder in one screen:
 *   1. Pick a target delivery date (list of available dates).
 *   2. Show the plan: cloneable + missing items.
 *   3. Confirm → parent adds items and navigates to cart.
 *
 * All matching/pricing logic lives in `lib/reorder.ts` so it can be unit-tested.
 */
function ReorderModal({
  order,
  deliveryDates,
  onClose,
  onConfirm,
}: {
  order: OrderHistoryItem;
  deliveryDates: DeliveryDateWithMenu[];
  onClose: () => void;
  onConfirm: (targetDate: DeliveryDateWithMenu, plan: ReorderPlan) => void;
}) {
  const theme = useTheme();
  const [selectedDateId, setSelectedDateId] = useState<string | null>(null);

  const targetDate = useMemo(
    () => deliveryDates.find((d) => d.id === selectedDateId) ?? null,
    [deliveryDates, selectedDateId],
  );

  const plan: ReorderPlan | null = useMemo(() => {
    if (!targetDate) return null;
    return planReorder(order, targetDate.menuItems);
  }, [order, targetDate]);

  const cloneableCount = plan?.cloneable.length ?? 0;
  const missingCount = plan?.missing.length ?? 0;
  const nothingCloneable = plan !== null && cloneableCount === 0;

  return (
    <Modal
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[reorderStyles.container, { backgroundColor: theme.dark }]}>
        <View style={reorderStyles.handleRow}>
          <View style={{ width: 60 }} />
          <Text
            style={[
              reorderStyles.headerTitle,
              { color: theme.textPrimary, fontFamily: theme.fontDisplay },
            ]}
          >
            Reorder
          </Text>
          <TouchableOpacity
            onPress={onClose}
            accessibilityLabel="Close"
            hitSlop={8}
            style={{ width: 60, alignItems: "flex-end" }}
          >
            <Text style={[reorderStyles.closeText, { color: theme.textSecondary }]}>
              Close
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={reorderStyles.scroll}>
          {/* Step 1: pick a date */}
          <View style={[reorderStyles.section, { backgroundColor: theme.surface }]}>
            <Text style={[reorderStyles.sectionTitle, { color: theme.textMuted }]}>
              Delivery date
            </Text>
            {deliveryDates.length === 0 ? (
              <Text style={[reorderStyles.emptyText, { color: theme.textSecondary }]}>
                No upcoming delivery dates. Check back once new dates open.
              </Text>
            ) : (
              deliveryDates.map((d) => {
                const on = d.id === selectedDateId;
                return (
                  <TouchableOpacity
                    key={d.id}
                    onPress={() => setSelectedDateId(d.id)}
                    style={[
                      reorderStyles.dateRow,
                      { borderColor: on ? theme.primary : theme.border },
                      on && { backgroundColor: `${theme.primary}14` },
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={`${formatDate(d.deliveryDate)}, ${d.school.name}`}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[reorderStyles.dateTitle, { color: theme.textPrimary }]}
                      >
                        {formatDate(d.deliveryDate)}
                      </Text>
                      <Text
                        style={[reorderStyles.dateSub, { color: theme.textMuted }]}
                      >
                        {d.school.name}
                      </Text>
                    </View>
                    {on ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={22}
                        color={theme.primary}
                      />
                    ) : (
                      <View
                        style={[
                          reorderStyles.radio,
                          { borderColor: theme.border },
                        ]}
                      />
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </View>

          {/* Step 2: plan preview */}
          {plan && targetDate ? (
            <>
              {plan.cloneable.length > 0 && (
                <View
                  style={[reorderStyles.section, { backgroundColor: theme.surface }]}
                >
                  <Text
                    style={[reorderStyles.sectionTitle, { color: theme.textMuted }]}
                  >
                    Will be added ({plan.cloneable.length})
                  </Text>
                  {plan.cloneable.map((c, idx) => (
                    <View
                      key={`clone-${idx}`}
                      style={[
                        reorderStyles.itemRow,
                        { borderBottomColor: theme.border },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[reorderStyles.itemName, { color: theme.textPrimary }]}
                        >
                          {c.menuItem.name}
                        </Text>
                        {(c.additions.length > 0 || c.removals.length > 0) && (
                          <Text
                            style={[
                              reorderStyles.itemMeta,
                              { color: theme.textSecondary },
                            ]}
                          >
                            {c.additions.length > 0 && `+ ${c.additions.join(", ")}`}
                            {c.additions.length > 0 && c.removals.length > 0 && " • "}
                            {c.removals.length > 0 && `− ${c.removals.join(", ")}`}
                          </Text>
                        )}
                      </View>
                      <Text
                        style={[reorderStyles.itemPrice, { color: theme.textPrimary }]}
                      >
                        {formatPrice(c.lineTotalCents)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {plan.missing.length > 0 && (
                <View
                  style={[
                    reorderStyles.section,
                    {
                      backgroundColor: theme.surface,
                      borderWidth: 1,
                      borderColor: theme.warning,
                    },
                  ]}
                >
                  <Text
                    style={[reorderStyles.sectionTitle, { color: theme.warning }]}
                  >
                    Not added ({plan.missing.length})
                  </Text>
                  {plan.missing.map((m, idx) => (
                    <View
                      key={`miss-${idx}`}
                      style={[
                        reorderStyles.itemRow,
                        { borderBottomColor: theme.border },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            reorderStyles.itemName,
                            { color: theme.textPrimary },
                          ]}
                        >
                          {m.name}
                        </Text>
                        <Text
                          style={[
                            reorderStyles.itemMeta,
                            { color: theme.textSecondary },
                          ]}
                        >
                          {reorderMissingReasonLabel(m.reason)}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {nothingCloneable && (
                <View
                  style={[
                    reorderStyles.section,
                    { backgroundColor: theme.surface },
                  ]}
                >
                  <Text
                    style={[
                      reorderStyles.emptyText,
                      { color: theme.textSecondary },
                    ]}
                  >
                    None of these items are available on {formatDate(targetDate.deliveryDate)}.
                  </Text>
                </View>
              )}
            </>
          ) : (
            <View
              style={[reorderStyles.section, { backgroundColor: theme.surface }]}
            >
              <Text
                style={[reorderStyles.emptyText, { color: theme.textSecondary }]}
              >
                Pick a delivery date to see what can be reordered.
              </Text>
            </View>
          )}
        </ScrollView>

        <SafeAreaView
          style={[
            reorderStyles.footer,
            { backgroundColor: theme.dark, borderTopColor: theme.border },
          ]}
        >
          {nothingCloneable ? (
            <TouchableOpacity
              style={[reorderStyles.actionBtn, { backgroundColor: theme.primary }]}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Back to order"
            >
              <Text
                style={[
                  reorderStyles.actionBtnText,
                  { color: theme.textOnPrimary },
                ]}
              >
                OK
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[
                reorderStyles.actionBtn,
                {
                  backgroundColor:
                    plan && cloneableCount > 0 ? theme.primary : theme.border,
                },
              ]}
              onPress={() => {
                if (!plan || !targetDate || cloneableCount === 0) return;
                onConfirm(targetDate, plan);
              }}
              disabled={!plan || cloneableCount === 0}
              accessibilityRole="button"
              accessibilityLabel={`Continue with ${cloneableCount} item${cloneableCount === 1 ? "" : "s"}`}
            >
              <Text
                style={[
                  reorderStyles.actionBtnText,
                  {
                    color:
                      plan && cloneableCount > 0
                        ? theme.textOnPrimary
                        : theme.textMuted,
                  },
                ]}
              >
                {plan && cloneableCount > 0
                  ? `Continue with ${cloneableCount} item${cloneableCount === 1 ? "" : "s"}${
                      missingCount > 0 ? ` (${missingCount} skipped)` : ""
                    }`
                  : "Pick a date to continue"}
              </Text>
            </TouchableOpacity>
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}


// ── Modify order modal ───────────────────────────────────────────────────────

type ItemEditState = {
  selectedSize: string | null;
  selectedChoice: string | null;
  selectedAdditions: string[];
  selectedRemovals: string[];
};

function ModifyModal({
  order,
  deliveryDate,
  orderId,
  queryClient,
  onClose,
}: {
  order: OrderHistoryItem;
  deliveryDate: DeliveryDateWithMenu;
  orderId: string;
  queryClient: QueryClient;
  onClose: () => void;
}) {
  const theme = useTheme();
  // Empty deps: plan is intentionally computed once at mount from the
  // already-snapshotted props. The parent guarantees these don't change
  // during the modal's lifetime (see editOrder/editDeliveryDate in OrderDetail).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const plan = useMemo(() => buildModifyPlan(order, deliveryDate.menuItems), []);

  const [editStates, setEditStates] = useState<ItemEditState[]>(() =>
    plan.matched.map((m) => ({
      selectedSize: null,
      selectedChoice: null,
      selectedAdditions: [...m.additions],
      selectedRemovals: [...m.removals],
    })),
  );
  const [submitting, setSubmitting] = useState(false);

  function updateSize(index: number, size: string) {
    setEditStates((prev) =>
      prev.map((s, i) => (i === index ? { ...s, selectedSize: size } : s)),
    );
  }
  function updateChoice(index: number, choice: string) {
    setEditStates((prev) =>
      prev.map((s, i) => (i === index ? { ...s, selectedChoice: choice } : s)),
    );
  }
  function toggleAddition(index: number, name: string) {
    setEditStates((prev) =>
      prev.map((s, i) => {
        if (i !== index) return s;
        const selectedAdditions = s.selectedAdditions.includes(name)
          ? s.selectedAdditions.filter((x) => x !== name)
          : [...s.selectedAdditions, name];
        return { ...s, selectedAdditions };
      }),
    );
  }
  function toggleRemoval(index: number, name: string) {
    setEditStates((prev) =>
      prev.map((s, i) => {
        if (i !== index) return s;
        const selectedRemovals = s.selectedRemovals.includes(name)
          ? s.selectedRemovals.filter((x) => x !== name)
          : [...s.selectedRemovals, name];
        return { ...s, selectedRemovals };
      }),
    );
  }

  async function handleSubmit() {
    for (let i = 0; i < plan.matched.length; i++) {
      const { menuItem } = plan.matched[i];
      const state = editStates[i];
      if ((menuItem.sizes?.length ?? 0) > 0 && !state.selectedSize) {
        Alert.alert("Size required", `Please select a size for ${menuItem.name}.`);
        return;
      }
      if ((menuItem.requiredChoices?.length ?? 0) > 0 && !state.selectedChoice) {
        Alert.alert(
          "Selection required",
          `Please make a required selection for ${menuItem.name}.`,
        );
        return;
      }
    }
    const items: ModifyOrderItem[] = plan.matched.map((m, i) => ({
      menuItemId: m.menuItem.id,
      ...(editStates[i].selectedChoice ? { choice: editStates[i].selectedChoice! } : {}),
      ...(editStates[i].selectedSize ? { size: editStates[i].selectedSize! } : {}),
      additions: editStates[i].selectedAdditions,
      removals: editStates[i].selectedRemovals,
    }));
    try {
      setSubmitting(true);
      const result = await modifyOrder(orderId, items);
      if (result.action === "updated") {
        await queryClient.invalidateQueries({ queryKey: ["orders"] });
        onClose();
        Alert.alert("Order updated", "Your changes have been saved.");
      } else {
        // checkout_required — user pays the delta; do NOT navigate to /checkout/success
        // which shows new-order celebration copy that is wrong here.
        onClose();
        const browserResult = await WebBrowser.openAuthSessionAsync(
          result.checkoutUrl,
          "lunchpad://checkout/success",
        );
        if (browserResult.type === "success") {
          await queryClient.invalidateQueries({ queryKey: ["orders"] });
          Alert.alert("Payment received", "Your order has been updated.");
        }
      }
    } catch (err) {
      Alert.alert(
        "Couldn't update order",
        err instanceof Error
          ? err.message
          : "Please try again or contact the restaurant.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[modifyStyles.container, { backgroundColor: theme.dark }]}>
        <View style={modifyStyles.handleRow}>
          <View style={{ width: 60 }} />
          <Text
            style={[
              modifyStyles.headerTitle,
              { color: theme.textPrimary, fontFamily: theme.fontDisplay },
            ]}
          >
            Modify order
          </Text>
          <TouchableOpacity
            onPress={onClose}
            accessibilityLabel="Close"
            hitSlop={8}
            style={{ width: 60, alignItems: "flex-end" }}
          >
            <Text style={[modifyStyles.closeText, { color: theme.textSecondary }]}>
              Close
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={modifyStyles.scroll}>
          {plan.unmatched.length > 0 && (
            <View
              style={[
                modifyStyles.section,
                { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.warning },
              ]}
            >
              <Text style={[modifyStyles.sectionTitle, { color: theme.warning }]}>
                Not editable ({plan.unmatched.length})
              </Text>
              <Text style={[modifyStyles.infoText, { color: theme.textSecondary }]}>
                {plan.unmatched.map((u) => u.name).join(", ")}{" "}
                {plan.unmatched.length === 1 ? "is" : "are"} no longer on the menu and
                cannot be modified.
              </Text>
            </View>
          )}

          {plan.matched.map((m, idx) => {
            const state = editStates[idx];
            const sizes = m.menuItem.sizes ?? [];
            const requiredChoices = m.menuItem.requiredChoices ?? [];
            const additionOptions = m.menuItem.options.filter(
              (o) => o.optionType === "ADD_ON" || o.optionType === "ADD",
            );
            const removalOptions = m.menuItem.options.filter(
              (o) => o.optionType === "REMOVAL" || o.optionType === "REMOVE",
            );
            const lineTotal = computeLineTotalCents(m.menuItem, {
              size: state.selectedSize,
              additions: state.selectedAdditions,
            });
            return (
              <View
                key={`modify-item-${idx}`}
                style={[modifyStyles.section, { backgroundColor: theme.surface }]}
              >
                <View style={modifyStyles.itemHeader}>
                  <Text
                    style={[
                      modifyStyles.itemName,
                      { color: theme.textPrimary, fontFamily: theme.fontDisplay },
                    ]}
                    numberOfLines={1}
                  >
                    {m.menuItem.name}
                  </Text>
                  <Text style={[modifyStyles.itemPrice, { color: theme.primary }]}>
                    {formatPrice(lineTotal)}
                  </Text>
                </View>

                {sizes.length > 0 && (
                  <View style={modifyStyles.optionGroup}>
                    <Text style={[modifyStyles.optionTitle, { color: theme.textMuted }]}>
                      SIZE <Text style={{ color: theme.accent }}>· required</Text>
                    </Text>
                    <View style={modifyStyles.chipGrid}>
                      {sizes.map((sz) => {
                        const on = state.selectedSize === sz.name;
                        return (
                          <TouchableOpacity
                            key={sz.name}
                            onPress={() => updateSize(idx, sz.name)}
                            style={[
                              modifyStyles.chip,
                              {
                                backgroundColor: on ? theme.primary : theme.dark,
                                borderColor: on ? theme.primary : theme.border,
                              },
                            ]}
                            accessibilityRole="radio"
                            accessibilityState={{ checked: on }}
                          >
                            <Text
                              style={[
                                modifyStyles.chipText,
                                { color: on ? theme.textOnPrimary : theme.textPrimary },
                              ]}
                            >
                              {sz.name}
                            </Text>
                            <Text
                              style={[
                                modifyStyles.chipSub,
                                { color: on ? theme.textOnPrimary : theme.textMuted },
                              ]}
                            >
                              {formatPrice(sz.priceCents)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}

                {requiredChoices.length > 0 && (
                  <View style={modifyStyles.optionGroup}>
                    <Text style={[modifyStyles.optionTitle, { color: theme.textMuted }]}>
                      CHOICE <Text style={{ color: theme.accent }}>· required</Text>
                    </Text>
                    <View style={modifyStyles.chipGrid}>
                      {requiredChoices.map((choice) => {
                        const on = state.selectedChoice === choice;
                        return (
                          <TouchableOpacity
                            key={choice}
                            onPress={() => updateChoice(idx, choice)}
                            style={[
                              modifyStyles.chip,
                              {
                                backgroundColor: on ? theme.primary : theme.dark,
                                borderColor: on ? theme.primary : theme.border,
                              },
                            ]}
                            accessibilityRole="radio"
                            accessibilityState={{ checked: on }}
                          >
                            <Text
                              style={[
                                modifyStyles.chipText,
                                { color: on ? theme.textOnPrimary : theme.textPrimary },
                              ]}
                            >
                              {choice}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}

                {additionOptions.length > 0 && (
                  <View style={modifyStyles.optionGroup}>
                    <Text style={[modifyStyles.optionTitle, { color: theme.textMuted }]}>
                      ADDITIONS
                    </Text>
                    <View style={modifyStyles.chipGrid}>
                      {additionOptions.map((opt) => {
                        const on = state.selectedAdditions.includes(opt.name);
                        return (
                          <TouchableOpacity
                            key={opt.id}
                            onPress={() => toggleAddition(idx, opt.name)}
                            style={[
                              modifyStyles.chip,
                              {
                                backgroundColor: on ? theme.primary : theme.dark,
                                borderColor: on ? theme.primary : theme.border,
                              },
                            ]}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: on }}
                          >
                            <Text
                              style={[
                                modifyStyles.chipText,
                                { color: on ? theme.textOnPrimary : theme.textPrimary },
                              ]}
                            >
                              {opt.name}
                            </Text>
                            {opt.priceDeltaCents > 0 && (
                              <Text
                                style={[
                                  modifyStyles.chipSub,
                                  { color: on ? theme.textOnPrimary : theme.textMuted },
                                ]}
                              >
                                +{formatPrice(opt.priceDeltaCents)}
                              </Text>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}

                {removalOptions.length > 0 && (
                  <View style={modifyStyles.optionGroup}>
                    <Text style={[modifyStyles.optionTitle, { color: theme.textMuted }]}>
                      REMOVE
                    </Text>
                    <View style={modifyStyles.chipGrid}>
                      {removalOptions.map((opt) => {
                        const on = state.selectedRemovals.includes(opt.name);
                        return (
                          <TouchableOpacity
                            key={opt.id}
                            onPress={() => toggleRemoval(idx, opt.name)}
                            style={[
                              modifyStyles.chip,
                              {
                                backgroundColor: on ? theme.primary : theme.dark,
                                borderColor: on ? theme.primary : theme.border,
                              },
                            ]}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: on }}
                          >
                            <Text
                              style={[
                                modifyStyles.chipText,
                                { color: on ? theme.textOnPrimary : theme.textPrimary },
                              ]}
                            >
                              {opt.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}
              </View>
            );
          })}

          {plan.matched.length === 0 && plan.unmatched.length === 0 && (
            <View style={[modifyStyles.section, { backgroundColor: theme.surface }]}>
              <Text style={[modifyStyles.infoText, { color: theme.textSecondary }]}>
                No items found for this order.
              </Text>
            </View>
          )}
        </ScrollView>

        <SafeAreaView
          style={[
            modifyStyles.footer,
            { backgroundColor: theme.dark, borderTopColor: theme.border },
          ]}
        >
          <TouchableOpacity
            style={[
              modifyStyles.actionBtn,
              {
                backgroundColor:
                  plan.matched.length > 0 && !submitting ? theme.primary : theme.border,
              },
            ]}
            onPress={handleSubmit}
            disabled={plan.matched.length === 0 || submitting}
            accessibilityRole="button"
            accessibilityLabel="Save changes"
          >
            {submitting ? (
              <ActivityIndicator color={theme.textOnPrimary} />
            ) : (
              <Text
                style={[
                  modifyStyles.actionBtnText,
                  {
                    color:
                      plan.matched.length > 0 ? theme.textOnPrimary : theme.textMuted,
                  },
                ]}
              >
                {plan.matched.length > 0 ? "Save changes" : "No items can be modified"}
              </Text>
            )}
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const modifyStyles = StyleSheet.create({
  container: { flex: 1 },
  handleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  closeText: { fontSize: 14, fontWeight: "600" },
  scroll: { paddingHorizontal: 16, paddingBottom: 24, gap: 16 },
  section: { borderRadius: 16, padding: 16, gap: 12 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  itemName: { fontSize: 16, fontWeight: "700", flex: 1 },
  itemPrice: { fontSize: 16, fontWeight: "700" },
  optionGroup: { gap: 8 },
  optionTitle: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: "center",
  },
  chipText: { fontSize: 14, fontWeight: "600" },
  chipSub: { fontSize: 11, marginTop: 1 },
  infoText: { fontSize: 14, lineHeight: 20 },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
    borderTopWidth: 1,
  },
  actionBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnText: { fontSize: 15, fontWeight: "700" },
});


const reorderStyles = StyleSheet.create({
  container: { flex: 1 },
  handleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  closeText: { fontSize: 14, fontWeight: "600" },
  scroll: { paddingHorizontal: 16, paddingBottom: 24, gap: 16 },
  section: { borderRadius: 16, padding: 16, gap: 10 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  emptyText: { fontSize: 14, lineHeight: 20 },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  dateTitle: { fontSize: 15, fontWeight: "700" },
  dateSub: { fontSize: 12.5, marginTop: 2 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 12,
  },
  itemName: { fontSize: 15, fontWeight: "600" },
  itemMeta: { fontSize: 13, marginTop: 2 },
  itemPrice: { fontSize: 15, fontWeight: "700" },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
    borderTopWidth: 1,
  },
  actionBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnText: { fontSize: 15, fontWeight: "700" },
});

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
