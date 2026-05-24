/**
 * UI chassis — shared primitives for the redesigned customer app.
 *
 * Every screen builds on these so spacing, type, color, and motion stay
 * consistent. All visuals are wired to lib/theme.ts (editorial palette +
 * the responsive `theme.type` scale) — screens should stop hardcoding
 * fontSize / colors and compose these instead.
 */

import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Animated,
  type ViewStyle,
  type StyleProp,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../lib/theme";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

// ── Screen ───────────────────────────────────────────────────────────────────
/** Full-bleed editorial-cream canvas. Root of every screen. */
export function Screen({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return <View style={[{ flex: 1, backgroundColor: theme.dark }, style]}>{children}</View>;
}

// ── ScreenHeader ─────────────────────────────────────────────────────────────
/** Consistent title block: optional eyebrow, Fraunces title, optional
 *  back affordance and right-side slot. Replaces the bespoke header each
 *  screen used to roll on its own. */
export function ScreenHeader({
  title,
  eyebrow,
  subtitle,
  onBack,
  right,
  safeArea = true,
}: {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  safeArea?: boolean;
}) {
  const theme = useTheme();
  const Wrap = safeArea ? SafeAreaView : View;
  return (
    <Wrap>
      <View style={h.row}>
        {onBack ? (
          <TouchableOpacity
            onPress={onBack}
            style={[h.back, { backgroundColor: theme.surface, borderColor: theme.border }]}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={22} color={theme.textPrimary} />
          </TouchableOpacity>
        ) : null}
        <View style={{ flex: 1 }}>
          {eyebrow ? (
            <Text style={[h.eyebrow, { color: theme.accent }]}>{eyebrow.toUpperCase()}</Text>
          ) : null}
          <Text
            style={[
              h.title,
              { color: theme.textPrimary, fontFamily: theme.fontDisplay, fontSize: theme.type.display.fontSize },
            ]}
            numberOfLines={1}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text style={[h.subtitle, { color: theme.textMuted }]} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right ?? null}
      </View>
    </Wrap>
  );
}

const h = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 10,
  },
  back: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: { fontSize: 11, fontWeight: "700", letterSpacing: 1.4 },
  title: { fontWeight: "600", letterSpacing: -0.5, marginTop: 1 },
  subtitle: { fontSize: 12.5, marginTop: 1 },
});

// ── Card ─────────────────────────────────────────────────────────────────────
export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        { backgroundColor: theme.surface, borderRadius: 18, borderWidth: 1, borderColor: theme.border },
        style,
      ]}
    >
      {children}
    </View>
  );
}

// ── SectionTitle ─────────────────────────────────────────────────────────────
export function SectionTitle({ children }: { children: string }) {
  const theme = useTheme();
  return (
    <Text
      style={{
        fontFamily: theme.fontDisplay,
        fontSize: theme.type.displaySmall.fontSize,
        fontWeight: "600",
        color: theme.textPrimary,
        letterSpacing: -0.2,
      }}
    >
      {children}
    </Text>
  );
}

// ── Eyebrow ──────────────────────────────────────────────────────────────────
export function Eyebrow({ children }: { children: string }) {
  const theme = useTheme();
  return (
    <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 1.4, color: theme.accent }}>
      {children.toUpperCase()}
    </Text>
  );
}

// ── Pill ─────────────────────────────────────────────────────────────────────
type Tone = "neutral" | "brand" | "urgent" | "success";

export function Pill({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  const theme = useTheme();
  const color =
    tone === "brand" ? theme.primary
    : tone === "urgent" ? theme.accent
    : tone === "success" ? theme.success
    : theme.textSecondary;
  return (
    <View style={[p.pill, { backgroundColor: `${color}1f` }]}>
      <Text style={[p.pillText, { color }]}>{label}</Text>
    </View>
  );
}

/** Small dietary / metadata tag — outlined, brand-tinted. */
export function Tag({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <View style={[p.tag, { backgroundColor: `${theme.primary}1a` }]}>
      <Text style={[p.tagText, { color: theme.primary }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

const p = StyleSheet.create({
  pill: { borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start" },
  pillText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.3 },
  tag: { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start" },
  tagText: { fontSize: 9.5, fontWeight: "700", letterSpacing: 0.4 },
});

// ── Buttons ──────────────────────────────────────────────────────────────────
export function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
  icon,
  tone = "brand",
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: IconName;
  tone?: "brand" | "accent";
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const bg = tone === "accent" ? theme.accent : theme.primary;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={[b.btn, { backgroundColor: bg }, (disabled || loading) && { opacity: 0.45 }, style]}
    >
      {loading ? (
        <ActivityIndicator color={theme.textOnPrimary} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={18} color={theme.textOnPrimary} /> : null}
          <Text style={[b.btnText, { color: theme.textOnPrimary }]}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

export function SecondaryButton({
  label,
  onPress,
  style,
}: {
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[b.secondary, style]}
    >
      <Text style={[b.secondaryText, { color: theme.textSecondary }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const b = StyleSheet.create({
  btn: {
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  btnText: { fontSize: 15, fontWeight: "700" },
  secondary: { paddingVertical: 12, alignItems: "center" },
  secondaryText: { fontSize: 14, fontWeight: "600" },
});

// ── EmptyState ───────────────────────────────────────────────────────────────
/** Branded empty state — an icon in a tinted circle, message, optional
 *  action. Replaces emoji placeholders (📭 🛒 👶) across the app. */
export function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  onAction,
}: {
  icon: IconName;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={e.wrap}>
      <View style={[e.circle, { backgroundColor: `${theme.primary}14` }]}>
        <Ionicons name={icon} size={34} color={theme.primary} />
      </View>
      <Text style={[e.title, { color: theme.textPrimary, fontFamily: theme.fontDisplay }]}>{title}</Text>
      {message ? <Text style={[e.message, { color: theme.textMuted }]}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <PrimaryButton label={actionLabel} onPress={onAction} style={{ marginTop: 8, paddingHorizontal: 28 }} />
      ) : null}
    </View>
  );
}

const e = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 40 },
  circle: { width: 78, height: 78, borderRadius: 39, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 19, fontWeight: "600", textAlign: "center", marginTop: 4 },
  message: { fontSize: 14, textAlign: "center", lineHeight: 20 },
});

// ── Skeleton ─────────────────────────────────────────────────────────────────
/** Shimmering placeholder block for loading states. */
export function Skeleton({
  width,
  height = 16,
  radius = 8,
  style,
}: {
  width?: number | string;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const pulse = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[
        { backgroundColor: theme.surfaceElevated, borderRadius: radius, opacity: pulse },
        width !== undefined ? { width: width as ViewStyle["width"] } : { alignSelf: "stretch" },
        { height },
        style,
      ]}
    />
  );
}
