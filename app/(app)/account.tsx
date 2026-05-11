/**
 * Account screen — profile, saved children, order history, sign out.
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
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { fetchAccount, fetchOrders, addChild, getSchoolCode } from "../../lib/api";
import { signOut, isSignedIn } from "../../lib/auth";
import { formatPrice } from "../../lib/store";
import { useTheme } from "../../lib/theme";
import { useRefreshTheme } from "../../lib/theme-context";

const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${DAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export default function AccountScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const theme = useTheme();
  const refreshTheme = useRefreshTheme();

  const { data: account, isLoading: loadingAccount } = useQuery({
    queryKey: ["account"],
    queryFn: fetchAccount,
    retry: false,
  });

  const { data: orders, isLoading: loadingOrders } = useQuery({
    queryKey: ["orders"],
    queryFn: fetchOrders,
    retry: false,
  });

  const [showAddChild, setShowAddChild] = useState(false);
  const [childName, setChildName] = useState("");
  const [childGrade, setChildGrade] = useState("");
  const [childAllergy, setChildAllergy] = useState("");

  const addChildMutation = useMutation({
    mutationFn: async () => {
      const { data: dates } = await fetchDatesForSchool();
      const schoolId = dates?.[0]?.schoolId ?? "";
      return addChild({
        schoolId,
        studentName: childName.trim(),
        grade: childGrade.trim(),
        allergyNotes: childAllergy.trim() || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["account"] });
      setShowAddChild(false);
      setChildName("");
      setChildGrade("");
      setChildAllergy("");
    },
  });

  async function fetchDatesForSchool() {
    const { fetchDeliveryDates } = await import("../../lib/api");
    const dates = await fetchDeliveryDates();
    return { data: dates };
  }

  async function handleSignOut() {
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          await signOut();
          queryClient.clear();
          // signOut() cleared the brand cache + school code; refresh the
          // theme so the auth screen renders in neutral LunchPad colors
          // rather than the previous tenant's brand.
          await refreshTheme();
          router.replace("/(auth)");
        },
      },
    ]);
  }

  const signedIn = !!account;

  return (
    <View style={[styles.container, { backgroundColor: theme.dark }]}>
      <SafeAreaView>
        <View style={styles.header}>
          <Text
            style={[styles.headerTitle, { color: theme.textPrimary, fontFamily: theme.fontDisplay }]}
          >
            Account
          </Text>
          {theme.restaurant && (
            <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>
              Signed in to {theme.restaurant.name}
            </Text>
          )}
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Profile section */}
        <View style={[styles.section, { backgroundColor: theme.surface }]}>
          {loadingAccount ? (
            <ActivityIndicator color={theme.primary} />
          ) : account ? (
            <>
              <View style={styles.profileRow}>
                <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
                  <Text style={[styles.avatarText, { color: theme.textOnPrimary }]}>
                    {(account.name ?? account.email)[0].toUpperCase()}
                  </Text>
                </View>
                <View style={styles.profileInfo}>
                  <Text style={[styles.profileName, { color: theme.textPrimary }]}>
                    {account.name ?? "Parent"}
                  </Text>
                  <Text style={[styles.profileEmail, { color: theme.textSecondary }]}>
                    {account.email}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.signOutBtn}
                onPress={handleSignOut}
                accessibilityLabel="Sign out"
                accessibilityRole="button"
              >
                <Ionicons name="log-out-outline" size={16} color={theme.danger} />
                <Text style={[styles.signOutText, { color: theme.danger }]}>Sign out</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.guestBox}>
              <Text style={[styles.guestTitle, { color: theme.textPrimary }]}>
                Signed in as guest
              </Text>
              <Text style={[styles.guestSub, { color: theme.textSecondary }]}>
                Sign in to save children's profiles and see order history.
              </Text>
              <TouchableOpacity
                style={[styles.signInBtn, { backgroundColor: theme.primary }]}
                onPress={() => router.push("/(auth)/sign-in")}
              >
                <Text style={[styles.signInText, { color: theme.textOnPrimary }]}>
                  Sign in with Apple
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Children section */}
        {account && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Saved children</Text>
              <TouchableOpacity onPress={() => setShowAddChild((v) => !v)}>
                <Ionicons
                  name={showAddChild ? "chevron-up" : "add-circle-outline"}
                  size={22}
                  color="#f59e0b"
                />
              </TouchableOpacity>
            </View>

            {account.children.length === 0 && !showAddChild && (
              <Text style={styles.emptyText}>
                No saved children yet. Add one to speed up checkout.
              </Text>
            )}

            {account.children.map((child) => (
              <View key={child.id} style={styles.childCard}>
                <View style={styles.childAvatar}>
                  <Text style={styles.childAvatarText}>
                    {child.studentName[0].toUpperCase()}
                  </Text>
                </View>
                <View style={styles.childInfo}>
                  <Text style={styles.childName}>{child.studentName}</Text>
                  <Text style={styles.childDetail}>
                    Grade {child.grade} · {child.schoolName}
                  </Text>
                  {child.allergyNotes && (
                    <Text style={styles.childAllergy}>⚠️ {child.allergyNotes}</Text>
                  )}
                </View>
              </View>
            ))}

            {showAddChild && (
              <View style={styles.addChildForm}>
                <Text style={styles.addChildTitle}>Add child</Text>
                <TextInput
                  style={styles.input}
                  value={childName}
                  onChangeText={setChildName}
                  placeholder="Student name"
                  placeholderTextColor="#475569"
                  autoCapitalize="words"
                />
                <TextInput
                  style={styles.input}
                  value={childGrade}
                  onChangeText={setChildGrade}
                  placeholder="Grade (e.g. 3rd)"
                  placeholderTextColor="#475569"
                />
                <TextInput
                  style={styles.input}
                  value={childAllergy}
                  onChangeText={setChildAllergy}
                  placeholder="Allergy notes (optional)"
                  placeholderTextColor="#475569"
                />
                <TouchableOpacity
                  style={[
                    styles.addChildBtn,
                    (!childName.trim() || !childGrade.trim()) && styles.addChildBtnDisabled,
                  ]}
                  onPress={() => addChildMutation.mutate()}
                  disabled={!childName.trim() || !childGrade.trim() || addChildMutation.isPending}
                >
                  {addChildMutation.isPending ? (
                    <ActivityIndicator color="#0f172a" />
                  ) : (
                    <Text style={styles.addChildBtnText}>Save child</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Order history — redesigned cards: status pill with semantic color,
            item names front-and-centre, restaurant name + date subline,
            total weighted to the right like a receipt. */}
        {account && (
          <View style={[styles.section, { backgroundColor: theme.surface }]}>
            <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>
              Order history
            </Text>
            {loadingOrders ? (
              <ActivityIndicator color={theme.primary} />
            ) : !orders?.length ? (
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                No orders yet.
              </Text>
            ) : (
              orders.map((order) => {
                const statusColor =
                  order.status === "PAID" ? theme.success
                  : order.status === "REFUNDED" ? theme.danger
                  : order.status === "CANCELLED" ? theme.textMuted
                  : theme.warning;
                const statusLabel =
                  order.status === "PAID" ? "Confirmed"
                  : order.status === "PENDING" ? "Pending"
                  : order.status === "REFUNDED" ? "Refunded"
                  : "Cancelled";
                const itemSummary = order.items
                  .map((i) => i.name)
                  .slice(0, 2)
                  .join(", ") + (order.items.length > 2 ? ` + ${order.items.length - 2} more` : "");
                return (
                  <View
                    key={order.id}
                    style={[
                      styles.orderCard,
                      { backgroundColor: theme.dark, borderColor: theme.surface },
                    ]}
                  >
                    {/* Header row: status pill + total */}
                    <View style={styles.orderHeader}>
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
                      <Text style={[styles.orderTotal, { color: theme.textPrimary }]}>
                        {formatPrice(order.totalCents)}
                      </Text>
                    </View>

                    {/* Items */}
                    <Text style={[styles.orderItems, { color: theme.textPrimary }]} numberOfLines={2}>
                      {itemSummary}
                    </Text>

                    {/* Meta row: date · school · order # */}
                    <Text style={[styles.orderMeta, { color: theme.textMuted }]}>
                      {formatDate(order.deliveryDate)} · {order.schoolName}
                      <Text style={[styles.orderRef, { color: theme.textMuted }]}>
                        {"   #" + order.orderNumber.slice(-6)}
                      </Text>
                    </Text>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* Change school */}
        <TouchableOpacity
          style={styles.changeSchoolBtn}
          onPress={() => router.replace("/(auth)")}
          accessibilityLabel="Change school or restaurant"
          accessibilityRole="button"
        >
          <Ionicons name="school-outline" size={16} color={theme.textSecondary} />
          <Text style={[styles.changeSchoolText, { color: theme.textSecondary }]}>
            Change school
          </Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
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
  scroll: { paddingHorizontal: 16, paddingBottom: 16, gap: 16 },
  section: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  profileRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#f59e0b",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 22, fontWeight: "700", color: "#0f172a" },
  profileInfo: { flex: 1, gap: 2 },
  profileName: { fontSize: 17, fontWeight: "700", color: "#f1f5f9" },
  profileEmail: { fontSize: 13, color: "#64748b" },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
  },
  signOutText: { fontSize: 14, color: "#f87171", fontWeight: "500" },
  guestBox: { gap: 8 },
  guestTitle: { fontSize: 16, fontWeight: "700", color: "#f1f5f9" },
  guestSub: { fontSize: 13, color: "#64748b", lineHeight: 18 },
  signInBtn: {
    backgroundColor: "#f59e0b",
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
    marginTop: 4,
  },
  signInText: { fontSize: 15, fontWeight: "700", color: "#0f172a" },
  emptyText: { fontSize: 13, color: "#475569" },
  childCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#0f172a",
  },
  childAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
  },
  childAvatarText: { fontSize: 16, fontWeight: "700", color: "#f59e0b" },
  childInfo: { flex: 1, gap: 2 },
  childName: { fontSize: 15, fontWeight: "600", color: "#f1f5f9" },
  childDetail: { fontSize: 12, color: "#64748b" },
  childAllergy: { fontSize: 12, color: "#fbbf24" },
  addChildForm: { gap: 10, borderTopWidth: 1, borderTopColor: "#0f172a", paddingTop: 12 },
  addChildTitle: { fontSize: 14, fontWeight: "600", color: "#94a3b8" },
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
  addChildBtn: {
    backgroundColor: "#f59e0b",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  addChildBtnDisabled: { opacity: 0.4 },
  addChildBtnText: { fontSize: 15, fontWeight: "700", color: "#0f172a" },
  orderCard: {
    borderRadius: 12,
    padding: 14,
    gap: 8,
    borderWidth: 1,
  },
  orderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statusBadge: {
    borderRadius: 100,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  statusText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.3, textTransform: "uppercase" },
  orderItems: { fontSize: 14, fontWeight: "600", lineHeight: 19 },
  orderMeta: { fontSize: 11, fontWeight: "500" },
  orderRef: { fontSize: 11, fontFamily: "Menlo" },
  orderTotal: { fontSize: 15, fontWeight: "800" },
  changeSchoolBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
  },
  changeSchoolText: { fontSize: 14, color: "#475569" },
});
