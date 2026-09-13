import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import React, { createContext, useContext, useEffect, useState } from "react";

import {
  apiFetch,
  clearCookie,
  getBaseUrl,
  storeCookie,
} from "@/hooks/useApi";

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
}

function normalizeUser(data: Record<string, unknown>): User {
  const firstName = typeof data.firstName === "string" ? data.firstName : "";
  const lastName = typeof data.lastName === "string" ? data.lastName : "";
  const email = typeof data.email === "string" ? data.email : "";
  const approvalStatus =
    typeof data.approvalStatus === "string" ? data.approvalStatus : undefined;
  const fullName = `${firstName} ${lastName}`.trim();

  return {
    id: String(data.id ?? ""),
    email,
    name:
      (typeof data.name === "string" && data.name.trim()) ||
      fullName ||
      email,
    role: typeof data.role === "string" ? data.role : "care_seeker",
    approved: data.approved === true || approvalStatus === "approved",
    firstName: firstName || undefined,
    lastName: lastName || undefined,
    approvalStatus,
    requiresAgreement: data.requiresAgreement === true,
    hospitalName:
      typeof data.hospitalName === "string" ? data.hospitalName : undefined,
  };
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    try {
      const res = await apiFetch("/api/auth/user");
      if (res.ok) {
        const data = (await res.json()) as Record<string, unknown>;
        setUser(normalizeUser(data));
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    }
  };

  useEffect(() => {
    refreshUser().finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
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
    if (setCookieHeader) {
      const match = setCookieHeader.match(/connect\.sid=[^;]+/);
      if (match) {
        await storeCookie(match[0]);
      }
    }
    setUser(normalizeUser(data));
    // Register Expo push token after successful login (non-blocking)
    registerMobilePushToken().catch(() => {});
  };

  const logout = async () => {
    // Deregister push token before clearing session (non-blocking)
    deregisterMobilePushToken().catch(() => {});
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {}
    await clearCookie();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
