import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useCallEvents, type CallEvent } from "@/hooks/use-call-events";
import { IncomingCallOverlay } from "./incoming-call-overlay";
import { subscribeToPush, isPushSupported, getNotificationPermission, hasPushSubscription } from "@/lib/push-subscription";
import { useToast } from "@/hooks/use-toast";
import { Bell, BellOff } from "lucide-react";
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
      audio.play().then(() => { audio.pause(); audio.currentTime = 0; }).catch(() => {});
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

  const dismissNotification = useCallback((bookingId: string) => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready.then((reg) => {
      reg.getNotifications({ tag: `call-${bookingId}` }).then((notifs) => {
        notifs.forEach((n) => n.close());
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
      setIncomingCall(event);
      // Auto-dismiss after 70 seconds in case the server's timeout/cancel event
      // is missed (e.g. tab was backgrounded or SSE reconnected after the event).
      clearCallAutoTimer();
      callAutoTimerRef.current = setTimeout(() => {
        setIncomingCall(null);
      }, 70000);
    } else if (event.type === "call_timeout" || event.type === "call_cancelled") {
      if (event.bookingId) dismissNotification(event.bookingId);
      clearCallAutoTimer();
      setIncomingCall(null);
    }
  }, [dismissNotification, clearCallAutoTimer]);

  useCallEvents(handleCallEvent);

  // Listen for SW postMessage INCOMING_CALL events
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    function onSwMessage(event: MessageEvent) {
      if (!event.data || event.data.type !== "INCOMING_CALL") return;

      const callEvent: CallEvent = {
        type: "incoming_call",
        bookingId: event.data.bookingId,
        callerName: event.data.callerName,
        callerRole: event.data.callerRole,
        videoRoomUrl: event.data.videoRoomUrl,
        serviceName: event.data.serviceName,
        subtitle: event.data.subtitle,
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
  }, [handleCallEvent]);

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
          const dismissedUntil = getPromptDismissedUntil();
          if (Date.now() > dismissedUntil) {
            setTimeout(() => setShowPermissionPrompt(true), 2000);
          }
        }
      });
    } else if (permission === "default") {
      // Never asked — show prompt unless recently dismissed
      setNotificationsEnabled(false);
      const dismissedUntil = getPromptDismissedUntil();
      if (Date.now() > dismissedUntil) {
        setTimeout(() => setShowPermissionPrompt(true), 2000);
      }
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
          onDismiss={() => { clearCallAutoTimer(); setIncomingCall(null); }}
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

      {/* Persistent mini-indicator when notifications are off and prompt is hidden */}
      {!showPermissionPrompt && notificationsEnabled === false && isAuthenticated && isPushSupported() && getNotificationPermission() !== "denied" && (
        <div className="fixed bottom-4 right-4 z-40">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 shadow-md text-xs"
            onClick={() => setShowPermissionPrompt(true)}
            data-testid="button-notifications-off-indicator"
            title="Call notifications are off — click to enable"
          >
            <BellOff className="h-3.5 w-3.5 text-muted-foreground" />
            Notifications off
          </Button>
        </div>
      )}
    </>
  );
}
