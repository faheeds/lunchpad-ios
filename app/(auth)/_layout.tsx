import { Stack } from "expo-router";
import { useTheme } from "../../lib/theme";

export default function AuthLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.dark },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="connect" />
      <Stack.Screen name="sign-in" />
    </Stack>
  );
}
