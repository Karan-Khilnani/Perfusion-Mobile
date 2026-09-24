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
import { Redirect, Stack, usePathname, type Href } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import {
  ActivityIndicator,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { IncomingCallOverlay } from "@/components/IncomingCallOverlay";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { CallProvider } from "@/contexts/CallContext";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

const PRIMARY = "#B73434";
const BG = "#FAFAFA";

function RootLayoutNav() {
  const { user, loading, callbackDevice, callbackDeviceLoading, callbackDeviceError } = useAuth();
  const pathname = usePathname();

  if (loading || (user?.role !== "admin" && user && callbackDeviceLoading)) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: BG,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator size="large" color={PRIMARY} />
      </View>
    );
  }

  const publicPaths = ["/login", "/register", "/set-password", "/verify-email"];
  const onboardingPaths = [
    ...publicPaths,
    "/complete-profile",
    "/account-status",
  ];
  let redirectHref: Href | null = null;
  if (!user && !publicPaths.includes(pathname)) {
    redirectHref = "/login";
  } else if (user?.needsProfile && pathname !== "/complete-profile") {
    redirectHref = "/complete-profile";
  } else if (
    user &&
    !user.needsProfile &&
    (user.approvalStatus === "pending" ||
      user.approvalStatus === "rejected") &&
    pathname !== "/account-status"
  ) {
    redirectHref = "/account-status";
  } else if (
    user &&
    user.role !== "admin" &&
    user.approvalStatus === "approved" &&
    (!callbackDevice || callbackDeviceError) &&
    pathname !== "/callback-device"
  ) {
    redirectHref = "/callback-device";
  } else if (
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
            <AuthProvider>
              <CallProvider>
                <RootLayoutNav />
              </CallProvider>
            </AuthProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
