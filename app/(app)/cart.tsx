/**
 * Cart — review items, enter student info, and proceed to Stripe checkout.
 */

import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Alert,
  SafeAreaView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useCart, formatPrice } from "../../lib/store";
import { fetchAccount, createOrder, getJWT } from "../../lib/api";
import type { Child } from "../../lib/types";
import { useTheme } from "../../lib/theme";

export default function CartScreen() {
  const router = useRouter();
  const theme = useTheme();
  const items = useCart((s) => s.items);
  const deliveryDateId = useCart((s) => s.deliveryDateId);
  const schoolId = useCart((s) => s.schoolId);
  const removeItem = useCart((s) => s.removeItem);
  const incrementItem = useCart((s) => s.incrementItem);
  const decrementItem = useCart((s) => s.decrementItem);
  const clearCart = useCart((s) => s.clearCart);
  const total = useCart((s) => s.total());
  const unitCount = useCart((s) => s.count());

  const { data: account } = useQuery({
    queryKey: ["account"],
    queryFn: fetchAccount,
    enabled: true,
    retry: false,
  });

  // Form state
  const [parentName, setParentName] = useState(account?.name ?? "");
  const [parentEmail, setParentEmail] = useState(account?.email ?? "");
  const [studentName, setStudentName] = useState("");
  const [grade, setGrade] = useState("");
  const [allergyNotes, setAllergyNotes] = useState("");
  const [selectedChildId, setSelectedChildId] = useState<string | null>(
    account?.children[0]?.id ?? null
  );
  const [submitting, setSubmitting] = useState(false);

  const children = account?.children ?? [];
  const selectedChild = children.find((c) => c.id === selectedChildId);

  const effectiveStudentName = selectedChild?.studentName ?? studentName;
  const effectiveGrade = selectedChild?.grade ?? grade;
  const effectiveAllergyNotes = selectedChild?.allergyNotes ?? allergyNotes;

  async function handleCheckout() {
    if (!deliveryDateId || !schoolId || items.length === 0) return;

    const effParentName = parentName.trim() || account?.name || "";
    const effParentEmail = parentEmail.trim() || account?.email || "";

    if (!effParentName || !effParentEmail || !effectiveStudentName || !effectiveGrade) {
      Alert.alert(
        "Missing info",
        "Please fill in your name, email, student name, and grade."
      );
      return;
    }

    setSubmitting(true);
    // Heavier haptic for the "money moving" CTA — affirmation that
    // we're proceeding to payment.
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
        // Expand quantities → the server treats each entry as one unit,
        // so qty=3 of a burger becomes 3 cart entries (and 3 OrderItem
        // rows). Keeps the API/DB unchanged while letting the UI
        // collapse identical configurations behind a single qty stepper.
        // `choice` is the required pick-one value (e.g. "Beef") from
        // the item modal — only present when the menu item declared
        // `requiredChoices`. The server validates this against the
        // item's `requiredChoices` list and rejects checkout if missing.
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

      clearCart();

      // Open Stripe inside the app via SFSafariViewController, not in
      // an external Safari tab. openAuthSessionAsync returns when the
      // browser session ends — either because Stripe redirected to our
      // `lunchpad://` deep-link scheme, or because the user dismissed
      // the sheet. We pass the deep-link as the second arg so iOS knows
      // to dismiss the sheet automatically when Stripe redirects there.
      const result = await WebBrowser.openAuthSessionAsync(
        checkoutUrl,
        "lunchpad://checkout/success",
      );

      if (result.type === "success" && result.url) {
        // Stripe redirected → /api/mobile/native/order/success → lunchpad://
        // Parse the orderId off the deep-link and route to the in-app
        // confirmation screen.
        const url = result.url;
        const match = url.match(/[?&]orderId=([^&]+)/);
        const orderId = match ? decodeURIComponent(match[1]) : "";
        if (url.includes("/checkout/success")) {
          router.replace({ pathname: "/checkout/success", params: { orderId } });
        } else if (url.includes("/checkout/cancel")) {
          // Customer cancelled — silently bring them back to cart;
          // their items were already cleared at the top of this
          // function so we just sit idle.
        }
      }
      // If type is "cancel" or "dismiss" the user closed the sheet
      // before completing payment. No-op; cart is already cleared.
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Checkout failed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (items.length === 0) {
    return (
      <View style={[styles.empty, { backgroundColor: theme.dark }]}>
        <Text style={styles.emptyIcon}>🛒</Text>
        <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>Your cart is empty</Text>
        <Text style={[styles.emptySub, { color: theme.textMuted }]}>
          Go to Order to browse the menu and add items.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.dark }]}>
      <SafeAreaView>
        <View style={styles.header}>
          <Text
            style={[styles.headerTitle, { color: theme.textPrimary, fontFamily: theme.fontDisplay }]}
          >
            Your cart
          </Text>
          <Text style={[styles.headerSub, { color: theme.textMuted }]}>
            {unitCount} item{unitCount !== 1 ? "s" : ""}
          </Text>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Cart items */}
        <View style={[styles.section, { backgroundColor: theme.surface }]}>
          <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>Items</Text>
          {items.map((item) => {
            const lineTotal = item.lineTotalCents * item.quantity;
            return (
              <View key={item.cartKey} style={[styles.cartItem, { borderBottomColor: theme.border }]}>
                <View style={styles.cartItemInfo}>
                  <Text style={[styles.cartItemName, { color: theme.textPrimary }]}>
                    {item.itemName}
                    {item.size ? <Text style={[styles.cartItemNameSize, { color: theme.textSecondary }]}>{` · ${item.size}`}</Text> : null}
                  </Text>
                  {item.choice && (
                    <Text style={[styles.cartItemChoice, { color: theme.textSecondary }]}>
                      {item.choice}
                    </Text>
                  )}
                  {item.additions.length > 0 && (
                    <Text style={[styles.cartItemMods, { color: theme.textMuted }]}>
                      + {item.additions.join(", ")}
                    </Text>
                  )}
                  {item.removals.length > 0 && (
                    <Text style={[styles.cartItemMods, { color: theme.textMuted }]}>
                      − {item.removals.join(", ")}
                    </Text>
                  )}
                  <Text style={[styles.cartItemPrice, { color: theme.primary }]}>
                    {formatPrice(lineTotal)}
                    {item.quantity > 1 ? (
                      <Text style={[styles.cartItemPriceUnit, { color: theme.textMuted }]}>
                        {"  "}({formatPrice(item.lineTotalCents)} each)
                      </Text>
                    ) : null}
                  </Text>
                </View>

                {/* Quantity stepper */}
                <View style={[styles.qtyControl, { backgroundColor: theme.surface }]}>
                  <TouchableOpacity
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      decrementItem(item.cartKey);
                    }}
                    style={styles.qtyBtn}
                    accessibilityLabel={
                      item.quantity > 1
                        ? `Decrease ${item.itemName} quantity`
                        : `Remove ${item.itemName} from cart`
                    }
                    accessibilityRole="button"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons
                      name={item.quantity > 1 ? "remove" : "trash-outline"}
                      size={18}
                      color={theme.textPrimary}
                    />
                  </TouchableOpacity>
                  <Text style={[styles.qtyValue, { color: theme.textPrimary }]}>
                    {item.quantity}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      incrementItem(item.cartKey);
                    }}
                    style={styles.qtyBtn}
                    accessibilityLabel={`Increase ${item.itemName} quantity`}
                    accessibilityRole="button"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="add" size={18} color={theme.textPrimary} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>

        {/* Student info */}
        <View style={[styles.section, { backgroundColor: theme.surface }]}>
          <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>Student</Text>

          {children.length > 0 && (
            <View style={styles.childPicker}>
              <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Saved profiles</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.childRow}>
                {children.map((child) => (
                  <TouchableOpacity
                    key={child.id}
                    style={[
                      styles.childChip,
                      {
                        backgroundColor: selectedChildId === child.id ? theme.accent : theme.dark,
                        borderColor: selectedChildId === child.id ? theme.accent : theme.border,
                      },
                    ]}
                    onPress={() => setSelectedChildId(child.id)}
                  >
                    <Text
                      style={[
                        styles.childChipText,
                        {
                          color: selectedChildId === child.id ? theme.textOnPrimary : theme.textSecondary,
                        },
                      ]}
                    >
                      {child.studentName}
                    </Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={[
                    styles.childChip,
                    {
                      backgroundColor: selectedChildId === null ? theme.accent : theme.dark,
                      borderColor: selectedChildId === null ? theme.accent : theme.border,
                    },
                  ]}
                  onPress={() => setSelectedChildId(null)}
                >
                  <Text
                    style={[
                      styles.childChipText,
                      {
                        color: selectedChildId === null ? theme.textOnPrimary : theme.textSecondary,
                      },
                    ]}
                  >
                    + New
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          )}

          {!selectedChild && (
            <>
              <Field
                label="Student name"
                value={studentName}
                onChangeText={setStudentName}
                placeholder="First Last"
                theme={theme}
              />
              <Field
                label="Grade"
                value={grade}
                onChangeText={setGrade}
                placeholder="e.g. 3rd"
                theme={theme}
              />
              <Field
                label="Allergy notes (optional)"
                value={allergyNotes}
                onChangeText={setAllergyNotes}
                placeholder="e.g. nut allergy"
                theme={theme}
              />
            </>
          )}
          {selectedChild && (
            <View style={[styles.selectedChildInfo, { backgroundColor: theme.dark }]}>
              <Text style={[styles.selectedChildName, { color: theme.textPrimary }]}>{selectedChild.studentName}</Text>
              <Text style={[styles.selectedChildGrade, { color: theme.textSecondary }]}>Grade: {selectedChild.grade}</Text>
              {selectedChild.allergyNotes && (
                <Text style={[styles.selectedChildAllergy, { color: theme.warning }]}>⚠️ {selectedChild.allergyNotes}</Text>
              )}
            </View>
          )}
        </View>

        {/* Parent info */}
        <View style={[styles.section, { backgroundColor: theme.surface }]}>
          <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>Your info</Text>
          <Field
            label="Your name"
            value={parentName || account?.name || ""}
            onChangeText={setParentName}
            placeholder="First Last"
            theme={theme}
          />
          <Field
            label="Email (for receipt)"
            value={parentEmail || account?.email || ""}
            onChangeText={setParentEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            theme={theme}
          />
        </View>

        {/* Total */}
        <View style={styles.totalRow}>
          <Text style={[styles.totalLabel, { color: theme.textSecondary }]}>Total</Text>
          <Text style={[styles.totalAmount, { color: theme.textPrimary }]}>{formatPrice(total)}</Text>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Checkout button */}
      <SafeAreaView style={[styles.footer, { backgroundColor: theme.dark, borderTopColor: theme.border }]}>
        <TouchableOpacity
          style={[
            styles.checkoutBtn,
            { backgroundColor: theme.primary },
            submitting && styles.checkoutBtnDisabled,
          ]}
          onPress={handleCheckout}
          disabled={submitting}
          accessibilityLabel={`Checkout, total ${formatPrice(total)}`}
          accessibilityRole="button"
        >
          {submitting ? (
            <ActivityIndicator color={theme.textOnPrimary} />
          ) : (
            <Text style={[styles.checkoutBtnText, { color: theme.textOnPrimary }]}>
              Checkout — {formatPrice(total)}
            </Text>
          )}
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  theme,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "email-address";
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={styles.fieldContainer}>
      <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>{label}</Text>
      <TextInput
        style={[styles.input, { backgroundColor: theme.dark, borderColor: theme.border, color: theme.textPrimary }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
        keyboardType={keyboardType ?? "default"}
        autoCapitalize={keyboardType === "email-address" ? "none" : "words"}
        autoCorrect={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  headerSub: { fontSize: 14, marginTop: 2 },
  scroll: { paddingHorizontal: 16, paddingBottom: 16, gap: 16 },
  section: {
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  cartItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  cartItemInfo: { flex: 1, gap: 3 },
  cartItemName: { fontSize: 15, fontWeight: "600" },
  cartItemNameSize: {
    fontSize: 14,
    fontWeight: "400",
  },
  cartItemMods: { fontSize: 12 },
  cartItemChoice: {
    fontSize: 12,
    fontWeight: "600",
  },
  cartItemPrice: { fontSize: 14, fontWeight: "600", marginTop: 2 },
  cartItemPriceUnit: { fontSize: 11, fontWeight: "500" },
  removeBtn: { padding: 4 },
  qtyControl: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    paddingHorizontal: 4,
    paddingVertical: 4,
    gap: 4,
  },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyValue: {
    minWidth: 22,
    textAlign: "center",
    fontSize: 15,
    fontWeight: "700",
  },
  childPicker: { gap: 8 },
  childRow: { flexDirection: "row" },
  childChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1.5,
  },
  childChipSelected: {},
  childChipText: { fontSize: 14, fontWeight: "500" },
  childChipTextSelected: {},
  selectedChildInfo: {
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  selectedChildName: { fontSize: 15, fontWeight: "700" },
  selectedChildGrade: { fontSize: 13 },
  selectedChildAllergy: { fontSize: 13 },
  fieldContainer: { gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  input: {
    borderRadius: 10,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  totalLabel: { fontSize: 18, fontWeight: "600" },
  totalAmount: { fontSize: 22, fontWeight: "800" },
  footer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderTopWidth: 1,
  },
  checkoutBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  checkoutBtnDisabled: { opacity: 0.5 },
  checkoutBtnText: { fontSize: 17, fontWeight: "700" },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 40,
  },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 20, fontWeight: "700", textAlign: "center" },
  emptySub: { fontSize: 15, textAlign: "center", lineHeight: 20 },
});
