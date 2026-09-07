/**
 * Order — the menu for one delivery date. Browse the day's dishes, open
 * an item to customize (size / required choice / add-ons), add to cart.
 * A floating cart bar carries the running total to checkout.
 */

import { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  SectionList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  TextInput,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { fetchDeliveryDates, fetchAccount } from "../../../lib/api";
import { useCart, formatPrice } from "../../../lib/store";
import { computeLineTotalCents } from "../../../lib/pricing";
import { groupItemsByCategory } from "../../../lib/groupByCategory";
import { STANDARD_GRADES } from "../../../lib/grades";
import type { MenuItem, DeliveryDateWithMenu } from "../../../lib/types";
import { useTheme } from "../../../lib/theme";
import { FoodImage } from "../../../components/FoodImage";
import { Screen, ScreenHeader, Card, PrimaryButton } from "../../../components/ui";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtDateLong(iso: string): string {
  const d = new Date(iso);
  return `${DAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

// ── Item card ────────────────────────────────────────────────────────────────

function MenuItemCard({
  item,
  soldOut,
  inCart,
  onPress,
}: {
  item: MenuItem;
  soldOut: boolean;
  inCart: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const s = cardStyles(theme);
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={soldOut}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${formatPrice(item.basePriceCents)}${
        soldOut ? ", sold out" : inCart ? ", in cart" : ""
      }`}
    >
      <Card style={[s.card, soldOut && { opacity: 0.5 }]}>
        <FoodImage uri={item.imageUrl} seed={item.id} size={70} radius={12} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[s.name, { color: theme.textPrimary }]} numberOfLines={1}>
            {item.name}
          </Text>
          {item.description ? (
            <Text style={[s.desc, { color: theme.textSecondary }]} numberOfLines={2}>
              {item.description}
            </Text>
          ) : null}
          <Text style={[s.price, { color: theme.primary }]}>{formatPrice(item.basePriceCents)}</Text>
        </View>
        {soldOut ? (
          <View style={[s.soldOut, { backgroundColor: theme.surfaceElevated }]}>
            <Text style={[s.soldOutText, { color: theme.textSecondary }]}>Sold out</Text>
          </View>
        ) : inCart ? (
          <Ionicons name="checkmark-circle" size={26} color={theme.primary} />
        ) : (
          <Ionicons name="add-circle" size={26} color={theme.primary} />
        )}
      </Card>
    </TouchableOpacity>
  );
}

// ── Item customization modal ─────────────────────────────────────────────────

function ItemModal({
  item,
  deliveryDate,
  onClose,
}: {
  item: MenuItem;
  deliveryDate: DeliveryDateWithMenu;
  onClose: () => void;
}) {
  const theme = useTheme();
  const m = modalStyles(theme);
  const addItem = useCart((st) => st.addItem);
  const inCart = useCart((st) => st.items.some((i) => i.menuItemId === item.id));
  const drafts = useCart((st) => st.drafts);
  const addDraftChild = useCart((st) => st.addDraftChild);

  // Reuses the same React Query cache keys the cart, account, and this
  // screen's own parent component already populate -- these don't
  // trigger extra network requests once that data has loaded, just read
  // the shared cache.
  const { data: account } = useQuery({ queryKey: ["account"], queryFn: fetchAccount, retry: false });
  const { data: allDatesForSchools } = useQuery({ queryKey: ["delivery-dates"], queryFn: fetchDeliveryDates });
  const isOffice = deliveryDate.school.locationType === "OFFICE";

  // Every distinct school available to this restaurant -- used by the
  // "add a child" form's school picker so a brand-new person can be
  // added for ANY school the restaurant serves, not just whichever
  // school this particular item happens to belong to.
  const allSchools = useMemo(() => {
    const map = new Map<string, { id: string; name: string; grades?: string[] }>();
    (allDatesForSchools ?? []).forEach((d) => map.set(d.school.id, d.school));
    return [...map.values()];
  }, [allDatesForSchools]);

  // Who's this for -- EVERY saved child plus every draft added this
  // session, never filtered out of the list entirely. A child whose own
  // school doesn't match this item's school is still shown (so a saved
  // child can never silently seem to not exist -- confirmed as a real,
  // repeated point of confusion), just visually marked and disabled;
  // picking them is prevented here for clarity, but the backend's own
  // validation (createAdHocCheckoutBatch) is the actual safety net
  // regardless, exactly like it already is for every other assignment
  // path in the app.
  const roster = useMemo(
    () => [...(account?.children ?? []), ...drafts],
    [account, drafts],
  );
  const [assignedPersonId, setAssignedPersonId] = useState<string | null>(null);
  const [showAddPersonForm, setShowAddPersonForm] = useState(false);
  const [newPersonName, setNewPersonName] = useState("");
  const [newPersonSchoolId, setNewPersonSchoolId] = useState<string | null>(null);
  const [newPersonGrade, setNewPersonGrade] = useState("");
  const [newPersonAllergy, setNewPersonAllergy] = useState("");

  const sizes = item.sizes ?? [];
  const requiredChoices = item.requiredChoices ?? [];
  const hasSize = sizes.length > 0;
  const hasRequiredChoice = requiredChoices.length > 0;

  const [selectedSize, setSelectedSize] = useState<string | null>(sizes[0]?.name ?? null);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [selectedAdditions, setSelectedAdditions] = useState<string[]>([]);
  const [selectedRemovals, setSelectedRemovals] = useState<string[]>([]);

  const additions = item.options.filter((o) => o.optionType === "ADD_ON" || o.optionType === "ADD");
  const removals = item.options.filter((o) => o.optionType === "REMOVAL" || o.optionType === "REMOVE");

  // Per-unit price for the line — canonical formula lives in lib/pricing.ts.
  // We still need `resolvedBase` separately because the cart stores it as
  // the line's `basePriceCents` (size-aware) alongside the full total.
  const resolvedBase = hasSize
    ? (sizes.find((sz) => sz.name === selectedSize) ?? sizes[0]).priceCents
    : item.basePriceCents;
  const total = computeLineTotalCents(item, {
    size: selectedSize,
    additions: selectedAdditions,
  });
  const canAdd =
    (!hasRequiredChoice || selectedChoice !== null) &&
    (!hasSize || selectedSize !== null) &&
    assignedPersonId !== null;

  function toggleAddition(name: string) {
    setSelectedAdditions((p) => (p.includes(name) ? p.filter((x) => x !== name) : [...p, name]));
  }
  function toggleRemoval(name: string) {
    setSelectedRemovals((p) => (p.includes(name) ? p.filter((x) => x !== name) : [...p, name]));
  }

  function submitAddPersonForm() {
    if (newPersonName.trim().length < 2) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
    }
    const chosenSchoolId = newPersonSchoolId ?? deliveryDate.schoolId;
    if (!isOffice && !newPersonGrade.trim()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
    }
    const newId = addDraftChild({
      studentName: newPersonName.trim(),
      schoolId: chosenSchoolId,
      grade: newPersonGrade.trim(),
      allergyNotes: newPersonAllergy.trim() || undefined,
    });
    // Only auto-assign the new person to THIS item if their school
    // actually matches it -- if the user deliberately picked a
    // different school (they're adding a child for later, not for this
    // specific item), assigning them here would just get rejected at
    // checkout. They're still added to the roster either way, ready to
    // use on an item from their own school.
    if (chosenSchoolId === deliveryDate.schoolId) {
      setAssignedPersonId(newId);
    } else {
      Alert.alert(
        "Added to your family",
        `${newPersonName.trim()} attends a different school than this item, so they're saved but not assigned here. Pick them from an item on their own school's menu.`,
      );
    }
    setShowAddPersonForm(false);
    setNewPersonName("");
    setNewPersonSchoolId(null);
    setNewPersonGrade("");
    setNewPersonAllergy("");
  }

  function handleAdd() {
    if (!canAdd) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    addItem(
      {
        menuItemId: item.id,
        itemName: item.name,
        basePriceCents: resolvedBase,
        choice: selectedChoice ?? undefined,
        size: selectedSize ?? undefined,
        additions: selectedAdditions,
        removals: selectedRemovals,
        lineTotalCents: total,
        parentChildId: assignedPersonId!, // canAdd guarantees this is set
      },
      deliveryDate.id,
      deliveryDate.schoolId,
    );
    onClose();
  }

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[m.container, { backgroundColor: theme.dark }]}>
        <View style={m.handleRow}>
          <View style={{ width: 32 }} />
          <View style={[m.grabber, { backgroundColor: theme.border }]} />
          <TouchableOpacity
            onPress={onClose}
            accessibilityLabel="Close"
            hitSlop={8}
            style={{ width: 32, alignItems: "flex-end" }}
          >
            <Ionicons name="close" size={22} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={m.scroll}>
          <FoodImage uri={item.imageUrl} seed={item.id} radius={18} style={m.image} />

          <View style={m.titleRow}>
            <Text style={[m.name, { color: theme.textPrimary, fontFamily: theme.fontDisplay }]}>
              {item.name}
            </Text>
            <Text style={[m.price, { color: theme.primary }]}>{formatPrice(total)}</Text>
          </View>

          {item.description ? (
            <Text style={[m.description, { color: theme.textSecondary }]}>{item.description}</Text>
          ) : null}

          <View style={m.section}>
            <Text style={[m.sectionTitle, { color: theme.textMuted }]}>
              WHO'S THIS FOR <Text style={{ color: theme.accent }}>· required</Text>
            </Text>
            <View style={m.chipGrid}>
              {roster.map((p) => {
                const on = assignedPersonId === p.id;
                const wrongSchool = p.schoolId !== deliveryDate.schoolId;
                return (
                  <TouchableOpacity
                    key={p.id}
                    disabled={wrongSchool}
                    onPress={() => {
                      setAssignedPersonId(p.id);
                      setShowAddPersonForm(false);
                      Haptics.selectionAsync().catch(() => {});
                    }}
                    style={[
                      m.chip,
                      wrongSchool
                        ? { backgroundColor: theme.surface, borderColor: theme.border, opacity: 0.4 }
                        : {
                            backgroundColor: on ? theme.primary : theme.surface,
                            borderColor: on ? theme.primary : theme.border,
                          },
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on, disabled: wrongSchool }}
                  >
                    <Text style={[m.chipText, { color: on ? theme.textOnPrimary : theme.textPrimary }]}>
                      {p.studentName.trim().split(/\s+/)[0]}
                      {wrongSchool ? " (different school)" : ""}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                onPress={() => setShowAddPersonForm((v) => !v)}
                style={[
                  m.chip,
                  {
                    backgroundColor: showAddPersonForm ? theme.primary : theme.surface,
                    borderColor: showAddPersonForm ? theme.primary : theme.border,
                  },
                ]}
              >
                <Text
                  style={[m.chipText, { color: showAddPersonForm ? theme.textOnPrimary : theme.textPrimary }]}
                >
                  + Add a child
                </Text>
              </TouchableOpacity>
            </View>

            {showAddPersonForm ? (
              <View style={{ gap: 8, marginTop: 10 }}>
                <TextInput
                  style={[
                    m.textInput,
                    { color: theme.textPrimary, borderColor: theme.border, backgroundColor: theme.surface },
                  ]}
                  value={newPersonName}
                  onChangeText={setNewPersonName}
                  placeholder="Their name"
                  placeholderTextColor={theme.textMuted}
                  autoCapitalize="words"
                />
                {!isOffice ? (() => {
                  const chosenSchoolId = newPersonSchoolId ?? deliveryDate.schoolId;
                  const chosenSchool = allSchools.find((sc) => sc.id === chosenSchoolId);
                  return (
                    <>
                      {allSchools.length > 1 ? (
                        <View style={m.chipGrid}>
                          {allSchools.map((sc) => {
                            const on = chosenSchoolId === sc.id;
                            return (
                              <TouchableOpacity
                                key={sc.id}
                                onPress={() => {
                                  setNewPersonSchoolId(sc.id);
                                  setNewPersonGrade(""); // grades differ per school -- don't carry over a stale pick
                                }}
                                style={[
                                  m.chip,
                                  {
                                    backgroundColor: on ? theme.primary : theme.surface,
                                    borderColor: on ? theme.primary : theme.border,
                                  },
                                ]}
                              >
                                <Text style={[m.chipText, { color: on ? theme.textOnPrimary : theme.textPrimary }]}>
                                  {sc.name}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      ) : null}
                      <View style={m.chipGrid}>
                        {(chosenSchool?.grades?.length ? chosenSchool.grades : STANDARD_GRADES).map((g) => {
                          const on = newPersonGrade === g;
                          return (
                            <TouchableOpacity
                              key={g}
                              onPress={() => setNewPersonGrade(g)}
                              style={[
                                m.chip,
                                {
                                  backgroundColor: on ? theme.primary : theme.surface,
                                  borderColor: on ? theme.primary : theme.border,
                                },
                              ]}
                            >
                              <Text style={[m.chipText, { color: on ? theme.textOnPrimary : theme.textPrimary }]}>
                                {g}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </>
                  );
                })() : null}
                <TextInput
                  style={[
                    m.textInput,
                    { color: theme.textPrimary, borderColor: theme.border, backgroundColor: theme.surface },
                  ]}
                  value={newPersonAllergy}
                  onChangeText={setNewPersonAllergy}
                  placeholder="Allergy notes (optional)"
                  placeholderTextColor={theme.textMuted}
                />
                <TouchableOpacity
                  onPress={submitAddPersonForm}
                  style={[m.addPersonBtn, { backgroundColor: theme.primary }]}
                >
                  <Text style={{ color: theme.textOnPrimary, fontWeight: "700" }}>Add</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>

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
                        m.chip,
                        {
                          backgroundColor: on ? theme.primary : theme.surface,
                          borderColor: on ? theme.primary : theme.border,
                        },
                      ]}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: on }}
                    >
                      <Text style={[m.chipText, { color: on ? theme.textOnPrimary : theme.textPrimary }]}>
                        {sz.name}
                      </Text>
                      <Text style={[m.chipPrice, { color: on ? theme.textOnPrimary : theme.textSecondary }]}>
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
                        m.chip,
                        {
                          backgroundColor: on ? theme.primary : theme.surface,
                          borderColor: on ? theme.primary : theme.border,
                        },
                      ]}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: on }}
                    >
                      <Text style={[m.chipText, { color: on ? theme.textOnPrimary : theme.textPrimary }]}>
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

        <SafeAreaView style={[m.footer, { backgroundColor: theme.dark, borderTopColor: theme.border }]}>
          <PrimaryButton
            label={
              canAdd
                ? `${inCart ? "Add another" : "Add to cart"} — ${formatPrice(total)}`
                : "Pick the required options above"
            }
            onPress={handleAdd}
            disabled={!canAdd}
          />
        </SafeAreaView>
      </View>
    </Modal>
  );
}

// ── Screen ───────────────────────────────────────────────────────────────────

export default function OrderScreen() {
  const { dateId, preselectedItemId } = useLocalSearchParams<{
    dateId: string;
    preselectedItemId?: string;
  }>();
  const router = useRouter();
  const theme = useTheme();
  const s = screenStyles(theme);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  // Tracks whether the preselectedItemId param has already opened its
  // modal. Without this, closing the modal (or adding to cart) sets
  // selectedItem back to null, which re-triggers the effect below and
  // immediately reopens the modal — trapping the user.
  const preselectHandled = useRef(false);

  const cartItems = useCart((st) => st.items);
  const cartCount = useCart((st) => st.count());
  const cartTotal = useCart((st) => st.total());

  const { data: allDates, isLoading } = useQuery({
    queryKey: ["delivery-dates"],
    queryFn: fetchDeliveryDates,
  });
  const deliveryDate = allDates?.find((d) => d.id === dateId);

  // Group items by category, preserving the order they arrive in — the
  // server already sorts menuItems by the restaurant's configured
  // category order (falling back to alphabetical), so grouping via a Map
  // (which preserves insertion order) naturally produces sections in the
  // correct sequence without the client needing to re-sort anything.
  const sections = useMemo(() => groupItemsByCategory(deliveryDate?.menuItems ?? []), [deliveryDate]);

  useEffect(() => {
    if (preselectHandled.current) return;
    if (preselectedItemId && deliveryDate) {
      const found = deliveryDate.menuItems.find((i) => i.id === preselectedItemId);
      if (found) {
        setSelectedItem(found);
        preselectHandled.current = true;
      }
    }
  }, [preselectedItemId, deliveryDate]);

  if (isLoading || !deliveryDate) {
    return (
      <Screen>
        <View style={s.center}>
          <ActivityIndicator color={theme.primary} size="large" />
        </View>
      </Screen>
    );
  }

  const soldOutSet = new Set(deliveryDate.soldOut);

  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }}>
        <ScreenHeader
          title={fmtDateLong(deliveryDate.deliveryDate)}
          subtitle={deliveryDate.school.name}
          onBack={() => router.back()}
          safeArea={false}
        />
        <SectionList
          sections={sections}
          keyExtractor={(i) => i.id}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <View style={s.sectionHead}>
              <Text style={[s.sectionTitle, { color: theme.textPrimary, fontFamily: theme.fontDisplay }]}>
                {section.title}
              </Text>
              <Text style={[s.sectionCount, { color: theme.textMuted }]}>{section.data.length}</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <MenuItemCard
              item={item}
              soldOut={soldOutSet.has(item.id)}
              inCart={cartItems.some((c) => c.menuItemId === item.id)}
              onPress={() => setSelectedItem(item)}
            />
          )}
        />
        {cartCount > 0 ? (
          <View style={s.cartBarWrap}>
            <TouchableOpacity
              activeOpacity={0.9}
              style={[s.cartBar, { backgroundColor: theme.primary }]}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                router.push("/(app)/cart");
              }}
              accessibilityRole="button"
              accessibilityLabel={`View cart, ${cartCount} items, ${formatPrice(cartTotal)}`}
            >
              <View style={[s.cartCount, { backgroundColor: "rgba(255,255,255,0.22)" }]}>
                <Text style={[s.cartCountText, { color: theme.textOnPrimary }]}>{cartCount}</Text>
              </View>
              <Text style={[s.cartBarText, { color: theme.textOnPrimary }]}>View cart</Text>
              <Text style={[s.cartBarPrice, { color: theme.textOnPrimary }]}>
                {formatPrice(cartTotal)}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </SafeAreaView>

      {selectedItem ? (
        <ItemModal
          item={selectedItem}
          deliveryDate={deliveryDate}
          onClose={() => setSelectedItem(null)}
        />
      ) : null}
    </Screen>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const screenStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    list: { paddingHorizontal: 16, paddingBottom: 96, gap: 9 },
    sectionHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingTop: 10, paddingBottom: 2 },
    sectionTitle: { fontSize: 18, fontWeight: "600", letterSpacing: -0.3 },
    sectionCount: { fontSize: 12, fontWeight: "700" },
    cartBarWrap: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingBottom: 10 },
    cartBar: {
      borderRadius: 15,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 15,
      gap: 11,
    },
    cartCount: {
      width: 26,
      height: 26,
      borderRadius: 9,
      alignItems: "center",
      justifyContent: "center",
    },
    cartCountText: { fontSize: 13, fontWeight: "800" },
    cartBarText: { flex: 1, fontSize: 15, fontWeight: "700" },
    cartBarPrice: { fontSize: 15, fontWeight: "700" },
  });

const cardStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    card: { flexDirection: "row", alignItems: "center", gap: 12, padding: 10 },
    name: { fontSize: 14.5, fontWeight: "700" },
    desc: { fontSize: 12.5, lineHeight: 17 },
    price: { fontSize: 14, fontWeight: "700", marginTop: 1 },
    soldOut: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
    soldOutText: { fontSize: 12, fontWeight: "700" },
  });

const modalStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    container: { flex: 1 },
    handleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 8,
    },
    grabber: { width: 40, height: 4, borderRadius: 2 },
    scroll: { paddingHorizontal: 20, paddingBottom: 120, gap: 14 },
    image: { width: "100%", height: 230 },
    titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 12 },
    name: { fontSize: 22, fontWeight: "600", flex: 1, letterSpacing: -0.4 },
    price: { fontSize: 19, fontWeight: "800" },
    description: { fontSize: 14.5, lineHeight: 21 },
    section: { gap: 8, marginTop: 2 },
    sectionTitle: { fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
    chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 999,
      borderWidth: 1.5,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    chipText: { fontSize: 14, fontWeight: "600" },
    chipPrice: { fontSize: 12, fontWeight: "500" },
    textInput: {
      borderWidth: 1.5,
      borderRadius: 11,
      paddingHorizontal: 14,
      paddingVertical: 11,
      fontSize: 14,
    },
    addPersonBtn: {
      paddingVertical: 12,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
    },
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
    footer: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6, borderTopWidth: 1 },
  });
