/**
 * Home — list of open delivery dates grouped by school.
 * Tapping a date goes to the menu/order screen.
 */

import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { fetchDeliveryDates } from "../../lib/api";
import type { DeliveryDateWithMenu } from "../../lib/types";
import { useTheme } from "../../lib/theme";
import { BrandMark } from "../../components/BrandMark";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatDate(iso: string): { day: string; month: string; date: number } {
  const d = new Date(iso);
  return {
    day: DAYS[d.getUTCDay()],
    month: MONTHS[d.getUTCMonth()],
    date: d.getUTCDate(),
  };
}

function formatCutoff(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  const min = d.getMinutes().toString().padStart(2, "0");
  return `Order by ${hour}:${min} ${ampm}`;
}

function DeliveryDateCard({
  item,
  onPress,
}: {
  item: DeliveryDateWithMenu;
  onPress: () => void;
}) {
  const theme = useTheme();
  const { day, month, date } = formatDate(item.deliveryDate);
  const cutoff = formatCutoff(item.cutoffAt);
  const itemCount = item.menuItems.length;

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: theme.surface }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {/* Date block */}
      <View style={[styles.dateBlock, { backgroundColor: theme.dark }]}>
        <Text style={[styles.dateDay, { color: theme.primary }]}>{day}</Text>
        <Text style={[styles.dateNum, { color: theme.textPrimary }]}>{date}</Text>
        <Text style={[styles.dateMon, { color: theme.textMuted }]}>{month}</Text>
      </View>

      {/* Info */}
      <View style={styles.cardInfo}>
        <Text style={[styles.schoolName, { color: theme.textPrimary }]}>{item.school.name}</Text>
        <Text style={[styles.itemCount, { color: theme.textSecondary }]}>
          {itemCount} item{itemCount !== 1 ? "s" : ""} available
        </Text>
        <Text style={[styles.cutoff, { color: theme.primary }]}>{cutoff}</Text>
      </View>

      {/* Arrow */}
      <Text style={[styles.arrow, { color: theme.surfaceElevated }]}>›</Text>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const restaurantName = theme.restaurant?.name;
  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["delivery-dates"],
    queryFn: fetchDeliveryDates,
  });

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.dark }]}>
        <ActivityIndicator color={theme.primary} size="large" />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.center, { backgroundColor: theme.dark }]}>
        <Text style={[styles.errorText, { color: theme.danger }]}>Couldn't load dates.</Text>
        <TouchableOpacity
          onPress={() => refetch()}
          style={[styles.retryBtn, { backgroundColor: theme.surface }]}
        >
          <Text style={[styles.retryText, { color: theme.primary }]}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const dates = data ?? [];

  return (
    <View style={[styles.container, { backgroundColor: theme.dark }]}>
      <View style={styles.header}>
        {/* Restaurant branding row — logo + name. Always shows the
            BrandMark; falls back to LunchPad icon when no tenant logo. */}
        <View style={styles.brandRow}>
          <BrandMark size={28} radius={7} />
          <Text
            style={[styles.brandName, { color: theme.textPrimary, fontFamily: theme.fontDisplay }]}
            numberOfLines={1}
          >
            {restaurantName ?? "LunchPad"}
          </Text>
        </View>
        <Text
          style={[
            styles.headerTitle,
            { color: theme.textPrimary, fontFamily: theme.fontDisplay },
          ]}
        >
          Upcoming lunches
        </Text>
        <Text style={[styles.headerSub, { color: theme.textMuted }]}>
          {dates.length} date{dates.length !== 1 ? "s" : ""} open for ordering
        </Text>
      </View>

      {dates.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📭</Text>
          <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>
            No dates open yet
          </Text>
          <Text style={[styles.emptySub, { color: theme.textMuted }]}>
            Check back soon — new delivery dates are added regularly.
          </Text>
        </View>
      ) : (
        <FlatList
          data={dates}
          keyExtractor={(d) => d.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <DeliveryDateCard
              item={item}
              onPress={() =>
                router.push({
                  pathname: "/(app)/order/[dateId]",
                  params: { dateId: item.id },
                })
              }
            />
          )}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={theme.primary}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  center: {
    flex: 1,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  brandLogo: {
    width: 28,
    height: 28,
    borderRadius: 7,
  },
  brandName: {
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  brandNameNoLogo: {
    // No logo to anchor — bump weight slightly so the wordmark carries
    // the brand presence on its own.
    fontWeight: "800",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#f1f5f9",
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: 14,
    color: "#64748b",
    marginTop: 2,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 12,
  },
  card: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  dateBlock: {
    width: 52,
    alignItems: "center",
    backgroundColor: "#0f172a",
    borderRadius: 12,
    paddingVertical: 10,
    gap: 1,
  },
  dateDay: {
    fontSize: 11,
    fontWeight: "600",
    color: "#f59e0b",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  dateNum: {
    fontSize: 24,
    fontWeight: "800",
    color: "#f1f5f9",
    lineHeight: 28,
  },
  dateMon: {
    fontSize: 11,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  cardInfo: {
    flex: 1,
    gap: 3,
  },
  schoolName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#f1f5f9",
  },
  itemCount: {
    fontSize: 13,
    color: "#94a3b8",
  },
  cutoff: {
    fontSize: 12,
    color: "#f59e0b",
    fontWeight: "500",
    marginTop: 2,
  },
  arrow: {
    fontSize: 24,
    color: "#334155",
  },
  errorText: {
    color: "#f87171",
    fontSize: 15,
  },
  retryBtn: {
    backgroundColor: "#1e293b",
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryText: {
    color: "#f59e0b",
    fontWeight: "600",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize: 48,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#f1f5f9",
    textAlign: "center",
  },
  emptySub: {
    fontSize: 14,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 20,
  },
});
