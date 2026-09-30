import { Feather } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  DimensionValue,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";

import { useColors } from "@/hooks/useColors";
import { designTokens } from "@/constants/designTokens";
import { cardShadow } from "@/constants/nativeShadows";

type StateCardProps = {
  title: string;
  message: string;
  icon?: keyof typeof Feather.glyphMap;
  actionLabel?: string;
  onAction?: () => void;
  variant?: "empty" | "error";
  style?: StyleProp<ViewStyle>;
};

export function StateCard({
  title,
  message,
  icon,
  actionLabel,
  onAction,
  variant = "empty",
  style,
}: StateCardProps) {
  const colors = useColors();
  const iconColor = variant === "error" ? colors.destructive : colors.primary;

  return (
    <View style={[styles.stateCard, style, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.stateIcon, { backgroundColor: variant === "error" ? colors.destructive + "14" : colors.accent }]}>
        <Feather name={icon || (variant === "error" ? "alert-circle" : "inbox")} size={22} color={iconColor} />
      </View>
      <Text style={[styles.stateTitle, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.stateMessage, { color: colors.mutedForeground }]}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          style={({ pressed }) => [styles.stateAction, { backgroundColor: colors.primary, opacity: pressed ? 0.88 : 1 }]}
        >
          <Text style={styles.stateActionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function SkeletonBlock({
  width = "100%",
  height = 14,
  radius = 8,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 800, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[
        styles.skeleton,
        { width, height, borderRadius: radius, backgroundColor: colors.muted },
        { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.52, 0.95] }) },
        style,
      ]}
    />
  );
}

export function ConsultationSkeletons({ count = 2 }: { count?: number }) {
  const colors = useColors();
  return (
    <View style={styles.skeletonList} accessibilityLabel="Loading consultations">
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={[styles.bookingSkeleton, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SkeletonBlock width={46} height={46} radius={14} />
          <View style={styles.skeletonText}>
            <SkeletonBlock width="64%" height={14} />
            <SkeletonBlock width="44%" height={12} />
            <SkeletonBlock width="78%" height={11} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stateCard: {
    alignItems: "center",
    padding: 24,
    borderWidth: 1,
    borderRadius: designTokens.radius.card,
    ...cardShadow,
  },
  stateIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  stateTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontFamily: "Sora_600SemiBold",
    textAlign: "center",
  },
  stateMessage: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 6,
  },
  stateAction: {
    minHeight: 44,
    borderRadius: designTokens.radius.pill,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
  stateActionText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  skeletonList: {
    gap: 12,
  },
  bookingSkeleton: {
    minHeight: 84,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    borderRadius: designTokens.radius.card,
    borderWidth: 1,
    padding: 14,
    ...cardShadow,
  },
  skeletonText: {
    flex: 1,
    gap: 8,
  },
  skeleton: {
    overflow: "hidden",
  },
});