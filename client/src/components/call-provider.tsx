import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useCallEvents, type CallEvent } from "@/hooks/use-call-events";
import { IncomingCallOverlay } from "./incoming-call-overlay";
import { subscribeToPush, isPushSupported, getNotificationPermission } from "@/lib/push-subscription";
import { useToast } from "@/hooks/use-toast";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const { toast } = useToast();
  const [incomingCall, setIncomingCall] = useState<CallEvent | null>(null);
  const [showPermissionPrompt, setShowPermissionPrompt] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUnlocked = useRef(false);

  // Create the audio element once and unlock it on first user interaction.
  // Browsers block audio that isn't triggered by a direct user gesture, so we
  // silently play-then-pause on the first click to satisfy the autoplay policy.
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

  // Pending call received via SW message while page was hidden
  const pendingSwCall = useRef<CallEvent | null>(null);

  // Close the OS push notification for a call by its tag
  const dismissNotification = useCallback((bookingId: string) => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready.then((reg) => {
      reg.getNotifications({ tag: `call-${bookingId}` }).then((notifs) => {
        notifs.forEach((n) => n.close());
      });
    }).catch(() => {});
  }, []);

  // Handle incoming call events (from SSE or SW message)
  const handleCallEvent = useCallback((event: CallEvent) => {
    if (event.type === "incoming_call") {
      setIncomingCall(event);
    } else if (
      event.type === "call_timeout" ||
      event.type === "call_cancelled"
    ) {
      // Dismiss OS notification so it doesn't linger after the call ends
      if (event.bookingId) dismissNotification(event.bookingId);
      setIncomingCall(null);
    }
  }, [dismissNotification]);

  useCallEvents(handleCallEvent);

  // Listen for INCOMING_CALL messages posted by the service worker when a
  // push arrives. If the page is hidden (backgrounded), queue the call and
  // fire it the moment the page becomes visible again (user taps notification).
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
      };

      if (document.hidden) {
        // Page is backgrounded — queue and trigger when visible
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

  // Check push permission and prompt if needed
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    if (!isPushSupported()) return;

    const permission = getNotificationPermission();
    if (permission === "default") {
      // Show prompt after a short delay to not be intrusive on load
      const t = setTimeout(() => setShowPermissionPrompt(true), 3000);
      return () => clearTimeout(t);
    } else if (permission === "granted") {
      // Already granted — silently re-subscribe (handles refresh/updates)
      subscribeToPush().catch(() => {});
    }
  }, [isAuthenticated, user]);

  const handleEnableNotifications = async () => {
    setShowPermissionPrompt(false);
    const success = await subscribeToPush();
    if (success) {
      toast({
        title: "Notifications enabled",
        description: "You'll receive ringing notifications for incoming consultation calls.",
      });
    } else {
      toast({
        title: "Notifications not enabled",
        description: "You can enable them later from your browser settings.",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      {children}

      {/* Incoming call overlay */}
      {incomingCall && (
        <IncomingCallOverlay
          callEvent={incomingCall}
          onDismiss={() => setIncomingCall(null)}
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
                Get notified when a consultation call starts — even if the app is closed.
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
                  onClick={() => setShowPermissionPrompt(false)}
                  data-testid="button-dismiss-notifications"
                >
                  Not now
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
