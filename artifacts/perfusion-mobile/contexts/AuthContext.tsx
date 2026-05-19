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
  hospitalName?: string;
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
        const data = await res.json();
        setUser(data);
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
    const res = await fetch(`${getBaseUrl()}/api/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Mobile-Client": "1",
      },
      body: JSON.stringify({ username: email, password }),
    });
    if (!res.ok) {
      let msg = "Login failed";
      try {
        const data = await res.json();
        msg = data.message || msg;
      } catch {}
      throw new Error(msg);
    }
    const setCookieHeader = res.headers.get("set-cookie");
    if (setCookieHeader) {
      const match = setCookieHeader.match(/connect\.sid=[^;]+/);
      if (match) {
        await storeCookie(match[0]);
      }
    }
    await refreshUser();
    // Register Expo push token after successful login (non-blocking)
    registerMobilePushToken().catch(() => {});
  };

  const logout = async () => {
    // Deregister push token before clearing session (non-blocking)
    deregisterMobilePushToken().catch(() => {});
    try {
      await apiFetch("/api/logout", { method: "POST" });
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
