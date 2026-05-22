/**
 * Menu screen — shows all items for a delivery date.
 * Tap an item to add it to the cart.
 */

import { useState, useEffect } from "react";
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

  const mModalStyles = modalStyles(theme);

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
      <View style={[mModalStyles.container, { backgroundColor: theme.dark }]}>
        {/* Handle + close */}
        <View style={mModalStyles.handleRow}>
          <View style={mModalStyles.handle} />
          <TouchableOpacity
            onPress={onClose}
            style={mModalStyles.closeBtn}
            accessibilityLabel="Close item details"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={20} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={mModalStyles.scroll}>
          {/* Image */}
          {item.imageUrl ? (
            <Image source={{ uri: item.imageUrl }} style={mModalStyles.image} />
          ) : (
            <View style={mModalStyles.imagePlaceholder}>
              <Text style={mModalStyles.imagePlaceholderText}>🍽️</Text>
            </View>
          )}

          {/* Name + price */}
          <View style={mModalStyles.titleRow}>
            <Text style={[mModalStyles.itemName, { color: theme.textPrimary }]}>{item.name}</Text>
            <Text style={[mModalStyles.itemPrice, { color: theme.primary }]}>{formatPrice(totalCents)}</Text>
          </View>

          {item.description && (
            <Text style={[mModalStyles.description, { color: theme.textSecondary }]}>{item.description}</Text>
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
            <View style={mModalStyles.section}>
              <View style={mModalStyles.sectionTitleRow}>
                <Text style={mModalStyles.sectionTitle}>
                  Size <Text style={mModalStyles.requiredMark}>· required</Text>
                </Text>
              </View>
              <View style={mModalStyles.choiceGrid}>
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
                        mModalStyles.choiceChip,
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
                          mModalStyles.choiceChipText,
                          { color: isSelected ? theme.textOnPrimary : theme.textPrimary },
                        ]}
                      >
                        {sz.name}
                      </Text>
                      <Text
                        style={[
                          mModalStyles.sizePrice,
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
            <View style={mModalStyles.section}>
              <View style={mModalStyles.sectionTitleRow}>
                <Text style={mModalStyles.sectionTitle}>
                  Pick one <Text style={mModalStyles.requiredMark}>· required</Text>
                </Text>
              </View>
              <View style={mModalStyles.choiceGrid}>
                {requiredChoices.map((name) => {
                  const isSelected = selectedChoice === name;
                  return (
                    <TouchableOpacity
                      key={name}
                      onPress={() => pickChoice(name)}
                      style={[
                        mModalStyles.choiceChip,
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
                          mModalStyles.choiceChipText,
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
            <View style={mModalStyles.section}>
              <Text style={mModalStyles.sectionTitle}>Add-ons</Text>
              {additions.map((opt) => (
                <TouchableOpacity
                  key={opt.id}
                  style={mModalStyles.optionRow}
                  onPress={() => toggleAddition(opt.name)}
                >
                  <View style={[
                    mModalStyles.checkbox,
                    selectedAdditions.includes(opt.name) && mModalStyles.checkboxChecked,
                  ]}>
                    {selectedAdditions.includes(opt.name) && (
                      <Ionicons name="checkmark" size={14} color={theme.textOnPrimary} />
                    )}
                  </View>
                  <Text style={[mModalStyles.optionName, { color: theme.textPrimary }]}>{opt.name}</Text>
                  {opt.priceDeltaCents > 0 && (
                    <Text style={[mModalStyles.optionPrice, { color: theme.textSecondary }]}>
                      +{formatPrice(opt.priceDeltaCents)}
                    </Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Removals */}
          {removals.length > 0 && (
            <View style={mModalStyles.section}>
              <Text style={mModalStyles.sectionTitle}>Remove</Text>
              {removals.map((opt) => (
                <TouchableOpacity
                  key={opt.id}
                  style={mModalStyles.optionRow}
                  onPress={() => toggleRemoval(opt.name)}
                >
                  <View style={[
                    mModalStyles.checkbox,
                    selectedRemovals.includes(opt.name) && mModalStyles.checkboxChecked,
                  ]}>
                    {selectedRemovals.includes(opt.name) && (
                      <Ionicons name="checkmark" size={14} color={theme.textOnPrimary} />
                    )}
                  </View>
                  <Text style={[mModalStyles.optionName, { color: theme.textPrimary }]}>{opt.name}</Text>
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
        <SafeAreaView style={[mModalStyles.footer, { backgroundColor: theme.dark }]}>
          <TouchableOpacity
            style={[
              mModalStyles.addButton,
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
                mModalStyles.addButtonText,
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
  const cardStyles = styles(theme);
  return (
    <TouchableOpacity
      style={[
        cardStyles.menuCard,
        { backgroundColor: theme.surface },
        soldOut && cardStyles.menuCardSoldOut,
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
        <Image source={{ uri: item.imageUrl }} style={cardStyles.menuImage} />
      ) : (
        <View style={[cardStyles.menuImagePlaceholder, { backgroundColor: theme.dark }]}>
          <Text style={{ fontSize: 28 }}>🍽️</Text>
        </View>
      )}
      <View style={cardStyles.menuInfo}>
        <Text style={[cardStyles.menuName, { color: theme.textPrimary }]}>{item.name}</Text>
        {item.description && (
          <Text
            style={[cardStyles.menuDesc, { color: theme.textSecondary }]}
            numberOfLines={2}
          >
            {item.description}
          </Text>
        )}
        <Text style={[cardStyles.menuPrice, { color: theme.primary }]}>
          {formatPrice(item.basePriceCents)}
        </Text>
      </View>
      {soldOut ? (
        <View style={[cardStyles.soldOutBadge, { backgroundColor: theme.surfaceElevated }]}>
          <Text style={[cardStyles.soldOutText, { color: theme.textSecondary }]}>Sold out</Text>
        </View>
      ) : inCart ? (
        <View style={cardStyles.inCartBadge}>
          <Ionicons name="checkmark-circle" size={24} color={theme.primary} />
        </View>
      ) : (
        <View style={cardStyles.addIcon}>
          <Ionicons name="add-circle-outline" size={24} color={theme.textMuted} />
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── Screen ───────────────────────────────────────────────────────────────────

export default function OrderScreen() {
  const { dateId, preselectedItemId } = useLocalSearchParams<{ dateId: string; preselectedItemId?: string }>();
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

  // Auto-select item if preselectedItemId is provided
  useEffect(() => {
    if (preselectedItemId && deliveryDate && !selectedItem) {
      const item = deliveryDate.menuItems.find((i) => i.id === preselectedItemId);
      if (item) {
        setSelectedItem(item);
      }
    }
  }, [preselectedItemId, deliveryDate, selectedItem]);

  if (isLoading || !deliveryDate) {
    return (
      <View style={[styles(theme).center, { backgroundColor: theme.dark }]}>
        <Text style={[styles(theme).loadingText, { color: theme.textMuted }]}>Loading menu…</Text>
      </View>
    );
  }

  const soldOutSet = new Set(deliveryDate.soldOut);
  const screenStyles = styles(theme);

  return (
    <View style={[screenStyles.container, { backgroundColor: theme.dark }]}>
      {/* Header */}
      <SafeAreaView>
        <View style={screenStyles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={screenStyles.backBtn}
            accessibilityLabel="Back to delivery dates"
            accessibilityRole="button"
          >
            <Ionicons name="chevron-back" size={24} color={theme.textPrimary} />
          </TouchableOpacity>
          <View style={screenStyles.headerText}>
            <Text
              style={[
                screenStyles.headerDate,
                { color: theme.textPrimary },
              ]}
            >
              {formatDateLong(deliveryDate.deliveryDate)}
            </Text>
            <Text style={[screenStyles.headerSchool, { color: theme.textMuted }]}>
              {deliveryDate.school.name}
            </Text>
          </View>
        </View>
      </SafeAreaView>

      {/* Menu list */}
      <FlatList
        data={deliveryDate.menuItems}
        keyExtractor={(i) => i.id}
        contentContainerStyle={screenStyles.list}
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
        <SafeAreaView style={screenStyles.cartBarWrapper}>
          <TouchableOpacity
            style={[screenStyles.cartBar, { backgroundColor: theme.primary }]}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              router.push("/(app)/cart");
            }}
            accessibilityLabel={`View cart with ${cartCount} items, ${formatPrice(cartTotal)}`}
            accessibilityRole="button"
          >
            <View style={[screenStyles.cartBadge, { backgroundColor: theme.dark }]}>
              <Text style={[screenStyles.cartBadgeText, { color: theme.primary }]}>
                {cartCount}
              </Text>
            </View>
            <Text style={[screenStyles.cartBarText, { color: theme.textOnPrimary }]}>View cart</Text>
            <Text style={[screenStyles.cartBarPrice, { color: theme.textOnPrimary }]}>
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

const styles = (theme: any) => StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { color: theme.textMuted, fontSize: 15 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerText: { flex: 1 },
  headerDate: { fontSize: 18, fontWeight: "700", fontFamily: theme.fontDisplay },
  headerSchool: { fontSize: 13, color: theme.textMuted, marginTop: 1 },
  list: { paddingHorizontal: 16, paddingBottom: 100, gap: 10 },
  menuCard: {
    backgroundColor: theme.surface,
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
    backgroundColor: theme.dark,
    alignItems: "center",
    justifyContent: "center",
  },
  menuInfo: { flex: 1, padding: 12, gap: 3 },
  menuName: { fontSize: 15, fontWeight: "700" },
  menuDesc: { fontSize: 12, lineHeight: 16 },
  menuPrice: { fontSize: 14, fontWeight: "600", marginTop: 2 },
  soldOutBadge: {
    marginRight: 14,
    backgroundColor: theme.surfaceElevated,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  soldOutText: { fontSize: 11, fontWeight: "600" },
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
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  cartBadge: {
    borderRadius: 10,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  cartBadgeText: { fontSize: 12, fontWeight: "800" },
  cartBarText: { flex: 1, fontSize: 16, fontWeight: "700" },
  cartBarPrice: { fontSize: 16, fontWeight: "700" },
});

const modalStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1 },
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
    backgroundColor: theme.border,
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
    backgroundColor: theme.surface,
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
  itemName: { flex: 1, fontSize: 22, fontWeight: "800", fontFamily: theme.fontDisplay },
  itemPrice: { fontSize: 20, fontWeight: "700" },
  description: { fontSize: 15, lineHeight: 20 },
  section: { gap: 8 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.textMuted,
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
    color: theme.accent,
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
    fontSize: 15,
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
    borderBottomColor: theme.border,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: theme.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: { backgroundColor: theme.primary, borderColor: theme.primary },
  optionName: { flex: 1, fontSize: 15 },
  optionPrice: { fontSize: 14, color: theme.textSecondary },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  addButton: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
  },
  addButtonText: { fontSize: 17, fontWeight: "700" },
});
