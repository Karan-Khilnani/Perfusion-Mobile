import React from "react";
import { Image, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { BRAND_GRADIENT } from "@/constants/designTokens";

export function BrandedLoading() {
  return (
    <LinearGradient
      colors={BRAND_GRADIENT}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
      accessibilityLabel="Perfusion is loading"
    >
      <View style={styles.logoWrap}>
        <Image
          source={require("../assets/images/perfusion-logo-white.png")}
          resizeMode="contain"
          style={styles.logo}
          accessibilityLabel="Perfusion"
        />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
  logoWrap: { width: 240, height: 164, alignItems: "center", justifyContent: "center" },
  logo: { width: 200, height: 150 },
});