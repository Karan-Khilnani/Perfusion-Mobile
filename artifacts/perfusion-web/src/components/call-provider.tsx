import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useCallEvents, type CallEvent } from "@/hooks/use-call-events";
import { IncomingCallOverlay } from "./incoming-call-overlay";
import { subscribeToPush, isPushSupported, getNotificationPermission, hasPushSubscription } from "@/lib/push-subscription";
import { useToast } from "@/hooks/use-toast";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";

const PUSH_DISMISSED_KEY = "push_prompt_dismissed_until";

function getPromptDismissedUntil(): number {
  try {
    return parseInt(localStorage.getItem(PUSH_DISMISSED_KEY) || "0", 10);
  } catch {
    return 0;
  }
}

function setPromptDismissedFor24h() {
  try {
    localStorage.setItem(PUSH_DISMISSED_KEY, String(Date.now() + 24 * 60 * 60 * 1000));
  } catch {}
}

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const { toast } = useToast();
  const [incomingCall, setIncomingCall] = useState<CallEvent | null>(null);
  const [showPermissionPrompt, setShowPermissionPrompt] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUnlocked = useRef(false);
  const callAutoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const incomingCallRef = useRef<CallEvent | null>(null);
  const pendingIncomingCallRef = useRef<CallEvent | null>(null);
  const incomingValidationRef = useRef(0);

  // Create the audio element once and unlock it on first user interaction.
  useEffect(() => {
    const audio = new Audio("/ringing.mp3");
    audio.loop = true;
    audio.volume = 1.0;
    audio.preload = "auto";
    audioRef.current = audio;

    function unlock() {
      if (audioUnlocked.current) return;
      audioUnlocked.current = true;
      // Unlock the browser audio context with a completely silent 1-sample
      // buffer. This satisfies iOS Safari's "user gesture required" rule
      // without making any audible sound. The ringtone will only play when an
      // actual incoming call arrives.
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          const buf = ctx.createBuffer(1, 1, 22050);
          const src = ctx.createBufferSource();
          src.buffer = buf;
          src.connect(ctx.destination);
          src.start(0);
          ctx.close();
        }
      } catch {}
      document.removeEventListener("click", unlock);
      document.removeEventListener("touchstart", unlock);
      document.removeEventListener("keydown", unlock);
    }

    document.addEventListener("click", unlock);
    document.addEventListener("touchstart", unlock);
    document.addEventListener("keydown", unlock);

    return () => {
      document.removeEventListener("click", unlock);
      document.removeEventListener("touchstart", unlock);
      document.removeEventListener("keydown", unlock);
      audio.pause();
    };
  }, []);

  // Play/stop ringing based on incoming call state
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (incomingCall) {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    } else {
      audio.pause();
      audio.currentTime = 0;
    }
  }, [incomingCall]);

  const pendingSwCall = useRef<CallEvent | null>(null);

  const dismissNotification = useCallback((bookingId: string, sessionGeneration?: string) => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready.then((reg) => {
      reg.getNotifications({ tag: `call-${bookingId}` }).then((notifs) => {
        notifs.forEach((notification) => {
          if (!sessionGeneration || notification.data?.sessionGeneration === sessionGeneration) {
            notification.close();
          }
        });
      });
    }).catch(() => {});
  }, []);

  const clearCallAutoTimer = useCallback(() => {
    if (callAutoTimerRef.current) {
      clearTimeout(callAutoTimerRef.current);
      callAutoTimerRef.current = null;
    }
  }, []);

  const handleCallEvent = useCallback((event: CallEvent) => {
    if (event.type === "incoming_call") {
      if (!event.bookingId || !event.sessionGeneration) return;
      const validationId = ++incomingValidationRef.current;
      pendingIncomingCallRef.current = event;
      fetch(`/api/call/status/${encodeURIComponent(event.bookingId)}`, {
        credentials: "include",
        cache: "no-store",
      }).then(async (response) => {
        if (!response.ok) return;
        const currentSession = await response.json();
        if (
          validationId !== incomingValidationRef.current ||
          currentSession?.status !== "ringing" ||
          currentSession.sessionGeneration !== event.sessionGeneration
        ) {
          if (
            pendingIncomingCallRef.current?.bookingId === event.bookingId &&
            pendingIncomingCallRef.current.sessionGeneration === event.sessionGeneration
          ) {
            pendingIncomingCallRef.current = null;
          }
          return;
        }

        const currentCall = incomingCallRef.current;
        if (currentCall?.bookingId === event.bookingId && currentCall.sessionGeneration === event.sessionGeneration) {
          pendingIncomingCallRef.current = null;
          return;
        }
        incomingCallRef.current = event;
        pendingIncomingCallRef.current = null;
        setIncomingCall(event);
        // Auto-dismiss if the server's terminal SSE event is missed.
        clearCallAutoTimer();
        callAutoTimerRef.current = setTimeout(() => {
          if (
            incomingCallRef.current?.bookingId === event.bookingId &&
            incomingCallRef.current.sessionGeneration === event.sessionGeneration
          ) {
            incomingCallRef.current = null;
            setIncomingCall(null);
          }
          if (
            pendingIncomingCallRef.current?.bookingId === event.bookingId &&
            pendingIncomingCallRef.current.sessionGeneration === event.sessionGeneration
          ) {
            pendingIncomingCallRef.current = null;
          }
        }, 70000);
      }).catch(() => {
        if (
          pendingIncomingCallRef.current?.bookingId === event.bookingId &&
          pendingIncomingCallRef.current.sessionGeneration === event.sessionGeneration
        ) {
          pendingIncomingCallRef.current = null;
        }
      });
      return;
    }

    const isTerminalCallEvent =
      event.type === "call_accepted" ||
      event.type === "call_declined" ||
      event.type === "call_timeout" ||
      event.type === "call_cancelled" ||
      event.type === "call_ended";
    if (isTerminalCallEvent && event.bookingId && event.sessionGeneration) {
      dismissNotification(event.bookingId, event.sessionGeneration);
      if (
        pendingIncomingCallRef.current?.bookingId === event.bookingId &&
        pendingIncomingCallRef.current.sessionGeneration === event.sessionGeneration
      ) {
        pendingIncomingCallRef.current = null;
        incomingValidationRef.current++;
      }
      const currentCall = incomingCallRef.current;
      if (currentCall?.bookingId === event.bookingId && currentCall.sessionGeneration === event.sessionGeneration) {
        incomingCallRef.current = null;
        clearCallAutoTimer();
        setIncomingCall(null);
      }
    }
  }, [dismissNotification, clearCallAutoTimer]);

  useCallEvents(handleCallEvent);

  // Listen for SW postMessage INCOMING_CALL events
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    function onSwMessage(event: MessageEvent) {
      if (event.data?.type === "CALL_ACTION_REJECTED") {
        const current = incomingCallRef.current;
        if (
          current &&
          current?.bookingId === event.data.bookingId &&
          current.sessionGeneration === event.data.sessionGeneration
        ) {
          incomingCallRef.current = null;
          pendingIncomingCallRef.current = null;
          incomingValidationRef.current++;
          clearCallAutoTimer();
          setIncomingCall(null);
          toast({
            title: "Call already ended",
            description: "This call has already been answered or ended.",
            variant: "destructive",
          });
        }
        return;
      }
      if (!event.data || event.data.type !== "INCOMING_CALL") return;
      if (!event.data.sessionGeneration) return;

      const callEvent: CallEvent = {
        type: "incoming_call",
        bookingId: event.data.bookingId,
        sessionGeneration: event.data.sessionGeneration,
        callerName: event.data.callerName,
        callerRole: event.data.callerRole,
        videoRoomUrl: event.data.videoRoomUrl,
        mediaProvider: event.data.mediaProvider,
        serviceName: event.data.serviceName,
        subtitle: event.data.subtitle,
        callType: event.data.callType,
      };

      if (document.hidden) {
        pendingSwCall.current = callEvent;
      } else {
        handleCallEvent(callEvent);
      }
    }

    function onVisibilityChange() {
      if (!document.hidden && pendingSwCall.current) {
        handleCallEvent(pendingSwCall.current);
        pendingSwCall.current = null;
      }
    }

    navigator.serviceWorker.addEventListener("message", onSwMessage);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      navigator.serviceWorker.removeEventListener("message", onSwMessage);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [handleCallEvent, clearCallAutoTimer, toast]);

  // Check push subscription status and prompt when needed
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    if (!isPushSupported()) {
      setNotificationsEnabled(false);
      return;
    }

    const permission = getNotificationPermission();

    if (permission === "granted") {
      // Already allowed — silently ensure the subscription is registered in the DB.
      // This handles: first load after granting, re-subscribe after DB wipe, key rotation.
      hasPushSubscription().then((hasSub) => {
        if (hasSub) {
          // Browser has a subscription — re-save it to DB in case it was lost
          subscribeToPush()
            .then((ok) => setNotificationsEnabled(ok))
            .catch(() => setNotificationsEnabled(false));
        } else {
          // Browser has no subscription at all — need user to re-grant
          setNotificationsEnabled(false);
          // push prompt disabled
        }
      });
    } else if (permission === "default") {
      // Never asked — prompt disabled for now
      setNotificationsEnabled(false);
    } else {
      // "denied" — user has blocked notifications in browser settings
      setNotificationsEnabled(false);
    }
  }, [isAuthenticated, user]);

  const handleEnableNotifications = async () => {
    setShowPermissionPrompt(false);
    const success = await subscribeToPush();
    setNotificationsEnabled(success);
    if (success) {
      toast({
        title: "Notifications enabled",
        description: "You'll receive incoming call alerts even when the app is in the background.",
      });
    } else {
      const permission = getNotificationPermission();
      if (permission === "denied") {
        toast({
          title: "Notifications blocked",
          description: "Please allow notifications in your browser settings, then reload.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Could not enable notifications",
          description: "Something went wrong. Please try again.",
          variant: "destructive",
        });
      }
    }
  };

  const handleDismissPrompt = () => {
    setShowPermissionPrompt(false);
    setPromptDismissedFor24h();
  };

  return (
    <>
      {children}

      {/* Incoming call overlay */}
      {incomingCall && (
        <IncomingCallOverlay
          callEvent={incomingCall}
          onDismiss={() => {
            incomingCallRef.current = null;
            pendingIncomingCallRef.current = null;
            incomingValidationRef.current++;
            clearCallAutoTimer();
            setIncomingCall(null);
          }}
        />
      )}

      {/* Push notification permission prompt */}
      {showPermissionPrompt && isAuthenticated && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4">
          <div className="rounded-xl border bg-background shadow-lg p-4 flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Bell className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Enable call notifications</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Required to receive incoming consultation call alerts when this tab is not active.
              </p>
              <div className="flex items-center gap-2 mt-3">
                <Button
                  size="sm"
                  onClick={handleEnableNotifications}
                  data-testid="button-enable-notifications"
                >
                  Enable
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleDismissPrompt}
                  data-testid="button-dismiss-notifications"
                >
                  Remind me later
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
