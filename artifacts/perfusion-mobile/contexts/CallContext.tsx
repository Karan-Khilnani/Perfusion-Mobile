import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, Platform } from "react-native";
import { router } from "expo-router";

import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/hooks/useApi";
import {
  endNativeCallForSession,
  getNativeActiveCallSession,
  initializeNativeCalls,
  reportNativeIncomingCall,
} from "@/lib/native-calls";
import { getPushDeviceId } from "@/lib/push-device";

export interface IncomingCallData {
  bookingId: string;
  sessionGeneration?: string;
  callerName: string;
  callerRole: string;
  videoRoomUrl: string;
  serviceName?: string;
  subtitle?: string;
  callType?: "voice" | "video";
}

interface CallContextType {
  incomingCall: IncomingCallData | null;
  acceptCall: (bookingId: string) => Promise<void>;
  declineCall: (bookingId: string) => Promise<void>;
  dismissCall: () => void;
}

const CallContext = createContext<CallContextType | null>(null);

function sessionKey(
  call: Pick<IncomingCallData, "bookingId" | "sessionGeneration">,
) {
  return `${call.bookingId}:${call.sessionGeneration || ""}`;
}

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(
    null
  );
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nativeReportedSessionRef = useRef<string | null>(null);
  const incomingCheckInFlightRef = useRef(false);

  const checkIncomingCall = useCallback(async () => {
    if (!user || incomingCheckInFlightRef.current) return;
    incomingCheckInFlightRef.current = true;
    try {
      const res = await apiFetch("/api/call/incoming");
      if (res.ok) {
        const data = (await res.json()) as IncomingCallData | null;
        if (data?.bookingId) {
          const key = sessionKey(data);
          if (Platform.OS !== "web") {
            if (nativeReportedSessionRef.current === key) {
              setIncomingCall(null);
              return;
            }
            const nativeReported = await reportNativeIncomingCall(data);
            if (nativeReported) {
              nativeReportedSessionRef.current = key;
              setIncomingCall(null);
              return;
            }
          }
          setIncomingCall((current) =>
            current && sessionKey(current) === key ? current : data,
          );
        } else {
          setIncomingCall(null);
        }
      }
    } catch (error) {
      console.warn("[call-context] Could not check for an incoming call", error);
    } finally {
      incomingCheckInFlightRef.current = false;
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setIncomingCall(null);
      nativeReportedSessionRef.current = null;
      return;
    }
    checkIncomingCall();
    pollRef.current = setInterval(checkIncomingCall, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [checkIncomingCall, user]);

  const reconcileNativeCall = useCallback(async () => {
    if (!user || Platform.OS === "web") return;
    const session = await getNativeActiveCallSession();
    const bookingId = session?.incomingCallEvent?.metadata?.bookingId;
    const sessionGeneration =
      session?.incomingCallEvent?.metadata?.sessionGeneration;
    if (
      typeof bookingId !== "string" ||
      typeof sessionGeneration !== "string" ||
      !sessionGeneration
    ) {
      nativeReportedSessionRef.current = null;
      return;
    }

    const key = `${bookingId}:${sessionGeneration}`;
    try {
      const response = await apiFetch(`/api/call/status/${bookingId}`);
      if (!response.ok) return;
      const status: {
        status?: string;
        sessionGeneration?: string;
      } = await response.json();
      if (
        status.sessionGeneration !== sessionGeneration ||
        (status.status !== "ringing" && status.status !== "accepted")
      ) {
        await endNativeCallForSession(bookingId, sessionGeneration);
        if (nativeReportedSessionRef.current === key) {
          nativeReportedSessionRef.current = null;
        }
        setIncomingCall((current) =>
          current && sessionKey(current) === key ? null : current,
        );
        return;
      }
      nativeReportedSessionRef.current = key;
    } catch (error) {
      console.warn("[call-context] Could not reconcile the system call", error);
    }
  }, [user]);

  useEffect(() => {
    if (!user || Platform.OS === "web") return;
    if (AppState.currentState === "active") {
      reconcileNativeCall();
      checkIncomingCall();
    }
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        reconcileNativeCall();
        checkIncomingCall();
      }
    });
    return () => subscription.remove();
  }, [checkIncomingCall, reconcileNativeCall, user]);

  useEffect(() => {
    if (!user || Platform.OS === "web") return;

    let cleanup = () => {};
    let cancelled = false;
    initializeNativeCalls({
      onAnswered: async (bookingId, sessionGeneration) => {
        const response = await apiFetch(`/api/call/accept/${bookingId}`, {
          method: "POST",
          body: JSON.stringify({ sessionGeneration }),
        });
        if (!response.ok) throw new Error("Could not accept call");
        const result: { callType?: "voice" | "video"; sessionGeneration?: string } = await response.json();
        setIncomingCall(null);
        router.push(`/call/${bookingId}?mode=${result.callType === "voice" ? "voice" : "video"}&generation=${result.sessionGeneration || ""}`);
      },
      onEnded: async (bookingId, sessionGeneration) => {
        const statusResponse = await apiFetch(`/api/call/status/${bookingId}`);
        if (!statusResponse.ok) {
          throw new Error("Could not verify the call before ending it");
        }
        const status: {
          status?: string;
          sessionGeneration?: string;
          isCaller?: boolean;
        } = await statusResponse.json();
        if (status.sessionGeneration !== sessionGeneration) {
          const key = `${bookingId}:${sessionGeneration}`;
          if (nativeReportedSessionRef.current === key) {
            nativeReportedSessionRef.current = null;
          }
          return;
        }
        const action =
          status.status === "accepted"
            ? "end"
            : status.status === "ringing"
              ? status.isCaller
                ? "cancel"
                : "decline"
              : null;
        if (action) {
          const response = await apiFetch(`/api/call/${action}/${bookingId}`, {
            method: "POST",
            body: JSON.stringify({ sessionGeneration }),
          });
          if (!response.ok && response.status !== 404 && response.status !== 409) {
            throw new Error("Could not end the system call");
          }
        }
        const key = `${bookingId}:${sessionGeneration}`;
        if (nativeReportedSessionRef.current === key) {
          nativeReportedSessionRef.current = null;
        }
        setIncomingCall(null);
      },
      onToken: async (token, tokenType) => {
        await apiFetch("/api/push/mobile-token", {
          method: "POST",
          body: JSON.stringify({
            token,
            platform: Platform.OS,
            tokenType,
            deviceId: await getPushDeviceId(),
          }),
        });
      },
    }).then((dispose) => {
      if (cancelled) dispose();
      else cleanup = dispose;
    });

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [user]);

  const acceptCall = async (bookingId: string) => {
    const response = await apiFetch(`/api/call/accept/${bookingId}`, {
      method: "POST",
      body: JSON.stringify({ sessionGeneration: incomingCall?.sessionGeneration }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.error || "Could not accept call");
    }
    setIncomingCall(null);
  };

  const declineCall = async (bookingId: string) => {
    const response = await apiFetch(`/api/call/decline/${bookingId}`, {
      method: "POST",
      body: JSON.stringify({ sessionGeneration: incomingCall?.sessionGeneration }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.error || "Could not decline call");
    }
    setIncomingCall(null);
  };

  const dismissCall = () => setIncomingCall(null);

  return (
    <CallContext.Provider
      value={{ incomingCall, acceptCall, declineCall, dismissCall }}
    >
      {children}
    </CallContext.Provider>
  );
}

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCall must be used within CallProvider");
  return ctx;
}
