/**
 * BrandMark — renders the restaurant's uploaded logo if the active theme
 * has one, otherwise falls back to the bundled LunchPad app icon. Used
 * on auth screens, the home header, and anywhere a brand badge is needed.
 *
 * Avoids the previous "🍽️ emoji on amber square" placeholder that read
 * as prototype-quality. The bundled icon (assets/icon.png) is the same
 * mark used for the iOS app icon, so it doubles as LunchPad's wordmark.
 */

import { Image, View, StyleSheet, type ImageSourcePropType } from "react-native";
import { useTheme } from "../lib/theme";

const LUNCHPAD_ICON: ImageSourcePropType = require("../assets/icon.png");

export function BrandMark({
  size = 56,
  radius,
}: {
  /** Edge length in points. Mark is always square. */
  size?: number;
  /** Override the default border-radius (size / 4). */
  radius?: number;
}) {
  const theme = useTheme();
  const cornerRadius = radius ?? size / 4;
  const source: ImageSourcePropType = theme.logoUrl
    ? { uri: theme.logoUrl }
    : LUNCHPAD_ICON;

  return (
    <View
      style={[
        styles.frame,
        {
          width: size,
          height: size,
          borderRadius: cornerRadius,
          backgroundColor: theme.logoUrl ? theme.primary : "transparent",
        },
      ]}
    >
      <Image
        source={source}
        style={{ width: size, height: size, borderRadius: cornerRadius }}
        resizeMode="cover"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
});
