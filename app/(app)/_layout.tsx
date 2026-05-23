/**
 * App tab bar. Four destinations — Home, Menu, Weekly, Account.
 *
 * The cart is no longer a permanent tab: it's reached contextually from
 * the order flow's floating bar (standard for modern food apps) and so
 * is registered as a hidden route. Weekly planning is promoted from a
 * hidden route to a first-class tab.
 */

import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../lib/theme";

export default function AppLayout() {
  const theme = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopColor: theme.border,
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
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
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
        name="weekly-plan"
        options={{
          title: "Weekly",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
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
      {/* Hidden — reached programmatically */}
      <Tabs.Screen name="cart" options={{ href: null }} />
      <Tabs.Screen name="order/[dateId]" options={{ href: null }} />
      <Tabs.Screen name="orders/[orderId]" options={{ href: null }} />
    </Tabs>
  );
}
