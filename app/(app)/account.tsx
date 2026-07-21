/**
 * Account — profile, saved eaters, order history, and tenant switching.
 * Rebuilt on the editorial chassis with operator-neutral language.
 */

import { useState, useMemo } from "react";
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
import { fetchAccount, fetchOrders, fetchDeliveryDates, addChild, editChild, deleteChild, deleteAccount } from "../../lib/api";
import { signOut } from "../../lib/auth";
import { formatPrice } from "../../lib/store";
import { useTheme } from "../../lib/theme";
import { useRefreshTheme } from "../../lib/theme-context";
import { Screen, ScreenHeader, Card, Eyebrow, SectionTitle } from "../../components/ui";
import { diffChildForm, type ChildFormSnapshot } from "../../lib/childEdit";
import type { Child } from "../../lib/types";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${DAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export default function AccountScreen() {
  const router = useRouter();
  const theme = useTheme();
  const queryClient = useQueryClient();
  const refreshTheme = useRefreshTheme();
  const s = styles(theme);

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
  const { data: dates } = useQuery({ queryKey: ["delivery-dates"], queryFn: fetchDeliveryDates });

  const [showAddChild, setShowAddChild] = useState(false);
  const [childName, setChildName] = useState("");
  const [childGrade, setChildGrade] = useState("");
  const [childAllergy, setChildAllergy] = useState("");
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null);
  // When set, the eater form is in "edit" mode for this child; when null,
  // it's the standard "add" flow. The snapshot is what the fields looked
  // like at open-time so we can compute a minimal PATCH payload on save.
  const [editingChildId, setEditingChildId] = useState<string | null>(null);
  const [editSnapshot, setEditSnapshot] = useState<ChildFormSnapshot | null>(null);

  const schools = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; locationType?: "SCHOOL" | "OFFICE" }
    >();
    (dates ?? []).forEach((d) =>
      map.set(d.schoolId, {
        id: d.schoolId,
        name: d.school.name,
        locationType: d.school.locationType,
      }),
    );
    return [...map.values()];
  }, [dates]);
  const effectiveSchoolId = selectedSchoolId ?? (schools.length === 1 ? schools[0].id : null);
  const effectiveSchoolIsOffice =
    schools.find((sc) => sc.id === effectiveSchoolId)?.locationType === "OFFICE";

  function resetChildForm() {
    setShowAddChild(false);
    setChildName("");
    setChildGrade("");
    setChildAllergy("");
    setSelectedSchoolId(null);
    setEditingChildId(null);
    setEditSnapshot(null);
  }

  const addChildMutation = useMutation({
    mutationFn: () =>
      addChild({
        schoolId: effectiveSchoolId ?? "",
        studentName: childName.trim(),
        grade: childGrade.trim(),
        allergyNotes: childAllergy.trim() || undefined,
      }),
    onSuccess: () => {
      // Refresh both the account query AND the weekly-plans bundle — the
      // Weekly screen reads its eater list from weekly-plans, so without
      // this it keeps showing the stale "Add an eater first" empty state.
      queryClient.invalidateQueries({ queryKey: ["account"] });
      queryClient.invalidateQueries({ queryKey: ["weekly-plans"] });
      resetChildForm();
    },
  });

  const editChildMutation = useMutation({
    mutationFn: () => {
      if (!editingChildId || !editSnapshot) {
        throw new Error("No eater selected for edit");
      }
      const patch = diffChildForm(editSnapshot, {
        studentName: childName,
        grade: childGrade,
        allergyNotes: childAllergy,
      });
      return editChild(editingChildId, patch);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["account"] });
      queryClient.invalidateQueries({ queryKey: ["weekly-plans"] });
      resetChildForm();
    },
    onError: (err) => {
      Alert.alert(
        "Couldn’t save eater",
        err instanceof Error ? err.message : "Please try again.",
      );
    },
  });

  const deleteChildMutation = useMutation({
    mutationFn: (id: string) => deleteChild(id),
    onSuccess: () => {
      // Deleting a child cascades on the server to clear any active
      // weekly plans for that eater, so invalidate both caches.
      queryClient.invalidateQueries({ queryKey: ["account"] });
      queryClient.invalidateQueries({ queryKey: ["weekly-plans"] });
    },
    onError: (err) => {
      Alert.alert(
        "Couldn’t delete eater",
        err instanceof Error ? err.message : "Please try again.",
      );
    },
  });

  function openEditChild(child: Child) {
    const snapshot: ChildFormSnapshot = {
      studentName: child.studentName,
      grade: child.grade,
      allergyNotes: child.allergyNotes ?? "",
    };
    setEditingChildId(child.id);
    setEditSnapshot(snapshot);
    setChildName(snapshot.studentName);
    setChildGrade(snapshot.grade);
    setChildAllergy(snapshot.allergyNotes);
    setSelectedSchoolId(child.schoolId);
    setShowAddChild(true);
  }

  function confirmDeleteChild(child: Child) {
    Alert.alert(
      "Delete eater?",
      `Deleting ${child.studentName} will also remove any active weekly plan for them. This can’t be undone.`,
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteChildMutation.mutate(child.id),
        },
      ],
    );
  }

  function handleSignOut() {
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          await signOut();
          queryClient.clear();
          await refreshTheme();
          router.replace("/(auth)");
        },
      },
    ]);
  }

  function handleDeleteAccount() {
    Alert.alert(
      "Delete account?",
      "This permanently deletes your account, saved eaters, and weekly plans. Past orders are kept by the lunch provider as records but are no longer linked to you. This can\u2019t be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete account",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteAccount();
              await signOut();
              queryClient.clear();
              await refreshTheme();
              router.replace("/(auth)");
            } catch (err) {
              Alert.alert(
                "Couldn\u2019t delete account",
                err instanceof Error ? err.message : "Please try again.",
              );
            }
          },
        },
      ],
    );
  }

  const isEditingChild = editingChildId !== null;
  const editPatch = useMemo(() => {
    if (!isEditingChild || !editSnapshot) return null;
    return diffChildForm(editSnapshot, {
      studentName: childName,
      grade: childGrade,
      allergyNotes: childAllergy,
    });
  }, [isEditingChild, editSnapshot, childName, childGrade, childAllergy]);
  const editHasChanges = editPatch !== null && Object.keys(editPatch).length > 0;
  const savingChild = addChildMutation.isPending || editChildMutation.isPending;
  const canSaveChild = isEditingChild
    ? childName.trim().length >= 2 &&
      (effectiveSchoolIsOffice || !!childGrade.trim()) &&
      editHasChanges &&
      !savingChild
    : childName.trim().length >= 2 &&
      (effectiveSchoolIsOffice || !!childGrade.trim()) &&
      !!effectiveSchoolId &&
      !savingChild;

  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }}>
        <ScreenHeader
          title="Account"
          subtitle={theme.restaurant ? `Signed in to ${theme.restaurant.name}` : undefined}
          safeArea={false}
        />
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          {/* Profile */}
          <Card style={s.card}>
            {loadingAccount ? (
              <ActivityIndicator color={theme.primary} />
            ) : account ? (
              <>
                <View style={s.profileRow}>
                  <View style={[s.avatar, { backgroundColor: theme.primary }]}>
                    <Text style={[s.avatarText, { color: theme.textOnPrimary }]}>
                      {(account.name ?? account.email)[0]?.toUpperCase() ?? "?"}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.profileName, { color: theme.textPrimary }]}>
                      {account.name ?? "Your account"}
                    </Text>
                    <Text style={[s.profileEmail, { color: theme.textSecondary }]}>
                      {account.email}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={s.signOutBtn}
                  onPress={handleSignOut}
                  accessibilityRole="button"
                  accessibilityLabel="Sign out"
                >
                  <Ionicons name="log-out-outline" size={16} color={theme.danger} />
                  <Text style={[s.signOutText, { color: theme.danger }]}>Sign out</Text>
                </TouchableOpacity>
              </>
            ) : (
              <View style={{ gap: 8 }}>
                <Text style={[s.guestTitle, { color: theme.textPrimary }]}>Browsing as guest</Text>
                <Text style={[s.guestSub, { color: theme.textSecondary }]}>
                  Sign in to save eater profiles, plan the week, and see your order history.
                </Text>
                <TouchableOpacity
                  style={[s.guestBtn, { backgroundColor: theme.primary }]}
                  onPress={() => router.push("/(auth)/sign-in")}
                >
                  <Text style={[s.guestBtnText, { color: theme.textOnPrimary }]}>Sign in</Text>
                </TouchableOpacity>
              </View>
            )}
          </Card>

          {/* Saved eaters */}
          {account ? (
            <Card style={s.card}>
              <View style={s.sectionRow}>
                <SectionTitle>Saved eaters</SectionTitle>
                <TouchableOpacity
                  onPress={() => {
                    if (showAddChild) {
                      resetChildForm();
                    } else {
                      setShowAddChild(true);
                    }
                  }}
                  hitSlop={8}
                  accessibilityLabel={
                    showAddChild
                      ? isEditingChild
                        ? "Close edit eater form"
                        : "Close add eater form"
                      : "Add an eater"
                  }
                >
                  <Ionicons
                    name={showAddChild ? "chevron-up" : "add-circle-outline"}
                    size={22}
                    color={theme.accent}
                  />
                </TouchableOpacity>
              </View>

              {account.children.length === 0 && !showAddChild ? (
                <Text style={[s.muted, { color: theme.textSecondary }]}>
                  No eaters saved yet — add one to speed up checkout.
                </Text>
              ) : null}

              {account.children.map((child, i) => {
                const isDeleting =
                  deleteChildMutation.isPending &&
                  deleteChildMutation.variables === child.id;
                return (
                  <View
                    key={child.id}
                    style={[
                      s.childRow,
                      i < account.children.length - 1 && {
                        borderBottomWidth: 1,
                        borderBottomColor: theme.border,
                      },
                    ]}
                  >
                    <View style={[s.childAvatar, { backgroundColor: theme.dark }]}>
                      <Text style={[s.childAvatarText, { color: theme.primary }]}>
                        {child.studentName[0]?.toUpperCase() ?? "?"}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.childName, { color: theme.textPrimary }]}>
                        {child.studentName}
                      </Text>
                      <Text style={[s.childDetail, { color: theme.textSecondary }]}>
                        {child.locationType === "OFFICE"
                          ? child.schoolName
                          : `Grade ${child.grade} \u00b7 ${child.schoolName}`}
                      </Text>
                      {child.allergyNotes ? (
                        <View style={s.allergyRow}>
                          <Ionicons name="warning-outline" size={12} color={theme.accent} />
                          <Text style={[s.allergyText, { color: theme.accent }]}>
                            {child.allergyNotes}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={s.childActions}>
                      <TouchableOpacity
                        onPress={() => openEditChild(child)}
                        hitSlop={8}
                        disabled={isDeleting}
                        accessibilityRole="button"
                        accessibilityLabel={`Edit ${child.studentName}`}
                        style={s.childActionBtn}
                      >
                        <Ionicons name="pencil-outline" size={18} color={theme.textSecondary} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => confirmDeleteChild(child)}
                        hitSlop={8}
                        disabled={isDeleting}
                        accessibilityRole="button"
                        accessibilityLabel={`Delete ${child.studentName}`}
                        style={s.childActionBtn}
                      >
                        {isDeleting ? (
                          <ActivityIndicator size="small" color={theme.danger} />
                        ) : (
                          <Ionicons name="trash-outline" size={18} color={theme.danger} />
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}

              {showAddChild ? (
                <View style={[s.addForm, { borderTopColor: theme.border }]}>
                  <Eyebrow>{isEditingChild ? "Edit eater" : "Add an eater"}</Eyebrow>
                  {schools.length > 1 && !isEditingChild ? (
                    <View style={s.schoolChips}>
                      {schools.map((sc) => {
                        const on = effectiveSchoolId === sc.id;
                        return (
                          <TouchableOpacity
                            key={sc.id}
                            onPress={() => setSelectedSchoolId(sc.id)}
                            style={[
                              s.schoolChip,
                              {
                                backgroundColor: on ? theme.primary : theme.dark,
                                borderColor: on ? theme.primary : theme.border,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                s.schoolChipText,
                                { color: on ? theme.textOnPrimary : theme.textPrimary },
                              ]}
                            >
                              {sc.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : null}
                  <TextInput
                    style={s.input}
                    value={childName}
                    onChangeText={setChildName}
                    placeholder="Eater's name"
                    placeholderTextColor={theme.textMuted}
                    autoCapitalize="words"
                  />
                  {effectiveSchoolIsOffice ? null : (
                    <TextInput
                      style={s.input}
                      value={childGrade}
                      onChangeText={setChildGrade}
                      placeholder="Grade or group (e.g. 3rd)"
                      placeholderTextColor={theme.textMuted}
                    />
                  )}
                  <TextInput
                    style={s.input}
                    value={childAllergy}
                    onChangeText={setChildAllergy}
                    placeholder="Allergy notes (optional)"
                    placeholderTextColor={theme.textMuted}
                  />
                  <TouchableOpacity
                    style={[s.saveBtn, { backgroundColor: theme.primary }, !canSaveChild && { opacity: 0.45 }]}
                    onPress={() =>
                      isEditingChild
                        ? editChildMutation.mutate()
                        : addChildMutation.mutate()
                    }
                    disabled={!canSaveChild}
                  >
                    {savingChild ? (
                      <ActivityIndicator color={theme.textOnPrimary} />
                    ) : (
                      <Text style={[s.saveBtnText, { color: theme.textOnPrimary }]}>
                        {isEditingChild ? "Save changes" : "Save eater"}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              ) : null}
            </Card>
          ) : null}

          {/* Order history */}
          {account ? (
            <Card style={s.card}>
              <SectionTitle>Order history</SectionTitle>
              {loadingOrders ? (
                <ActivityIndicator color={theme.primary} />
              ) : !orders || orders.length === 0 ? (
                <Text style={[s.muted, { color: theme.textSecondary }]}>No orders yet.</Text>
              ) : (
                orders.map((order) => {
                  const statusColor =
                    order.status === "PAID"
                      ? theme.success
                      : order.status === "REFUNDED"
                        ? theme.danger
                        : order.status === "CANCELLED"
                          ? theme.textMuted
                          : theme.warning;
                  const statusLabel =
                    order.status === "PAID"
                      ? "Confirmed"
                      : order.status === "PENDING"
                        ? "Pending"
                        : order.status === "REFUNDED"
                          ? "Refunded"
                          : "Cancelled";
                  const itemSummary =
                    order.items.map((i) => i.name).slice(0, 2).join(", ") +
                    (order.items.length > 2 ? ` + ${order.items.length - 2} more` : "");
                  return (
                    <TouchableOpacity
                      key={order.id}
                      activeOpacity={0.7}
                      onPress={() => router.push(`/(app)/orders/${order.id}`)}
                      style={[s.orderCard, { backgroundColor: theme.dark }]}
                      accessibilityRole="button"
                      accessibilityLabel={`Order ${order.orderNumber.slice(-6)}`}
                    >
                      <View style={s.orderHead}>
                        <View style={[s.statusBadge, { backgroundColor: `${statusColor}22` }]}>
                          <Text style={[s.statusText, { color: statusColor }]}>{statusLabel}</Text>
                        </View>
                        <Text style={[s.orderTotal, { color: theme.textPrimary }]}>
                          {formatPrice(order.totalCents)}
                        </Text>
                      </View>
                      <Text style={[s.orderItems, { color: theme.textPrimary }]} numberOfLines={2}>
                        {itemSummary}
                      </Text>
                      <Text style={[s.orderMeta, { color: theme.textMuted }]}>
                        {fmtDate(order.deliveryDate)} · {order.schoolName} · #
                        {order.orderNumber.slice(-6)}
                      </Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </Card>
          ) : null}

          {/* Switch program */}
          <TouchableOpacity
            style={s.switchBtn}
            onPress={() => router.replace("/(auth)/connect")}
            accessibilityRole="button"
            accessibilityLabel="Switch lunch program"
          >
            <Ionicons name="swap-horizontal-outline" size={16} color={theme.textSecondary} />
            <Text style={[s.switchText, { color: theme.textSecondary }]}>Switch lunch program</Text>
          </TouchableOpacity>

          {/* Delete account - required by App Store guideline 5.1.1(v) */}
          {account ? (
            <TouchableOpacity
              style={s.switchBtn}
              onPress={handleDeleteAccount}
              accessibilityRole="button"
              accessibilityLabel="Delete account"
            >
              <Ionicons name="trash-outline" size={16} color={theme.danger} />
              <Text style={[s.switchText, { color: theme.danger }]}>Delete account</Text>
            </TouchableOpacity>
          ) : null}

          <View style={{ height: 24 }} />
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}

const styles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    scroll: { padding: 16, gap: 14 },
    card: { padding: 16, gap: 12 },

    profileRow: { flexDirection: "row", alignItems: "center", gap: 13 },
    avatar: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
    avatarText: { fontSize: 21, fontWeight: "700", fontFamily: theme.fontDisplay },
    profileName: { fontSize: 17, fontWeight: "700" },
    profileEmail: { fontSize: 13, marginTop: 1 },
    signOutBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 },
    signOutText: { fontSize: 14, fontWeight: "600" },

    guestTitle: { fontSize: 16, fontWeight: "700" },
    guestSub: { fontSize: 14, lineHeight: 20 },
    guestBtn: { borderRadius: 12, paddingVertical: 13, alignItems: "center", marginTop: 4 },
    guestBtnText: { fontSize: 15, fontWeight: "700" },

    sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    muted: { fontSize: 14, lineHeight: 20 },

    childRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 9 },
    childActions: { flexDirection: "row", alignItems: "center", gap: 6 },
    childActionBtn: { padding: 6 },
    childAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
    childAvatarText: { fontSize: 16, fontWeight: "700" },
    childName: { fontSize: 14.5, fontWeight: "700" },
    childDetail: { fontSize: 12.5, marginTop: 1 },
    allergyRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
    allergyText: { fontSize: 11.5, fontWeight: "700" },

    addForm: { gap: 10, borderTopWidth: 1, paddingTop: 12, marginTop: 2 },
    schoolChips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    schoolChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99, borderWidth: 1.5 },
    schoolChipText: { fontSize: 12.5, fontWeight: "600" },
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
    saveBtn: { borderRadius: 12, paddingVertical: 13, alignItems: "center" },
    saveBtnText: { fontSize: 15, fontWeight: "700" },

    orderCard: { borderRadius: 13, padding: 13, gap: 7, marginTop: 4 },
    orderHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    statusBadge: { borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3 },
    statusText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.3, textTransform: "uppercase" },
    orderTotal: { fontSize: 15, fontWeight: "800" },
    orderItems: { fontSize: 13.5, fontWeight: "600", lineHeight: 18 },
    orderMeta: { fontSize: 12, fontWeight: "500" },

    switchBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 12,
    },
    switchText: { fontSize: 14, fontWeight: "600" },
  });
