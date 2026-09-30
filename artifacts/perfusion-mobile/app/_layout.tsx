import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import {
  Sora_400Regular,
  Sora_600SemiBold,
  Sora_700Bold,
} from "@expo-google-fonts/sora";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setBaseUrl } from "@workspace/api-client-react";
import { Redirect, Stack, usePathname, type Href } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { BrandedLoading } from "@/components/BrandedLoading";
import { IncomingCallOverlay } from "@/components/IncomingCallOverlay";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { CallProvider } from "@/contexts/CallContext";
import { useColors } from "@/hooks/useColors";
import { getBaseUrl } from "@/hooks/useApi";

setBaseUrl(getBaseUrl());
SplashScreen.setOptions({ duration: 220, fade: true });
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function RootLayoutNav() {
  const { user, loading, callbackDevice, callbackDeviceLoading, callbackDeviceError } = useAuth();
  const colors = useColors();
  const pathname = usePathname();

  if (loading || (user?.role !== "admin" && user && callbackDeviceLoading)) {
    return <BrandedLoading showTagline={loading} />;
  }

  const publicPaths = [
    "/login",
    "/register",
    "/set-password",
    "/verify-email",
    "/forgot-password",
  ];
  const isRecoveryFlow = pathname === "/forgot-password";
  const onboardingPaths = [
    ...publicPaths,
    "/complete-profile",
    "/account-status",
  ];
  let redirectHref: Href | null = null;
  if (!user && !publicPaths.includes(pathname)) {
    redirectHref = "/login";
  } else if (
    !isRecoveryFlow &&
    user?.needsProfile &&
    pathname !== "/complete-profile"
  ) {
    redirectHref = "/complete-profile";
  } else if (
    !isRecoveryFlow &&
    user &&
    !user.needsProfile &&
    (user.approvalStatus === "pending" ||
      user.approvalStatus === "rejected") &&
    pathname !== "/account-status"
  ) {
    redirectHref = "/account-status";
  } else if (
    !isRecoveryFlow &&
    user &&
    user.role !== "admin" &&
    user.approvalStatus === "approved" &&
    (!callbackDevice || callbackDeviceError) &&
    pathname !== "/callback-device"
  ) {
    redirectHref = "/callback-device";
  } else if (
    !isRecoveryFlow &&
    user &&
    (user.role === "admin" || user.approvalStatus === "approved") &&
    onboardingPaths.includes(pathname)
  ) {
    redirectHref = "/(tabs)";
  }

  return (
    <>
      <Stack screenOptions={{ headerBackTitle: "Back" }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="login"
          options={{ headerShown: false, gestureEnabled: false }}
        />
        <Stack.Screen
          name="register"
          options={{ headerShown: false, gestureEnabled: false }}
        />
        <Stack.Screen
          name="set-password"
          options={{ headerShown: false, gestureEnabled: false }}
        />
        <Stack.Screen
          name="forgot-password"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="verify-email"
          options={{ headerShown: false, gestureEnabled: false }}
        />
        <Stack.Screen
          name="complete-profile"
          options={{ headerShown: false, gestureEnabled: false }}
        />
        <Stack.Screen
          name="account-status"
          options={{ headerShown: false, gestureEnabled: false }}
        />
        <Stack.Screen
          name="callback-device"
          options={{ title: "Callback Device", gestureEnabled: !!callbackDevice }}
        />
        <Stack.Screen
          name="booking/[id]"
          options={{ title: "Booking Details" }}
        />
        <Stack.Screen
          name="case-file/[bookingId]"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="new-consultation"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="call/[bookingId]"
          options={{ headerShown: false, gestureEnabled: false }}
        />
      </Stack>
      {redirectHref && <Redirect href={redirectHref} />}
      {user && <IncomingCallOverlay />}
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Sora_400Regular,
    Sora_600SemiBold,
    Sora_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <AuthProvider>
                <CallProvider>
                  <RootLayoutNav />
                </CallProvider>
              </AuthProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
