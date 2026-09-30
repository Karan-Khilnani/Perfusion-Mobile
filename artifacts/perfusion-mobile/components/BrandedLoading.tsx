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

import { BRAND_GRADIENT, designTokens } from "@/constants/designTokens";

const LOGO_ASPECT_RATIO = 846 / 254;

export function BrandedLoading({
  showTagline = false,
}: {
  showTagline?: boolean;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const logoWidth = Math.min(width * 0.64, height * 0.34, 288);

  return (
    <LinearGradient
      colors={BRAND_GRADIENT}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
      accessibilityLabel="Perfusion is loading"
    >
      <View style={styles.logoStage} pointerEvents="none">
        <Image
          source={require("../assets/images/perfusion-logo-white-launch.png")}
          resizeMode="contain"
          style={{ width: logoWidth, height: logoWidth / LOGO_ASPECT_RATIO }}
          accessibilityLabel="Perfusion"
        />
      </View>
      {showTagline && (
        <Text
          style={[
            styles.tagline,
            {
              color: designTokens.color.card,
              paddingBottom: Math.max(insets.bottom + 18, 36),
            },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.85}
        >
          Connected care, Everywhere.
        </Text>
      )}
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
    left: 24,
    right: 24,
    bottom: 0,
    textAlign: "center",
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    letterSpacing: 0.3,
  },
});
