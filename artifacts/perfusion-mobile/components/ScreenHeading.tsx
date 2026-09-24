import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

export function ScreenHeading({ title, subtitle }: { title: string; subtitle: string }) {
  const colors = useColors();
  return (
    <View style={styles.block}>
      <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 5 },
  title: { fontSize: 24, lineHeight: 30, fontFamily: "Sora_700Bold", letterSpacing: -0.5 },
  subtitle: { fontSize: 13, lineHeight: 19, fontFamily: "Inter_400Regular" },
});