import React from "react";
import {
  Image,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { designTokens } from "@/constants/designTokens";

const LOGO_ASPECT_RATIO = 557 / 283;

export function BrandedLoading() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const logoWidth = Math.min(width * 0.48, height * 0.3, 230);

  return (
    <LinearGradient
      colors={designTokens.gradient.welcome}
      locations={[0, 0.25, 0.5, 0.75, 1]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={styles.container}
      accessibilityLabel="Perfusion. Connected care, Everywhere"
    >
      <View style={styles.logoStage} pointerEvents="none">
        <Image
          source={require("../assets/images/perfusion-logo-welcome.png")}
          resizeMode="contain"
          style={{ width: logoWidth, height: logoWidth / LOGO_ASPECT_RATIO }}
          accessibilityLabel="Perfusion"
        />
      </View>
      <Text
        style={[
          styles.tagline,
          {
            color: designTokens.color.card,
            bottom: Math.max(insets.bottom + 22, height * 0.055),
          },
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.85}
      >
        Connected care, Everywhere
      </Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
  logoStage: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  tagline: {
    position: "absolute",
    left: 18,
    right: 18,
    textAlign: "center",
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    letterSpacing: 1.6,
  },
});
