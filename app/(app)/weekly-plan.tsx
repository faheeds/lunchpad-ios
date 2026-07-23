/**
 * Weekly plan — promoted to a first-class tab and rebuilt on the
 * editorial chassis. Plan a meal for each upcoming weekday the operator
 * runs, then pay for the whole week in one checkout.
 *
 * Logic (data-driven weekday slots, per-eater switching, weekly Stripe
 * checkout) is unchanged from the original — this is a visual redesign.
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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import * as Haptics from "expo-haptics";
import {
  fetchWeeklyPlans,
  fetchOrders,
  upsertWeeklyPlan,
  deleteWeeklyPlan,
  createWeeklyCheckout,
} from "../../lib/api";
import { formatPrice } from "../../lib/store";
import { computeLineTotalCents } from "../../lib/pricing";
import { useTheme } from "../../lib/theme";
import type {
  MenuItem,
  OrderHistoryItem,
  WeeklyDeliveryDate,
  WeeklyPlan,
  WeeklyPlansBundle,
} from "../../lib/types";
import { countDoneSlots } from "../../lib/weeklyPlanSlot";
import { FoodImage } from "../../components/FoodImage";
import { Screen, Card, Eyebrow, PrimaryButton, EmptyState } from "../../components/ui";

const ALL_WEEKDAYS = [
  { num: 1, label: "MON", long: "Monday" },
  { num: 2, label: "TUE", long: "Tuesday" },
  { num: 3, label: "WED", long: "Wednesday" },
  { num: 4, label: "THU", long: "Thursday" },
  { num: 5, label: "FRI", long: "Friday" },
  { num: 6, label: "SAT", long: "Saturday" },
  { num: 7, label: "SUN", long: "Sunday" },
];

function getWeekdayFromISO(iso: string): number {
  const dow = new Date(iso).getUTCDay();
  return dow === 0 ? 7 : dow;
}

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function fmtShortDate(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** Per-meal price for a saved plan. Thin adapter around
 *  `computeLineTotalCents` — returns 0 when the item is missing (e.g.
 *  the day's menu removed it after the plan was saved). */
function resolvePlanPrice(plan: WeeklyPlan, item: MenuItem | undefined): number {
  if (!item) return 0;
  return computeLineTotalCents(item, {
    size: plan.size,
    additions: plan.additions,
  });
}

export default function WeeklyPlanScreen() {
  const router = useRouter();
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState<{ weekday: number; childId: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const s = styles(theme);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["weekly-plans"],
    queryFn: fetchWeeklyPlans,
  });

  const ordersQ = useQuery({
    queryKey: ["orders"],
    queryFn: fetchOrders,
    retry: false,
  });
  const orders = ordersQ.data ?? [];

  const activeChildId = selectedChildId ?? data?.children[0]?.id ?? null;

  // Both mutations update the React Query cache optimistically so the
  // slot fills (or clears) the instant the user acts — no waiting on
  // the POST + refetch round-trip. onError rolls the cache back; the
  // onSettled invalidate reconciles with the server copy.
  const upsertMutation = useMutation({
    mutationFn: upsertWeeklyPlan,
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ["weekly-plans"] });
      const prev = queryClient.getQueryData<WeeklyPlansBundle>(["weekly-plans"]);
      if (prev) {
        const child = prev.children.find((c) => c.id === vars.parentChildId);
        const date = child
          ? prev.deliveryDates.find(
              (d) =>
                d.schoolId === child.schoolId &&
                getWeekdayFromISO(d.deliveryDate) === vars.weekday,
            )
          : undefined;
        const menuItem = date?.menuItems.find((m) => m.id === vars.menuItemId);
        const optimistic: WeeklyPlan = {
          id: `optimistic-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
          parentChildId: vars.parentChildId,
          weekday: vars.weekday,
          menuItemId: vars.menuItemId,
          menuItemName: menuItem?.name ?? "",
          choice: vars.choice ?? null,
          size: vars.size ?? null,
          additions: vars.additions ?? [],
          removals: vars.removals ?? [],
          isActive: true,
        };
        queryClient.setQueryData<WeeklyPlansBundle>(["weekly-plans"], {
          ...prev,
          plans: [...prev.plans, optimistic],
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["weekly-plans"], ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["weekly-plans"] }),
  });
  const deleteMutation = useMutation({
    mutationFn: deleteWeeklyPlan,
    onMutate: async (planId) => {
      await queryClient.cancelQueries({ queryKey: ["weekly-plans"] });
      const prev = queryClient.getQueryData<WeeklyPlansBundle>(["weekly-plans"]);
      if (prev) {
        queryClient.setQueryData<WeeklyPlansBundle>(["weekly-plans"], {
          ...prev,
          plans: prev.plans.filter((p) => p.id !== planId),
        });
      }
      return { prev };
    },
    onError: (_err, _planId, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["weekly-plans"], ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["weekly-plans"] }),
  });

  const activeChild = data?.children.find((c) => c.id === activeChildId) ?? null;
  const childPlans = useMemo(
    () => (data?.plans ?? []).filter((p) => p.parentChildId === activeChildId),
    [data, activeChildId],
  );

  const weekdaySlots = useMemo(() => {
    if (!data || !activeChild)
      return [] as Array<{
        weekday: (typeof ALL_WEEKDAYS)[number];
        date: WeeklyDeliveryDate;
        plans: WeeklyPlan[];
        order: OrderHistoryItem | null;
      }>;
    return ALL_WEEKDAYS.flatMap((w) => {
      const date = data.deliveryDates.find(
        (d) => d.schoolId === activeChild.schoolId && getWeekdayFromISO(d.deliveryDate) === w.num,
      );
      if (!date) return [];
      const plans = childPlans.filter((p) => p.weekday === w.num);
      const order =
        orders.find(
          (o) =>
            o.parentChildId != null &&
            o.parentChildId === activeChildId &&
            o.deliveryDateId != null &&
            o.deliveryDateId === date.id &&
            o.status !== "CANCELLED",
        ) ?? null;
      return [{ weekday: w, date, plans, order }];
    });
  }, [data, activeChild, childPlans, orders, activeChildId]);

  const totalCents = useMemo(() => {
    if (!data) return 0;
    let sum = 0;
    for (const plan of data.plans) {
      const child = data.children.find((c) => c.id === plan.parentChildId);
      if (!child) continue;
      const date = data.deliveryDates.find(
        (d) => d.schoolId === child.schoolId && getWeekdayFromISO(d.deliveryDate) === plan.weekday,
      );
      if (!date) continue;
      const item = date.menuItems.find((m) => m.id === plan.menuItemId);
      if (!item) continue;
      sum += resolvePlanPrice(plan, item);
    }
    return sum;
  }, [data]);

  const activePlanCount = data?.plans.length ?? 0;
  const childPlanCount = childPlans.length;
  const childDoneCount = countDoneSlots(weekdaySlots);

  async function handleCheckout() {
    if (activePlanCount === 0) {
      Alert.alert("No meals planned", "Add at least one meal before checking out.");
      return;
    }
    setSubmitting(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    try {
      const { checkoutUrl } = await createWeeklyCheckout();
      const result = await WebBrowser.openAuthSessionAsync(checkoutUrl, "lunchpad://checkout/success");
      if (result.type === "success" && result.url && result.url.includes("/checkout/success")) {
        const match = result.url.match(/[?&]orderId=([^&]+)/);
        const orderId = match ? decodeURIComponent(match[1]) : "";
        queryClient.invalidateQueries();
        router.replace({ pathname: "/checkout/success", params: { orderId } });
      }
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Checkout failed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <Screen>
        <View style={s.center}>
          <ActivityIndicator color={theme.primary} size="large" />
        </View>
      </Screen>
    );
  }

  if (isError || !data) {
    return (
      <Screen>
        <SafeAreaView style={{ flex: 1 }}>
          <EmptyState
            icon="cloud-offline-outline"
            title="Couldn't load weekly plans"
            message="Check your connection and try again."
            actionLabel="Retry"
            onAction={() => refetch()}
          />
        </SafeAreaView>
      </Screen>
    );
  }

  if (data.children.length === 0) {
    return (
      <Screen>
        <SafeAreaView style={{ flex: 1 }}>
          <EmptyState
            icon="people-outline"
            title="Add an eater first"
            message="Weekly plans need an eater profile so each meal is tied to a school. Add one from the Account tab."
            actionLabel="Go to Account"
            onAction={() => router.push("/(app)/account")}
          />
        </SafeAreaView>
      </Screen>
    );
  }

  const progress = weekdaySlots.length > 0 ? Math.min(1, childDoneCount / weekdaySlots.length) : 0;
  const activeFirstName = activeChild?.studentName.trim().split(/\s+/)[0];

  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={s.header}>
          <Eyebrow>Meal planning</Eyebrow>
          <Text style={[s.title, { color: theme.textPrimary, fontFamily: theme.fontDisplay }]}>
            Plan the week
          </Text>
          {weekdaySlots.length > 0 ? (
            <>
              <View style={[s.track, { backgroundColor: theme.divider }]}>
                <View
                  style={[s.fill, { backgroundColor: theme.primary, width: `${progress * 100}%` }]}
                />
              </View>
              <Text style={[s.progressText, { color: theme.textSecondary }]}>
                {childDoneCount} of {weekdaySlots.length} day{weekdaySlots.length === 1 ? "" : "s"}{" "}
                planned{activeFirstName ? ` for ${activeFirstName}` : ""}
              </Text>
            </>
          ) : null}
        </View>

        {/* Eater chips */}
        {data.children.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.chipRow}
          >
            {data.children.map((c) => {
              const on = c.id === activeChildId;
              return (
                <TouchableOpacity
                  key={c.id}
                  onPress={() => setSelectedChildId(c.id)}
                  style={[
                    s.chip,
                    {
                      backgroundColor: on ? theme.primary : theme.surface,
                      borderColor: on ? theme.primary : theme.border,
                    },
                  ]}
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[s.chipText, { color: on ? theme.textOnPrimary : theme.textPrimary }]}>
                    {c.studentName.trim().split(/\s+/)[0]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : null}

        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          {weekdaySlots.length === 0 ? (
            <Card style={s.noDates}>
              <Ionicons name="calendar-outline" size={30} color={theme.textMuted} />
              <Text style={[s.noDatesTitle, { color: theme.textPrimary }]}>
                No upcoming delivery dates
              </Text>
              <Text style={[s.noDatesSub, { color: theme.textMuted }]}>
                {activeChild
                  ? `${activeChild.schoolName} doesn't have open dates this week. Check back soon.`
                  : "Pick an eater to see their schedule."}
              </Text>
            </Card>
          ) : (
            weekdaySlots.map(({ weekday: w, date, plans, order }) => (
              <View key={w.num} style={s.daySlot}>
                <View style={s.dayHeader}>
                  <View style={[s.dayChip, { backgroundColor: theme.dark }]}>
                    <Text style={[s.dayChipText, { color: theme.primary }]}>{w.label}</Text>
                  </View>
                  <Text style={[s.dayName, { color: theme.textPrimary }]}>{w.long}</Text>
                  <Text style={[s.dayDate, { color: theme.textMuted }]}>{fmtShortDate(date.deliveryDate)}</Text>
                </View>

                {/* Ordered state \u2014 tap-through to order detail, no edit affordance */}
                {order ? (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() =>
                      router.push({
                        pathname: "/(app)/orders/[orderId]",
                        params: { orderId: order.id },
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`View order for ${w.long}`}
                  >
                    <Card style={s.planRow}>
                      {(() => {
                        const firstItem = order.items[0];
                        const menuMatch = firstItem
                          ? date.menuItems.find((m) => m.name === firstItem.name)
                          : undefined;
                        return (
                          <FoodImage
                            uri={menuMatch?.imageUrl ?? null}
                            seed={date.id}
                            size={44}
                            radius={10}
                          />
                        );
                      })()}
                      <View style={{ flex: 1 }}>
                        <Text style={[s.slotName, { color: theme.textPrimary }]} numberOfLines={1}>
                          {order.items.map((i) => i.name).join(", ")}
                        </Text>
                        <Text style={[s.slotPrice, { color: theme.textSecondary }]} numberOfLines={1}>
                          Ordered \u00b7 {formatPrice(order.totalCents)}
                        </Text>
                      </View>
                      <Ionicons name="checkmark-circle" size={22} color={theme.success} />
                      <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
                    </Card>
                  </TouchableOpacity>
                ) : null}

                {/* Draft plan rows \u2014 only when not already ordered */}
                {!order ? plans.map((plan) => {
                  const item = date.menuItems.find((m) => m.id === plan.menuItemId);
                  const meta = [plan.size, plan.choice].filter(Boolean).join(" \u00b7 ");
                  const price = formatPrice(resolvePlanPrice(plan, item));
                  return (
                    <Card key={plan.id} style={s.planRow}>
                      <FoodImage
                        uri={item?.imageUrl}
                        seed={item?.id ?? plan.menuItemId}
                        size={44}
                        radius={10}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={[s.slotName, { color: theme.textPrimary }]} numberOfLines={1}>
                          {item?.name ?? plan.menuItemName}
                        </Text>
                        <Text
                          style={[s.slotPrice, { color: theme.textSecondary }]}
                          numberOfLines={1}
                        >
                          {meta ? `${meta} \u00b7 ${price}` : price}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                          deleteMutation.mutate(plan.id);
                        }}
                        style={s.removeBtn}
                        accessibilityLabel={`Remove ${item?.name ?? plan.menuItemName} from ${w.long}`}
                        hitSlop={8}
                      >
                        <Ionicons name="close-circle" size={22} color={theme.textMuted} />
                      </TouchableOpacity>
                    </Card>
                  );
                }) : null}

                {/* Add row \u2014 hidden when already ordered */}
                {!order ? (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => {
                      if (!activeChildId) return;
                      Haptics.selectionAsync().catch(() => {});
                      setPickerOpen({ weekday: w.num, childId: activeChildId });
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={
                      plans.length ? `Add another meal for ${w.long}` : `Add ${w.long} meal`
                    }
                  >
                    <View style={[s.addRow, { borderColor: theme.accent }]}>
                      <Ionicons name="add-circle-outline" size={18} color={theme.accent} />
                      <Text style={[s.addRowText, { color: theme.accent }]}>
                        {plans.length ? "Add another meal" : `Add ${w.long}\u2019s meal`}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))
          )}
          <View style={{ height: 8 }} />
        </ScrollView>

        {/* Sticky checkout footer */}
        {activePlanCount > 0 ? (
          <View style={[s.footer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
            <View>
              <Text style={[s.footerLabel, { color: theme.textMuted }]}>
                {activePlanCount} MEAL{activePlanCount === 1 ? "" : "S"}
              </Text>
              <Text style={[s.footerTotal, { color: theme.textPrimary, fontFamily: theme.fontDisplay }]}>
                {formatPrice(totalCents)}
              </Text>
            </View>
            <PrimaryButton
              label="Checkout the week"
              onPress={handleCheckout}
              loading={submitting}
              style={{ flex: 1 }}
            />
          </View>
        ) : null}
      </SafeAreaView>

      {pickerOpen ? (
        <ItemPickerModal
          deliveryDate={
            weekdaySlots.find((slot) => slot.weekday.num === pickerOpen.weekday)?.date ?? null
          }
          onClose={() => setPickerOpen(null)}
          onPick={(item, size, choice, additions, removals) => {
            const open = pickerOpen;
            setPickerOpen(null);
            upsertMutation.mutate({
              parentChildId: open.childId,
              weekday: open.weekday,
              menuItemId: item.id,
              size,
              choice,
              additions,
              removals,
            });
          }}
        />
      ) : null}
    </Screen>
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
  onPick: (
    item: MenuItem,
    size?: string,
    choice?: string,
    additions?: string[],
    removals?: string[],
  ) => void;
}) {
  const theme = useTheme();
  const m = modalStyles(theme);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [selectedAdditions, setSelectedAdditions] = useState<string[]>([]);
  const [selectedRemovals, setSelectedRemovals] = useState<string[]>([]);

  if (!deliveryDate) return null;

  // ── Item list ──────────────────────────────────────────────────────────────
  if (!selectedItem) {
    return (
      <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
        <View style={[m.container, { backgroundColor: theme.dark }]}>
          <View style={m.handleRow}>
            <Text style={[m.title, { color: theme.textPrimary, fontFamily: theme.fontDisplay }]}>
              Pick a meal
            </Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close picker" hitSlop={8}>
              <Ionicons name="close" size={22} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={m.list}>
            {deliveryDate.menuItems.map((item) => (
              <TouchableOpacity
                key={item.id}
                activeOpacity={0.85}
                onPress={() => {
                  setSelectedItem(item);
                  setSelectedSize(item.sizes?.[0]?.name ?? null);
                  setSelectedChoice(null);
                  setSelectedAdditions([]);
                  setSelectedRemovals([]);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Select ${item.name}`}
              >
                <Card style={m.itemCard}>
                  <FoodImage uri={item.imageUrl} seed={item.id} size={64} radius={12} />
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={[m.itemName, { color: theme.textPrimary }]} numberOfLines={2}>
                      {item.name}
                    </Text>
                    {item.description ? (
                      <Text style={[m.itemDesc, { color: theme.textSecondary }]} numberOfLines={2}>
                        {item.description}
                      </Text>
                    ) : null}
                    <Text style={[m.itemPrice, { color: theme.primary }]}>
                      {formatPrice(item.basePriceCents)}
                    </Text>
                  </View>
                </Card>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>
    );
  }

  // ── Customize ──────────────────────────────────────────────────────────────
  const sizes = selectedItem.sizes ?? [];
  const requiredChoices = selectedItem.requiredChoices ?? [];
  const hasSize = sizes.length > 0;
  const hasRequiredChoice = requiredChoices.length > 0;
  const additions = selectedItem.options.filter(
    (o) => o.optionType === "ADD_ON" || o.optionType === "ADD",
  );
  const removals = selectedItem.options.filter(
    (o) => o.optionType === "REMOVAL" || o.optionType === "REMOVE",
  );
  // Per-unit price — canonical formula lives in lib/pricing.ts.
  const total = computeLineTotalCents(selectedItem, {
    size: selectedSize,
    additions: selectedAdditions,
  });
  const canConfirm =
    (!hasRequiredChoice || selectedChoice !== null) && (!hasSize || selectedSize !== null);

  function toggleAddition(name: string) {
    setSelectedAdditions((p) => (p.includes(name) ? p.filter((x) => x !== name) : [...p, name]));
  }
  function toggleRemoval(name: string) {
    setSelectedRemovals((p) => (p.includes(name) ? p.filter((x) => x !== name) : [...p, name]));
  }

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[m.container, { backgroundColor: theme.dark }]}>
        <View style={m.handleRow}>
          <TouchableOpacity onPress={() => setSelectedItem(null)} accessibilityLabel="Back to list" hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={theme.textSecondary} />
          </TouchableOpacity>
          <Text style={[m.title, { color: theme.textPrimary, fontFamily: theme.fontDisplay }]}>
            Customize
          </Text>
          <TouchableOpacity onPress={onClose} accessibilityLabel="Close picker" hitSlop={8}>
            <Ionicons name="close" size={22} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={m.custScroll}>
          <Card style={m.custHeader}>
            <FoodImage uri={selectedItem.imageUrl} seed={selectedItem.id} size={56} radius={12} />
            <View style={{ flex: 1 }}>
              <Text style={[m.custName, { color: theme.textPrimary }]}>{selectedItem.name}</Text>
              <Text style={[m.custPrice, { color: theme.primary }]}>{formatPrice(total)}</Text>
            </View>
          </Card>

          {hasSize ? (
            <View style={m.section}>
              <Text style={[m.sectionTitle, { color: theme.textMuted }]}>
                SIZE <Text style={{ color: theme.accent }}>· required</Text>
              </Text>
              <View style={m.chipGrid}>
                {sizes.map((sz) => {
                  const on = selectedSize === sz.name;
                  return (
                    <TouchableOpacity
                      key={sz.id}
                      onPress={() => {
                        setSelectedSize(sz.name);
                        Haptics.selectionAsync().catch(() => {});
                      }}
                      style={[
                        m.choiceChip,
                        {
                          backgroundColor: on ? theme.primary : theme.surface,
                          borderColor: on ? theme.primary : theme.border,
                        },
                      ]}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: on }}
                    >
                      <Text style={[m.choiceText, { color: on ? theme.textOnPrimary : theme.textPrimary }]}>
                        {sz.name}
                      </Text>
                      <Text style={[m.sizePrice, { color: on ? theme.textOnPrimary : theme.textSecondary }]}>
                        {formatPrice(sz.priceCents)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : null}

          {hasRequiredChoice ? (
            <View style={m.section}>
              <Text style={[m.sectionTitle, { color: theme.textMuted }]}>
                PICK ONE <Text style={{ color: theme.accent }}>· required</Text>
              </Text>
              <View style={m.chipGrid}>
                {requiredChoices.map((name) => {
                  const on = selectedChoice === name;
                  return (
                    <TouchableOpacity
                      key={name}
                      onPress={() => {
                        setSelectedChoice((p) => (p === name ? null : name));
                        Haptics.selectionAsync().catch(() => {});
                      }}
                      style={[
                        m.choiceChip,
                        {
                          backgroundColor: on ? theme.primary : theme.surface,
                          borderColor: on ? theme.primary : theme.border,
                        },
                      ]}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: on }}
                    >
                      <Text style={[m.choiceText, { color: on ? theme.textOnPrimary : theme.textPrimary }]}>
                        {name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : null}

          {additions.length > 0 ? (
            <View style={m.section}>
              <Text style={[m.sectionTitle, { color: theme.textMuted }]}>ADD-ONS</Text>
              {additions.map((opt) => {
                const on = selectedAdditions.includes(opt.name);
                return (
                  <TouchableOpacity key={opt.id} onPress={() => toggleAddition(opt.name)} style={m.optRow}>
                    <View
                      style={[
                        m.checkbox,
                        { borderColor: theme.border },
                        on && { backgroundColor: theme.primary, borderColor: theme.primary },
                      ]}
                    >
                      {on ? <Ionicons name="checkmark" size={13} color={theme.textOnPrimary} /> : null}
                    </View>
                    <Text style={[m.optName, { color: theme.textPrimary }]}>{opt.name}</Text>
                    {opt.priceDeltaCents > 0 ? (
                      <Text style={[m.optPrice, { color: theme.textSecondary }]}>
                        +{formatPrice(opt.priceDeltaCents)}
                      </Text>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}

          {removals.length > 0 ? (
            <View style={m.section}>
              <Text style={[m.sectionTitle, { color: theme.textMuted }]}>REMOVE</Text>
              {removals.map((opt) => {
                const on = selectedRemovals.includes(opt.name);
                return (
                  <TouchableOpacity key={opt.id} onPress={() => toggleRemoval(opt.name)} style={m.optRow}>
                    <View
                      style={[
                        m.checkbox,
                        { borderColor: theme.border },
                        on && { backgroundColor: theme.primary, borderColor: theme.primary },
                      ]}
                    >
                      {on ? <Ionicons name="checkmark" size={13} color={theme.textOnPrimary} /> : null}
                    </View>
                    <Text style={[m.optName, { color: theme.textPrimary }]}>{opt.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}
        </ScrollView>

        <SafeAreaView style={[m.custFooter, { backgroundColor: theme.dark, borderTopColor: theme.border }]}>
          <PrimaryButton
            label={canConfirm ? `Confirm — ${formatPrice(total)}` : "Pick the required options above"}
            onPress={() =>
              onPick(
                selectedItem,
                selectedSize ?? undefined,
                selectedChoice ?? undefined,
                selectedAdditions,
                selectedRemovals,
              )
            }
            disabled={!canConfirm}
          />
        </SafeAreaView>
      </View>
    </Modal>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, gap: 4 },
    title: { fontSize: 25, fontWeight: "600", letterSpacing: -0.5, marginTop: 1 },
    track: { height: 6, borderRadius: 99, marginTop: 10, overflow: "hidden" },
    fill: { height: 6, borderRadius: 99 },
    progressText: { fontSize: 12, marginTop: 6 },

    chipRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingBottom: 10 },
    chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 99, borderWidth: 1 },
    chipText: { fontSize: 13, fontWeight: "600" },

    scroll: { paddingHorizontal: 16, paddingBottom: 16, gap: 10 },

    noDates: { padding: 22, alignItems: "center", gap: 6 },
    noDatesTitle: { fontSize: 15, fontWeight: "700", marginTop: 2 },
    noDatesSub: { fontSize: 13, textAlign: "center", lineHeight: 19 },

    slot: { flexDirection: "row", alignItems: "center", gap: 11, padding: 10 },
    slotEmpty: {
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
      padding: 10,
      borderRadius: 18,
      borderWidth: 1.5,
      borderStyle: "dashed",
    },
    dayBadge: {
      width: 46,
      borderRadius: 11,
      paddingVertical: 13,
      alignItems: "center",
    },
    dayBadgeText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
    slotName: { fontSize: 14, fontWeight: "700" },
    slotPrice: { fontSize: 12.5, marginTop: 2 },
    slotEmptyText: { flex: 1, fontSize: 13.5, fontWeight: "700" },
    removeBtn: { paddingHorizontal: 8, paddingVertical: 8 },

    daySlot: { gap: 7 },
    dayHeader: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 2 },
    dayChip: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
    dayChipText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
    dayName: { fontSize: 14, fontWeight: "700" },
    dayDate: { fontSize: 12, marginLeft: "auto" as const },
    planRow: { flexDirection: "row", alignItems: "center", gap: 11, padding: 10 },
    addRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      paddingVertical: 11,
      borderRadius: 14,
      borderWidth: 1.5,
      borderStyle: "dashed",
    },
    addRowText: { fontSize: 13, fontWeight: "700" },

    footer: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 8,
      borderTopWidth: 1,
    },
    footerLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1 },
    footerTotal: { fontSize: 19, fontWeight: "600", marginTop: 1 },
  });

const modalStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    container: { flex: 1 },
    handleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 12,
    },
    title: { fontSize: 19, fontWeight: "600", letterSpacing: -0.3 },
    list: { paddingHorizontal: 16, paddingBottom: 32, gap: 10 },
    itemCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 10 },
    itemName: { fontSize: 14, fontWeight: "700" },
    itemDesc: { fontSize: 12, lineHeight: 16 },
    itemPrice: { fontSize: 14, fontWeight: "700", marginTop: 1 },

    custScroll: { paddingHorizontal: 16, paddingBottom: 110, gap: 16 },
    custHeader: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, marginTop: 4 },
    custName: { fontSize: 16, fontWeight: "700" },
    custPrice: { fontSize: 18, fontWeight: "700", marginTop: 3 },

    section: { gap: 8 },
    sectionTitle: { fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
    chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    choiceChip: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 999,
      borderWidth: 1.5,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    choiceText: { fontSize: 14, fontWeight: "600" },
    sizePrice: { fontSize: 12, fontWeight: "500" },
    optRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 1.5,
      alignItems: "center",
      justifyContent: "center",
    },
    optName: { flex: 1, fontSize: 14 },
    optPrice: { fontSize: 13 },
    custFooter: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8, borderTopWidth: 1 },
  });
