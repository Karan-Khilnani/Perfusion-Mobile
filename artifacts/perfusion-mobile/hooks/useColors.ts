import colors from "@/constants/colors";

/**
 * Perfusion currently ships a light-only interface. Keep the app's colors
 * independent of the device appearance until dark mode is fully supported.
 */
export function useColors() {
  return { ...colors.light, radius: colors.radius };
}
