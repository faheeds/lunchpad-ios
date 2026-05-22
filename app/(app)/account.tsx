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
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null);
  const [schools, setSchools] = useState<Array<{ id: string; name: string }>>([]);

  const addChildMutation = useMutation({
    mutationFn: async () => {
      return addChild({
        schoolId: selectedSchoolId ?? "",
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
      setSelectedSchoolId(null);
    },
  });

  async function loadSchools() {
    const { fetchDeliveryDates } = await import("../../lib/api");
    const dates = await fetchDeliveryDates();
    const uniqueSchools = Array.from(
      new Map(dates.map((d) => [d.schoolId, { id: d.schoolId, name: d.school.name }])).values()
    );
    setSchools(uniqueSchools);
    if (uniqueSchools.length === 1) {
      setSelectedSchoolId(uniqueSchools[0].id);
    }
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
      <SafeAreaView style={styles.header}>
        <Text
          style={[styles.headerTitle, { color: theme.textPrimary, fontFamily: theme.fontDisplay }]}
        >
          Account
        </Text>
        {theme.restaurant && (
          <Text style={{ fontSize: 13, color: theme.textMuted, marginTop: 2 }}>
            Signed in to {theme.restaurant.name}
          </Text>
        )}
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
          <View style={[styles.section, { backgroundColor: theme.surface }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>Saved children</Text>
              <TouchableOpacity
                onPress={() => {
                  const newShowAddChild = !showAddChild;
                  setShowAddChild(newShowAddChild);
                  if (newShowAddChild) {
                    loadSchools();
                  }
                }}
              >
                <Ionicons
                  name={showAddChild ? "chevron-up" : "add-circle-outline"}
                  size={22}
                  color={theme.accent}
                />
              </TouchableOpacity>
            </View>

            {account.children.length === 0 && !showAddChild && (
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                No saved children yet. Add one to speed up checkout.
              </Text>
            )}

            {account.children.map((child) => (
              <View key={child.id} style={[styles.childCard, { borderBottomColor: theme.border }]}>
                <View style={[styles.childAvatar, { backgroundColor: theme.dark }]}>
                  <Text style={[styles.childAvatarText, { color: theme.primary }]}>
                    {child.studentName[0].toUpperCase()}
                  </Text>
                </View>
                <View style={styles.childInfo}>
                  <Text style={[styles.childName, { color: theme.textPrimary }]}>{child.studentName}</Text>
                  <Text style={[styles.childDetail, { color: theme.textSecondary }]}>
                    Grade {child.grade} · {child.schoolName}
                  </Text>
                  {child.allergyNotes && (
                    <Text style={[styles.childAllergy, { color: theme.warning }]}>⚠️ {child.allergyNotes}</Text>
                  )}
                </View>
              </View>
            ))}

            {showAddChild && (
              <View style={[styles.addChildForm, { borderTopColor: theme.border }]}>
                <Text style={[styles.addChildTitle, { color: theme.textSecondary }]}>Add child</Text>
                {schools.length > 1 && (
                  <View style={styles.schoolPickerWrapper}>
                    <Text style={[styles.schoolPickerLabel, { color: theme.textSecondary }]}>School</Text>
                    <View style={styles.schoolChips}>
                      {schools.map((school) => (
                        <TouchableOpacity
                          key={school.id}
                          style={[
                            styles.schoolChip,
                            {
                              backgroundColor: selectedSchoolId === school.id ? theme.primary : theme.dark,
                              borderColor: selectedSchoolId === school.id ? theme.primary : theme.border,
                            },
                          ]}
                          onPress={() => setSelectedSchoolId(school.id)}
                          accessibilityRole="radio"
                          accessibilityLabel={`Select ${school.name}`}
                          accessibilityState={{ selected: selectedSchoolId === school.id }}
                        >
                          <Text
                            style={[
                              styles.schoolChipText,
                              { color: selectedSchoolId === school.id ? theme.textOnPrimary : theme.textPrimary },
                            ]}
                          >
                            {school.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
                <TextInput
                  style={[styles.input, { backgroundColor: theme.dark, borderColor: theme.border, color: theme.textPrimary }]}
                  value={childName}
                  onChangeText={setChildName}
                  placeholder="Student name"
                  placeholderTextColor={theme.textMuted}
                  autoCapitalize="words"
                />
                <TextInput
                  style={[styles.input, { backgroundColor: theme.dark, borderColor: theme.border, color: theme.textPrimary }]}
                  value={childGrade}
                  onChangeText={setChildGrade}
                  placeholder="Grade (e.g. 3rd)"
                  placeholderTextColor={theme.textMuted}
                />
                <TextInput
                  style={[styles.input, { backgroundColor: theme.dark, borderColor: theme.border, color: theme.textPrimary }]}
                  value={childAllergy}
                  onChangeText={setChildAllergy}
                  placeholder="Allergy notes (optional)"
                  placeholderTextColor={theme.textMuted}
                />
                <TouchableOpacity
                  style={[
                    styles.addChildBtn,
                    { backgroundColor: theme.primary },
                    (!childName.trim() || !childGrade.trim() || !selectedSchoolId) && styles.addChildBtnDisabled,
                  ]}
                  onPress={() => addChildMutation.mutate()}
                  disabled={!childName.trim() || !childGrade.trim() || !selectedSchoolId || addChildMutation.isPending}
                >
                  {addChildMutation.isPending ? (
                    <ActivityIndicator color={theme.textOnPrimary} />
                  ) : (
                    <Text style={[styles.addChildBtnText, { color: theme.textOnPrimary }]}>Save child</Text>
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
                  <TouchableOpacity
                    key={order.id}
                    style={[
                      styles.orderCard,
                      { backgroundColor: theme.surface, borderColor: theme.border },
                    ]}
                    onPress={() => router.push(`/(app)/orders/${order.id}`)}
                    accessibilityLabel={`Order ${order.orderNumber.slice(-6)}`}
                    accessibilityRole="button"
                    activeOpacity={0.6}
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
                  </TouchableOpacity>
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
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  scroll: { paddingHorizontal: 16, paddingBottom: 16, gap: 16 },
  section: {
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
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  profileRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 22, fontWeight: "700" },
  profileInfo: { flex: 1, gap: 2 },
  profileName: { fontSize: 17, fontWeight: "700" },
  profileEmail: { fontSize: 13 },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
  },
  signOutText: { fontSize: 14, fontWeight: "500" },
  guestBox: { gap: 8 },
  guestTitle: { fontSize: 16, fontWeight: "700" },
  guestSub: { fontSize: 15, lineHeight: 20 },
  signInBtn: {
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
    marginTop: 4,
  },
  signInText: { fontSize: 15, fontWeight: "700" },
  emptyText: { fontSize: 15, lineHeight: 20 },
  childCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  childAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  childAvatarText: { fontSize: 16, fontWeight: "700" },
  childInfo: { flex: 1, gap: 2 },
  childName: { fontSize: 15, fontWeight: "600" },
  childDetail: { fontSize: 13, lineHeight: 18 },
  childAllergy: { fontSize: 13 },
  addChildForm: { gap: 10, borderTopWidth: 1, paddingTop: 12 },
  addChildTitle: { fontSize: 14, fontWeight: "600" },
  schoolPickerWrapper: { gap: 6 },
  schoolPickerLabel: { fontSize: 13, fontWeight: "600" },
  schoolChips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  schoolChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  schoolChipText: { fontSize: 13, fontWeight: "600" },
  input: {
    borderRadius: 10,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  addChildBtn: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  addChildBtnDisabled: { opacity: 0.4 },
  addChildBtnText: { fontSize: 15, fontWeight: "700" },
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
  orderMeta: { fontSize: 13, fontWeight: "500" },
  orderRef: { fontSize: 13, fontFamily: "Menlo" },
  orderTotal: { fontSize: 15, fontWeight: "800" },
  changeSchoolBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
  },
  changeSchoolText: { fontSize: 14 },
});
