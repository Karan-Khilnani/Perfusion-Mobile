import * as SecureStore from "expo-secure-store";

const KEY = "perfusion_push_device_id";
let deviceIdPromise: Promise<string> | null = null;

export function getPushDeviceId(): Promise<string> {
  if (!deviceIdPromise) {
    deviceIdPromise = (async () => {
      const saved = await SecureStore.getItemAsync(KEY);
      if (saved) return saved;
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
      await SecureStore.setItemAsync(KEY, id);
      return id;
    })().catch((error) => {
      deviceIdPromise = null;
      throw error;
    });
  }
  return deviceIdPromise;
}