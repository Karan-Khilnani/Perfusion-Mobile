function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function getVapidPublicKey(): Promise<string | null> {
  try {
    const res = await fetch("/api/push/vapid-public-key");
    if (!res.ok) {
      console.warn("[Push] VAPID key endpoint returned", res.status);
      return null;
    }
    const data = await res.json();
    return data.publicKey || null;
  } catch (err) {
    console.error("[Push] Failed to fetch VAPID public key:", err);
    return null;
  }
}

export async function subscribeToPush(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) {
    console.warn("[Push] Service workers not supported");
    return false;
  }
  if (!("PushManager" in window)) {
    console.warn("[Push] PushManager not supported (app may be running in an iframe or unsupported browser)");
    return false;
  }
  if (!("Notification" in window)) {
    console.warn("[Push] Notification API not supported");
    return false;
  }

  try {
    console.log("[Push] Requesting notification permission...");
    const permission = await Notification.requestPermission();
    console.log("[Push] Permission result:", permission);
    if (permission !== "granted") {
      console.log("[Push] Permission not granted — push subscription skipped");
      return false;
    }

    const vapidKey = await getVapidPublicKey();
    if (!vapidKey) {
      console.error("[Push] No VAPID public key available — cannot subscribe");
      return false;
    }
    console.log("[Push] Got VAPID key, length:", vapidKey.length);

    console.log("[Push] Waiting for service worker to be ready...");
    const registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("SW ready timeout")), 10000)
      ),
    ]);
    console.log("[Push] Service worker ready, scope:", (registration as ServiceWorkerRegistration).scope);

    let subscription = await (registration as ServiceWorkerRegistration).pushManager.getSubscription();
    console.log("[Push] Existing subscription:", subscription ? "found" : "none");

    if (!subscription) {
      console.log("[Push] Creating new push subscription...");
      subscription = await (registration as ServiceWorkerRegistration).pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      console.log("[Push] New subscription created, endpoint:", subscription.endpoint.substring(0, 60));
    }

    const subJson = subscription.toJSON();
    const p256dh = subJson.keys?.p256dh;
    const auth = subJson.keys?.auth;

    if (!p256dh || !auth) {
      console.error("[Push] Subscription missing keys — cannot save");
      return false;
    }

    console.log("[Push] Saving subscription to server...");
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        p256dh,
        auth,
      }),
    });

    if (res.ok) {
      console.log("[Push] Subscription saved successfully");
      return true;
    }

    const errBody = await res.text().catch(() => "");
    console.error("[Push] Server rejected subscription:", res.status, errBody);
    return false;
  } catch (error) {
    console.error("[Push] subscribeToPush error:", error);
    return false;
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await fetch("/api/push/unsubscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      await subscription.unsubscribe();
      console.log("[Push] Unsubscribed");
    }
  } catch (error) {
    console.error("[Push] Unsubscribe error:", error);
  }
}

export function isPushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}

/** Returns true if the browser has an active PushManager subscription */
export async function hasPushSubscription(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub !== null;
  } catch {
    return false;
  }
}
