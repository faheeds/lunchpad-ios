import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useCart } from "../../lib/store";
import { View, Text, StyleSheet, Animated } from "react-native";
import { useEffect, useRef } from "react";
import { useTheme } from "../../lib/theme";

/**
 * Cart-count badge with a subtle pulse animation on count change. When
 * the user taps "Add to cart" anywhere in the app, the badge briefly
 * scales up and back — gives a tactile sense that the action took effect.
 */
function CartBadge() {
  const count = useCart((s) => s.count());
  const theme = useTheme();
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (count === 0) return;
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.3, useNativeDriver: true, friction: 4 }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 4 }),
    ]).start();
  }, [count, scale]);

  if (count === 0) return null;
  return (
    <Animated.View
      style={[
        styles.badge,
        { backgroundColor: theme.primary, transform: [{ scale }] },
      ]}
      accessibilityLabel={`${count} items in cart`}
    >
      <Text style={[styles.badgeText, { color: theme.textOnPrimary }]}>{count}</Text>
    </Animated.View>
  );
}

export default function AppLayout() {
  const theme = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.dark,
          borderTopColor: theme.surface,
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Order",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: "Menu",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="restaurant-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: "Cart",
          tabBarIcon: ({ color, size }) => (
            <View>
              <Ionicons name="bag-outline" size={size} color={color} />
              <CartBadge />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "Account",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
      {/* Hidden tab — navigated to programmatically */}
      <Tabs.Screen
        name="order/[dateId]"
        options={{ href: null }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    top: -4,
    right: -8,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "800",
  },
});
