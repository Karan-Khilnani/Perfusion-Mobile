import { randomUUID } from "node:crypto";
import { cert, getApp, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { Expo, type ExpoPushMessage } from "expo-server-sdk";
import { getPool } from "../db";
import { logger } from "../lib/logger";

interface IncomingCallPush {
  bookingId: string;
  sessionGeneration: string;
  callerId: string;
  callerName: string;
  callerRole: "seeker" | "provider";
  callType: string;
  videoRoomUrl: string;
  mediaProvider: "daily" | "stream";
  serviceName: string;
  subtitle: string;
}

type TokenRow = { token: string; platform: string; token_type: string; device_id: string | null };
const APP_NAME = "perfusion-call-push";
const PROJECT_ID = "perfusion-4f89a";
let credentialsWarningShown = false;

function getFirebaseMessaging() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    if (!credentialsWarningShown) {
      logger.warn("[MobilePush] FIREBASE_SERVICE_ACCOUNT_JSON not configured; native Android calls are unavailable");
      credentialsWarningShown = true;
    }
    return null;
  }

  try {
    const serviceAccount = JSON.parse(raw);
    if (serviceAccount.type !== "service_account" ||
        serviceAccount.project_id !== PROJECT_ID ||
        !serviceAccount.client_email ||
        !serviceAccount.private_key) {
      throw new Error("Firebase service account is invalid or belongs to another project");
    }
    let app;
    try {
      app = getApp(APP_NAME);
    } catch {
      app = initializeApp({ credential: cert(serviceAccount), projectId: PROJECT_ID }, APP_NAME);
    }
    return getMessaging(app);
  } catch (error) {
    logger.error("[MobilePush] Invalid Firebase credentials or wrong project");
    return null;
  }
}

export async function verifyMobileCallPush(): Promise<void> {
  if (!getFirebaseMessaging()) return;
  try {
    // Confirms the service account can authenticate; never log the returned access token.
    await getApp(APP_NAME).options.credential?.getAccessToken();
    logger.info("[MobilePush] Firebase server credentials authenticated");
  } catch {
    logger.error("[MobilePush] Firebase server authentication failed; native calls cannot be delivered");
  }
}

export async function notifyMobileIncomingCall(userId: string, call: IncomingCallPush): Promise<void> {
  const pool = getPool();
  const { rows } = await pool.query<TokenRow>(
    "SELECT token, platform, token_type, device_id FROM mobile_push_tokens WHERE user_id = $1",
    [userId],
  );
  if (!rows.length) return;

  const androidTokens = rows.filter((row) => row.platform === "android" && row.token_type === "FCM");
  const firebase = androidTokens.length ? getFirebaseMessaging() : null;
  const sentNative = new Set<string>();
  const sentDevices = new Set<string>();
  if (firebase) {
    // FCM data-only messages are parsed by ExpoCallKitTelecomMessagingService before JS starts.
    const incomingCall = JSON.stringify({
      eventId: randomUUID(),
      serverCallId: call.bookingId,
      hasVideo: call.callType === "video",
      startedAt: new Date().toISOString(),
      caller: { id: call.callerId, displayName: call.callerName },
      metadata: {
        bookingId: call.bookingId,
        callType: call.callType,
        sessionGeneration: call.sessionGeneration,
        videoRoomUrl: call.videoRoomUrl,
        mediaProvider: call.mediaProvider,
        serviceName: call.serviceName,
        subtitle: call.subtitle,
        patientName: call.callerRole === "seeker" ? call.subtitle : undefined,
      },
    });
    // FCM multicast accepts at most 500 tokens per batch.
    for (let offset = 0; offset < androidTokens.length; offset += 500) {
      const batch = androidTokens.slice(offset, offset + 500);
      try {
        const result = await firebase.sendEachForMulticast({
          tokens: batch.map((row) => row.token),
          data: { messageType: "incomingCall", incomingCall },
          android: { priority: "high", ttl: 45_000 },
        });
        for (let i = 0; i < result.responses.length; i++) {
          const response = result.responses[i];
          if (response.success) {
            sentNative.add(batch[i].token);
            const deviceId = batch[i].device_id;
            if (deviceId) sentDevices.add(deviceId);
          } else {
            const code = response.error?.code;
            logger.warn({ code }, "[MobilePush] Native call delivery failed");
            if (code === "messaging/registration-token-not-registered" ||
                code === "messaging/invalid-registration-token") {
              await pool.query("DELETE FROM mobile_push_tokens WHERE token = $1", [batch[i].token]);
            }
          }
        }
      } catch (error) {
        logger.error({ err: error }, "[MobilePush] Native call delivery failed");
      }
    }
    logger.info({ delivered: sentNative.size, attempted: androidTokens.length }, "[MobilePush] Native incoming calls");
  }

  // Keep Expo notifications for iOS and as an Android fallback when native FCM did not send.
  const expoRows = rows.filter((row) => row.token_type === "EXPO" && Expo.isExpoPushToken(row.token));
  const messages: ExpoPushMessage[] = expoRows
    .filter((row) => row.platform !== "android" || !row.device_id || !sentDevices.has(row.device_id))
    .map((row) => ({
      to: row.token,
      sound: "default",
      title: call.callerRole === "seeker" ? call.callerName : "Incoming Consultation",
      body: call.subtitle,
      data: {
        type: "incoming_call",
        bookingId: call.bookingId,
        callerName: call.callerName,
        callerRole: call.callerRole,
        callType: call.callType,
        sessionGeneration: call.sessionGeneration,
        videoRoomUrl: call.videoRoomUrl,
        subtitle: call.subtitle,
        patientName: call.callerRole === "seeker" ? call.subtitle : undefined,
      },
      priority: "high",
    }));
  if (!messages.length) return;
  const expo = new Expo();
  for (const chunk of expo.chunkPushNotifications(messages)) {
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      for (let i = 0; i < tickets.length; i++) {
        const ticket = tickets[i];
        if (ticket.status !== "error") continue;
        logger.warn({ error: ticket.details?.error, message: ticket.message }, "[MobilePush] Expo delivery failed");
        if (ticket.details?.error === "DeviceNotRegistered") {
          await pool.query("DELETE FROM mobile_push_tokens WHERE token = $1", [chunk[i].to]);
        }
      }
    } catch (error) {
      logger.error({ err: error }, "[MobilePush] Expo delivery failed");
    }
  }
}

export async function notifyMobileCallEnded(
  userId: string,
  call: { bookingId: string; sessionGeneration: string },
): Promise<void> {
  const pool = getPool();
  const { rows } = await pool.query<TokenRow>(
    "SELECT token FROM mobile_push_tokens WHERE user_id = $1 AND platform = 'android' AND token_type = 'FCM'",
    [userId],
  );
  if (!rows.length) return;

  const firebase = getFirebaseMessaging();
  if (!firebase) return;

  const callEnded = JSON.stringify({
    bookingId: call.bookingId,
    sessionGeneration: call.sessionGeneration,
  });

  for (let offset = 0; offset < rows.length; offset += 500) {
    const batch = rows.slice(offset, offset + 500);
    try {
      const result = await firebase.sendEachForMulticast({
        tokens: batch.map((row) => row.token),
        data: { messageType: "callEnded", callEnded },
        android: { priority: "high", ttl: 60_000 },
      });

      for (let i = 0; i < result.responses.length; i++) {
        const response = result.responses[i];
        if (response.success) continue;

        const code = response.error?.code;
        logger.warn({ code }, "[MobilePush] Native call cleanup delivery failed");
        if (
          code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token"
        ) {
          await pool.query("DELETE FROM mobile_push_tokens WHERE token = $1", [batch[i].token]);
        }
      }
    } catch (error) {
      logger.error({ err: error }, "[MobilePush] Native call cleanup delivery failed");
    }
  }
}