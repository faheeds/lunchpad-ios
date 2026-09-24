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
  forceLunchPad = false,
}: {
  /** Edge length in points. Mark is always square. */
  size?: number;
  /** Override the default border-radius (size / 4). */
  radius?: number;
  /** Always show the bundled LunchPad mark, ignoring the active theme's
   *  uploaded restaurant logo. Use this on screens that are inherently
   *  tenant-neutral — most notably the connect/switch-program screen.
   *  The theme context isn't cleared until a *new* tenant code is
   *  validated, so without this a customer switching away from
   *  restaurant A briefly sees restaurant A's logo on the very screen
   *  where they're picking a different program. */
  forceLunchPad?: boolean;
}) {
  const theme = useTheme();
  const cornerRadius = radius ?? size / 4;
  const showThemeLogo = !forceLunchPad && Boolean(theme.logoUrl);
  const source: ImageSourcePropType = showThemeLogo
    ? { uri: theme.logoUrl as string }
    : LUNCHPAD_ICON;

  return (
    <View
      style={[
        styles.frame,
        {
          width: size,
          height: size,
          borderRadius: cornerRadius,
          backgroundColor: showThemeLogo ? theme.primary : "transparent",
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
