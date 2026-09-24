/**
 * Menu — a genuine browse surface for the operator's full menu.
 * Dietary filter chips, photo-forward item cards, and an item detail
 * sheet. Tapping "order" routes to date selection.
 */

import { useState, useMemo } from "react";
import {
  View,
  Text,
  SectionList,
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
import { computeLineTotalCents } from "../../lib/pricing";
import type { MenuItem } from "../../lib/types";
import { useTheme } from "../../lib/theme";
import { FoodImage } from "../../components/FoodImage";
import { Screen, Card, Eyebrow, Tag, PrimaryButton, EmptyState } from "../../components/ui";

const DIETARY_LABEL: Record<string, string> = {
  halal: "Halal",
  vegetarian: "Vegetarian",
  vegan: "Vegan",
  "gluten-free": "Gluten-free",
  dairy_free: "Dairy-free",
  nut_free: "Nut-free",
  spicy: "Spicy",
};

const labelFor = (tag: string) => DIETARY_LABEL[tag] ?? tag;

export default function MenuScreen() {
  const router = useRouter();
  const theme = useTheme();
  const s = styles(theme);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [filter, setFilter] = useState<string | null>(null);

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["menu"],
    queryFn: fetchMenu,
  });

  const allTags = useMemo(() => {
    const set = new Set<string>();
    data?.categories.forEach((c) => c.items.forEach((it) => (it.dietaryTags ?? []).forEach((t) => set.add(t))));
    return [...set];
  }, [data]);

  const sections = useMemo(() => {
    return (data?.categories ?? [])
      .map((c) => ({
        title: c.title,
        data: filter ? c.items.filter((it) => (it.dietaryTags ?? []).includes(filter)) : c.items,
      }))
      .filter((sec) => sec.data.length > 0);
  }, [data, filter]);

  if (isLoading) {
    return (
      <Screen>
        <View style={s.center}>
          <ActivityIndicator color={theme.primary} size="large" />
        </View>
      </Screen>
    );
  }

  if (isError || !data) {
    return (
      <Screen>
        <SafeAreaView style={{ flex: 1 }}>
          <EmptyState
            icon="cloud-offline-outline"
            title="Couldn't load the menu"
            message="Check your connection and try again."
            actionLabel="Retry"
            onAction={() => refetch()}
          />
        </SafeAreaView>
      </Screen>
    );
  }

  const totalItems = data.categories.reduce((sum, c) => sum + c.items.length, 0);

  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={s.header}>
          <Text style={[s.title, { color: theme.textPrimary, fontFamily: theme.fontDisplay }]}>Menu</Text>
          <Text style={[s.sub, { color: theme.textMuted }]}>
            {data.restaurantName} · {totalItems} dish{totalItems === 1 ? "" : "es"}
          </Text>
        </View>

        {allTags.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.chipRow}
          >
            <FilterChip label="All" on={filter === null} onPress={() => setFilter(null)} />
            {allTags.map((t) => (
              <FilterChip
                key={t}
                label={labelFor(t)}
                on={filter === t}
                onPress={() => setFilter(filter === t ? null : t)}
              />
            ))}
          </ScrollView>
        ) : null}

        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={s.list}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.primary} />
          }
          ListEmptyComponent={
            <View style={{ paddingTop: 48 }}>
              <EmptyState
                icon="filter-outline"
                title="No matches"
                message="No dishes match that filter. Try another."
              />
            </View>
          }
          renderSectionHeader={({ section }) => (
            <View style={s.sectionHead}>
              <Text style={[s.sectionTitle, { color: theme.textPrimary, fontFamily: theme.fontDisplay }]}>
                {section.title}
              </Text>
              <Text style={[s.sectionCount, { color: theme.textMuted }]}>{section.data.length}</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setSelectedItem(item)}
              accessibilityRole="button"
              accessibilityLabel={`${item.name}, ${formatPrice(computeLineTotalCents(item))}`}
            >
              <Card style={s.itemCard}>
                <FoodImage uri={item.imageUrl} seed={item.id} size={66} radius={12} />
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={s.itemTitleRow}>
                    <Text style={[s.itemName, { color: theme.textPrimary }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={[s.itemPrice, { color: theme.primary }]}>
                      {formatPrice(computeLineTotalCents(item))}
                    </Text>
                  </View>
                  {item.description ? (
                    <Text style={[s.itemDesc, { color: theme.textSecondary }]} numberOfLines={2}>
                      {item.description}
                    </Text>
                  ) : null}
                  {item.dietaryTags && item.dietaryTags.length > 0 ? (
                    <View style={s.tagRow}>
                      {item.dietaryTags.slice(0, 3).map((t) => (
                        <Tag key={t} label={labelFor(t)} />
                      ))}
                    </View>
                  ) : null}
                </View>
              </Card>
            </TouchableOpacity>
          )}
        />
      </SafeAreaView>

      {selectedItem ? (
        <ItemDetailModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onOrder={() => {
            const item = selectedItem;
            setSelectedItem(null);
            router.push({ pathname: "/(app)", params: { preselectedItemId: item.id } });
          }}
        />
      ) : null}
    </Screen>
  );
}

function FilterChip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 99,
        borderWidth: 1,
        backgroundColor: on ? theme.primary : theme.surface,
        borderColor: on ? theme.primary : theme.border,
      }}
    >
      <Text style={{ fontSize: 12.5, fontWeight: "600", color: on ? theme.textOnPrimary : theme.textPrimary }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

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
  const m = modalStyles(theme);
  const addOns = item.options.filter((o) => o.optionType === "ADD_ON" || o.optionType === "ADD");

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[m.container, { backgroundColor: theme.dark }]}>
        <View style={m.handleRow}>
          <View style={{ width: 32 }} />
          <View style={[m.grabber, { backgroundColor: theme.border }]} />
          <TouchableOpacity onPress={onClose} accessibilityLabel="Close" hitSlop={8} style={{ width: 32, alignItems: "flex-end" }}>
            <Ionicons name="close" size={22} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={m.scroll}>
          <FoodImage uri={item.imageUrl} seed={item.id} radius={18} style={m.image} />

          <View style={m.titleRow}>
            <Text style={[m.name, { color: theme.textPrimary, fontFamily: theme.fontDisplay }]}>
              {item.name}
            </Text>
            <Text style={[m.price, { color: theme.primary }]}>{formatPrice(computeLineTotalCents(item))}</Text>
          </View>

          {item.description ? (
            <Text style={[m.description, { color: theme.textSecondary }]}>{item.description}</Text>
          ) : null}

          {item.dietaryTags && item.dietaryTags.length > 0 ? (
            <View style={m.tagRow}>
              {item.dietaryTags.map((t) => (
                <Tag key={t} label={labelFor(t)} />
              ))}
            </View>
          ) : null}

          {addOns.length > 0 ? (
            <View style={m.section}>
              <Eyebrow>Available add-ons</Eyebrow>
              {addOns.map((o) => (
                <View key={o.id} style={m.optionRow}>
                  <Text style={[m.optionName, { color: theme.textSecondary }]}>{o.name}</Text>
                  {o.priceDeltaCents > 0 ? (
                    <Text style={[m.optionPrice, { color: theme.textMuted }]}>
                      +{formatPrice(o.priceDeltaCents)}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>

        <SafeAreaView style={[m.footer, { backgroundColor: theme.dark, borderTopColor: theme.border }]}>
          <PrimaryButton label="Choose a date to order" icon="calendar-outline" onPress={onOrder} />
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6 },
    title: { fontSize: 25, fontWeight: "600", letterSpacing: -0.5 },
    sub: { fontSize: 13, marginTop: 1 },
    chipRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
    list: { paddingHorizontal: 16, paddingBottom: 24 },
    sectionHead: {
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "space-between",
      paddingTop: 18,
      paddingBottom: 8,
    },
    sectionTitle: { fontSize: 18, fontWeight: "600", letterSpacing: -0.3 },
    sectionCount: { fontSize: 12, fontWeight: "700" },
    itemCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 10, marginBottom: 8 },
    itemTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
    itemName: { fontSize: 14.5, fontWeight: "700", flex: 1 },
    itemPrice: { fontSize: 14, fontWeight: "700" },
    itemDesc: { fontSize: 12.5, lineHeight: 17 },
    tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 3 },
  });

const modalStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    container: { flex: 1 },
    handleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 8,
    },
    grabber: { width: 40, height: 4, borderRadius: 2 },
    scroll: { paddingHorizontal: 20, paddingBottom: 110, gap: 14 },
    image: { width: "100%", height: 240 },
    titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 12 },
    name: { fontSize: 23, fontWeight: "600", flex: 1, letterSpacing: -0.4 },
    price: { fontSize: 19, fontWeight: "800" },
    description: { fontSize: 15, lineHeight: 22 },
    tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
    section: { gap: 8, marginTop: 4 },
    optionRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
    optionName: { fontSize: 14 },
    optionPrice: { fontSize: 14 },
    footer: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6, borderTopWidth: 1 },
  });
