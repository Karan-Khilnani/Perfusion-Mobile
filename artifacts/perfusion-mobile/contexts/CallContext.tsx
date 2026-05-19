import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { apiFetch } from "@/hooks/useApi";

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
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(
    null
  );
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkIncomingCall = useCallback(async () => {
    try {
      const res = await apiFetch("/api/call/incoming");
      if (res.ok) {
        const data = await res.json();
        if (data && data.bookingId && !incomingCall) {
          setIncomingCall(data);
        } else if (!data || !data.bookingId) {
          setIncomingCall(null);
        }
      }
    } catch {}
  }, [incomingCall]);

  useEffect(() => {
    checkIncomingCall();
    pollRef.current = setInterval(checkIncomingCall, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [checkIncomingCall]);

  const acceptCall = async (bookingId: string) => {
    try {
      await apiFetch(`/api/call/accept/${bookingId}`, { method: "POST" });
    } catch {}
    setIncomingCall(null);
  };

  const declineCall = async (bookingId: string) => {
    try {
      await apiFetch(`/api/call/decline/${bookingId}`, { method: "POST" });
    } catch {}
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
