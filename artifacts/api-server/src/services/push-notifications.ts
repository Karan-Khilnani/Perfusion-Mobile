import webpush from "web-push";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_EMAIL = process.env.VAPID_EMAIL || "mailto:admin@perfusion.health";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  console.log("[PushNotifications] VAPID configured — push notifications enabled");
} else {
  // Warn clearly at startup so broken push config is immediately visible
  console.error(
    "[PushNotifications] VAPID keys not configured — push notifications DISABLED. " +
    "Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_EMAIL environment variables."
  );
}

export interface PushPayload {
  type: "incoming_call" | "call_accepted" | "call_declined" | "call_timeout";
  bookingId: string;
  callerName: string;
  callerRole: "seeker" | "provider";
  recipientRole: "seeker" | "provider";
  videoRoomUrl: string;
  mediaProvider: "daily" | "stream";
  title: string;
  body: string;
  subtitle?: string;
}

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
