import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

export function BrandMark({ compact = false, large = false }: { compact?: boolean; large?: boolean }) {
  const colors = useColors();
  return (
    <View style={styles.row} accessibilityLabel="Perfusion">
      <Image
        source={require("../assets/images/icon.png")}
        resizeMode="contain"
        style={[styles.mark, compact && styles.compactMark, large && styles.largeMark]}
        accessibilityLabel="Perfusion logo"
      />
      <Text style={[styles.wordmark, { color: colors.foreground }, compact && styles.compact]}>Perfusion</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  mark: { width: 32, height: 32 },
  compactMark: { width: 24, height: 24 },
  largeMark: { width: 64, height: 64 },
  wordmark: { fontSize: 18, fontFamily: "Sora_700Bold", letterSpacing: -0.4 },
  compact: { fontSize: 16 },
});