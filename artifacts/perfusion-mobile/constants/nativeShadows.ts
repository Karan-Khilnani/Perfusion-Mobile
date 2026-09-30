import type { ViewStyle } from "react-native";

import { designTokens } from "./designTokens";

type ShadowToken = {
  color: string;
  opacity: number;
  radius: number;
  offset: Readonly<{ width: number; height: number }>;
  elevation: number;
};

// Map design tokens to React Native shadow keys. Spreading the raw token's
// `opacity` field would fade the entire view instead of only its shadow.
function toNativeShadow(token: ShadowToken): ViewStyle {
  return {
    shadowColor: token.color,
    shadowOpacity: token.opacity,
    shadowRadius: token.radius,
    shadowOffset: { ...token.offset },
    elevation: token.elevation,
  };
}

export const cardShadow = toNativeShadow(designTokens.shadow.card);
export const elevatedShadow = toNativeShadow(designTokens.shadow.elevated);