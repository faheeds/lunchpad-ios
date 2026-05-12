/**
 * Menu screen — shows all items for a delivery date.
 * Tap an item to add it to the cart.
 */

import { useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  Modal,
  ScrollView,
  SafeAreaView,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { fetchDeliveryDates } from "../../../lib/api";
import { useCart, formatPrice } from "../../../lib/store";
import type { MenuItem, DeliveryDateWithMenu } from "../../../lib/types";
import { useTheme } from "../../../lib/theme";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function formatDateLong(iso: string) {
  const d = new Date(iso);
  return `${DAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

// ── Item detail modal ────────────────────────────────────────────────────────

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
  const addItem = useCart((s) => s.addItem);
  const cartItems = useCart((s) => s.items);
  const inCart = cartItems.some((i) => i.menuItemId === item.id);

  // Required-choice picker state. When `item.requiredChoices` is non-empty,
  // the customer MUST pick one before "Add to cart" enables. The backend
  // validates this against MenuItem.requiredChoices and rejects checkout
  // if missing, so blocking client-side is purely UX — the underlying
  // safety is server-enforced.
  const requiredChoices = item.requiredChoices ?? [];
  const hasRequiredChoice = requiredChoices.length > 0;
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);

  // Size picker state. Same gating logic as required-choices, but the
  // picked size's priceCents drives the line total (replaces basePriceCents).
  // Auto-select the first size when the modal opens so the customer sees
  // a populated price right away — they can change it before adding.
  const sizes = item.sizes ?? [];
  const hasSize = sizes.length > 0;
  const [selectedSize, setSelectedSize] = useState<string | null>(
    sizes.length > 0 ? sizes[0].name : null,
  );

  const [selectedAdditions, setSelectedAdditions] = useState<string[]>([]);
  const [selectedRemovals, setSelectedRemovals] = useState<string[]>([]);

  // Backend enum values are "ADD_ON" and "REMOVAL". We also match the
  // shorter "ADD" / "REMOVE" forms defensively in case future API
  // responses use a different convention — same pattern as menu.tsx
  // and weekly-plan.tsx already do.
  const additions = item.options.filter((o) => o.optionType === "ADD_ON" || o.optionType === "ADD");
  const removals = item.options.filter((o) => o.optionType === "REMOVAL" || o.optionType === "REMOVE");

  const extraCents = additions
    .filter((o) => selectedAdditions.includes(o.name))
    .reduce((s, o) => s + o.priceDeltaCents, 0);

  // Resolve per-unit base: size price overrides basePriceCents when a
  // size is in play. Falls back to the first size if state hasn't
  // initialized (defensive — useState initializer should beat this).
  const resolvedBaseCents = hasSize
    ? (sizes.find((s) => s.name === selectedSize) ?? sizes[0]).priceCents
    : item.basePriceCents;
  const totalCents = resolvedBaseCents + extraCents;

  // Gate "Add to cart": both required-choice and size must be resolved.
  const canAddToCart = (!hasRequiredChoice || selectedChoice !== null) && (!hasSize || selectedSize !== null);

  function toggleAddition(name: string) {
    setSelectedAdditions((prev) =>
      prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]
    );
  }

  function toggleRemoval(name: string) {
    setSelectedRemovals((prev) =>
      prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]
    );
  }

  function pickChoice(name: string) {
    // Toggle off if re-tapped so the customer can clear their selection
    // and re-evaluate — feels less sticky than radio buttons.
    setSelectedChoice((prev) => (prev === name ? null : name));
    // Light tap so a quick scroll-through-and-pick feels responsive
    // without being too loud.
    Haptics.selectionAsync().catch(() => {});
  }

  function handleAddToCart() {
    if (!canAddToCart) {
      // Belt-and-braces — the disabled state on the button already
      // prevents this, but if a future change wires onPress without
      // disabled checks we still get a useful nudge instead of a silent
      // failure at checkout.
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
    }
    // Haptic confirmation — feels native and is invaluable when stacking
    // multiple items quickly. The store bumps quantity if this exact
    // configuration is already in the cart, otherwise adds a new line.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    addItem(
      {
        menuItemId: item.id,
        itemName: item.name,
        // Snapshot the RESOLVED base (size price when sized, else
        // item.basePriceCents) so cart math and on-screen line totals
        // agree with what we'll send to checkout.
        basePriceCents: resolvedBaseCents,
        choice: selectedChoice ?? undefined,
        size: selectedSize ?? undefined,
        additions: selectedAdditions,
        removals: selectedRemovals,
        lineTotalCents: totalCents,
      },
      deliveryDate.id,
      deliveryDate.schoolId
    );
    onClose();
  }

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[modalStyles.container, { backgroundColor: theme.dark }]}>
        {/* Handle + close */}
        <View style={modalStyles.handleRow}>
          <View style={modalStyles.handle} />
          <TouchableOpacity
            onPress={onClose}
            style={modalStyles.closeBtn}
            accessibilityLabel="Close item details"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={20} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={modalStyles.scroll}>
          {/* Image */}
          {item.imageUrl ? (
            <Image source={{ uri: item.imageUrl }} style={modalStyles.image} />
          ) : (
            <View style={modalStyles.imagePlaceholder}>
              <Text style={modalStyles.imagePlaceholderText}>🍽️</Text>
            </View>
          )}

          {/* Name + price */}
          <View style={modalStyles.titleRow}>
            <Text style={modalStyles.itemName}>{item.name}</Text>
            <Text style={modalStyles.itemPrice}>{formatPrice(totalCents)}</Text>
          </View>

          {item.description && (
            <Text style={modalStyles.description}>{item.description}</Text>
          )}

          {/* Required choice picker — rendered first so it visually
              gates the add-on section beneath. Each choice is a tappable
              chip; tapping the selected one again clears it. The "Add
              to cart" button stays disabled below until exactly one is
              picked. */}
          {/* Size picker — rendered first so the customer commits to size
              before customizing. Each chip shows the absolute price for
              that size so the customer can compare at a glance. Tapping
              re-selects (no clear-by-retap) since you always need exactly
              one when sizes exist. */}
          {hasSize && (
            <View style={modalStyles.section}>
              <View style={modalStyles.sectionTitleRow}>
                <Text style={modalStyles.sectionTitle}>
                  Size <Text style={modalStyles.requiredMark}>· required</Text>
                </Text>
              </View>
              <View style={modalStyles.choiceGrid}>
                {sizes.map((sz) => {
                  const isSelected = selectedSize === sz.name;
                  return (
                    <TouchableOpacity
                      key={sz.id}
                      onPress={() => {
                        setSelectedSize(sz.name);
                        Haptics.selectionAsync().catch(() => {});
                      }}
                      style={[
                        modalStyles.choiceChip,
                        {
                          backgroundColor: isSelected ? theme.primary : theme.surfaceElevated,
                          borderColor: isSelected ? theme.primary : theme.border,
                        },
                      ]}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: isSelected }}
                      accessibilityLabel={`${sz.name}, ${formatPrice(sz.priceCents)}${isSelected ? ", selected" : ""}`}
                    >
                      <Text
                        style={[
                          modalStyles.choiceChipText,
                          { color: isSelected ? theme.textOnPrimary : theme.textPrimary },
                        ]}
                      >
                        {sz.name}
                      </Text>
                      <Text
                        style={[
                          modalStyles.sizePrice,
                          { color: isSelected ? theme.textOnPrimary : theme.textSecondary },
                        ]}
                      >
                        {formatPrice(sz.priceCents)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {hasRequiredChoice && (
            <View style={modalStyles.section}>
              <View style={modalStyles.sectionTitleRow}>
                <Text style={modalStyles.sectionTitle}>
                  Pick one <Text style={modalStyles.requiredMark}>· required</Text>
                </Text>
              </View>
              <View style={modalStyles.choiceGrid}>
                {requiredChoices.map((name) => {
                  const isSelected = selectedChoice === name;
                  return (
                    <TouchableOpacity
                      key={name}
                      onPress={() => pickChoice(name)}
                      style={[
                        modalStyles.choiceChip,
                        {
                          backgroundColor: isSelected ? theme.primary : theme.surfaceElevated,
                          borderColor: isSelected ? theme.primary : theme.border,
                        },
                      ]}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: isSelected }}
                      accessibilityLabel={`${name}${isSelected ? ", selected" : ""}`}
                    >
                      <Text
                        style={[
                          modalStyles.choiceChipText,
                          { color: isSelected ? theme.textOnPrimary : theme.textPrimary },
                        ]}
                      >
                        {name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Additions */}
          {additions.length > 0 && (
            <View style={modalStyles.section}>
              <Text style={modalStyles.sectionTitle}>Add-ons</Text>
              {additions.map((opt) => (
                <TouchableOpacity
                  key={opt.id}
                  style={modalStyles.optionRow}
                  onPress={() => toggleAddition(opt.name)}
                >
                  <View style={[
                    modalStyles.checkbox,
                    selectedAdditions.includes(opt.name) && modalStyles.checkboxChecked,
                  ]}>
                    {selectedAdditions.includes(opt.name) && (
                      <Ionicons name="checkmark" size={14} color="#0f172a" />
                    )}
                  </View>
                  <Text style={modalStyles.optionName}>{opt.name}</Text>
                  {opt.priceDeltaCents > 0 && (
                    <Text style={modalStyles.optionPrice}>
                      +{formatPrice(opt.priceDeltaCents)}
                    </Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Removals */}
          {removals.length > 0 && (
            <View style={modalStyles.section}>
              <Text style={modalStyles.sectionTitle}>Remove</Text>
              {removals.map((opt) => (
                <TouchableOpacity
                  key={opt.id}
                  style={modalStyles.optionRow}
                  onPress={() => toggleRemoval(opt.name)}
                >
                  <View style={[
                    modalStyles.checkbox,
                    selectedRemovals.includes(opt.name) && modalStyles.checkboxChecked,
                  ]}>
                    {selectedRemovals.includes(opt.name) && (
                      <Ionicons name="checkmark" size={14} color="#0f172a" />
                    )}
                  </View>
                  <Text style={modalStyles.optionName}>{opt.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>

        {/* Add to cart — disabled until any required choice is picked.
            We keep the button visually present (so the user sees the
            price) but dim it and add an inline hint when it's gated.
            Tapping while disabled does nothing — the chip picker above
            is the call-to-action in that state. */}
        <SafeAreaView style={modalStyles.footer}>
          <TouchableOpacity
            style={[
              modalStyles.addButton,
              {
                backgroundColor: canAddToCart ? theme.primary : theme.surfaceElevated,
                opacity: canAddToCart ? 1 : 0.7,
              },
            ]}
            onPress={handleAddToCart}
            disabled={!canAddToCart}
            accessibilityState={{ disabled: !canAddToCart }}
            accessibilityHint={
              !canAddToCart ? "Pick a required option above to enable" : undefined
            }
          >
            <Text
              style={[
                modalStyles.addButtonText,
                { color: canAddToCart ? theme.textOnPrimary : theme.textMuted },
              ]}
            >
              {!canAddToCart
                ? "Pick a required option above"
                : `${inCart ? "Add another" : "Add to cart"} — ${formatPrice(totalCents)}`}
            </Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

// ── Menu item card ───────────────────────────────────────────────────────────

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
  return (
    <TouchableOpacity
      style={[
        styles.menuCard,
        { backgroundColor: theme.surface },
        soldOut && styles.menuCardSoldOut,
      ]}
      onPress={onPress}
      disabled={soldOut}
      activeOpacity={0.8}
      accessibilityLabel={`${item.name}, ${formatPrice(item.basePriceCents)}${
        soldOut ? ", sold out" : inCart ? ", in cart" : ""
      }`}
      accessibilityRole="button"
    >
      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={styles.menuImage} />
      ) : (
        <View style={[styles.menuImagePlaceholder, { backgroundColor: theme.dark }]}>
          <Text style={{ fontSize: 28 }}>🍽️</Text>
        </View>
      )}
      <View style={styles.menuInfo}>
        <Text style={[styles.menuName, { color: theme.textPrimary }]}>{item.name}</Text>
        {item.description && (
          <Text
            style={[styles.menuDesc, { color: theme.textSecondary }]}
            numberOfLines={2}
          >
            {item.description}
          </Text>
        )}
        <Text style={[styles.menuPrice, { color: theme.primary }]}>
          {formatPrice(item.basePriceCents)}
        </Text>
      </View>
      {soldOut ? (
        <View style={[styles.soldOutBadge, { backgroundColor: theme.surfaceElevated }]}>
          <Text style={[styles.soldOutText, { color: theme.textSecondary }]}>Sold out</Text>
        </View>
      ) : inCart ? (
        <View style={styles.inCartBadge}>
          <Ionicons name="checkmark-circle" size={24} color={theme.primary} />
        </View>
      ) : (
        <View style={styles.addIcon}>
          <Ionicons name="add-circle-outline" size={24} color={theme.textMuted} />
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── Screen ───────────────────────────────────────────────────────────────────

export default function OrderScreen() {
  const { dateId } = useLocalSearchParams<{ dateId: string }>();
  const router = useRouter();
  const theme = useTheme();
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const cartItems = useCart((s) => s.items);
  const cartCount = useCart((s) => s.count());
  const cartTotal = useCart((s) => s.total());

  const { data: allDates, isLoading } = useQuery({
    queryKey: ["delivery-dates"],
    queryFn: fetchDeliveryDates,
  });

  const deliveryDate = allDates?.find((d) => d.id === dateId);

  if (isLoading || !deliveryDate) {
    return (
      <View style={[styles.center, { backgroundColor: theme.dark }]}>
        <Text style={[styles.loadingText, { color: theme.textMuted }]}>Loading menu…</Text>
      </View>
    );
  }

  const soldOutSet = new Set(deliveryDate.soldOut);

  return (
    <View style={[styles.container, { backgroundColor: theme.dark }]}>
      {/* Header */}
      <SafeAreaView>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
            accessibilityLabel="Back to delivery dates"
            accessibilityRole="button"
          >
            <Ionicons name="chevron-back" size={24} color={theme.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text
              style={[
                styles.headerDate,
                { color: theme.textPrimary, fontFamily: theme.fontDisplay },
              ]}
            >
              {formatDateLong(deliveryDate.deliveryDate)}
            </Text>
            <Text style={[styles.headerSchool, { color: theme.textMuted }]}>
              {deliveryDate.school.name}
            </Text>
          </View>
        </View>
      </SafeAreaView>

      {/* Menu list */}
      <FlatList
        data={deliveryDate.menuItems}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <MenuItemCard
            item={item}
            soldOut={soldOutSet.has(item.id)}
            inCart={cartItems.some((c) => c.menuItemId === item.id)}
            onPress={() => setSelectedItem(item)}
          />
        )}
      />

      {/* Floating cart button */}
      {cartCount > 0 && (
        <SafeAreaView style={styles.cartBarWrapper}>
          <TouchableOpacity
            style={[styles.cartBar, { backgroundColor: theme.primary }]}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              router.push("/(app)/cart");
            }}
            accessibilityLabel={`View cart with ${cartCount} items, ${formatPrice(cartTotal)}`}
            accessibilityRole="button"
          >
            <View style={[styles.cartBadge, { backgroundColor: theme.dark }]}>
              <Text style={[styles.cartBadgeText, { color: theme.primary }]}>
                {cartCount}
              </Text>
            </View>
            <Text style={[styles.cartBarText, { color: theme.textOnPrimary }]}>View cart</Text>
            <Text style={[styles.cartBarPrice, { color: theme.textOnPrimary }]}>
              {formatPrice(cartTotal)}
            </Text>
          </TouchableOpacity>
        </SafeAreaView>
      )}

      {/* Item modal */}
      {selectedItem && (
        <ItemModal
          item={selectedItem}
          deliveryDate={deliveryDate}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  center: { flex: 1, backgroundColor: "#0f172a", alignItems: "center", justifyContent: "center" },
  loadingText: { color: "#64748b", fontSize: 15 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerText: { flex: 1 },
  headerDate: { fontSize: 18, fontWeight: "700", color: "#f1f5f9" },
  headerSchool: { fontSize: 13, color: "#64748b", marginTop: 1 },
  list: { paddingHorizontal: 16, paddingBottom: 100, gap: 10 },
  menuCard: {
    backgroundColor: "#1e293b",
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
  },
  menuCardSoldOut: { opacity: 0.45 },
  menuImage: { width: 80, height: 80 },
  menuImagePlaceholder: {
    width: 80,
    height: 80,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
  },
  menuInfo: { flex: 1, padding: 12, gap: 3 },
  menuName: { fontSize: 15, fontWeight: "700", color: "#f1f5f9" },
  menuDesc: { fontSize: 12, color: "#64748b", lineHeight: 16 },
  menuPrice: { fontSize: 14, fontWeight: "600", color: "#f59e0b", marginTop: 2 },
  soldOutBadge: {
    marginRight: 14,
    backgroundColor: "#334155",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  soldOutText: { fontSize: 11, color: "#64748b", fontWeight: "600" },
  inCartBadge: { marginRight: 14 },
  addIcon: { marginRight: 14 },
  cartBarWrapper: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  cartBar: {
    backgroundColor: "#f59e0b",
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  cartBadge: {
    backgroundColor: "#0f172a",
    borderRadius: 10,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  cartBadgeText: { fontSize: 12, fontWeight: "800", color: "#f59e0b" },
  cartBarText: { flex: 1, fontSize: 16, fontWeight: "700", color: "#0f172a" },
  cartBarPrice: { fontSize: 16, fontWeight: "700", color: "#0f172a" },
});

const modalStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f172a" },
  handleRow: {
    alignItems: "center",
    paddingTop: 12,
    paddingHorizontal: 16,
    flexDirection: "row",
    justifyContent: "center",
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: "#334155",
    borderRadius: 2,
    position: "absolute",
    top: 16,
  },
  closeBtn: {
    position: "absolute",
    right: 16,
    top: 8,
    padding: 8,
  },
  scroll: { paddingHorizontal: 20, paddingBottom: 24, gap: 16 },
  image: { width: "100%", height: 220, borderRadius: 16, marginTop: 16 },
  imagePlaceholder: {
    width: "100%",
    height: 160,
    backgroundColor: "#1e293b",
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
  imagePlaceholderText: { fontSize: 48 },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  itemName: { flex: 1, fontSize: 22, fontWeight: "800", color: "#f1f5f9" },
  itemPrice: { fontSize: 20, fontWeight: "700", color: "#f59e0b" },
  description: { fontSize: 14, color: "#94a3b8", lineHeight: 20 },
  section: { gap: 8 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  requiredMark: {
    color: "#f59e0b",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "none",
    letterSpacing: 0,
  },
  choiceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  choiceChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1.5,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  choiceChipText: {
    fontSize: 14,
    fontWeight: "600",
  },
  sizePrice: {
    fontSize: 13,
    fontWeight: "500",
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: { backgroundColor: "#f59e0b", borderColor: "#f59e0b" },
  optionName: { flex: 1, fontSize: 15, color: "#f1f5f9" },
  optionPrice: { fontSize: 14, color: "#64748b" },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    backgroundColor: "#0f172a",
    borderTopWidth: 1,
    borderTopColor: "#1e293b",
  },
  addButton: {
    backgroundColor: "#f59e0b",
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
  },
  addButtonText: { fontSize: 17, fontWeight: "700", color: "#0f172a" },
});
