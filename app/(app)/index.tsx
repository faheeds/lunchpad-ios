/**
 * Home — the storefront.
 *
 * Reframed from a flat list of delivery dates into a personalized home
 * that answers, top to bottom: who am I feeding, when is the next
 * cutoff, the fastest way to handle the week, and what's coming up.
 */

import React, { useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  SafeAreaView,
  TextInput,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { fetchDeliveryDates, fetchAccount, fetchWeeklyPlans, fetchOrders, notifyMe } from "../../lib/api";
import { useTheme } from "../../lib/theme";
import {
  getCarouselPhotos,
  nextCarouselIndex,
  CAROUSEL_INTERVAL_MS,
  CAROUSEL_RESUME_DELAY_MS,
} from "../../lib/heroCarousel";
import { BrandMark } from "../../components/BrandMark";
import { FoodImage } from "../../components/FoodImage";
import {
  Screen,
  Card,
  SectionTitle,
  Eyebrow,
  Pill,
  PrimaryButton,
  EmptyState,
  Skeleton,
} from "../../components/ui";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function fmtLong(iso: string): string {
  const d = new Date(iso);
  return `${DAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function fmtCutoff(iso: string): string {
  const d = new Date(iso);
  let h = d.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const m = d.getMinutes().toString().padStart(2, "0");
  const time = `${h}:${m} ${ampm}`;
  // The card already shows the delivery date, but the cutoff is often a
  // different day (usually the evening before), so the time alone is
  // ambiguous. Add a relative day ("today"/"tomorrow") or a short date.
  const startOfDay = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayDiff = Math.round(
    (startOfDay(d) - startOfDay(new Date())) / 86_400_000,
  );
  if (dayDiff <= 0) return `${time} today`;
  if (dayDiff === 1) return `${time} tomorrow`;
  return `${time} ${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function hoursUntil(iso: string): number {
  return (new Date(iso).getTime() - Date.now()) / 3_600_000;
}

// TODO: respect AccessibilityInfo.isReduceMotionEnabled — pause auto-advance when enabled.
// No reduced-motion pattern exists in this codebase yet; treat as a follow-up.
function NextHeroCarousel({
  photos,
  seed,
  style,
}: {
  photos: string[];
  seed: string;
  style?: StyleProp<ViewStyle>;
}) {
  const [heroWidth, setHeroWidth] = useState(0);
  const [activeIdx, setActiveIdx] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resumeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isUserScrollRef = useRef(false);

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (resumeRef.current) {
      clearTimeout(resumeRef.current);
      resumeRef.current = null;
    }
  }

  function startTimer() {
    stopTimer();
    if (photos.length <= 1 || heroWidth <= 0) return;
    timerRef.current = setInterval(() => {
      setActiveIdx((prev) => {
        const next = nextCarouselIndex(prev, photos.length);
        scrollRef.current?.scrollTo({ x: next * heroWidth, animated: true });
        return next;
      });
    }, CAROUSEL_INTERVAL_MS);
  }

  useEffect(() => {
    if (heroWidth > 0 && photos.length > 1) startTimer();
    return stopTimer;
  }, [heroWidth, photos.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (photos.length === 0) {
    return <FoodImage uri={undefined} seed={seed} style={style} radius={0} />;
  }

  if (photos.length === 1) {
    return <FoodImage uri={photos[0]} seed={seed} style={style} radius={0} />;
  }

  return (
    <View
      style={style}
      onLayout={(e) => setHeroWidth(e.nativeEvent.layout.width)}
    >
      {heroWidth > 0 ? (
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScrollBeginDrag={() => {
            isUserScrollRef.current = true;
            stopTimer();
          }}
          onMomentumScrollEnd={(e) => {
            const idx = Math.round(e.nativeEvent.contentOffset.x / heroWidth);
            setActiveIdx(idx);
            if (isUserScrollRef.current) {
              isUserScrollRef.current = false;
              resumeRef.current = setTimeout(startTimer, CAROUSEL_RESUME_DELAY_MS);
            }
          }}
        >
          {photos.map((uri, i) => (
            <Image
              key={i}
              source={{ uri }}
              style={{ width: heroWidth, height: 148 }}
              resizeMode="cover"
            />
          ))}
        </ScrollView>
      ) : null}
      <View style={carouselStyles.dots}>
        {photos.map((_, i) => (
          <View
            key={i}
            style={[
              carouselStyles.dot,
              i === activeIdx ? carouselStyles.dotActive : carouselStyles.dotMuted,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const carouselStyles = StyleSheet.create({
  dots: {
    position: "absolute",
    bottom: 8,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 5,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotActive: { backgroundColor: "rgba(255,255,255,0.95)" },
  dotMuted: { backgroundColor: "rgba(255,255,255,0.45)" },
});

function UpcomingDatesEmpty({ theme }: { theme: ReturnType<typeof useTheme> }) {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const restaurantId = theme.restaurant?.id;

  async function handleNotifyMe() {
    if (!restaurantId) {
      setError("Restaurant information not available");
      return;
    }

    if (!email.trim()) {
      setError("Please enter a valid email");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await notifyMe(restaurantId, email);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to subscribe");
    } finally {
      setIsSubmitting(false);
    }
  }

  const s = emptyStateStyles(theme);

  if (submitted) {
    return (
      <Card style={s.card}>
        <View style={s.successIcon}>
          <Ionicons name="checkmark-circle" size={40} color={theme.success} />
        </View>
        <Text style={[s.successTitle, { color: theme.textPrimary }]}>
          We'll email you when new dates are added
        </Text>
      </Card>
    );
  }

  return (
    <Card style={s.card}>
      <Ionicons name="calendar-outline" size={30} color={theme.textMuted} />
      <Text style={[s.title, { color: theme.textPrimary }]}>No dates open yet</Text>
      <Text style={[s.subtitle, { color: theme.textMuted }]}>
        New delivery dates are added regularly
      </Text>

      <View style={s.inputRow}>
        <TextInput
          placeholder="your@email.com"
          placeholderTextColor={theme.textMuted}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          editable={!isSubmitting}
          value={email}
          onChangeText={setEmail}
          accessibilityLabel="Email address"
          style={[s.input, { borderColor: theme.border, color: theme.textPrimary }]}
        />
        <PrimaryButton
          label="Notify me"
          onPress={handleNotifyMe}
          disabled={isSubmitting}
          loading={isSubmitting}
          style={s.button}
        />
      </View>

      {error ? (
        <Text style={[s.error, { color: theme.danger }]}>
          {error}
        </Text>
      ) : null}
    </Card>
  );
}

const emptyStateStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    card: { padding: 18, alignItems: "center", gap: 8 },
    title: { fontSize: 15, fontWeight: "700", marginTop: 4 },
    subtitle: { fontSize: 13, textAlign: "center", lineHeight: 18 },
    inputRow: { width: "100%", gap: 8, marginTop: 6 },
    input: {
      borderWidth: 1,
      borderRadius: 10,
      paddingVertical: 12,
      paddingHorizontal: 12,
      fontSize: 14,
    },
    button: { paddingVertical: 12, paddingHorizontal: 16 },
    error: { fontSize: 12, textAlign: "center", marginTop: 4 },
    successIcon: { alignItems: "center", marginBottom: 4 },
    successTitle: { fontSize: 15, fontWeight: "700", textAlign: "center", lineHeight: 20 },
  });

export default function HomeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { preselectedItemId } = useLocalSearchParams<{ preselectedItemId?: string }>();
  const s = styles(theme);

  const datesQ = useQuery({ queryKey: ["delivery-dates"], queryFn: fetchDeliveryDates });
  const accountQ = useQuery({ queryKey: ["account"], queryFn: fetchAccount, retry: false });
  const weeklyQ = useQuery({ queryKey: ["weekly-plans"], queryFn: fetchWeeklyPlans, retry: false });
  const ordersQ = useQuery({ queryKey: ["orders"], queryFn: fetchOrders, retry: false });

  const dates = datesQ.data ?? [];
  const nextDate = dates[0];
  const children = accountQ.data?.children ?? [];
  const firstName = accountQ.data?.name?.trim().split(/\s+/)[0];
  const restaurantName = theme.restaurant?.name;

  const weekDayCount = weeklyQ.data?.deliveryDates.length ?? 0;
  const weeklyDateIds = new Set((weeklyQ.data?.deliveryDates ?? []).map((d) => d.id));
  const orderedDayCount = (ordersQ.data ?? []).filter(
    (o) =>
      o.deliveryDateId != null &&
      weeklyDateIds.has(o.deliveryDateId) &&
      o.status !== "CANCELLED",
  ).length;
  const plannedCount = (weeklyQ.data?.plans.length ?? 0) + orderedDayCount;
  const weeklyProgress = weekDayCount > 0 ? Math.min(1, plannedCount / weekDayCount) : 0;

  function goToDate(id: string) {
    const params: { dateId: string; preselectedItemId?: string } = { dateId: id };
    if (preselectedItemId) params.preselectedItemId = preselectedItemId;
    router.push({ pathname: "/(app)/order/[dateId]", params });
  }

  function refreshAll() {
    datesQ.refetch();
    accountQ.refetch();
    weeklyQ.refetch();
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (datesQ.isLoading) {
    return (
      <Screen>
        <SafeAreaView style={{ flex: 1 }}>
          <View style={s.scroll}>
            <Skeleton width={150} height={30} />
            <Skeleton height={150} radius={18} style={{ marginTop: 8 }} />
            <Skeleton height={86} radius={18} />
            <Skeleton height={86} radius={18} />
          </View>
        </SafeAreaView>
      </Screen>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (datesQ.isError) {
    return (
      <Screen>
        <SafeAreaView style={{ flex: 1 }}>
          <EmptyState
            icon="cloud-offline-outline"
            title="Couldn't load lunches"
            message="Check your connection and try again."
            actionLabel="Retry"
            onAction={refreshAll}
          />
        </SafeAreaView>
      </Screen>
    );
  }

  const nextUrgent = nextDate ? hoursUntil(nextDate.cutoffAt) < 24 : false;
  const heroPhotos = nextDate ? getCarouselPhotos(nextDate.menuItems) : [];

  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={datesQ.isRefetching}
              onRefresh={refreshAll}
              tintColor={theme.primary}
            />
          }
        >
          {/* Greeting */}
          <View style={s.greetRow}>
            <View style={{ flex: 1 }}>
              <Text style={[s.greetSmall, { color: theme.textMuted }]}>{greeting()}</Text>
              <Text
                style={[s.greetBig, { color: theme.textPrimary, fontFamily: theme.fontDisplay }]}
                numberOfLines={1}
              >
                {firstName ? `Hi, ${firstName}` : restaurantName ?? "LunchPad"}
              </Text>
            </View>
            <BrandMark size={36} radius={10} />
          </View>

          {/* Next up */}
          {nextDate ? (
            <Card style={[s.nextCard, nextUrgent && { borderColor: theme.accent }]}>
              <NextHeroCarousel photos={heroPhotos} seed={nextDate.id} style={s.nextHero} />
              <View style={s.nextBody}>
                <View style={s.nextHead}>
                  <Eyebrow>Next lunch</Eyebrow>
                  {nextUrgent ? (
                    <Pill
                      label={`Cutoff in ${Math.max(1, Math.ceil(hoursUntil(nextDate.cutoffAt)))}h`}
                      tone="urgent"
                    />
                  ) : null}
                </View>
                <Text
                  style={[s.nextTitle, { color: theme.textPrimary, fontFamily: theme.fontDisplay }]}
                >
                  {fmtLong(nextDate.deliveryDate)}
                </Text>
                <Text style={[s.nextSub, { color: theme.textSecondary }]}>
                  {nextDate.school.name} · order by {fmtCutoff(nextDate.cutoffAt)}
                </Text>
                <PrimaryButton
                  label="Choose this day's lunch"
                  onPress={() => goToDate(nextDate.id)}
                  style={{ marginTop: 12 }}
                />
              </View>
            </Card>
          ) : null}

          {/* Your eaters */}
          {children.length > 0 ? (
            <View style={{ gap: 10 }}>
              <View style={s.sectionRow}>
                <SectionTitle>Your eaters</SectionTitle>
                <TouchableOpacity onPress={() => router.push("/(app)/account")}>
                  <Text style={[s.link, { color: theme.accent }]}>Manage</Text>
                </TouchableOpacity>
              </View>
              <View style={s.eaterRow}>
                {children.map((c) => (
                  <View key={c.id} style={s.eater}>
                    <View style={[s.avatar, { backgroundColor: theme.primary }]}>
                      <Text style={[s.avatarText, { color: theme.textOnPrimary }]}>
                        {c.studentName.trim()[0]?.toUpperCase() ?? "?"}
                      </Text>
                    </View>
                    <Text style={[s.eaterName, { color: theme.textPrimary }]} numberOfLines={1}>
                      {c.studentName.trim().split(/\s+/)[0]}
                    </Text>
                  </View>
                ))}
                <TouchableOpacity
                  style={s.eater}
                  onPress={() => router.push("/(app)/account")}
                  accessibilityLabel="Add an eater"
                  accessibilityRole="button"
                >
                  <View style={[s.avatarAdd, { borderColor: theme.border }]}>
                    <Ionicons name="add" size={20} color={theme.textMuted} />
                  </View>
                  <Text style={[s.eaterName, { color: theme.textMuted }]}>Add</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {/* Plan the week — permanent module */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.push("/(app)/weekly-plan")}
            accessibilityRole="button"
            accessibilityLabel="Plan the week"
          >
            <Card style={s.weeklyCard}>
              <View style={[s.weeklyIcon, { backgroundColor: theme.primary }]}>
                <Ionicons name="calendar-clear-outline" size={24} color={theme.textOnPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Eyebrow>Plan the week</Eyebrow>
                <Text style={[s.weeklyTitle, { color: theme.textPrimary }]}>
                  One checkout, every day sorted
                </Text>
                {weekDayCount > 0 ? (
                  <>
                    <View style={[s.track, { backgroundColor: theme.divider }]}>
                      <View
                        style={[
                          s.fill,
                          { backgroundColor: theme.primary, width: `${weeklyProgress * 100}%` },
                        ]}
                      />
                    </View>
                    <Text style={[s.weeklySub, { color: theme.textSecondary }]}>
                      {plannedCount} of {weekDayCount} day{weekDayCount === 1 ? "" : "s"} planned
                    </Text>
                  </>
                ) : (
                  <Text style={[s.weeklySub, { color: theme.textSecondary }]}>
                    Plan several days and pay for them together
                  </Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
            </Card>
          </TouchableOpacity>

          {/* Upcoming dates */}
          <SectionTitle>Upcoming dates</SectionTitle>
          {dates.length === 0 ? (
            <UpcomingDatesEmpty theme={theme} />
          ) : (
            dates.map((d) => (
              <TouchableOpacity
                key={d.id}
                activeOpacity={0.85}
                onPress={() => goToDate(d.id)}
                accessibilityRole="button"
                accessibilityLabel={`${fmtLong(d.deliveryDate)}, ${d.menuItems.length} dishes`}
              >
                <Card style={s.dateCard}>
                  <FoodImage uri={d.menuItems[0]?.imageUrl} seed={d.id} size={62} radius={13} />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={[s.dateTitle, { color: theme.textPrimary }]} numberOfLines={1}>
                      {fmtLong(d.deliveryDate)}
                    </Text>
                    <Text style={[s.dateSub, { color: theme.textMuted }]} numberOfLines={1}>
                      {d.school.name} · {d.menuItems.length} dish
                      {d.menuItems.length === 1 ? "" : "es"}
                    </Text>
                    <Pill
                      label={`Order by ${fmtCutoff(d.cutoffAt)}`}
                      tone={hoursUntil(d.cutoffAt) < 24 ? "urgent" : "neutral"}
                    />
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
                </Card>
              </TouchableOpacity>
            ))
          )}

          <View style={{ height: 8 }} />
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}

const styles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    scroll: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24, gap: 18 },

    greetRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    greetSmall: { fontSize: 13, fontWeight: "600" },
    greetBig: { fontSize: 26, fontWeight: "600", letterSpacing: -0.5, marginTop: 1 },

    nextCard: { overflow: "hidden" },
    nextHero: { width: "100%", height: 148 },
    nextBody: { padding: 16 },
    nextHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    nextTitle: { fontSize: 20, fontWeight: "600", letterSpacing: -0.3, marginTop: 8 },
    nextSub: { fontSize: 13.5, marginTop: 3 },

    sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
    link: { fontSize: 13, fontWeight: "600" },

    eaterRow: { flexDirection: "row", gap: 16 },
    eater: { alignItems: "center", gap: 6, width: 56 },
    avatar: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center" },
    avatarText: { fontSize: 19, fontWeight: "700", fontFamily: theme.fontDisplay },
    avatarAdd: {
      width: 50,
      height: 50,
      borderRadius: 25,
      borderWidth: 1.5,
      borderStyle: "dashed",
      alignItems: "center",
      justifyContent: "center",
    },
    eaterName: { fontSize: 11.5, fontWeight: "600" },

    weeklyCard: { flexDirection: "row", alignItems: "center", gap: 13, padding: 13 },
    weeklyIcon: { width: 46, height: 46, borderRadius: 13, alignItems: "center", justifyContent: "center" },
    weeklyTitle: { fontSize: 14.5, fontWeight: "700", marginTop: 2 },
    weeklySub: { fontSize: 12, marginTop: 6 },
    track: { height: 6, borderRadius: 99, marginTop: 9, overflow: "hidden" },
    fill: { height: 6, borderRadius: 99 },

    dateCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 10 },
    dateTitle: { fontSize: 15, fontWeight: "700" },
    dateSub: { fontSize: 12.5 },

    emptyTitle: { fontSize: 15, fontWeight: "700", marginTop: 2 },
    emptyMsg: { fontSize: 13, textAlign: "center", lineHeight: 19 },
  });
