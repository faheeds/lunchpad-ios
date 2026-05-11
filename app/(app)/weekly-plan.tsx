/**
 * Weekly plan — iOS equivalent of the web's /weekly page.
 *
 * Layout:
 *   - Header: "Plan the week" + restaurant context
 *   - Child picker (chips) — switches the planner view to that child's slots
 *   - Per-weekday card — Mon → Fri, each showing the planned meal or
 *     "Add meal" CTA when empty
 *   - Sticky footer: "Checkout the week" button with the running total
 *
 * Tapping a weekday slot opens a pageSheet modal listing menu items
 * available on that day's delivery date — selection saves a WeeklyLunchPlan
 * via POST and updates state.
 */

import { useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  Modal,
  Alert,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import * as Haptics from "expo-haptics";
import {
  fetchWeeklyPlans,
  upsertWeeklyPlan,
  deleteWeeklyPlan,
  createWeeklyCheckout,
} from "../../lib/api";
import { formatPrice } from "../../lib/store";
import { useTheme } from "../../lib/theme";
import type { MenuItem, WeeklyDeliveryDate, WeeklyPlan } from "../../lib/types";

// weekday: 1=Mon ... 7=Sun (matches the server's getWeekdayNumber convention)
// We render whichever weekdays the restaurant actually has scheduled —
// no hardcoded Mon-Fri / Mon-Thu cap. LunchPad is multi-tenant; some
// operators do Fri / Sat / Sun deliveries and we shouldn't hide them.
const ALL_WEEKDAYS = [
  { num: 1, label: "Mon", long: "Monday" },
  { num: 2, label: "Tue", long: "Tuesday" },
  { num: 3, label: "Wed", long: "Wednesday" },
  { num: 4, label: "Thu", long: "Thursday" },
  { num: 5, label: "Fri", long: "Friday" },
  { num: 6, label: "Sat", long: "Saturday" },
  { num: 7, label: "Sun", long: "Sunday" },
];

/**
 * Compute the weekday number (1-7, Mon-Sun) from an ISO date string in
 * the school's timezone. Matches the server's `getWeekdayNumber` so the
 * picker can match plan weekdays to actual delivery dates.
 */
function getWeekdayFromISO(iso: string): number {
  const d = new Date(iso);
  // getUTCDay returns 0=Sun..6=Sat. Map to 1=Mon..7=Sun.
  const dow = d.getUTCDay();
  return dow === 0 ? 7 : dow;
}

export default function WeeklyPlanScreen() {
  const router = useRouter();
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState<{ weekday: number; childId: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["weekly-plans"],
    queryFn: fetchWeeklyPlans,
  });

  // Auto-select first child when data loads
  const activeChildId =
    selectedChildId ?? data?.children[0]?.id ?? null;

  const upsertMutation = useMutation({
    mutationFn: upsertWeeklyPlan,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["weekly-plans"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteWeeklyPlan,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["weekly-plans"] }),
  });

  // ── Derived data ──────────────────────────────────────────────────────────
  const activeChild = data?.children.find((c) => c.id === activeChildId) ?? null;
  const childPlans = useMemo(
    () => (data?.plans ?? []).filter((p) => p.parentChildId === activeChildId),
    [data, activeChildId]
  );

  // Data-driven weekday slots: render a slot for each weekday that
  // *either* has an open delivery date for this child's school OR has a
  // pre-existing plan saved. Renders in calendar order (Mon→Sun) even
  // if dates arrive out of order. If a restaurant runs Mon/Wed/Fri only,
  // the user sees three slots — no fake "No delivery scheduled" rows.
  const weekdaySlots = useMemo(() => {
    if (!data || !activeChild) return [] as Array<{
      weekday: typeof ALL_WEEKDAYS[number];
      date: WeeklyDeliveryDate;
      plan: WeeklyPlan | null;
    }>;
    return ALL_WEEKDAYS.flatMap((w) => {
      const date = data.deliveryDates.find(
        (d) =>
          d.schoolId === activeChild.schoolId &&
          getWeekdayFromISO(d.deliveryDate) === w.num
      );
      if (!date) return []; // no delivery → no slot
      const plan = childPlans.find((p) => p.weekday === w.num) ?? null;
      return [{ weekday: w, date, plan }];
    });
  }, [data, activeChild, childPlans]);

  // Running total across ALL children's plans (the batch covers everything)
  const totalCents = useMemo(() => {
    if (!data) return 0;
    let sum = 0;
    for (const plan of data.plans) {
      const child = data.children.find((c) => c.id === plan.parentChildId);
      if (!child) continue;
      const date = data.deliveryDates.find(
        (d) =>
          d.schoolId === child.schoolId &&
          getWeekdayFromISO(d.deliveryDate) === plan.weekday
      );
      if (!date) continue;
      const item = date.menuItems.find((m) => m.id === plan.menuItemId);
      if (!item) continue;
      const addOnCost = item.options
        .filter((o) => (o.optionType === "ADD" || o.optionType === "ADD_ON") && plan.additions.includes(o.name))
        .reduce((s, o) => s + o.priceDeltaCents, 0);
      sum += item.basePriceCents + addOnCost;
    }
    return sum;
  }, [data]);

  const activePlanCount = data?.plans.length ?? 0;

  // ── Checkout ──────────────────────────────────────────────────────────────
  async function handleCheckout() {
    if (activePlanCount === 0) {
      Alert.alert("No meals planned", "Add at least one meal before checking out.");
      return;
    }
    setSubmitting(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    try {
      const { checkoutUrl } = await createWeeklyCheckout();
      // Same in-app browser pattern as single-order checkout.
      const result = await WebBrowser.openAuthSessionAsync(
        checkoutUrl,
        "lunchpad://checkout/success"
      );
      if (result.type === "success" && result.url) {
        if (result.url.includes("/checkout/success")) {
          const match = result.url.match(/[?&]orderId=([^&]+)/);
          const orderId = match ? decodeURIComponent(match[1]) : "";
          // Invalidate caches so the home + account screens reflect the new orders
          queryClient.invalidateQueries();
          router.replace({ pathname: "/checkout/success", params: { orderId } });
        }
      }
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Checkout failed.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.dark }]}>
        <ActivityIndicator color={theme.primary} size="large" />
      </View>
    );
  }

  if (isError || !data) {
    return (
      <View style={[styles.center, { backgroundColor: theme.dark }]}>
        <Text style={[styles.errorText, { color: theme.danger }]}>
          Couldn&apos;t load weekly plans.
        </Text>
        <TouchableOpacity
          onPress={() => refetch()}
          style={[styles.retryBtn, { backgroundColor: theme.surface }]}
        >
          <Text style={[styles.retryText, { color: theme.primary }]}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (data.children.length === 0) {
    return (
      <View style={[styles.center, { backgroundColor: theme.dark, paddingHorizontal: 32 }]}>
        <Text style={styles.emptyIcon}>👶</Text>
        <Text style={[styles.emptyTitle, { color: theme.textPrimary, fontFamily: theme.fontDisplay }]}>
          Add a child first
        </Text>
        <Text style={[styles.emptySub, { color: theme.textMuted }]}>
          Weekly plans need a child profile so each meal is tied to a school.
          Add one from the Account tab to get started.
        </Text>
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: theme.primary, marginTop: 20 }]}
          onPress={() => router.push("/(app)/account")}
        >
          <Text style={[styles.primaryBtnText, { color: theme.textOnPrimary }]}>
            Go to Account
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.dark }]}>
      <SafeAreaView>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Back to home">
            <Ionicons name="chevron-back" size={28} color={theme.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.textPrimary, fontFamily: theme.fontDisplay }]}>
            Plan the week
          </Text>
          <View style={{ width: 28 }} />
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Pick a meal for each weekday. Tap &quot;Checkout the week&quot; to pay
          for all of them in one go.
        </Text>

        {/* Child picker — chips */}
        {data.children.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {data.children.map((c) => {
              const active = c.id === activeChildId;
              return (
                <TouchableOpacity
                  key={c.id}
                  onPress={() => setSelectedChildId(c.id)}
                  style={[
                    styles.chip,
                    active
                      ? { backgroundColor: theme.primary, borderColor: theme.primary }
                      : { backgroundColor: theme.surface, borderColor: theme.surfaceElevated },
                  ]}
                  accessibilityState={{ selected: active }}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: active ? theme.textOnPrimary : theme.textPrimary },
                    ]}
                  >
                    {c.studentName}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* Weekday slots — only rendered for weekdays the restaurant has
            actually scheduled. Empty state below covers "this restaurant
            doesn't have any upcoming dates" / "no children yet". */}
        {weekdaySlots.length === 0 ? (
          <View style={[styles.noDatesBox, { backgroundColor: theme.surface, borderColor: theme.surfaceElevated }]}>
            <Text style={[styles.noDatesTitle, { color: theme.textPrimary }]}>
              No upcoming delivery dates
            </Text>
            <Text style={[styles.noDatesSub, { color: theme.textMuted }]}>
              {activeChild
                ? `${activeChild.schoolName} doesn't have any open delivery dates this week. Check back soon.`
                : "Pick a child to see their school's schedule."}
            </Text>
          </View>
        ) : (
          <View style={styles.slotList}>
            {weekdaySlots.map(({ weekday: w, date, plan }) => {
              const item = plan
                ? date.menuItems.find((m) => m.id === plan.menuItemId)
                : null;
              return (
                <TouchableOpacity
                  key={w.num}
                  onPress={() => {
                    if (!activeChildId) return;
                    Haptics.selectionAsync().catch(() => {});
                    setPickerOpen({ weekday: w.num, childId: activeChildId });
                  }}
                  style={[
                    styles.slotCard,
                    {
                      backgroundColor: theme.surface,
                      borderColor: plan ? theme.primary : theme.surfaceElevated,
                    },
                  ]}
                >
                  <View style={[styles.slotDay, { backgroundColor: theme.dark }]}>
                    <Text style={[styles.slotDayLabel, { color: theme.primary }]}>
                      {w.label}
                    </Text>
                  </View>
                  <View style={styles.slotBody}>
                    {item ? (
                      <>
                        <Text
                          style={[styles.slotItemName, { color: theme.textPrimary }]}
                          numberOfLines={1}
                        >
                          {item.name}
                        </Text>
                        <Text style={[styles.slotPrice, { color: theme.primary }]}>
                          {formatPrice(item.basePriceCents)}
                        </Text>
                      </>
                    ) : (
                      <Text style={[styles.slotPlaceholder, { color: theme.textSecondary }]}>
                        Tap to add a meal
                      </Text>
                    )}
                  </View>
                  {plan && (
                    <TouchableOpacity
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        deleteMutation.mutate(plan.id);
                      }}
                      style={styles.slotClearBtn}
                      accessibilityLabel={`Remove ${w.long} meal`}
                    >
                      <Ionicons name="close-circle" size={22} color={theme.textMuted} />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <View style={{ height: 16 }} />
      </ScrollView>

      {/* Sticky checkout footer */}
      {activePlanCount > 0 && (
        <SafeAreaView style={[styles.footer, { backgroundColor: theme.dark, borderTopColor: theme.surface }]}>
          <View style={styles.footerInner}>
            <View>
              <Text style={[styles.footerLabel, { color: theme.textMuted }]}>
                {activePlanCount} meal{activePlanCount !== 1 ? "s" : ""} this week
              </Text>
              <Text style={[styles.footerTotal, { color: theme.textPrimary }]}>
                {formatPrice(totalCents)}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.checkoutBtn, { backgroundColor: theme.primary }]}
              onPress={handleCheckout}
              disabled={submitting}
              accessibilityLabel={`Checkout the week, ${formatPrice(totalCents)}`}
            >
              {submitting ? (
                <ActivityIndicator color={theme.textOnPrimary} />
              ) : (
                <Text style={[styles.checkoutBtnText, { color: theme.textOnPrimary }]}>
                  Checkout the week
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      )}

      {/* Item picker modal */}
      {pickerOpen && (
        <ItemPickerModal
          deliveryDate={
            weekdaySlots.find((s) => s.weekday.num === pickerOpen.weekday)?.date ?? null
          }
          onClose={() => setPickerOpen(null)}
          onPick={(item) => {
            const open = pickerOpen;
            setPickerOpen(null);
            upsertMutation.mutate({
              parentChildId: open.childId,
              weekday: open.weekday,
              menuItemId: item.id,
            });
          }}
        />
      )}
    </View>
  );
}

// ── Item picker modal ────────────────────────────────────────────────────────

function ItemPickerModal({
  deliveryDate,
  onClose,
  onPick,
}: {
  deliveryDate: WeeklyDeliveryDate | null;
  onClose: () => void;
  onPick: (item: MenuItem) => void;
}) {
  const theme = useTheme();
  if (!deliveryDate) return null;
  return (
    <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[modalStyles.container, { backgroundColor: theme.dark }]}>
        <View style={modalStyles.handleRow}>
          <Text
            style={[
              modalStyles.title,
              { color: theme.textPrimary, fontFamily: theme.fontDisplay },
            ]}
          >
            Pick a meal
          </Text>
          <TouchableOpacity onPress={onClose} accessibilityLabel="Close picker">
            <Ionicons name="close" size={24} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={modalStyles.list}>
          {deliveryDate.menuItems.map((item) => (
            <TouchableOpacity
              key={item.id}
              onPress={() => onPick(item)}
              style={[modalStyles.itemCard, { backgroundColor: theme.surface }]}
              activeOpacity={0.8}
            >
              {item.imageUrl ? (
                <Image source={{ uri: item.imageUrl }} style={modalStyles.itemImage} />
              ) : (
                <View
                  style={[
                    modalStyles.itemImage,
                    { backgroundColor: theme.dark, alignItems: "center", justifyContent: "center" },
                  ]}
                >
                  <Text style={{ fontSize: 28 }}>🍽️</Text>
                </View>
              )}
              <View style={modalStyles.itemBody}>
                <Text style={[modalStyles.itemName, { color: theme.textPrimary }]} numberOfLines={2}>
                  {item.name}
                </Text>
                {item.description && (
                  <Text
                    style={[modalStyles.itemDesc, { color: theme.textSecondary }]}
                    numberOfLines={2}
                  >
                    {item.description}
                  </Text>
                )}
                <Text style={[modalStyles.itemPrice, { color: theme.primary }]}>
                  {formatPrice(item.basePriceCents)}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  errorText: { fontSize: 15 },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10 },
  retryText: { fontWeight: "600" },

  emptyIcon: { fontSize: 56 },
  emptyTitle: { fontSize: 22, fontWeight: "800", textAlign: "center" },
  emptySub: { fontSize: 14, lineHeight: 20, textAlign: "center" },
  primaryBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  primaryBtnText: { fontSize: 15, fontWeight: "700" },

  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: { fontSize: 18, fontWeight: "800", letterSpacing: -0.3 },

  scroll: { paddingHorizontal: 16, paddingBottom: 140, gap: 12 },
  subtitle: { fontSize: 13, lineHeight: 19 },

  chipRow: { gap: 8, paddingVertical: 4, flexDirection: "row" },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 100,
    borderWidth: 1,
  },
  chipText: { fontSize: 13, fontWeight: "600" },

  slotList: { gap: 10 },
  noDatesBox: {
    padding: 20,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  noDatesTitle: { fontSize: 15, fontWeight: "700" },
  noDatesSub: { fontSize: 13, lineHeight: 18, textAlign: "center" },
  slotCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1.5,
  },
  slotDay: {
    width: 56,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
  },
  slotDayLabel: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  slotBody: { flex: 1, paddingHorizontal: 14, paddingVertical: 12, gap: 3 },
  slotItemName: { fontSize: 14, fontWeight: "700" },
  slotPrice: { fontSize: 13, fontWeight: "600" },
  slotPlaceholder: { fontSize: 13, fontStyle: "italic" },
  slotClearBtn: { paddingHorizontal: 14, paddingVertical: 18 },

  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
  },
  footerInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  footerLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  footerTotal: { fontSize: 22, fontWeight: "800", letterSpacing: -0.3 },
  checkoutBtn: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 12,
    minWidth: 160,
    alignItems: "center",
  },
  checkoutBtnText: { fontSize: 15, fontWeight: "700" },
});

const modalStyles = StyleSheet.create({
  container: { flex: 1 },
  handleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
  },
  title: { fontSize: 20, fontWeight: "800", letterSpacing: -0.3 },
  list: { paddingHorizontal: 16, paddingBottom: 32, gap: 10 },
  itemCard: {
    flexDirection: "row",
    borderRadius: 14,
    overflow: "hidden",
  },
  itemImage: { width: 80, height: 80 },
  itemBody: { flex: 1, padding: 12, gap: 3 },
  itemName: { fontSize: 14, fontWeight: "700" },
  itemDesc: { fontSize: 12, lineHeight: 16 },
  itemPrice: { fontSize: 14, fontWeight: "700", marginTop: 2 },
});
