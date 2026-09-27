import { useEffect, useRef, useCallback } from "react";
import { useAuth } from "./use-auth";

export type CallEventType =
  | "incoming_call"
  | "call_accepted"
  | "call_declined"
  | "call_timeout"
  | "call_cancelled"
  | "call_ended"
  | "document_uploaded"
  | "case_file_updated";

export interface CallEvent {
  type: CallEventType;
  bookingId: string;
  sessionGeneration?: string;
  callerName?: string;
  callerRole?: "seeker" | "provider";
  videoRoomUrl?: string;
  mediaProvider?: "daily" | "stream";
  serviceName?: string;
  subtitle?: string;
  callType?: "voice" | "video";
  url?: string;
  fileName?: string;
}

type CallEventHandler = (event: CallEvent) => void;

export function useCallEvents(onEvent: CallEventHandler, onOpen?: () => void) {
  const { isAuthenticated } = useAuth();
  const eventSourceRef = useRef<EventSource | null>(null);
  const handlerRef = useRef<CallEventHandler>(onEvent);
  const onOpenRef = useRef(onOpen);

  // Keep handler ref up to date without re-connecting
  useEffect(() => {
    handlerRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    onOpenRef.current = onOpen;
  }, [onOpen]);

  useEffect(() => {
    if (!isAuthenticated) return;

    let reconnectTimeout: ReturnType<typeof setTimeout>;
    let active = true;

    function connect() {
      if (!active) return;

      const es = new EventSource("/api/call-events", { withCredentials: true });
      eventSourceRef.current = es;

      es.onopen = () => {
        if (active) {
          onOpenRef.current?.();
        }
      };

      es.onmessage = (event) => {
        try {
          const data: CallEvent = JSON.parse(event.data);
          handlerRef.current(data);
        } catch {
          // ignore parse errors
        }
      };

      es.onerror = () => {
        es.close();
        eventSourceRef.current = null;
        if (active) {
          // Reconnect after 3 seconds
          reconnectTimeout = setTimeout(connect, 3000);
        }
      };
    }

    connect();

    return () => {
      active = false;
      clearTimeout(reconnectTimeout);
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, [isAuthenticated]);
}
