/**
 * FoodImage — a food photo with a branded, on-brand fallback.
 *
 * When the operator has uploaded a photo we render it. When they haven't,
 * we draw a warm tinted tile with a serving-dish glyph — never the food
 * emoji, which rendered inconsistently and read as unfinished.
 *
 * The fallback tint is derived from the menu item's id so the same dish
 * always gets the same color, and a menu reads as varied rather than
 * monotone.
 */

import {
  Image,
  View,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
  type ImageStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../lib/theme";

// Warm editorial tints for the photo-less fallback.
const TINTS = ["#C0673E", "#6E8E5A", "#D8A24A", "#A8502F", "#5E7A52", "#B98235"];

function tintFor(seed: string | undefined): string {
  if (!seed) return TINTS[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return TINTS[Math.abs(hash) % TINTS.length];
}

export function FoodImage({
  uri,
  seed,
  size,
  radius = 14,
  style,
}: {
  /** Photo URL; null/undefined renders the branded fallback. */
  uri?: string | null;
  /** Stable seed (usually the menu item id) for the fallback tint. */
  seed?: string;
  /** Square edge length. Omit and pass `style` for non-square layouts. */
  size?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const box: StyleProp<ViewStyle> = [
    size !== undefined ? { width: size, height: size } : null,
    { borderRadius: radius, overflow: "hidden" },
    style,
  ];

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={box as StyleProp<ImageStyle>}
        resizeMode="cover"
      />
    );
  }

  return (
    <View style={[box, styles.fallback, { backgroundColor: tintFor(seed) }]}>
      <Ionicons name="restaurant" size={(size ?? 56) * 0.4} color={theme.surface} />
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: "center", justifyContent: "center" },
});
