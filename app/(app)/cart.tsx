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
  Linking,
  SafeAreaView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useCart, formatPrice } from "../../lib/store";
import { fetchAccount, createOrder, getJWT } from "../../lib/api";
import type { Child } from "../../lib/types";

export default function CartScreen() {
  const items = useCart((s) => s.items);
  const deliveryDateId = useCart((s) => s.deliveryDateId);
  const schoolId = useCart((s) => s.schoolId);
  const removeItem = useCart((s) => s.removeItem);
  const clearCart = useCart((s) => s.clearCart);
  const total = useCart((s) => s.total());

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
    try {
      const { checkoutUrl } = await createOrder({
        deliveryDateId,
        schoolId,
        studentName: effectiveStudentName,
        grade: effectiveGrade,
        parentName: effParentName,
        parentEmail: effParentEmail,
        allergyNotes: effectiveAllergyNotes,
        items: items.map((i) => ({
          menuItemId: i.menuItemId,
          additions: i.additions,
          removals: i.removals,
        })),
      });

      clearCart();
      await Linking.openURL(checkoutUrl);
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Checkout failed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (items.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyIcon}>🛒</Text>
        <Text style={styles.emptyTitle}>Your cart is empty</Text>
        <Text style={styles.emptySub}>
          Go to Order to browse the menu and add items.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Your Cart</Text>
          <Text style={styles.headerSub}>{items.length} item{items.length !== 1 ? "s" : ""}</Text>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Cart items */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Items</Text>
          {items.map((item) => (
            <View key={item.menuItemId} style={styles.cartItem}>
              <View style={styles.cartItemInfo}>
                <Text style={styles.cartItemName}>{item.itemName}</Text>
                {item.additions.length > 0 && (
                  <Text style={styles.cartItemMods}>
                    + {item.additions.join(", ")}
                  </Text>
                )}
                {item.removals.length > 0 && (
                  <Text style={styles.cartItemMods}>
                    − {item.removals.join(", ")}
                  </Text>
                )}
                <Text style={styles.cartItemPrice}>
                  {formatPrice(item.lineTotalCents)}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => removeItem(item.menuItemId)}
                style={styles.removeBtn}
              >
                <Ionicons name="trash-outline" size={18} color="#475569" />
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {/* Student info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Student</Text>

          {children.length > 0 && (
            <View style={styles.childPicker}>
              <Text style={styles.fieldLabel}>Saved profiles</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.childRow}>
                {children.map((child) => (
                  <TouchableOpacity
                    key={child.id}
                    style={[
                      styles.childChip,
                      selectedChildId === child.id && styles.childChipSelected,
                    ]}
                    onPress={() => setSelectedChildId(child.id)}
                  >
                    <Text
                      style={[
                        styles.childChipText,
                        selectedChildId === child.id && styles.childChipTextSelected,
                      ]}
                    >
                      {child.studentName}
                    </Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={[
                    styles.childChip,
                    selectedChildId === null && styles.childChipSelected,
                  ]}
                  onPress={() => setSelectedChildId(null)}
                >
                  <Text
                    style={[
                      styles.childChipText,
                      selectedChildId === null && styles.childChipTextSelected,
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
            <View style={styles.selectedChildInfo}>
              <Text style={styles.selectedChildName}>{selectedChild.studentName}</Text>
              <Text style={styles.selectedChildGrade}>Grade: {selectedChild.grade}</Text>
              {selectedChild.allergyNotes && (
                <Text style={styles.selectedChildAllergy}>⚠️ {selectedChild.allergyNotes}</Text>
              )}
            </View>
          )}
        </View>

        {/* Parent info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your info</Text>
          <Field
            label="Your name"
            value={parentName || account?.name || ""}
            onChangeText={setParentName}
            placeholder="First Last"
          />
          <Field
            label="Email (for receipt)"
            value={parentEmail || account?.email || ""}
            onChangeText={setParentEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
          />
        </View>

        {/* Total */}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalAmount}>{formatPrice(total)}</Text>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Checkout button */}
      <SafeAreaView style={styles.footer}>
        <TouchableOpacity
          style={[styles.checkoutBtn, submitting && styles.checkoutBtnDisabled]}
          onPress={handleCheckout}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#0f172a" />
          ) : (
            <Text style={styles.checkoutBtnText}>
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
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "email-address";
}) {
  return (
    <View style={styles.fieldContainer}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#475569"
        keyboardType={keyboardType ?? "default"}
        autoCapitalize={keyboardType === "email-address" ? "none" : "words"}
        autoCorrect={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 28, fontWeight: "800", color: "#f1f5f9", letterSpacing: -0.5 },
  headerSub: { fontSize: 14, color: "#64748b", marginTop: 2 },
  scroll: { paddingHorizontal: 16, paddingBottom: 16, gap: 16 },
  section: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  cartItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#0f172a",
  },
  cartItemInfo: { flex: 1, gap: 3 },
  cartItemName: { fontSize: 15, fontWeight: "600", color: "#f1f5f9" },
  cartItemMods: { fontSize: 12, color: "#64748b" },
  cartItemPrice: { fontSize: 14, fontWeight: "600", color: "#f59e0b", marginTop: 2 },
  removeBtn: { padding: 4 },
  childPicker: { gap: 8 },
  childRow: { flexDirection: "row" },
  childChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#0f172a",
    marginRight: 8,
    borderWidth: 1.5,
    borderColor: "#334155",
  },
  childChipSelected: { borderColor: "#f59e0b", backgroundColor: "#f59e0b1a" },
  childChipText: { fontSize: 14, color: "#94a3b8", fontWeight: "500" },
  childChipTextSelected: { color: "#f59e0b" },
  selectedChildInfo: {
    backgroundColor: "#0f172a",
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  selectedChildName: { fontSize: 15, fontWeight: "700", color: "#f1f5f9" },
  selectedChildGrade: { fontSize: 13, color: "#94a3b8" },
  selectedChildAllergy: { fontSize: 13, color: "#fbbf24" },
  fieldContainer: { gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: "600", color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 },
  input: {
    backgroundColor: "#0f172a",
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#334155",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#f1f5f9",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  totalLabel: { fontSize: 18, fontWeight: "600", color: "#94a3b8" },
  totalAmount: { fontSize: 22, fontWeight: "800", color: "#f1f5f9" },
  footer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: "#1e293b",
    backgroundColor: "#0f172a",
  },
  checkoutBtn: {
    backgroundColor: "#f59e0b",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  checkoutBtnDisabled: { opacity: 0.5 },
  checkoutBtnText: { fontSize: 17, fontWeight: "700", color: "#0f172a" },
  empty: {
    flex: 1,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 40,
  },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: "#f1f5f9", textAlign: "center" },
  emptySub: { fontSize: 14, color: "#64748b", textAlign: "center", lineHeight: 20 },
});
