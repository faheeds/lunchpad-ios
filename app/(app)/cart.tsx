/**
 * Cart — review the order, assign each item to a person, and check out.
 *
 * Redesigned around one simple rule instead of the tangle of global
 * "selected eater" / "add child form" state this screen used to carry:
 * every item always has its own independent "Assign to" control, showing
 * one shared roster (saved children + anyone added as a draft during
 * this cart session). There is no other place in the app that answers
 * "who is this for" -- no global selection, no separate guest-only form,
 * no branching between a "simple" and "complex" checkout path. A brand
 * new person added via "+ Add a child" is usable immediately, the same
 * way an already-saved child is, and only actually becomes a permanent
 * saved child at checkout time, and only if something ended up assigned
 * to them.
 */

import { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useCart, formatPrice, isDraftChildId } from "../../lib/store";
import { fetchAccount, fetchDeliveryDates, createCartCheckout, addChild } from "../../lib/api";
import { useTheme } from "../../lib/theme";
import { STANDARD_GRADES } from "../../lib/grades";
import { FoodImage } from "../../components/FoodImage";
import { Screen, ScreenHeader, Card, Eyebrow, PrimaryButton, EmptyState } from "../../components/ui";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${DAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

// A roster entry -- either a real saved child or a draft added this
// session. Only the fields every item-assignment UI actually needs.
type RosterPerson = {
  id: string;
  studentName: string;
  schoolId: string;
  grade: string;
  allergyNotes?: string;
};

export default function CartScreen() {
  const router = useRouter();
  const theme = useTheme();
  const s = styles(theme);

  const items = useCart((st) => st.items);
  const drafts = useCart((st) => st.drafts);
  // Computed locally from `items` (already a stable, properly-subscribed
  // reference) via useMemo, rather than calling the store's schoolIds()
  // selector directly in useCart(). schoolIds() returns a brand-new array
  // every call, and Zustand's default equality check is by reference --
  // subscribing to it that way creates a new "changed" value on every
  // single render, which creates an infinite re-render loop the moment
  // this screen mounts. This is exactly what caused a real crash
  // ("Something went wrong") specifically on opening the cart.
  const schoolIds = useMemo(() => [...new Set(items.map((i) => i.schoolId))], [items]);
  const incrementItem = useCart((st) => st.incrementItem);
  const decrementItem = useCart((st) => st.decrementItem);
  const assignItemToChild = useCart((st) => st.assignItemToChild);
  const addDraftChild = useCart((st) => st.addDraftChild);
  const total = useCart((st) => st.total());
  const unitCount = useCart((st) => st.count());

  const { data: account } = useQuery({ queryKey: ["account"], queryFn: fetchAccount, retry: false });
  const { data: dates } = useQuery({ queryKey: ["delivery-dates"], queryFn: fetchDeliveryDates });

  // Every distinct school available to this restaurant, derived from the
  // fetched delivery dates -- used by the "add a child" modal's school
  // picker so a brand-new person can be added for any school the
  // restaurant serves, not just whichever school the current cart
  // happens to be scoped to.
  const allSchools = useMemo(() => {
    const map = new Map<string, { id: string; name: string; grades?: string[] }>();
    (dates ?? []).forEach((d) => map.set(d.school.id, d.school));
    return [...map.values()];
  }, [dates]);

  // Cart items each carry their own deliveryDateId (to support items for
  // people at different schools in one cart) -- look up each item's own
  // delivery date rather than assuming one shared date for the whole
  // screen.
  const deliveryDateById = new Map((dates ?? []).map((d) => [d.id, d]));
  const isMultiSchool = schoolIds.length > 1;
  // Only used as a fallback for the office-vs-school wording below, and
  // for the header subtitle in the common single-school case.
  const deliveryDate = items[0] ? deliveryDateById.get(items[0].deliveryDateId) : undefined;
  const isOffice = deliveryDate?.school.locationType === "OFFICE";

  // The one shared roster every item's "Assign to" picker reads from --
  // saved children plus anyone added as a draft during this cart
  // session. No other list of "who could this be for" exists anywhere
  // else in this screen.
  const roster: RosterPerson[] = useMemo(
    () => [...(account?.children ?? []), ...drafts],
    [account, drafts],
  );

  const [parentName, setParentName] = useState(account?.name ?? "");
  const [parentEmail, setParentEmail] = useState(account?.email ?? "");
  const [editingParent, setEditingParent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Which item's "+ Add a child" modal is open, if any. Null = closed.
  const [addingForCartKey, setAddingForCartKey] = useState<string | null>(null);
  // Which line's compact "reassign" row is expanded, if any. Assignment
  // now happens once, up front, on the ordering screen -- this is only
  // for correcting a mistake afterward, so at most one line's reassign
  // row is open at a time, and it starts closed for every line.
  const [reassigningCartKey, setReassigningCartKey] = useState<string | null>(null);
  const [modalName, setModalName] = useState("");
  const [modalSchoolId, setModalSchoolId] = useState<string | null>(null);
  const [modalGrade, setModalGrade] = useState("");
  const [modalAllergy, setModalAllergy] = useState("");

  function openAddPersonModal(cartKey: string, defaultSchoolId: string) {
    setAddingForCartKey(cartKey);
    setModalName("");
    setModalSchoolId(defaultSchoolId);
    setModalGrade("");
    setModalAllergy("");
  }

  function closeAddPersonModal() {
    setAddingForCartKey(null);
  }

  function submitAddPersonModal() {
    if (modalName.trim().length < 2) {
      Alert.alert("Name needed", "Enter their name (at least 2 characters).");
      return;
    }
    if (!isOffice && !modalGrade.trim()) {
      Alert.alert("Grade needed", "Pick their grade.");
      return;
    }
    if (!isOffice && !modalSchoolId) {
      Alert.alert("School needed", "Pick which school they attend.");
      return;
    }
    const newId = addDraftChild({
      studentName: modalName.trim(),
      schoolId: modalSchoolId ?? deliveryDate?.schoolId ?? "",
      grade: modalGrade.trim(),
      allergyNotes: modalAllergy.trim() || undefined,
    });
    if (addingForCartKey) {
      assignItemToChild(addingForCartKey, newId);
    }
    closeAddPersonModal();
  }

  // The account query resolves after first render, so the useState
  // initializers above start empty. Seed the form once when it arrives --
  // without this the saved name/email never populate (checkout then
  // ships an empty/too-short parentName the server rejects).
  const initedRef = useRef(false);
  useEffect(() => {
    if (account && !initedRef.current) {
      initedRef.current = true;
      if (account.name) setParentName(account.name);
      if (account.email) setParentEmail(account.email);
    }
  }, [account]);

  const effParentName = parentName.trim() || account?.name || "";
  const effParentEmail = parentEmail.trim() || account?.email || "";

  // Match the server order schema (lib/validation/order.ts): parentName
  // needs >= 2 chars, parentEmail must be a real address.
  const nameOk = effParentName.trim().length >= 2;
  const emailOk = /^\S+@\S+\.\S+$/.test(effParentEmail.trim());

  async function handleCheckout() {
    if (items.length === 0) return;
    if (addingForCartKey) {
      // The "add a child" modal is open with unsaved input -- resolve or
      // close it first rather than letting it silently disappear.
      Alert.alert(
        "Finish adding this person",
        'Tap "Add" to save them, or close the form to check out without them.',
      );
      return;
    }
    const unassigned = items.filter((i) => !i.parentChildId);
    if (unassigned.length > 0) {
      Alert.alert(
        "Assign each item",
        `${unassigned[0].itemName} still needs to be assigned to someone before checking out.`,
      );
      return;
    }
    if (!nameOk) {
      Alert.alert("Your name", "Enter your full name (at least 2 characters) for the receipt.");
      setEditingParent(true);
      return;
    }
    if (!emailOk) {
      Alert.alert("Email needed", "Enter a valid email address for the receipt.");
      setEditingParent(true);
      return;
    }
    setSubmitting(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    try {
      // Convert every distinct draft actually used in the cart into a
      // real saved child now, right before checkout -- not earlier (a
      // draft the user added but never assigned anything to is simply
      // discarded, never created) and not per-item (each unique draft
      // becomes exactly one real child, however many items point at
      // them).
      const usedDraftIds = [...new Set(items.map((i) => i.parentChildId!).filter(isDraftChildId))];
      const draftToRealId = new Map<string, string>();
      for (const draftId of usedDraftIds) {
        const draft = drafts.find((d) => d.id === draftId);
        if (!draft) continue; // shouldn't happen -- every used draft id came from the roster
        const created = await addChild({
          schoolId: draft.schoolId,
          studentName: draft.studentName,
          grade: draft.grade,
          allergyNotes: draft.allergyNotes,
        });
        draftToRealId.set(draftId, created.id);
      }

      const result = await createCartCheckout({
        items: items.flatMap((i) => {
          const rawId = i.parentChildId!; // validated non-empty above
          const parentChildId = draftToRealId.get(rawId) ?? rawId;
          return Array.from({ length: i.quantity }, () => ({
            parentChildId,
            deliveryDateId: i.deliveryDateId,
            menuItemId: i.menuItemId,
            choice: i.choice,
            size: i.size,
            additions: i.additions,
            removals: i.removals,
          }));
        }),
      });

      const authResult = await WebBrowser.openAuthSessionAsync(result.checkoutUrl, "lunchpad://checkout/success");
      if (authResult.type === "success" && authResult.url && authResult.url.includes("/checkout/success")) {
        const match = authResult.url.match(/[?&]orderId=([^&]+)/);
        const orderId = match ? decodeURIComponent(match[1]) : "";
        router.replace({ pathname: "/checkout/success", params: { orderId } });
      }
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Checkout failed.");
    } finally {
      setSubmitting(false);
    }
  }

  // -- Empty --------------------------------------------------------------
  if (items.length === 0) {
    return (
      <Screen>
        <SafeAreaView style={{ flex: 1 }}>
          <ScreenHeader title="Your cart" onBack={() => router.back()} safeArea={false} />
          <EmptyState
            icon="bag-handle-outline"
            title="Your cart is empty"
            message="Browse an upcoming date's menu and add a few dishes."
            actionLabel="Find a date"
            onAction={() => router.replace("/(app)")}
          />
        </SafeAreaView>
      </Screen>
    );
  }

  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }}>
        <ScreenHeader
          title="Your cart"
          subtitle={
            isMultiSchool
              ? `${unitCount} item${unitCount === 1 ? "" : "s"} across ${schoolIds.length} locations`
              : deliveryDate
                ? `${fmtDate(deliveryDate.deliveryDate)} \u00b7 ${deliveryDate.school.name}`
                : `${unitCount} item${unitCount === 1 ? "" : "s"}`
          }
          onBack={() => router.back()}
          safeArea={false}
        />
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
            {/* Items */}
            <Card style={s.card}>
              <Eyebrow>{`${unitCount} item${unitCount === 1 ? "" : "s"}`}</Eyebrow>
              {/* When the cart spans more than one school, group items by
                  school with a small header above each group so a mixed
                  cart never looks like an undifferentiated list -- a
                  parent should always be able to see which items belong
                  to which location at a glance. */}
              {(isMultiSchool ? [...items].sort((a, b) => a.schoolId.localeCompare(b.schoolId)) : items).map(
                (item, idx, sortedItems) => {
                  const itemDate = deliveryDateById.get(item.deliveryDateId);
                  const menuItem = itemDate?.menuItems.find((m) => m.id === item.menuItemId);
                  const lineTotal = item.lineTotalCents * item.quantity;
                  const mods = [
                    item.size,
                    item.choice,
                    ...item.additions.map((a) => `+ ${a}`),
                    ...item.removals.map((r) => `- ${r}`),
                  ].filter(Boolean);
                  const showSchoolHeader =
                    isMultiSchool && (idx === 0 || sortedItems[idx - 1].schoolId !== item.schoolId);
                  // Every item's assignable roster is filtered to people
                  // at THIS item's own school -- a child can never be
                  // offered as an option for a school they don't attend,
                  // which is what makes a mixed-school cart safe by
                  // construction rather than by a check that runs after
                  // the fact.
                  const eligiblePeople = roster.filter((p) => p.schoolId === item.schoolId);
                  const assignedId = item.parentChildId;
                  const assignedPerson = roster.find((p) => p.id === assignedId);
                  const isReassigning = reassigningCartKey === item.cartKey;
                  return (
                    <View key={item.cartKey}>
                      {showSchoolHeader ? (
                        <Text style={[s.schoolGroupHeader, { color: theme.textMuted }]}>
                          {itemDate?.school.name ?? "Unknown location"}
                        </Text>
                      ) : null}
                      <View
                        style={[
                          s.itemRow,
                          idx < sortedItems.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border },
                        ]}
                      >
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: "row", gap: 12 }}>
                            <FoodImage uri={menuItem?.imageUrl} seed={item.menuItemId} size={48} radius={11} />
                            <View style={{ flex: 1 }}>
                              <Text style={[s.itemName, { color: theme.textPrimary }]} numberOfLines={1}>
                                {item.itemName}
                              </Text>
                              {mods.length > 0 ? (
                                <Text style={[s.itemMods, { color: theme.textMuted }]} numberOfLines={2}>
                                  {mods.join(" \u00b7 ")}
                                </Text>
                              ) : null}
                              <Text style={[s.itemPrice, { color: theme.primary }]}>{formatPrice(lineTotal)}</Text>
                            </View>
                            <View style={[s.qty, { backgroundColor: theme.dark }]}>
                              <TouchableOpacity
                                onPress={() => {
                                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                                  decrementItem(item.cartKey);
                                }}
                                style={s.qtyBtn}
                                hitSlop={6}
                                accessibilityLabel={item.quantity > 1 ? "Decrease quantity" : "Remove item"}
                              >
                                <Ionicons
                                  name={item.quantity > 1 ? "remove" : "trash-outline"}
                                  size={16}
                                  color={theme.textPrimary}
                                />
                              </TouchableOpacity>
                              <Text style={[s.qtyValue, { color: theme.textPrimary }]}>{item.quantity}</Text>
                              <TouchableOpacity
                                onPress={() => {
                                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                                  incrementItem(item.cartKey);
                                }}
                                style={s.qtyBtn}
                                hitSlop={6}
                                accessibilityLabel="Increase quantity"
                              >
                                <Ionicons name="add" size={16} color={theme.textPrimary} />
                              </TouchableOpacity>
                            </View>
                          </View>

                          {/* Who this line is for -- decided once, up
                              front, on the ordering screen. Shown here as
                              a simple fact, tappable to correct a mistake
                              via a small reassign row rather than an
                              always-open picker on every line. */}
                          <TouchableOpacity
                            onPress={() => setReassigningCartKey(isReassigning ? null : item.cartKey)}
                            style={s.forRow}
                          >
                            <Ionicons name="person-outline" size={13} color={theme.textMuted} />
                            <Text style={[s.forText, { color: theme.textSecondary }]}>
                              For {assignedPerson?.studentName.trim().split(/\s+/)[0] ?? "someone no longer on your roster"}
                            </Text>
                            <Ionicons
                              name={isReassigning ? "chevron-up" : "chevron-down"}
                              size={13}
                              color={theme.textMuted}
                            />
                          </TouchableOpacity>

                          {isReassigning ? (
                            <View style={s.itemEaterChips}>
                              {eligiblePeople.map((p) => {
                                const on = assignedId === p.id;
                                return (
                                  <TouchableOpacity
                                    key={p.id}
                                    onPress={() => {
                                      assignItemToChild(item.cartKey, p.id);
                                      setReassigningCartKey(null);
                                    }}
                                    style={[
                                      s.itemEaterChip,
                                      {
                                        backgroundColor: on ? theme.primary : theme.dark,
                                        borderColor: on ? theme.primary : theme.border,
                                      },
                                    ]}
                                  >
                                    <Text
                                      style={[
                                        s.itemEaterChipText,
                                        { color: on ? theme.textOnPrimary : theme.textPrimary },
                                      ]}
                                    >
                                      {p.studentName.trim().split(/\s+/)[0]}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              })}
                              <TouchableOpacity
                                onPress={() => {
                                  setReassigningCartKey(null);
                                  openAddPersonModal(item.cartKey, item.schoolId);
                                }}
                                style={[s.itemEaterChip, { backgroundColor: theme.dark, borderColor: theme.border }]}
                              >
                                <Text style={[s.itemEaterChipText, { color: theme.textPrimary }]}>+ Add a child</Text>
                              </TouchableOpacity>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    </View>
                  );
                },
              )}
            </Card>

            {/* Parent / receipt */}
            <Card style={s.card}>
              {editingParent || !nameOk || !emailOk ? (
                <>
                  <Eyebrow>Receipt to</Eyebrow>
                  <Labeled label="Your name">
                    <TextInput
                      style={s.input}
                      value={parentName}
                      onChangeText={setParentName}
                      placeholder="First Last"
                      placeholderTextColor={theme.textMuted}
                      autoCapitalize="words"
                    />
                  </Labeled>
                  <Labeled label="Email">
                    <TextInput
                      style={s.input}
                      value={parentEmail}
                      onChangeText={setParentEmail}
                      placeholder="you@example.com"
                      placeholderTextColor={theme.textMuted}
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </Labeled>
                </>
              ) : (
                <View style={s.parentCollapsed}>
                  <View style={{ flex: 1 }}>
                    <Eyebrow>Receipt to</Eyebrow>
                    <Text style={[s.parentText, { color: theme.textPrimary }]} numberOfLines={1}>
                      {effParentName}
                    </Text>
                    <Text style={[s.parentSub, { color: theme.textMuted }]} numberOfLines={1}>
                      {effParentEmail}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setEditingParent(true)} hitSlop={8}>
                    <Text style={[s.editLink, { color: theme.accent }]}>Edit</Text>
                  </TouchableOpacity>
                </View>
              )}
            </Card>

            <View style={{ height: 8 }} />
          </ScrollView>

          {/* Checkout footer */}
          <View style={[s.footer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
            <View style={s.totalRow}>
              <Text style={[s.totalLabel, { color: theme.textSecondary }]}>Total</Text>
              <Text style={[s.totalAmount, { color: theme.textPrimary, fontFamily: theme.fontDisplay }]}>
                {formatPrice(total)}
              </Text>
            </View>
            <PrimaryButton label={`Checkout \u2014 ${formatPrice(total)}`} onPress={handleCheckout} loading={submitting} />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Add a child -- one shared modal, opened from any item's "+ Add a
          child" chip. Adding here creates a draft only; they become a
          real saved child at checkout, and only if used. */}
      <Modal visible={addingForCartKey !== null} animationType="slide" transparent onRequestClose={closeAddPersonModal}>
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, { backgroundColor: theme.surface }]}>
            <Text style={[s.modalTitle, { color: theme.textPrimary, fontFamily: theme.fontDisplay }]}>
              Add a child
            </Text>
            <View style={{ gap: 10 }}>
              <Labeled label="Name">
                <TextInput
                  style={s.input}
                  value={modalName}
                  onChangeText={setModalName}
                  placeholder="First Last"
                  placeholderTextColor={theme.textMuted}
                  autoCapitalize="words"
                  autoFocus
                />
              </Labeled>
              {!isOffice &&
                (() => {
                  const modalSchool = allSchools.find((sc) => sc.id === modalSchoolId);
                  return (
                    <>
                      {allSchools.length > 1 ? (
                        <Labeled label="School">
                          <View style={s.itemEaterChips}>
                            {allSchools.map((sc) => {
                              const on = modalSchoolId === sc.id;
                              return (
                                <TouchableOpacity
                                  key={sc.id}
                                  onPress={() => setModalSchoolId(sc.id)}
                                  style={[
                                    s.itemEaterChip,
                                    {
                                      backgroundColor: on ? theme.primary : theme.dark,
                                      borderColor: on ? theme.primary : theme.border,
                                    },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      s.itemEaterChipText,
                                      { color: on ? theme.textOnPrimary : theme.textPrimary },
                                    ]}
                                  >
                                    {sc.name}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </Labeled>
                      ) : modalSchool ? (
                        <Labeled label="School">
                          <View style={[s.input, { justifyContent: "center" }]}>
                            <Text style={{ color: theme.textPrimary, fontSize: 13 }}>{modalSchool.name}</Text>
                          </View>
                        </Labeled>
                      ) : null}
                      <Labeled label="Grade">
                        <View style={s.itemEaterChips}>
                          {(modalSchool?.grades?.length ? modalSchool.grades : STANDARD_GRADES).map((g) => {
                            const on = modalGrade === g;
                            return (
                              <TouchableOpacity
                                key={g}
                                onPress={() => setModalGrade(g)}
                                style={[
                                  s.itemEaterChip,
                                  {
                                    backgroundColor: on ? theme.primary : theme.dark,
                                    borderColor: on ? theme.primary : theme.border,
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    s.itemEaterChipText,
                                    { color: on ? theme.textOnPrimary : theme.textPrimary },
                                  ]}
                                >
                                  {g}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </Labeled>
                    </>
                  );
                })()}
              <Labeled label="Allergy notes (optional)">
                <TextInput
                  style={s.input}
                  value={modalAllergy}
                  onChangeText={setModalAllergy}
                  placeholder="e.g. nut allergy"
                  placeholderTextColor={theme.textMuted}
                />
              </Labeled>
            </View>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <TouchableOpacity
                onPress={closeAddPersonModal}
                style={[s.modalCancelBtn, { borderColor: theme.border }]}
              >
                <Text style={{ color: theme.textPrimary, fontWeight: "600" }}>Cancel</Text>
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <PrimaryButton label="Add" onPress={submitAddPersonModal} />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text
        style={{
          fontSize: 11,
          fontWeight: "700",
          letterSpacing: 1,
          textTransform: "uppercase",
          color: theme.textMuted,
        }}
      >
        {label}
      </Text>
      {children}
    </View>
  );
}

const styles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    scroll: { padding: 16, gap: 14 },
    card: { padding: 14, gap: 10 },

    itemRow: { flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 9 },
    itemName: { fontSize: 14, fontWeight: "700" },
    itemMods: { fontSize: 12, marginTop: 1 },
    itemPrice: { fontSize: 13, fontWeight: "700", marginTop: 3 },
    schoolGroupHeader: {
      fontSize: 11,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.4,
      paddingTop: 12,
      paddingBottom: 4,
    },
    itemEaterChips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
    forRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 },
    forText: { fontSize: 12, fontWeight: "600" },
    itemEaterChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, borderWidth: 1.5 },
    itemEaterChipText: { fontSize: 11.5, fontWeight: "600" },
    qty: { flexDirection: "row", alignItems: "center", borderRadius: 10, padding: 4, gap: 3 },
    qtyBtn: { width: 26, height: 26, borderRadius: 7, alignItems: "center", justifyContent: "center" },
    qtyValue: { minWidth: 20, textAlign: "center", fontSize: 14, fontWeight: "700" },

    input: {
      backgroundColor: theme.dark,
      borderRadius: 11,
      borderWidth: 1.5,
      borderColor: theme.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: theme.textPrimary,
    },

    parentCollapsed: { flexDirection: "row", alignItems: "center", gap: 12 },
    parentText: { fontSize: 14, fontWeight: "700", marginTop: 4 },
    parentSub: { fontSize: 12.5, marginTop: 1 },
    editLink: { fontSize: 13, fontWeight: "700" },

    footer: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, borderTopWidth: 1, gap: 10 },
    totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    totalLabel: { fontSize: 15, fontWeight: "600" },
    totalAmount: { fontSize: 22, fontWeight: "600" },

    modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
    modalCard: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 },
    modalTitle: { fontSize: 20, fontWeight: "700", marginBottom: 16 },
    modalCancelBtn: {
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderRadius: 12,
      borderWidth: 1.5,
      alignItems: "center",
      justifyContent: "center",
    },
  });
