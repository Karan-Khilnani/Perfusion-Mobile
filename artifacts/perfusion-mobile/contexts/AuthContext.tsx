import * as Notifications from "expo-notifications";
import * as Crypto from "expo-crypto";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import React, { createContext, useContext, useEffect, useState } from "react";

import {
  apiFetch,
  clearCookie,
  getBaseUrl,
  storeCookie,
} from "@/hooks/useApi";
import { deregisterNativeCallToken } from "@/lib/native-calls";
import { getPushDeviceId } from "@/lib/push-device";

WebBrowser.maybeCompleteAuthSession();

async function registerMobilePushToken(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") return;

    const tokenData = await Notifications.getExpoPushTokenAsync();
    await apiFetch("/api/push/mobile-token", {
      method: "POST",
      body: JSON.stringify({
        token: tokenData.data,
        platform: Platform.OS,
        deviceId: await getPushDeviceId(),
      }),
    });
  } catch {
    // Non-fatal — push notifications are optional
  }
}

async function deregisterMobilePushToken(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync();
    await apiFetch("/api/push/mobile-token", {
      method: "DELETE",
      body: JSON.stringify({ token: tokenData.data }),
    });
  } catch {}
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  approved: boolean;
  firstName?: string;
  lastName?: string;
  approvalStatus?: string;
  requiresAgreement?: boolean;
  hospitalName?: string;
  needsProfile: boolean;
}

export interface CallbackDevice {
  deviceName: string;
  phoneNumber: string;
  updatedAt: string;
}

export interface RegistrationInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface ProfileCompletionInput {
  role: "care_seeker" | "provider";
  hospitalName: string;
  hospitalAddress: string;
  hospitalRegistrationNo: string;
  hospitalRegisteredOrg: string;
  phone?: string;
  providerType?: "lab" | "consultant" | "hospital" | "transport" | "teleradiology";
  description?: string;
  location?: string;
}

function normalizeUser(data: Record<string, unknown>): User {
  const firstName = typeof data.firstName === "string" ? data.firstName : "";
  const lastName = typeof data.lastName === "string" ? data.lastName : "";
  const email = typeof data.email === "string" ? data.email : "";
  const approvalStatus =
    typeof data.approvalStatus === "string" ? data.approvalStatus : undefined;
  const fullName = `${firstName} ${lastName}`.trim();
  const role = typeof data.role === "string" ? data.role : "care_seeker";
  const hospitalName =
    typeof data.hospitalName === "string" && data.hospitalName.trim()
      ? data.hospitalName
      : undefined;
  const googleAccount =
    typeof data.googleId === "string" && data.googleId.length > 0;

  return {
    id: String(data.id ?? ""),
    email,
    name:
      (typeof data.name === "string" && data.name.trim()) ||
      fullName ||
      email,
    role,
    approved: data.approved === true || approvalStatus === "approved",
    firstName: firstName || undefined,
    lastName: lastName || undefined,
    approvalStatus,
    requiresAgreement: data.requiresAgreement === true,
    hospitalName,
    needsProfile:
      data.needsProfile === true ||
      (googleAccount && role !== "admin" && !hospitalName),
  };
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  callbackDevice: CallbackDevice | null;
  callbackDeviceLoading: boolean;
  callbackDeviceError: string | null;
  refreshCallbackDevice: () => Promise<void>;
  saveCallbackDevice: (deviceName: string, phoneNumber: string) => Promise<void>;
  login: (email: string, password: string) => Promise<User>;
  loginWithGoogle: () => Promise<User | null>;
  register: (input: RegistrationInput) => Promise<void>;
  completeProfile: (input: ProfileCompletionInput) => Promise<User>;
  verifyEmail: (code: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [callbackDevice, setCallbackDevice] = useState<CallbackDevice | null>(null);
  const [callbackDeviceLoading, setCallbackDeviceLoading] = useState(true);
  const [callbackDeviceError, setCallbackDeviceError] = useState<string | null>(null);

  const refreshCallbackDevice = async () => {
    setCallbackDeviceLoading(true);
    setCallbackDeviceError(null);
    setCallbackDevice(null);
    try {
      const response = await apiFetch("/api/profile/callback-device");
      if (!response.ok) throw new Error("Could not load Callback Device. Try again.");
      setCallbackDevice((await response.json()) as CallbackDevice | null);
    } catch (error) {
      setCallbackDevice(null);
      setCallbackDeviceError(error instanceof Error ? error.message : "Could not load Callback Device.");
    } finally {
      setCallbackDeviceLoading(false);
    }
  };

  const saveCallbackDevice = async (deviceName: string, phoneNumber: string) => {
    const response = await apiFetch("/api/profile/callback-device", {
      method: "PUT",
      body: JSON.stringify({ deviceName, phoneNumber }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.message || "Could not save Callback Device.");
    }
    setCallbackDevice((await response.json()) as CallbackDevice);
    setCallbackDeviceError(null);
  };

  const applyAuthenticatedUser = async (
    data: Record<string, unknown>,
  ): Promise<User> => {
    const authenticatedUser = normalizeUser(data);
    setUser(authenticatedUser);
    if (
      authenticatedUser.role === "admin" ||
      authenticatedUser.needsProfile ||
      authenticatedUser.approvalStatus !== "approved"
    ) {
      setCallbackDevice(null);
      setCallbackDeviceError(null);
      setCallbackDeviceLoading(false);
    } else {
      await refreshCallbackDevice();
    }
    return authenticatedUser;
  };

  const refreshUser = async () => {
    try {
      const res = await apiFetch("/api/auth/user");
      if (res.ok) {
        const data = (await res.json()) as Record<string, unknown>;
        await applyAuthenticatedUser(data);
      } else {
        setUser(null);
        setCallbackDevice(null);
        setCallbackDeviceLoading(false);
      }
    } catch {
      setUser(null);
      setCallbackDevice(null);
      setCallbackDeviceLoading(false);
    }
  };

  useEffect(() => {
    refreshUser().finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string): Promise<User> => {
    const res = await fetch(`${getBaseUrl()}/api/auth/login`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-Mobile-Client": "1",
      },
      body: JSON.stringify({ email, password }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const msg =
        typeof data.message === "string" ? data.message : "Login failed";
      throw new Error(msg);
    }
    const setCookieHeader = res.headers.get("set-cookie");
    const match = setCookieHeader?.match(/connect\.sid=[^;]+/);
    if (match) await storeCookie(match[0]);
    const authenticatedUser = await applyAuthenticatedUser(data);
    // Register Expo push token after successful login (non-blocking)
    registerMobilePushToken().catch(() => {});
    return authenticatedUser;
  };

  const loginWithGoogle = async (): Promise<User | null> => {
    if (Platform.OS === "web") {
      throw new Error("Google mobile sign-in is available in the Android and iOS apps.");
    }
    const redirectUri = "perfusion-mobile://auth/callback";
    const codeVerifier = `${Crypto.randomUUID()}${Crypto.randomUUID()}`
      .replace(/-/g, "");
    const codeChallenge = (
      await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        codeVerifier,
        { encoding: Crypto.CryptoEncoding.BASE64 },
      )
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
    const result = await WebBrowser.openAuthSessionAsync(
      `${getBaseUrl()}/api/auth/google/mobile?code_challenge=${encodeURIComponent(codeChallenge)}`,
      redirectUri,
    );
    if (result.type === "cancel" || result.type === "dismiss") return null;
    if (result.type !== "success" || !result.url) {
      throw new Error("Google sign-in could not be completed.");
    }

    const callback = Linking.parse(result.url);
    const oauthError =
      typeof callback.queryParams?.error === "string"
        ? callback.queryParams.error
        : null;
    if (oauthError) {
      if (oauthError === "invalid_state") {
        throw new Error("Google sign-in expired. Please try again.");
      }
      throw new Error("Google sign-in was not completed. Please try again.");
    }
    const ticket =
      typeof callback.queryParams?.ticket === "string"
        ? callback.queryParams.ticket
        : null;
    if (!ticket) {
      throw new Error("Google sign-in did not return a valid authorization.");
    }

    const response = await fetch(
      `${getBaseUrl()}/api/auth/google/mobile/exchange`,
      {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Mobile-Client": "1",
        },
        body: JSON.stringify({ ticket, codeVerifier }),
      },
    );
    const data = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (!response.ok) {
      throw new Error(
        typeof data.message === "string"
          ? data.message
          : "Could not complete Google sign-in.",
      );
    }
    const setCookieHeader = response.headers.get("set-cookie");
    const match = setCookieHeader?.match(/connect\.sid=[^;]+/);
    if (!match) {
      throw new Error("The app could not save your sign-in session.");
    }
    await storeCookie(match[0]);
    const authenticatedUser = await applyAuthenticatedUser(data);
    registerMobilePushToken().catch(() => {});
    return authenticatedUser;
  };

  const register = async (input: RegistrationInput) => {
    const res = await fetch(`${getBaseUrl()}/api/auth/register`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-Mobile-Client": "1",
      },
      body: JSON.stringify({
        ...input,
        role: "care_seeker",
        hospitalName: "Personal account",
        hospitalAddress: "Not applicable",
        hospitalRegistrationNo: "Not applicable",
        hospitalRegisteredOrg: "Personal account",
      }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new Error(typeof data.message === "string" ? data.message : "Registration failed");
    }
    const setCookieHeader = res.headers.get("set-cookie");
    const match = setCookieHeader?.match(/connect\.sid=[^;]+/);
    if (match) await storeCookie(match[0]);
    await applyAuthenticatedUser(data);
    setCallbackDevice(null);
    setCallbackDeviceLoading(false);
    setCallbackDeviceError(null);
  };

  const verifyEmail = async (code: string) => {
    const res = await apiFetch("/api/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new Error(typeof data.message === "string" ? data.message : "Verification failed");
    }
    await applyAuthenticatedUser(data);
  };

  const resendVerification = async () => {
    const res = await apiFetch("/api/auth/resend-verification", { method: "POST" });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new Error(typeof data.message === "string" ? data.message : "Could not resend the code");
    }
  };

  const completeProfile = async (
    input: ProfileCompletionInput,
  ): Promise<User> => {
    const response = await apiFetch("/api/auth/complete-profile", {
      method: "POST",
      body: JSON.stringify(input),
    });
    const data = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (!response.ok) {
      throw new Error(
        typeof data.message === "string"
          ? data.message
          : "Could not complete your profile.",
      );
    }
    return applyAuthenticatedUser({ ...data, needsProfile: false });
  };

  const logout = async () => {
    // Remove both device tokens while the user's session still authenticates these requests.
    await Promise.allSettled([deregisterMobilePushToken(), deregisterNativeCallToken()]);
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {}
    await clearCookie();
    setUser(null);
    setCallbackDevice(null);
    setCallbackDeviceError(null);
    setCallbackDeviceLoading(false);
  };

  return (
    <AuthContext.Provider value={{
      user, loading, login, loginWithGoogle, register, completeProfile,
      verifyEmail, resendVerification, logout, refreshUser,
      callbackDevice, callbackDeviceLoading, callbackDeviceError,
      refreshCallbackDevice, saveCallbackDevice,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
