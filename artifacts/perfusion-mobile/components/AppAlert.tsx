import { Feather } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Modal, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from "react-native";

import { designTokens } from "@/constants/designTokens";
import { elevatedShadow } from "@/constants/nativeShadows";
import { useColors } from "@/hooks/useColors";

export type AppAlertButton = {
  text?: string;
  onPress?: () => void;
  style?: "default" | "cancel" | "destructive";
  disabled?: boolean;
};

type AppAlertOptions = {
  cancelable?: boolean;
  onDismiss?: () => void;
};

type AlertRequest = {
  id: number;
  title: string;
  message?: string;
  buttons: AppAlertButton[];
  options?: AppAlertOptions;
};

let nextId = 0;
let queue: AlertRequest[] = [];
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function getCurrentAlert() {
  return queue[0] ?? null;
}

function removeAlert(id: number) {
  if (queue[0]?.id !== id) return false;
  queue = queue.slice(1);
  notify();
  return true;
}

function removeQueuedAlert(id: number) {
  const remaining = queue.filter((request) => request.id !== id);
  if (remaining.length === queue.length) return;
  queue = remaining;
  notify();
}

/** In-app replacement for React Native Alert.alert, with the same button behavior. */
export const AppAlert = {
  alert(
    title: string,
    message?: string,
    buttons?: AppAlertButton[],
    options?: AppAlertOptions,
  ) {
    const id = ++nextId;
    queue = [...queue, {
      id,
      title,
      message,
      buttons: buttons?.length ? buttons : [{ text: "OK" }],
      options,
    }];
    notify();
    return () => removeQueuedAlert(id);
  },
};

export function AppAlertHost() {
  const palette = useColors();
  const current = useSyncExternalStore(subscribe, getCurrentAlert, () => null);
  const [closingId, setClosingId] = useState<number | null>(null);
  const closing = useRef<{ id: number; callback?: () => void } | null>(null);

  const finishDismissal = useCallback(() => {
    const action = closing.current;
    if (!action) return;
    closing.current = null;
    const removed = removeAlert(action.id);
    setClosingId(null);
    if (removed) action.callback?.();
  }, []);

  // onDismiss is iOS-only in some React Native versions. Keep a fallback
  // beyond the fade animation so Android/web actions also run after dismissal.
  useEffect(() => {
    if (closingId === null) return;
    const timer = setTimeout(finishDismissal, Platform.OS === "ios" ? 500 : 350);
    return () => clearTimeout(timer);
  }, [closingId, finishDismissal]);

  if (!current) return null;

  const close = (callback?: () => void) => {
    if (closing.current) return;
    closing.current = { id: current.id, callback };
    setClosingId(current.id);
  };
  const cancelable = current.options?.cancelable === true;
  const dismiss = () => {
    if (cancelable) close(current.options?.onDismiss);
  };

  return (
    <Modal
      animationType="fade"
      onDismiss={finishDismissal}
      onRequestClose={dismiss}
      statusBarTranslucent
      transparent
      visible={closingId !== current.id}
    >
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <View style={styles.overlay} testID="app-alert-dialog">
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFillObject, styles.backdrop, { backgroundColor: palette.foreground }]}
        />
        {cancelable ? (
          <Pressable
            accessibilityLabel="Dismiss dialog"
            accessibilityRole="button"
            onPress={dismiss}
            style={StyleSheet.absoluteFillObject}
          />
        ) : null}
        <AppAlertPanel
          title={current.title}
          message={current.message}
          buttons={current.buttons}
          onPressButton={(button) => close(button.onPress)}
        />
      </View>
    </Modal>
  );
}

type PanelProps = {
  title: string;
  message?: string;
  buttons: AppAlertButton[];
  onPressButton?: (button: AppAlertButton) => void;
};

/** Reusable themed dialog content, including inside screens that already use Modal. */
export function AppAlertPanel({ title, message, buttons, onPressButton }: PanelProps) {
  const palette = useColors();
  const isError = /(cannot|could not|unable|failed|failure|error|permission (needed|required)|unavailable)/i.test(title);
  const isSuccess = /^(.* (saved|changed|updated|created)|success)/i.test(title);
  const hasDestructiveAction = buttons.some((button) => button.style === "destructive");
  const icon: keyof typeof Feather.glyphMap = isError
    ? "alert-circle"
    : hasDestructiveAction
      ? "alert-triangle"
      : isSuccess
        ? "check-circle"
        : "info";
  const iconColor = isError || hasDestructiveAction
    ? palette.destructive
    : isSuccess
      ? palette.success
      : palette.primary;
  const iconBackground = isError || hasDestructiveAction
    ? designTokens.color.redTint
    : isSuccess
      ? designTokens.color.greenTint
      : palette.accent;
  const stacked = buttons.length > 2;
  const primaryIndex = buttons.reduce(
    (last, button, index) => button.style === "cancel" ? last : index,
    -1,
  );

  return (
    <View
      accessibilityViewIsModal
      style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}
    >
      <ScrollView
        bounces={false}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
      >
        <View style={styles.heading}>
          <View style={[styles.iconWrap, { backgroundColor: iconBackground }]}>
            <Feather name={icon} size={21} color={iconColor} />
          </View>
          <Text
            accessibilityLiveRegion="assertive"
            accessibilityRole="header"
            style={[styles.title, { color: palette.foreground }]}
          >
            {title}
          </Text>
        </View>
        {message ? (
          <Text style={[styles.message, { color: palette.mutedForeground }]}>
            {message}
          </Text>
        ) : null}
      </ScrollView>
      <View style={[styles.actions, stacked && styles.stackedActions]}>
        {buttons.map((button, index) => {
          const cancel = button.style === "cancel";
          const destructive = button.style === "destructive";
          const primary = index === primaryIndex && !cancel;
          const filled = destructive || primary;
          const backgroundColor = destructive
            ? palette.destructive
            : cancel
              ? palette.muted
              : primary
                ? designTokens.color.coralDark
                : palette.card;
          const foregroundColor = filled ? palette.primaryForeground : palette.foreground;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !!button.disabled }}
              disabled={button.disabled}
              key={index}
              onPress={() => onPressButton ? onPressButton(button) : button.onPress?.()}
              style={({ pressed }) => [
                styles.button,
                stacked ? styles.stackedButton : styles.inlineButton,
                {
                  backgroundColor,
                  borderColor: palette.border,
                  opacity: button.disabled ? 0.55 : pressed ? 0.82 : 1,
                },
              ]}
              testID={`app-alert-action-${index}`}
            >
              <Text style={[styles.buttonText, { color: foregroundColor }]}>
                {button.text || "OK"}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: designTokens.spacing.gutter,
    paddingVertical: designTokens.spacing.xl,
  },
  backdrop: { opacity: 0.46 },
  card: {
    width: "100%",
    maxWidth: 380,
    maxHeight: "84%",
    padding: designTokens.spacing.xl,
    borderWidth: 1,
    borderRadius: designTokens.radius.hero,
    ...elevatedShadow,
  },
  scroll: { flexGrow: 0, flexShrink: 1 },
  content: { paddingBottom: 1 },
  heading: { flexDirection: "row", alignItems: "center", gap: designTokens.spacing.md },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: designTokens.radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    fontSize: 18,
    lineHeight: 24,
    fontFamily: "Sora_600SemiBold",
  },
  message: {
    marginTop: designTokens.spacing.md,
    fontSize: 14,
    lineHeight: 21,
    fontFamily: "Inter_400Regular",
  },
  actions: { flexDirection: "row", gap: designTokens.spacing.sm, marginTop: designTokens.spacing.xl },
  stackedActions: { flexDirection: "column" },
  button: {
    minHeight: 48,
    paddingHorizontal: designTokens.spacing.md,
    borderWidth: 1,
    borderRadius: designTokens.radius.medium,
    alignItems: "center",
    justifyContent: "center",
  },
  inlineButton: { flex: 1 },
  stackedButton: { width: "100%" },
  buttonText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    fontFamily: "Inter_600SemiBold",
  },
});