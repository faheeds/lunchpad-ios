/**
 * Menu tab — browse the restaurant's full menu without committing to a
 * date. Lets curious customers see what's on offer before they have an
 * upcoming-delivery account or have placed any orders.
 *
 * Layout:
 *   - Header with restaurant brand + hero image (if uploaded)
 *   - Section list grouped by category
 *   - Item cards with image, name, description, price, dietary tags
 *   - Tap an item → modal with full description + "Order this item" CTA
 *     that takes the user to the home screen to pick a delivery date
 */

import { useState } from "react";
import {
  View,
  Text,
  SectionList,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  ScrollView,
  RefreshControl,
  SafeAreaView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { fetchMenu } from "../../lib/api";
import { formatPrice } from "../../lib/store";
import type { MenuItem } from "../../lib/types";
import { useTheme } from "../../lib/theme";
import { BrandMark } from "../../components/BrandMark";

const DIETARY_LABEL: Record<string, string> = {
  halal: "Halal",
  vegetarian: "Vegetarian",
  vegan: "Vegan",
  "gluten-free": "Gluten-free",
  dairy_free: "Dairy-free",
  nut_free: "Nut-free",
  spicy: "Spicy",
};

export default function MenuScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["menu"],
    queryFn: fetchMenu,
  });

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.dark }]}>
        <ActivityIndicator color={theme.primary} size="large" />
      </View>
    );
  }

  if (isError || !data) {
    return (
      <View style={[styles.center, { backgroundColor: theme.dark }]}>
        <Text style={[styles.errorText, { color: theme.danger }]}>
          Couldn&apos;t load the menu.
        </Text>
        <TouchableOpacity
          onPress={() => refetch()}
          style={[styles.retryBtn, { backgroundColor: theme.surface }]}
        >
          <Text style={[styles.retryText, { color: theme.primary }]}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // SectionList expects each section to expose its rows on `data`, not
  // `items` (the name we use on the wire). Adapt here once rather than
  // forking the server contract.
  const sections = data.categories.map((c) => ({ title: c.title, data: c.items }));
  const totalItems = data.categories.reduce((sum, s) => sum + s.items.length, 0);

  return (
    <View style={[styles.container, { backgroundColor: theme.dark }]}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={theme.primary}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            {/* Hero image — restaurant's uploaded photo with brand overlay.
                Falls back to a solid brand-color banner when no hero is set. */}
            <View style={[styles.heroWrap, { backgroundColor: theme.surface }]}>
              {theme.heroImageUrl ? (
                <Image
                  source={{ uri: theme.heroImageUrl }}
                  style={styles.heroImage}
                  resizeMode="cover"
                />
              ) : (
                <View
                  style={[styles.heroImage, { backgroundColor: theme.primary }]}
                />
              )}
              <View style={styles.heroOverlay} />
              <View style={styles.heroContent}>
                <BrandMark size={40} radius={10} />
                <Text
                  style={[
                    styles.heroTitle,
                    { color: "#ffffff", fontFamily: theme.fontDisplay },
                  ]}
                >
                  {data.restaurantName}
                </Text>
                <Text style={styles.heroSub}>
                  {totalItems} item{totalItems !== 1 ? "s" : ""} on the menu
                </Text>
              </View>
            </View>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={[styles.sectionHeader, { backgroundColor: theme.dark }]}>
            <Text
              style={[
                styles.sectionTitle,
                { color: theme.textPrimary, fontFamily: theme.fontDisplay },
              ]}
            >
              {section.title}
            </Text>
            <Text style={[styles.sectionCount, { color: theme.textMuted }]}>
              {section.data.length} item{section.data.length !== 1 ? "s" : ""}
            </Text>
          </View>
        )}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.itemCard, { backgroundColor: theme.surface }]}
            onPress={() => setSelectedItem(item)}
            activeOpacity={0.8}
            accessibilityLabel={`${item.name}, ${formatPrice(item.basePriceCents)}`}
            accessibilityRole="button"
          >
            {item.imageUrl ? (
              <Image source={{ uri: item.imageUrl }} style={styles.itemImage} />
            ) : (
              <View style={[styles.itemImage, { backgroundColor: theme.dark }]}>
                <Text style={{ fontSize: 24 }}>🍽️</Text>
              </View>
            )}
            <View style={styles.itemInfo}>
              {/* Name + price share row 1 — saves vertical space */}
              <View style={styles.itemTitleRow}>
                <Text
                  style={[styles.itemName, { color: theme.textPrimary }]}
                  numberOfLines={1}
                >
                  {item.name}
                </Text>
                <Text style={[styles.itemPrice, { color: theme.primary }]}>
                  {formatPrice(item.basePriceCents)}
                </Text>
              </View>
              {item.description && (
                <Text
                  style={[styles.itemDesc, { color: theme.textSecondary }]}
                  numberOfLines={2}
                >
                  {item.description}
                </Text>
              )}
              {item.dietaryTags && item.dietaryTags.length > 0 && (
                <View style={styles.tagRow}>
                  {item.dietaryTags.slice(0, 3).map((tag) => (
                    <View
                      key={tag}
                      style={[
                        styles.tag,
                        { backgroundColor: `${theme.primary}22`, borderColor: theme.primary },
                      ]}
                    >
                      <Text style={[styles.tagText, { color: theme.primary }]}>
                        {DIETARY_LABEL[tag] ?? tag}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </TouchableOpacity>
        )}
        stickySectionHeadersEnabled
      />

      {selectedItem && (
        <ItemDetailModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onOrder={() => {
            setSelectedItem(null);
            // Send the customer to the home screen to pick a delivery date.
            // We don't preselect the item — once a date is chosen, the user
            // adds it like any other item. Could deep-link later if needed.
            router.push("/(app)");
          }}
        />
      )}
    </View>
  );
}

// ── Item detail modal ─────────────────────────────────────────────────────────

function ItemDetailModal({
  item,
  onClose,
  onOrder,
}: {
  item: MenuItem;
  onClose: () => void;
  onOrder: () => void;
}) {
  const theme = useTheme();

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[modalStyles.container, { backgroundColor: theme.dark }]}>
        <View style={modalStyles.handleRow}>
          <View style={[modalStyles.handle, { backgroundColor: theme.surfaceElevated }]} />
          <TouchableOpacity
            onPress={onClose}
            style={modalStyles.closeBtn}
            accessibilityLabel="Close menu item details"
          >
            <Ionicons name="close" size={20} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={modalStyles.scroll}>
          {item.imageUrl ? (
            <Image source={{ uri: item.imageUrl }} style={modalStyles.image} />
          ) : (
            <View
              style={[
                modalStyles.image,
                { backgroundColor: theme.surface, alignItems: "center", justifyContent: "center" },
              ]}
            >
              <Text style={{ fontSize: 64 }}>🍽️</Text>
            </View>
          )}

          <View style={modalStyles.body}>
            <View style={modalStyles.titleRow}>
              <Text
                style={[
                  modalStyles.name,
                  { color: theme.textPrimary, fontFamily: theme.fontDisplay },
                ]}
              >
                {item.name}
              </Text>
              <Text style={[modalStyles.price, { color: theme.primary }]}>
                {formatPrice(item.basePriceCents)}
              </Text>
            </View>

            {item.description && (
              <Text style={[modalStyles.description, { color: theme.textSecondary }]}>
                {item.description}
              </Text>
            )}

            {/* Dietary chips */}
            {item.dietaryTags && item.dietaryTags.length > 0 && (
              <View style={modalStyles.chipRow}>
                {item.dietaryTags.map((tag) => (
                  <View
                    key={tag}
                    style={[
                      modalStyles.chip,
                      { backgroundColor: theme.surface, borderColor: theme.primary },
                    ]}
                  >
                    <Text style={[modalStyles.chipText, { color: theme.primary }]}>
                      {DIETARY_LABEL[tag] ?? tag}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Add-ons preview */}
            {item.options.some((o) => o.optionType === "ADD" || o.optionType === "ADD_ON") && (
              <View style={modalStyles.section}>
                <Text style={[modalStyles.sectionLabel, { color: theme.textMuted }]}>
                  Available add-ons
                </Text>
                {item.options
                  .filter((o) => o.optionType === "ADD" || o.optionType === "ADD_ON")
                  .map((o) => (
                    <View key={o.id} style={modalStyles.optionRow}>
                      <Text style={[modalStyles.optionName, { color: theme.textSecondary }]}>
                        + {o.name}
                      </Text>
                      {o.priceDeltaCents > 0 && (
                        <Text style={[modalStyles.optionPrice, { color: theme.textMuted }]}>
                          +{formatPrice(o.priceDeltaCents)}
                        </Text>
                      )}
                    </View>
                  ))}
              </View>
            )}
          </View>
        </ScrollView>

        <SafeAreaView style={modalStyles.footer}>
          <TouchableOpacity
            style={[modalStyles.orderButton, { backgroundColor: theme.primary }]}
            onPress={onOrder}
          >
            <Text
              style={[modalStyles.orderButtonText, { color: theme.textOnPrimary }]}
            >
              Pick a date to order
            </Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  errorText: { fontSize: 15 },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10 },
  retryText: { fontWeight: "600" },
  list: { paddingBottom: 32 },

  // Header / hero
  header: { paddingBottom: 8 },
  heroWrap: { height: 200, overflow: "hidden", position: "relative" },
  heroImage: { ...StyleSheet.absoluteFillObject },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  heroContent: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 18,
    gap: 6,
  },
  heroTitle: { fontSize: 28, fontWeight: "800", letterSpacing: -0.5, marginTop: 6 },
  heroSub: { fontSize: 13, color: "rgba(255,255,255,0.85)", fontWeight: "500" },

  // Section header
  sectionHeader: {
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  sectionTitle: { fontSize: 20, fontWeight: "800", letterSpacing: -0.3 },
  sectionCount: { fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.4 },

  // Item card — denser layout: smaller image, name & price on one row,
  // description + tags below. Halves the card height vs. the earlier design.
  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    overflow: "hidden",
  },
  itemImage: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  itemInfo: { flex: 1, paddingHorizontal: 12, paddingVertical: 10, gap: 3 },
  itemTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  itemName: { fontSize: 15, fontWeight: "700", flex: 1 },
  itemPrice: { fontSize: 14, fontWeight: "700" },
  itemDesc: { fontSize: 12, lineHeight: 16 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 2 },
  tag: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 100,
    borderWidth: 1,
  },
  tagText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.3 },
});

const modalStyles = StyleSheet.create({
  container: { flex: 1 },
  handleRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    alignItems: "center",
  },
  handle: {
    position: "absolute",
    top: 8,
    left: "50%",
    marginLeft: -20,
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: { paddingBottom: 100 },
  image: {
    width: "100%",
    aspectRatio: 1,
    maxHeight: 360,
  },
  body: { padding: 20, gap: 14 },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 12,
  },
  name: { fontSize: 24, fontWeight: "800", flex: 1, letterSpacing: -0.4 },
  price: { fontSize: 20, fontWeight: "800" },
  description: { fontSize: 14, lineHeight: 21 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 100, borderWidth: 1 },
  chipText: { fontSize: 12, fontWeight: "600" },
  section: { gap: 8, marginTop: 6 },
  sectionLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  optionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  optionName: { fontSize: 13 },
  optionPrice: { fontSize: 12 },
  footer: { paddingHorizontal: 16, paddingBottom: 4, paddingTop: 8 },
  orderButton: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  orderButtonText: { fontSize: 15, fontWeight: "700" },
});
