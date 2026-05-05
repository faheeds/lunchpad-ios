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

const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${DAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export default function AccountScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

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
          router.replace("/(auth)/sign-in");
        },
      },
    ]);
  }

  const signedIn = !!account;

  return (
    <View style={styles.container}>
      <SafeAreaView>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Account</Text>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Profile section */}
        <View style={styles.section}>
          {loadingAccount ? (
            <ActivityIndicator color="#f59e0b" />
          ) : account ? (
            <>
              <View style={styles.profileRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {(account.name ?? account.email)[0].toUpperCase()}
                  </Text>
                </View>
                <View style={styles.profileInfo}>
                  <Text style={styles.profileName}>{account.name ?? "Parent"}</Text>
                  <Text style={styles.profileEmail}>{account.email}</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
                <Ionicons name="log-out-outline" size={16} color="#f87171" />
                <Text style={styles.signOutText}>Sign out</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.guestBox}>
              <Text style={styles.guestTitle}>Signed in as guest</Text>
              <Text style={styles.guestSub}>
                Sign in to save children's profiles and see order history.
              </Text>
              <TouchableOpacity
                style={styles.signInBtn}
                onPress={() => router.push("/(auth)/sign-in")}
              >
                <Text style={styles.signInText}>Sign in with Apple</Text>
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

        {/* Order history */}
        {account && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Order history</Text>
            {loadingOrders ? (
              <ActivityIndicator color="#f59e0b" />
            ) : !orders?.length ? (
              <Text style={styles.emptyText}>No orders yet.</Text>
            ) : (
              orders.map((order) => (
                <View key={order.id} style={styles.orderCard}>
                  <View style={styles.orderHeader}>
                    <Text style={styles.orderNumber}>#{order.orderNumber}</Text>
                    <View
                      style={[
                        styles.statusBadge,
                        order.status === "PAID" && styles.statusPaid,
                      ]}
                    >
                      <Text style={styles.statusText}>{order.status}</Text>
                    </View>
                  </View>
                  <Text style={styles.orderDate}>
                    {formatDate(order.deliveryDate)} · {order.schoolName}
                  </Text>
                  {order.items.map((item, i) => (
                    <Text key={i} style={styles.orderItem}>
                      {item.name}
                      {item.additions.length > 0 ? ` (+${item.additions.join(", ")})` : ""}
                    </Text>
                  ))}
                  <Text style={styles.orderTotal}>{formatPrice(order.totalCents)}</Text>
                </View>
              ))
            )}
          </View>
        )}

        {/* Change school */}
        <TouchableOpacity
          style={styles.changeSchoolBtn}
          onPress={() => router.replace("/(auth)")}
        >
          <Ionicons name="school-outline" size={16} color="#64748b" />
          <Text style={styles.changeSchoolText}>Change school</Text>
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
    backgroundColor: "#0f172a",
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  orderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  orderNumber: { fontSize: 14, fontWeight: "700", color: "#f1f5f9" },
  statusBadge: {
    backgroundColor: "#334155",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusPaid: { backgroundColor: "#14532d" },
  statusText: { fontSize: 11, fontWeight: "700", color: "#94a3b8" },
  orderDate: { fontSize: 12, color: "#64748b" },
  orderItem: { fontSize: 13, color: "#94a3b8" },
  orderTotal: { fontSize: 14, fontWeight: "700", color: "#f59e0b", marginTop: 4 },
  changeSchoolBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
  },
  changeSchoolText: { fontSize: 14, color: "#475569" },
});
