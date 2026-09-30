import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const KEY = "perfusion_push_device_id";
let deviceIdPromise: Promise<string> | null = null;
let webDeviceId: string | null = null;

function createDeviceId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function getPushDeviceId(): Promise<string> {
  if (!deviceIdPromise) {
    deviceIdPromise = (async () => {
      if (Platform.OS === "web") {
        try {
          const saved = globalThis.localStorage?.getItem(KEY);
          if (saved) return saved;
          const id = createDeviceId();
          globalThis.localStorage?.setItem(KEY, id);
          webDeviceId = id;
          return id;
        } catch {
          return webDeviceId || (webDeviceId = createDeviceId());
        }
      }
      try {
        const saved = await SecureStore.getItemAsync(KEY);
        if (saved) return saved;
        const id = createDeviceId();
        await SecureStore.setItemAsync(KEY, id);
        return id;
      } catch {
        return createDeviceId();
      }
    })().catch((error) => {
      deviceIdPromise = null;
      throw error;
    });
  }
  return deviceIdPromise;
}