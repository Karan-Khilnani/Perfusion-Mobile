import { useEffect, useRef, useState } from "react";
import { Phone, PhoneOff, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import type { CallEvent } from "@/hooks/use-call-events";

interface Props {
  callEvent: CallEvent | null;
  onDismiss: () => void;
}

export function IncomingCallOverlay({ callEvent, onDismiss }: Props) {
  const [, navigate] = useLocation();
  const [accepting, setAccepting] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Play ringtone while incoming call is active
  useEffect(() => {
    if (!callEvent) return;

    // Create oscillator-based ringtone using Web Audio API
    let audioContext: AudioContext | null = null;
    let interval: ReturnType<typeof setInterval>;
    let stopped = false;

    function playRing() {
      if (stopped) return;
      try {
        type WebkitWindow = typeof window & { webkitAudioContext?: typeof AudioContext };
        const AudioCtx = window.AudioContext || (window as WebkitWindow).webkitAudioContext;
        audioContext = new AudioCtx();
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.frequency.value = 480;
        gain.gain.setValueAtTime(0.3, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.4);
        osc.start(audioContext.currentTime);
        osc.stop(audioContext.currentTime + 0.4);
      } catch {}
    }

    playRing();
    interval = setInterval(playRing, 1200);

    return () => {
      stopped = true;
      clearInterval(interval);
      try { audioContext?.close(); } catch {}
    };
  }, [callEvent]);

  if (!callEvent) return null;

  const handleAccept = async () => {
    setAccepting(true);
    try {
      await apiRequest("POST", `/api/call/accept/${callEvent.bookingId}`, {});
      onDismiss();
      // callerRole tells us who called; recipient is the opposite role
      const returnTo = callEvent.callerRole === "provider" ? "/user/orders" : "/provider/bookings";
      // accepted=true tells video-room to skip precall and go straight to connected
      navigate(`/video/${encodeURIComponent(callEvent.videoRoomUrl || "")}?returnTo=${returnTo}&accepted=true`);
    } catch {
      setAccepting(false);
    }
  };

  const handleDecline = async () => {
    try {
      await apiRequest("POST", `/api/call/decline/${callEvent.bookingId}`, {});
    } catch {}
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
          <p className="text-sm font-medium text-white/70 uppercase tracking-wider">
            Incoming Consultation
          </p>
          <h2 className="text-2xl font-bold">{callEvent.callerName}</h2>
          {callEvent.serviceName && (
            <p className="text-sm text-white/60">{callEvent.serviceName}</p>
          )}
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
