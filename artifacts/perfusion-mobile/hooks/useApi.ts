import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const COOKIE_KEY = "perfusion_session_cookie";

// SecureStore is native-only; fall back to in-memory for web previews
let _webCookie: string | null = null;

export function getBaseUrl(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN?.trim();
  if (domain) {
    const normalizedDomain = domain.replace(/\/+$/, "");
    return /^https?:\/\//i.test(normalizedDomain)
      ? normalizedDomain
      : `https://${normalizedDomain}`;
  }
  if (Platform.OS !== "web") {
    throw new Error(
      "The mobile API address is missing. Rebuild the app with EXPO_PUBLIC_DOMAIN configured, then try again.",
    );
  }
  return "";
}

export async function getStoredCookie(): Promise<string | null> {
  try {
    if (Platform.OS === "web") return _webCookie;
    return await SecureStore.getItemAsync(COOKIE_KEY);
  } catch {
    return null;
  }
}

export async function storeCookie(cookie: string): Promise<void> {
  if (Platform.OS === "web") {
    _webCookie = cookie;
    return;
  }
  await SecureStore.setItemAsync(COOKIE_KEY, cookie);
}

export async function clearCookie(): Promise<void> {
  if (Platform.OS === "web") {
    _webCookie = null;
    return;
  }
  await SecureStore.deleteItemAsync(COOKIE_KEY);
}

export async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const cookie = await getStoredCookie();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Mobile-Client": "1",
    ...(options.headers as Record<string, string>),
  };
  if (cookie) {
    headers["Cookie"] = cookie;
  }
  return fetch(`${getBaseUrl()}${path}`, {
    ...options,
    credentials: "include",
    headers,
  });
}
