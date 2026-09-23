import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";
import { router } from "expo-router";

import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/hooks/useApi";
import {
  initializeNativeCalls,
  reportNativeIncomingCall,
} from "@/lib/native-calls";
import { getPushDeviceId } from "@/lib/push-device";

export interface IncomingCallData {
  bookingId: string;
  callerName: string;
  callerRole: string;
  videoRoomUrl: string;
  serviceName?: string;
  subtitle?: string;
}

interface CallContextType {
  incomingCall: IncomingCallData | null;
  acceptCall: (bookingId: string) => Promise<void>;
  declineCall: (bookingId: string) => Promise<void>;
  dismissCall: () => void;
}

const CallContext = createContext<CallContextType | null>(null);

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(
    null
  );
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nativeReportedBookingRef = useRef<string | null>(null);

  const checkIncomingCall = useCallback(async () => {
    if (!user) return;
    try {
      const res = await apiFetch("/api/call/incoming");
      if (res.ok) {
        const data = await res.json();
        if (data && data.bookingId && !incomingCall) {
          if (
            Platform.OS !== "web" &&
            nativeReportedBookingRef.current !== data.bookingId
          ) {
            const nativeReported = await reportNativeIncomingCall(data);
            if (nativeReported) {
              nativeReportedBookingRef.current = data.bookingId;
              return;
            }
          }
          setIncomingCall(data);
        } else if (!data || !data.bookingId) {
          nativeReportedBookingRef.current = null;
          setIncomingCall(null);
        }
      }
    } catch {}
  }, [incomingCall, user]);

  useEffect(() => {
    if (!user) {
      setIncomingCall(null);
      return;
    }
    checkIncomingCall();
    pollRef.current = setInterval(checkIncomingCall, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [checkIncomingCall, user]);

  useEffect(() => {
    if (!user || Platform.OS === "web") return;

    let cleanup = () => {};
    let cancelled = false;
    initializeNativeCalls({
      onAnswered: async (bookingId) => {
        const response = await apiFetch(`/api/call/accept/${bookingId}`, {
          method: "POST",
        });
        if (!response.ok) throw new Error("Could not accept call");
        setIncomingCall(null);
        router.push(`/call/${bookingId}`);
      },
      onDeclined: async (bookingId) => {
        await apiFetch(`/api/call/decline/${bookingId}`, { method: "POST" });
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
    const response = await apiFetch(`/api/call/accept/${bookingId}`, { method: "POST" });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.error || "Could not accept call");
    }
    setIncomingCall(null);
  };

  const declineCall = async (bookingId: string) => {
    const response = await apiFetch(`/api/call/decline/${bookingId}`, { method: "POST" });
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
