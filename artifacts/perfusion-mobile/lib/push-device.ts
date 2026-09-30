import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const KEY = "perfusion_push_device_id";
let deviceIdPromise: Promise<string> | null = null;

function createDeviceId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function getPushDeviceId(): Promise<string> {
  if (!deviceIdPromise) {
    deviceIdPromise = (async () => {
      if (Platform.OS === "web") {
        try {
          const storage = globalThis.localStorage;
          if (!storage) throw new Error("Local storage is unavailable");
          const saved = storage.getItem(KEY);
          if (saved) return saved;
          const id = createDeviceId();
          storage.setItem(KEY, id);
          return id;
        } catch {
          throw new Error("This browser cannot save an installation identity. Enable local storage and try again.");
        }
      }
      try {
        const saved = await SecureStore.getItemAsync(KEY);
        if (saved) return saved;
        const id = createDeviceId();
        await SecureStore.setItemAsync(KEY, id);
        return id;
      } catch {
        throw new Error("This device cannot securely save its installation identity. Check device storage and try again.");
      }
    })().catch((error) => {
      deviceIdPromise = null;
      throw error;
    });
  }
  return deviceIdPromise;
}