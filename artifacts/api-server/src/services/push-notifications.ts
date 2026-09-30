import webpush from "web-push";
import { createECDH } from "node:crypto";

const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
// The public key is distributable and can be recovered from the configured
// private key, so an absent public-key setting need not disable existing pushes.
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || (() => {
  if (!VAPID_PRIVATE_KEY) return undefined;
  try {
    const key = createECDH("prime256v1");
    key.setPrivateKey(Buffer.from(VAPID_PRIVATE_KEY, "base64url"));
    return key.getPublicKey(undefined, "uncompressed").toString("base64url");
  } catch {
    console.error("[PushNotifications] Invalid VAPID private key; web push disabled");
    return undefined;
  }
})();
const VAPID_EMAIL = process.env.VAPID_EMAIL || "mailto:admin@perfusion.health";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  console.log("[PushNotifications] VAPID configured — push notifications enabled");
} else {
  // Warn clearly at startup so broken push config is immediately visible
  console.error(
    "[PushNotifications] VAPID keys not configured — push notifications DISABLED. " +
    "Configure a valid VAPID_PRIVATE_KEY to enable web push."
  );
}

export type PushPayload =
  | {
      type: "callback_device_reminder";
      bookingId: string;
      title: string;
      body: string;
    }
  | {
      type: "incoming_call";
      bookingId: string;
      sessionGeneration: string;
      callerName: string;
      callerRole: "seeker" | "provider";
      recipientRole: "seeker" | "provider";
      videoRoomUrl: string;
      mediaProvider: "daily" | "stream";
      installationId?: string;
      title: string;
      body: string;
      subtitle?: string;
    }
  | {
      type: "call_accepted" | "call_declined" | "call_timeout" | "call_cancelled" | "call_ended";
      bookingId: string;
      sessionGeneration: string;
    };

export interface PushSubscriptionData {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type PushResult = { sent: boolean; expired: boolean };

export async function sendPushNotification(
  subscription: PushSubscriptionData,
  payload: PushPayload
): Promise<PushResult> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn("[PushNotifications] Skipping — VAPID keys not set");
    return { sent: false, expired: false };
  }

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      },
      JSON.stringify(payload)
    );
    console.log("[PushNotifications] Sent to endpoint:", subscription.endpoint.substring(0, 50));
    return { sent: true, expired: false };
  } catch (error: any) {
    if (error.statusCode === 410 || error.statusCode === 404) {
      console.log("[PushNotifications] Subscription expired/invalid — will be pruned:", subscription.endpoint.substring(0, 50));
      return { sent: false, expired: true };
    }
    console.error("[PushNotifications] Failed:", error?.message || error);
    return { sent: false, expired: false };
  }
}

export function getVapidPublicKey(): string | null {
  return VAPID_PUBLIC_KEY || null;
}
