import { Platform } from "react-native";
import { apiFetch } from "@/hooks/useApi";

import type {
  CallSession,
  IncomingCallEvent,
  PushTokenType,
} from "expo-callkit-telecom";

export interface NativeIncomingCall {
  bookingId: string;
  sessionGeneration?: string;
  callerName: string;
  callerRole: string;
  videoRoomUrl: string;
  serviceName?: string;
  subtitle?: string;
  patientName?: string;
  callType?: "voice" | "video";
}

interface NativeCallHandlers {
  onAnswered: (bookingId: string, sessionGeneration?: string) => Promise<void>;
  onEnded: (
    bookingId: string,
    sessionGeneration: string,
  ) => Promise<void>;
  onToken: (token: string, type: PushTokenType) => Promise<void>;
}

type CallsModule = typeof import("expo-callkit-telecom");

let callsModulePromise: Promise<CallsModule | null> | null = null;

async function getCallsModule(): Promise<CallsModule | null> {
  if (Platform.OS === "web") return null;
  if (!callsModulePromise) {
    callsModulePromise = import("expo-callkit-telecom").catch(() => null);
  }
  return callsModulePromise;
}

function bookingIdFromSession(session: CallSession | null): string | null {
  const value = session?.incomingCallEvent?.metadata?.bookingId;
  return typeof value === "string" ? value : null;
}

function generationFromSession(session: CallSession | null): string | undefined {
  const value = session?.incomingCallEvent?.metadata?.sessionGeneration;
  return typeof value === "string" ? value : undefined;
}

function isSameCallSession(
  session: CallSession | null,
  bookingId: string,
  sessionGeneration: string,
): boolean {
  return (
    bookingIdFromSession(session) === bookingId &&
    generationFromSession(session) === sessionGeneration
  );
}

export async function getNativeActiveCallSession(): Promise<CallSession | null> {
  const calls = await getCallsModule();
  if (!calls) return null;

  try {
    return await calls.getActiveCallSession();
  } catch (error) {
    console.warn("[native-calls] Could not read the active system call", error);
    return null;
  }
}

/**
 * Clears a native call only when it is the exact session we are reconciling.
 * The generation check prevents a delayed end event from clearing a newer call.
 */
export async function endNativeCallForSession(
  bookingId: string,
  sessionGeneration: string,
  reason: "remoteEnded" | "failed" = "remoteEnded",
): Promise<boolean> {
  if (!sessionGeneration) return false;
  const calls = await getCallsModule();
  if (!calls) return false;

  try {
    const session = await calls.getActiveCallSession();
    if (!session || !isSameCallSession(session, bookingId, sessionGeneration)) {
      return false;
    }
    await calls.reportCallEnded(session.id, reason);
    return true;
  } catch (error) {
    console.warn("[native-calls] Could not clear the ended system call", error);
    return false;
  }
}

export async function initializeNativeCalls(
  handlers: NativeCallHandlers,
): Promise<() => void> {
  const calls = await getCallsModule();
  if (!calls) return () => {};

  const subscriptions = [
    calls.addVoIPPushTokenUpdatedListener((event) => {
      if (event.token) {
        handlers.onToken(event.token, event.type).catch(() => {});
      }
    }),
    calls.addCallAnsweredListener(async ({ id, requestId }) => {
      const session = await calls.getActiveCallSession();
      const bookingId = bookingIdFromSession(session);
      if (!bookingId) {
        await calls.failIncomingCallConnected(id, requestId);
        return;
      }

      try {
        await handlers.onAnswered(bookingId, generationFromSession(session));
        await calls.fulfillIncomingCallConnected(requestId);
      } catch {
        await calls.failIncomingCallConnected(id, requestId);
      }
    }),
    calls.addCallEndedListener(({ session }) => {
      const bookingId = bookingIdFromSession(session);
      const sessionGeneration = generationFromSession(session);
      if (bookingId && sessionGeneration) {
        handlers.onEnded(bookingId, sessionGeneration).catch((error) => {
          console.warn("[native-calls] Could not sync a system call end", error);
        });
      }
    }),
  ];

  calls.registerVoIPPush();
  const currentToken = calls.getVoIPPushToken();
  if (currentToken) {
    handlers.onToken(currentToken.token, currentToken.type).catch(() => {});
  }

  return () => subscriptions.forEach((subscription) => subscription.remove());
}

export async function deregisterNativeCallToken(): Promise<void> {
  const calls = await getCallsModule();
  const token = calls?.getVoIPPushToken();
  if (!token) return;
  const response = await apiFetch("/api/push/mobile-token", {
    method: "DELETE",
    body: JSON.stringify({ token: token.token }),
  });
  if (!response.ok) throw new Error("Failed to remove native call token");
}

export async function reportNativeIncomingCall(
  incomingCall: NativeIncomingCall,
): Promise<boolean> {
  const calls = await getCallsModule();
  if (!calls) return false;

  if (incomingCall.sessionGeneration) {
    const activeSession = await getNativeActiveCallSession();
    if (
      activeSession &&
      isSameCallSession(
        activeSession,
        incomingCall.bookingId,
        incomingCall.sessionGeneration,
      )
    ) {
      return true;
    }
  }

  const event: IncomingCallEvent = {
    eventId: incomingCall.sessionGeneration || incomingCall.bookingId,
    serverCallId: incomingCall.sessionGeneration || incomingCall.bookingId,
    hasVideo: incomingCall.callType !== "voice",
    startedAt: new Date().toISOString(),
    caller: {
      id: `${incomingCall.callerRole}:${incomingCall.callerName}`,
      displayName: incomingCall.callerName,
    },
    metadata: {
      bookingId: incomingCall.bookingId,
      sessionGeneration: incomingCall.sessionGeneration,
      videoRoomUrl: incomingCall.videoRoomUrl,
      serviceName: incomingCall.serviceName,
      subtitle: incomingCall.subtitle,
      patientName: incomingCall.callerRole === "seeker" ? incomingCall.patientName || incomingCall.subtitle : undefined,
      callType: incomingCall.callType,
    },
  };

  try {
    await calls.reportIncomingCall(event);
    return true;
  } catch (error) {
    console.warn("[native-calls] Could not report an incoming system call", error);
    return false;
  }
}