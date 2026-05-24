/**
 * Cart — review the order, confirm the eater, and check out.
 *
 * Rebuilt as a summary rather than a form: for signed-in customers the
 * saved eater is pre-selected (with their allergy shown as a confirmed
 * chip) and parent info is collapsed behind "Edit". Guests get the
 * minimal manual form.
 */

import { useState, useEffect, useRef } from "react";
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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useCart, formatPrice } from "../../lib/store";
import { fetchAccount, fetchDeliveryDates, createOrder } from "../../lib/api";
import { useTheme } from "../../lib/theme";
import { FoodImage } from "../../components/FoodImage";
import { Screen, ScreenHeader, Card, Eyebrow, PrimaryButton, EmptyState } from "../../components/ui";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${DAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export default function CartScreen() {
  const router = useRouter();
  const theme = useTheme();
  const s = styles(theme);

  const items = useCart((st) => st.items);
  const deliveryDateId = useCart((st) => st.deliveryDateId);
  const schoolId = useCart((st) => st.schoolId);
  const incrementItem = useCart((st) => st.incrementItem);
  const decrementItem = useCart((st) => st.decrementItem);
  const total = useCart((st) => st.total());
  const unitCount = useCart((st) => st.count());

  const { data: account } = useQuery({ queryKey: ["account"], queryFn: fetchAccount, retry: false });
  const { data: dates } = useQuery({ queryKey: ["delivery-dates"], queryFn: fetchDeliveryDates });

  const deliveryDate = dates?.find((d) => d.id === deliveryDateId);
  const isOffice = deliveryDate?.school.locationType === "OFFICE";
  const children = account?.children ?? [];

  const [selectedChildId, setSelectedChildId] = useState<string | null>(
    account?.children[0]?.id ?? null,
  );
  const [parentName, setParentName] = useState(account?.name ?? "");
  const [parentEmail, setParentEmail] = useState(account?.email ?? "");
  const [studentName, setStudentName] = useState("");
  const [grade, setGrade] = useState("");
  const [allergyNotes, setAllergyNotes] = useState("");
  const [editingParent, setEditingParent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // The account query resolves after first render, so the useState
  // initializers above start empty. Seed the form once when it arrives —
  // without this the saved name/email never populate (checkout then ships
  // an empty/too-short parentName the server rejects) and the saved eater
  // is never pre-selected.
  const initedRef = useRef(false);
  useEffect(() => {
    if (account && !initedRef.current) {
      initedRef.current = true;
      if (account.name) setParentName(account.name);
      if (account.email) setParentEmail(account.email);
      if (account.children[0]) setSelectedChildId(account.children[0].id);
    }
  }, [account]);

  const selectedChild = children.find((c) => c.id === selectedChildId);
  const effectiveStudentName = selectedChild?.studentName ?? studentName;
  const effectiveGrade = selectedChild?.grade ?? grade;
  const effectiveAllergyNotes = selectedChild?.allergyNotes ?? allergyNotes;
  const effParentName = parentName.trim() || account?.name || "";
  const effParentEmail = parentEmail.trim() || account?.email || "";

  // Match the server order schema (lib/validation/order.ts): parentName
  // and studentName need >= 2 chars, parentEmail must be a real address.
  const nameOk = effParentName.trim().length >= 2;
  const emailOk = /^\S+@\S+\.\S+$/.test(effParentEmail.trim());
  const studentOk = effectiveStudentName.trim().length >= 2;
  const gradeOk = isOffice || effectiveGrade.trim().length >= 1;

  async function handleCheckout() {
    if (!deliveryDateId || !schoolId || items.length === 0) return;
    if (!studentOk) {
      Alert.alert("Eater needed", "Enter the eater's name (at least 2 characters).");
      return;
    }
    if (!gradeOk) {
      Alert.alert("Grade needed", "Enter the eater's grade or group.");
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
      const { checkoutUrl } = await createOrder({
        deliveryDateId,
        schoolId,
        studentName: effectiveStudentName,
        grade: effectiveGrade,
        parentName: effParentName,
        parentEmail: effParentEmail,
        allergyNotes: effectiveAllergyNotes,
        items: items.flatMap((i) =>
          Array.from({ length: i.quantity }, () => ({
            menuItemId: i.menuItemId,
            choice: i.choice,
            size: i.size,
            additions: i.additions,
            removals: i.removals,
          })),
        ),
      });
      const result = await WebBrowser.openAuthSessionAsync(checkoutUrl, "lunchpad://checkout/success");
      if (result.type === "success" && result.url && result.url.includes("/checkout/success")) {
        const match = result.url.match(/[?&]orderId=([^&]+)/);
        const orderId = match ? decodeURIComponent(match[1]) : "";
        router.replace({ pathname: "/checkout/success", params: { orderId } });
      }
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Checkout failed.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Empty ──────────────────────────────────────────────────────────────────
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
            deliveryDate
              ? `${fmtDate(deliveryDate.deliveryDate)} · ${deliveryDate.school.name}`
              : `${unitCount} item${unitCount === 1 ? "" : "s"}`
          }
          onBack={() => router.back()}
          safeArea={false}
        />
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
            {/* Items */}
            <Card style={s.card}>
              <Eyebrow>{`${unitCount} item${unitCount === 1 ? "" : "s"}`}</Eyebrow>
              {items.map((item, idx) => {
                const menuItem = deliveryDate?.menuItems.find((m) => m.id === item.menuItemId);
                const lineTotal = item.lineTotalCents * item.quantity;
                const mods = [
                  item.size,
                  item.choice,
                  ...item.additions.map((a) => `+ ${a}`),
                  ...item.removals.map((r) => `- ${r}`),
                ].filter(Boolean);
                return (
                  <View
                    key={item.cartKey}
                    style={[
                      s.itemRow,
                      idx < items.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border },
                    ]}
                  >
                    <FoodImage uri={menuItem?.imageUrl} seed={item.menuItemId} size={48} radius={11} />
                    <View style={{ flex: 1 }}>
                      <Text style={[s.itemName, { color: theme.textPrimary }]} numberOfLines={1}>
                        {item.itemName}
                      </Text>
                      {mods.length > 0 ? (
                        <Text style={[s.itemMods, { color: theme.textMuted }]} numberOfLines={2}>
                          {mods.join(" · ")}
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
                );
              })}
            </Card>

            {/* Eater */}
            <Card style={s.card}>
              <Eyebrow>Eater</Eyebrow>
              {children.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
                  {children.map((c) => {
                    const on = selectedChildId === c.id;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        onPress={() => setSelectedChildId(c.id)}
                        style={[
                          s.chip,
                          {
                            backgroundColor: on ? theme.primary : theme.dark,
                            borderColor: on ? theme.primary : theme.border,
                          },
                        ]}
                      >
                        <Text style={[s.chipText, { color: on ? theme.textOnPrimary : theme.textPrimary }]}>
                          {c.studentName.trim().split(/\s+/)[0]}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  <TouchableOpacity
                    onPress={() => setSelectedChildId(null)}
                    style={[
                      s.chip,
                      {
                        backgroundColor: selectedChildId === null ? theme.primary : theme.dark,
                        borderColor: selectedChildId === null ? theme.primary : theme.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        s.chipText,
                        { color: selectedChildId === null ? theme.textOnPrimary : theme.textPrimary },
                      ]}
                    >
                      + New
                    </Text>
                  </TouchableOpacity>
                </ScrollView>
              ) : null}

              {selectedChild ? (
                <View style={[s.eaterCard, { backgroundColor: theme.dark }]}>
                  <View style={[s.avatar, { backgroundColor: theme.primary }]}>
                    <Text style={[s.avatarText, { color: theme.textOnPrimary }]}>
                      {selectedChild.studentName.trim()[0]?.toUpperCase() ?? "?"}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.eaterName, { color: theme.textPrimary }]}>
                      {isOffice
                        ? selectedChild.studentName
                        : `${selectedChild.studentName} · Grade ${selectedChild.grade}`}
                    </Text>
                    {selectedChild.allergyNotes ? (
                      <View style={s.allergyRow}>
                        <Ionicons name="warning-outline" size={13} color={theme.accent} />
                        <Text style={[s.allergyText, { color: theme.accent }]}>
                          {selectedChild.allergyNotes}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              ) : (
                <View style={{ gap: 10 }}>
                  <Labeled label="Eater's name">
                    <TextInput
                      style={s.input}
                      value={studentName}
                      onChangeText={setStudentName}
                      placeholder="First Last"
                      placeholderTextColor={theme.textMuted}
                      autoCapitalize="words"
                    />
                  </Labeled>
                   {isOffice ? null : (
                    <Labeled label="Grade or group">
                      <TextInput
                        style={s.input}
                        value={grade}
                        onChangeText={setGrade}
                        placeholder="e.g. 3rd, or a team name"
                        placeholderTextColor={theme.textMuted}
                      />
                    </Labeled>
                  )}
                  <Labeled label="Allergy notes (optional)">
                    <TextInput
                      style={s.input}
                      value={allergyNotes}
                      onChangeText={setAllergyNotes}
                      placeholder="e.g. nut allergy"
                      placeholderTextColor={theme.textMuted}
                    />
                  </Labeled>
                </View>
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
            <PrimaryButton
              label={`Checkout — ${formatPrice(total)}`}
              onPress={handleCheckout}
              loading={submitting}
            />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
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
    qty: { flexDirection: "row", alignItems: "center", borderRadius: 10, padding: 4, gap: 3 },
    qtyBtn: { width: 26, height: 26, borderRadius: 7, alignItems: "center", justifyContent: "center" },
    qtyValue: { minWidth: 20, textAlign: "center", fontSize: 14, fontWeight: "700" },

    chipRow: { flexDirection: "row", gap: 8, paddingVertical: 2 },
    chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, borderWidth: 1.5 },
    chipText: { fontSize: 13, fontWeight: "600" },

    eaterCard: { flexDirection: "row", alignItems: "center", gap: 11, borderRadius: 12, padding: 11 },
    avatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
    avatarText: { fontSize: 16, fontWeight: "700", fontFamily: theme.fontDisplay },
    eaterName: { fontSize: 14, fontWeight: "700" },
    allergyRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
    allergyText: { fontSize: 11.5, fontWeight: "700" },

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
  });
