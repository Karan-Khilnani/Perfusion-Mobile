import { useState } from "react";
import { Phone, PhoneOff, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import type { CallEvent } from "@/hooks/use-call-events";

interface Props {
  callEvent: CallEvent | null;
  onDismiss: () => void;
}

export function IncomingCallOverlay({ callEvent, onDismiss }: Props) {
  const [, navigate] = useLocation();
  const [accepting, setAccepting] = useState(false);
  const { toast } = useToast();
  // Audio is managed by CallProvider (unlocked on first user interaction)

  if (!callEvent) return null;

  // Close the OS push notification for this call (if still showing)
  const dismissNotification = (bookingId: string, sessionGeneration: string) => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready.then((reg) => {
      reg.getNotifications({ tag: `call-${bookingId}` }).then((notifs) => {
        notifs.forEach((n) => {
          if (n.data?.sessionGeneration === sessionGeneration) n.close();
        });
      });
    }).catch(() => {});
  };

  const handleAccept = async () => {
    setAccepting(true);
    try {
      const sessionGeneration = callEvent.sessionGeneration;
      if (!sessionGeneration) throw new Error("The call session has changed. Please wait for the latest call alert.");
      const result = await apiRequest("POST", `/api/call/accept/${callEvent.bookingId}`, { sessionGeneration });
      const data = await result.json().catch(() => ({}));
      dismissNotification(callEvent.bookingId, sessionGeneration);
      onDismiss();
      // callerRole tells us who called; recipient is the opposite role
      const returnTo = callEvent.callerRole === "provider" ? "/user/orders" : "/provider/bookings";
      // Use videoRoomUrl from accept response if available (more up-to-date), fall back to event
      const roomUrl = data?.videoRoomUrl || callEvent.videoRoomUrl || "";
      // accepted=true tells video-room to skip precall and go straight to connected
      const voiceParam = callEvent.callType === "voice" ? "&voice=true" : "";
      const acceptedGeneration = data?.sessionGeneration || sessionGeneration;
      navigate(`/video/${encodeURIComponent(roomUrl)}?returnTo=${returnTo}&accepted=true${voiceParam}&sessionGeneration=${encodeURIComponent(acceptedGeneration)}`);
    } catch (err: any) {
      setAccepting(false);
      const msg = err?.message || "";
      if (msg.includes("404") || msg.includes("No active call")) {
        toast({
          title: "Call already ended",
          description: "The caller cancelled or the call timed out before you could answer.",
          variant: "destructive",
        });
        onDismiss();
      } else {
        toast({
          title: "Could not accept call",
          description: "Please check your connection and try again.",
          variant: "destructive",
        });
      }
    }
  };

  const handleDecline = async () => {
    try {
      if (!callEvent.sessionGeneration) throw new Error("The call session has changed");
      await apiRequest("POST", `/api/call/decline/${callEvent.bookingId}`, {
        sessionGeneration: callEvent.sessionGeneration,
      });
    } catch {}
    if (callEvent.sessionGeneration) dismissNotification(callEvent.bookingId, callEvent.sessionGeneration);
    onDismiss();
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-8 px-8 py-12 text-center text-white max-w-sm w-full">
        {/* Pulsing avatar */}
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-green-500/30 animate-ping" />
          <div className="relative flex h-28 w-28 items-center justify-center rounded-full bg-primary">
            <Stethoscope className="h-12 w-12 text-white" />
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-wide">
            {callEvent.callerRole === "seeker" ? callEvent.callerName || "Care Seeker" : "Perfusion"}
          </h2>
          <p className="text-base text-white/80">
            {callEvent.subtitle || callEvent.callerName}
          </p>
        </div>

        <div className="flex items-center gap-12">
          {/* Decline */}
          <div className="flex flex-col items-center gap-2">
            <Button
              size="icon"
              onClick={handleDecline}
              className="h-16 w-16 rounded-full bg-red-500 hover:bg-red-600 shadow-lg"
              data-testid="button-decline-call"
            >
              <PhoneOff className="h-7 w-7 text-white" />
            </Button>
            <span className="text-sm text-white/70">Decline</span>
          </div>

          {/* Accept */}
          <div className="flex flex-col items-center gap-2">
            <Button
              size="icon"
              onClick={handleAccept}
              disabled={accepting}
              className="h-16 w-16 rounded-full bg-green-500 hover:bg-green-600 shadow-lg"
              data-testid="button-accept-call"
            >
              <Phone className="h-7 w-7 text-white" />
            </Button>
            <span className="text-sm text-white/70">Accept</span>
          </div>
        </div>
      </div>
    </div>
  );
}
