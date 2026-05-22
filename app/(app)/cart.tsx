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
import { useTheme, type Theme } from "../../lib/theme";

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

  const screenStyles = styles(theme);

  if (items.length === 0) {
    return (
      <View style={[screenStyles.empty, { backgroundColor: theme.dark }]}>
        <Text style={screenStyles.emptyIcon}>🛒</Text>
        <Text style={[screenStyles.emptyTitle, { color: theme.textPrimary }]}>Your cart is empty</Text>
        <Text style={[screenStyles.emptySub, { color: theme.textSecondary }]}>
          Go to Order to browse the menu and add items.
        </Text>
      </View>
    );
  }

  return (
    <View style={[screenStyles.container, { backgroundColor: theme.dark }]}>
      <SafeAreaView>
        <View style={screenStyles.header}>
          <Text
            style={[screenStyles.headerTitle, { color: theme.textPrimary }]}
          >
            Your cart
          </Text>
          <Text style={[screenStyles.headerSub, { color: theme.textMuted }]}>
            {unitCount} item{unitCount !== 1 ? "s" : ""}
          </Text>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={screenStyles.scroll}>
        {/* Cart items */}
        <View style={screenStyles.section}>
          <Text style={screenStyles.sectionTitle}>Items</Text>
          {items.map((item) => {
            const lineTotal = item.lineTotalCents * item.quantity;
            return (
              <View key={item.cartKey} style={screenStyles.cartItem}>
                <View style={screenStyles.cartItemInfo}>
                  <Text style={[screenStyles.cartItemName, { color: theme.textPrimary }]}>
                    {item.itemName}
                    {item.size ? <Text style={screenStyles.cartItemNameSize}>{` · ${item.size}`}</Text> : null}
                  </Text>
                  {item.choice && (
                    <Text style={screenStyles.cartItemChoice}>
                      {item.choice}
                    </Text>
                  )}
                  {item.additions.length > 0 && (
                    <Text style={screenStyles.cartItemMods}>
                      + {item.additions.join(", ")}
                    </Text>
                  )}
                  {item.removals.length > 0 && (
                    <Text style={screenStyles.cartItemMods}>
                      − {item.removals.join(", ")}
                    </Text>
                  )}
                  <Text style={screenStyles.cartItemPrice}>
                    {formatPrice(lineTotal)}
                    {item.quantity > 1 ? (
                      <Text style={screenStyles.cartItemPriceUnit}>
                        {"  "}({formatPrice(item.lineTotalCents)} each)
                      </Text>
                    ) : null}
                  </Text>
                </View>

                {/* Quantity stepper */}
                <View style={screenStyles.qtyControl}>
                  <TouchableOpacity
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      decrementItem(item.cartKey);
                    }}
                    style={screenStyles.qtyBtn}
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
                  <Text style={[screenStyles.qtyValue, { color: theme.textPrimary }]}>
                    {item.quantity}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      incrementItem(item.cartKey);
                    }}
                    style={screenStyles.qtyBtn}
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
        <View style={screenStyles.section}>
          <Text style={screenStyles.sectionTitle}>Student</Text>

          {children.length > 0 && (
            <View style={screenStyles.childPicker}>
              <Text style={screenStyles.fieldLabel}>Saved profiles</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={screenStyles.childRow}>
                {children.map((child) => (
                  <TouchableOpacity
                    key={child.id}
                    style={[
                      screenStyles.childChip,
                      selectedChildId === child.id && screenStyles.childChipSelected,
                    ]}
                    onPress={() => setSelectedChildId(child.id)}
                  >
                    <Text
                      style={[
                        screenStyles.childChipText,
                        selectedChildId === child.id && screenStyles.childChipTextSelected,
                      ]}
                    >
                      {child.studentName}
                    </Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={[
                    screenStyles.childChip,
                    selectedChildId === null && screenStyles.childChipSelected,
                  ]}
                  onPress={() => setSelectedChildId(null)}
                >
                  <Text
                    style={[
                      screenStyles.childChipText,
                      selectedChildId === null && screenStyles.childChipTextSelected,
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
              />
              <Field
                label="Grade"
                value={grade}
                onChangeText={setGrade}
                placeholder="e.g. 3rd"
              />
              <Field
                label="Allergy notes (optional)"
                value={allergyNotes}
                onChangeText={setAllergyNotes}
                placeholder="e.g. nut allergy"
              />
            </>
          )}
          {selectedChild && (
            <View style={screenStyles.selectedChildInfo}>
              <Text style={[screenStyles.selectedChildName, { color: theme.textPrimary }]}>{selectedChild.studentName}</Text>
              <Text style={screenStyles.selectedChildGrade}>Grade: {selectedChild.grade}</Text>
              {selectedChild.allergyNotes && (
                <Text style={screenStyles.selectedChildAllergy}>⚠️ {selectedChild.allergyNotes}</Text>
              )}
            </View>
          )}
        </View>

        {/* Parent info */}
        <View style={screenStyles.section}>
          <Text style={screenStyles.sectionTitle}>Your info</Text>
          <Field
            label="Your name"
            value={parentName || account?.name || ""}
            onChangeText={setParentName}
            placeholder="First Last"
            theme={theme}
            screenStyles={screenStyles}
          />
          <Field
            label="Email (for receipt)"
            value={parentEmail || account?.email || ""}
            onChangeText={setParentEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            theme={theme}
            screenStyles={screenStyles}
          />
        </View>

        {/* Total */}
        <View style={screenStyles.totalRow}>
          <Text style={[screenStyles.totalLabel, { color: theme.textSecondary }]}>Total</Text>
          <Text style={[screenStyles.totalAmount, { color: theme.textPrimary }]}>{formatPrice(total)}</Text>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Checkout button */}
      <SafeAreaView style={[screenStyles.footer, { backgroundColor: theme.dark }]}>
        <TouchableOpacity
          style={[
            screenStyles.checkoutBtn,
            { backgroundColor: theme.primary },
            submitting && screenStyles.checkoutBtnDisabled,
          ]}
          onPress={handleCheckout}
          disabled={submitting}
          accessibilityLabel={`Checkout, total ${formatPrice(total)}`}
          accessibilityRole="button"
        >
          {submitting ? (
            <ActivityIndicator color={theme.textOnPrimary} />
          ) : (
            <Text style={[screenStyles.checkoutBtnText, { color: theme.textOnPrimary }]}>
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
  screenStyles,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "email-address";
  theme?: Theme;
  screenStyles?: ReturnType<typeof styles>;
}) {
  return (
    <View style={screenStyles?.fieldContainer}>
      <Text style={screenStyles?.fieldLabel}>{label}</Text>
      <TextInput
        style={screenStyles?.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme?.textMuted}
        keyboardType={keyboardType ?? "default"}
        autoCapitalize={keyboardType === "email-address" ? "none" : "words"}
        autoCorrect={false}
      />
    </View>
  );
}

const styles = (theme: Theme) => StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 28, fontWeight: "800", letterSpacing: -0.5, fontFamily: theme.fontDisplay },
  headerSub: { fontSize: 14, color: theme.textMuted, marginTop: 2 },
  scroll: { paddingHorizontal: 16, paddingBottom: 16, gap: 16 },
  section: {
    backgroundColor: theme.surface,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  cartItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  cartItemInfo: { flex: 1, gap: 3 },
  cartItemName: { fontSize: 15, fontWeight: "600" },
  cartItemNameSize: {
    fontSize: 14,
    fontWeight: "400",
    color: theme.textSecondary,
  },
  cartItemMods: { fontSize: 12, color: theme.textSecondary },
  cartItemChoice: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.textSecondary,
  },
  cartItemPrice: { fontSize: 14, fontWeight: "600", color: theme.primary, marginTop: 2 },
  cartItemPriceUnit: { fontSize: 11, fontWeight: "500", color: theme.textSecondary },
  removeBtn: { padding: 4 },
  qtyControl: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    paddingHorizontal: 4,
    paddingVertical: 4,
    gap: 4,
    backgroundColor: theme.surfaceElevated,
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
    backgroundColor: theme.dark,
    marginRight: 8,
    borderWidth: 1.5,
    borderColor: theme.border,
  },
  childChipSelected: { borderColor: theme.primary, backgroundColor: `${theme.primary}1a` },
  childChipText: { fontSize: 14, color: theme.textSecondary, fontWeight: "500" },
  childChipTextSelected: { color: theme.primary },
  selectedChildInfo: {
    backgroundColor: theme.dark,
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  selectedChildName: { fontSize: 15, fontWeight: "700" },
  selectedChildGrade: { fontSize: 13, color: theme.textSecondary },
  selectedChildAllergy: { fontSize: 13, color: theme.warning },
  fieldContainer: { gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: "600", color: theme.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  input: {
    backgroundColor: theme.dark,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: theme.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: theme.textPrimary,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  totalLabel: { fontSize: 18, fontWeight: "600", color: theme.textSecondary },
  totalAmount: { fontSize: 22, fontWeight: "800" },
  footer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: theme.border,
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
  emptySub: { fontSize: 15, color: theme.textSecondary, textAlign: "center", lineHeight: 20 },
});
