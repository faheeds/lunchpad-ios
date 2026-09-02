/**
 * HeroImageCard — displays a tenant's hero image in a card with rounded corners.
 * Falls back to a gradient-like two-color overlay when no image is provided.
 */

import { View, Image, StyleSheet, type StyleProp, type ViewStyle } from "react-native";

export function HeroImageCard({
  heroImageUrl,
  primaryColor,
  darkColor,
  style,
}: {
  heroImageUrl?: string | null;
  primaryColor?: string;
  darkColor?: string;
  style?: StyleProp<ViewStyle>;
}) {
  if (heroImageUrl) {
    return (
      <View style={[styles.card, style]}>
        <Image
          source={{ uri: heroImageUrl }}
          style={styles.image}
          resizeMode="cover"
        />
      </View>
    );
  }

  const bgColor = primaryColor || "#C1502E";
  const accentColor = darkColor || "#F1E8D6";

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: bgColor,
          overflow: "hidden",
        },
        style,
      ]}
    >
      <View style={[styles.gradientOverlay, { backgroundColor: accentColor, opacity: 0.15 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    height: 140,
    borderRadius: 18,
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
});
