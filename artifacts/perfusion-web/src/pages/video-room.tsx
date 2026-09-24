import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Video, VideoOff, Phone, Maximize2, Minimize2, Stethoscope, ClipboardList, PhoneOff, RefreshCw, PanelRightClose, PanelRightOpen, FileText, ShieldCheck, Clock } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCallEvents, type CallEvent } from "@/hooks/use-call-events";
import { ClinicalPanel } from "@/components/clinical-panel";
import { InCallSummaryForm } from "@/components/in-call-summary-form";
import type { Booking } from "@shared/schema";

import { getCallWindow, toISTTimeString, getPostRxStatus } from "@/lib/call-window";

type CallPhase =
  | "precall"
  | "ringing"
  | "connected"
  | "declined"
  | "timeout"
  | "window_closed"
  | "ended"
  | "unavailable";

type MobilePanel = "video" | "docs" | "summary";

type VideoRoomBooking = Booking & {
  seekerName?: string | null;
  providerName?: string | null;
  participantRole?: "seeker" | "provider";
  otherParticipantName?: string | null;
};

export default function VideoRoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [onCallDoctorName, setOnCallDoctorName] = useState("");
  const [onCallDoctorDesignation, setOnCallDoctorDesignation] = useState("");
  const [panelOpen, setPanelOpen] = useState(true);
  const [inCallDocs, setInCallDocs] = useState<{ url: string; name: string }[]>([]);
  const [phase, setPhase] = useState<CallPhase>("precall");
  const [showSummaryDialog, setShowSummaryDialog] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("video");
  const mobilePanelRef = useRef<MobilePanel>("video");
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [pipPos, setPipPos] = useState({ bottom: 80, right: 12 });
  const touchStartXRef = useRef<number>(0);
  const touchStartYRef = useRef<number>(0);
  const pipDragRef = useRef<{ startX: number; startY: number; startBottom: number; startRight: number } | null>(null);
  const isDraggingPip = useRef(false);

  // Tracks whether we've applied the initial accepted=true jump (avoid re-render loop)
  const joinedAsCalleeApplied = useRef(false);
  const ringStartedRef = useRef(false);
  const ringAlreadyStartedRef = useRef(new URLSearchParams(window.location.search).get("initiated") === "true");

  const phaseRef = useRef<CallPhase>("precall");
  // Stable ref to latest booking so unmount cleanup can access it
  const bookingRef = useRef<Booking | null>(null);

  const urlParams = new URLSearchParams(window.location.search);
  const returnTo = urlParams.get("returnTo") || "/user/orders";
  const returnPathSuggestsProvider = returnTo.includes("/provider");
  // If the user accepted an incoming call, skip precall and go straight to connected
  const joinedAsCallee = urlParams.get("accepted") === "true";
  const isVoiceCall = urlParams.get("voice") === "true";

  const { data: booking } = useQuery<VideoRoomBooking>({
    queryKey: ["/api/bookings/room", roomId],
    queryFn: async () => {
      const decoded = decodeURIComponent(roomId || "");
      const res = await fetch(`/api/bookings/room/${encodeURIComponent(decoded)}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!roomId,
  });
  const isProvider =
    booking?.participantRole === "provider" ||
    (!booking?.participantRole && returnPathSuggestsProvider);
  const otherParticipantName =
    booking?.otherParticipantName ||
    (isProvider
      ? booking?.seekerName || "Care Seeker"
      : booking?.providerName || booking?.serviceName || "Consultant");

  // Fetch the currently logged-in user so we can show their real name in the call
  const { data: authUser } = useQuery<{ firstName?: string; lastName?: string; email?: string }>({
    queryKey: ["/api/auth/user"],
  });

  const getDailyUrl = () => {
    if (!roomId) return null;
    const decoded = decodeURIComponent(roomId);
    if (decoded.startsWith("https://") || decoded.startsWith("http://")) {
      return decoded;
    }
    return null;
  };

  const dailyUrl = getDailyUrl();

  // Daily.co meeting token — generated server-side with the user's real name baked in.
  // This is the only reliable way: URL params are ignored when prejoinUI=false and
  // Daily caches the last-entered name in browser localStorage across sessions.
  const [dailyToken, setDailyToken] = useState<string | null>(null);
  const [dailyTokenError, setDailyTokenError] = useState<string | null>(null);

  const buildDailyUrl = (url: string) => {
    try {
      const u = new URL(url);
      u.searchParams.set("prejoinUI", "false");
      if (isVoiceCall) u.searchParams.set("startVideoOff", "true");
      if (dailyToken) u.searchParams.set("t", dailyToken);
      return u.toString();
    } catch {
      return url;
    }
  };

  // Always use the logged-in user's own name so each participant sees their
  // real identity in the Daily.co call, regardless of what is stored on the booking.
  const callDisplayName =
    `${authUser?.firstName || ""} ${authUser?.lastName || ""}`.trim() ||
    authUser?.email ||
    "";

  // Mobile detection with resize listener
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // Keep phaseRef in sync with phase state
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Keep bookingRef in sync so unmount cleanup has the latest value
  useEffect(() => {
    if (booking) bookingRef.current = booking;
  }, [booking]);

  // Callee who accepted an incoming call skips precall → goes straight to connected
  useEffect(() => {
    if (joinedAsCallee && !joinedAsCalleeApplied.current && phase === "precall") {
      joinedAsCalleeApplied.current = true;
      setPhase("connected");
    }
  }, [joinedAsCallee, phase]);

  // Call window check — after advisory confirmation use post-rx gate; before confirmation use slot window
  useEffect(() => {
    if (booking && phase === "precall" && !joinedAsCallee) {
      const prescriptionApprovedAt = (booking as any).prescriptionApprovedAt;
      if (prescriptionApprovedAt) {
        const rxStatus = getPostRxStatus(booking as any);
        if (!rxStatus.videoEnabled) setPhase("window_closed");
      } else {
        const win = getCallWindow(booking as any);
        if (!win.open) setPhase("window_closed");
      }
    }
  }, [booking, phase, joinedAsCallee]);

  // Conference-room model: no ring timers needed
  function clearRingTimer() {}

  // Listen for call events (accepted/declined/timeout from the other side).
  // Use bookingRef.current as fallback — on mobile the booking query may not have
  // resolved yet when the SSE event arrives, and checking `booking` (stale closure)
  // would silently drop the event.
  const handleCallEvent = useCallback((event: CallEvent) => {
    const b = booking ?? bookingRef.current;
    if (!b) return;
    if (event.bookingId !== b.id) return;

    if (event.type === "document_uploaded" && event.url && event.fileName) {
      setInCallDocs(prev => {
        if (prev.some(d => d.url === event.url)) return prev;
        return [...prev, { url: event.url!, name: event.fileName! }];
      });
    }
  }, [booking]);

  useCallEvents(handleCallEvent);

  const ringOtherParticipant = useCallback(async () => {
    if (!booking || joinedAsCallee || ringAlreadyStartedRef.current || ringStartedRef.current) return;
    ringStartedRef.current = true;
    try {
      await apiRequest("POST", `/api/call/ring/${booking.id}`, { callType: isVoiceCall ? "voice" : "video" });
    } catch (error) {
      ringStartedRef.current = false;
      toast({
        title: "Could not ring the other participant",
        description: "Check your connection and try again.",
        variant: "destructive",
      });
      throw error;
    }
  }, [booking, joinedAsCallee, isVoiceCall, toast]);

  // The call must be accepted by the other participant before either side enters
  // Daily. Poll persisted status so this also works after a direct initiated link.
  useEffect(() => {
    if (phase !== "ringing" || !booking) return;
    let stopped = false;
    const checkStatus = async () => {
      try {
        const response = await fetch(`/api/call/status/${booking.id}`, { credentials: "include" });
        if (!response.ok) return;
        const data = await response.json();
        if (stopped) return;
        switch (data.status) {
          case "accepted":
            setPhase("connected");
            break;
          case "declined":
            setPhase("declined");
            break;
          case "timeout":
            setPhase("timeout");
            break;
          case "ended":
            setPhase("ended");
            break;
          case "none":
            setPhase("unavailable");
            break;
        }
      } catch {
        // Retry on the next interval when the status endpoint is temporarily unavailable.
      }
    };
    void checkStatus();
    const interval = window.setInterval(() => void checkStatus(), 2000);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [phase, booking?.id]);

  // Fetch a server-side Daily token when entering the call — this locks in the user's
  // real name and cannot be overridden by browser cache.
  useEffect(() => {
    if (phase === "connected" && dailyUrl) {
      setDailyToken(null);
      setDailyTokenError(null);
      fetch(`/api/bookings/room/${encodeURIComponent(dailyUrl)}/daily-token`, { credentials: "include" })
        .then(async (response) => {
          const data = await response.json().catch(() => ({}));
          if (!response.ok || !data?.token) {
            throw new Error(data?.message || "Could not prepare the secure video room");
          }
          setDailyToken(data.token);
        })
        .catch((error) => {
          setDailyTokenError(
            error instanceof Error ? error.message : "Could not prepare the secure video room",
          );
          setIsLoading(false);
        });
    }
  }, [phase, dailyUrl]);

  useEffect(() => {
    if (phase !== "connected") return;
    const timer = setTimeout(() => setIsLoading(false), 2000);
    return () => clearTimeout(timer);
  }, [phase]);

  // Ring the other participant, then wait for their acceptance before entering.
  const handleEnterRoom = useCallback(async () => {
    if (!booking) return;
    try {
      await ringOtherParticipant();
    } catch {
      return;
    }

    // Save on-call doctor info for seeker before entering
    if (!isProvider && onCallDoctorName.trim()) {
      try {
        await apiRequest("PATCH", `/api/bookings/${booking.id}/on-call-doctor`, {
          onCallDoctorName: onCallDoctorName.trim(),
          onCallDoctorDesignation: onCallDoctorDesignation.trim() || null,
        });
      } catch (e) {
        console.error("Failed to save on-call doctor info:", e);
      }
    }

    setPhase("ringing");
  }, [booking, isProvider, onCallDoctorName, onCallDoctorDesignation, ringOtherParticipant]);

  // Provider-initiated and already-rang routes both wait for the callee's answer.
  useEffect(() => {
    if (!isProvider || joinedAsCallee || phase !== "precall" || !booking) return;
    void ringOtherParticipant()
      .then(() => setPhase("ringing"))
      .catch(() => setPhase("unavailable"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProvider, joinedAsCallee, booking?.id, phase, ringOtherParticipant]);

  const handleCancelRing = async () => {
    clearRingTimer();
    if (!booking) {
      toast({
        title: "Could not cancel the call",
        description: "The booking details are not available. Please try again.",
        variant: "destructive",
      });
      return;
    }
    try {
      await apiRequest("POST", `/api/call/cancel/${booking.id}`, {});
    } catch {
      toast({
        title: "Could not cancel the call",
        description: "The call is still active. Check your connection and try again.",
        variant: "destructive",
      });
      return;
    }
    navigate(returnTo);
  };

  const handleRetry = () => {
    ringStartedRef.current = false;
    ringAlreadyStartedRef.current = false;
    setPhase("precall");
  };

  const hangUp = async () => {
    try {
      if (!booking) throw new Error("Booking details are not available");
      await apiRequest("POST", `/api/call/end/${booking.id}`, {});
    } catch {
      toast({
        title: "Could not end the call",
        description: "The call could not be ended on the server. Please check your connection and try again.",
        variant: "destructive",
      });
      return;
    }
    navigate(returnTo);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement && containerRef.current) {
      containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else if (document.fullscreenElement) {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    return () => {
      // No ring cleanup needed — conference-room model has no ring/accept state.
    };
  }, []);

  // ── Touch / swipe handlers for mobile carousel ────────────────────────────
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartXRef.current;
    const dy = e.changedTouches[0].clientY - touchStartYRef.current;
    // Ignore if too small or mostly vertical — use ref to avoid stale closure
    if (Math.abs(dx) < 35 || Math.abs(dx) < Math.abs(dy) * 1.5) return;

    const current = mobilePanelRef.current;
    if (dx < 0) {
      // Swiped LEFT → reports/docs panel (matches right-side button)
      switchPanel(current === "summary" ? "video" : "docs");
    } else {
      // Swiped RIGHT → summary panel (matches left-side button)
      switchPanel(current === "docs" ? "video" : "summary");
    }
  };

  // Switch panel, keep ref in sync, and reset PiP position when returning to video
  const switchPanel = (panel: MobilePanel) => {
    mobilePanelRef.current = panel;
    if (panel === "video") setPipPos({ bottom: 80, right: 12 });
    setMobilePanel(panel);
  };

  // PiP drag handlers (pointer events for cross-platform touch+mouse support)
  const handlePipPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (mobilePanel === "video") return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    isDraggingPip.current = true;
    pipDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startBottom: pipPos.bottom,
      startRight: pipPos.right,
    };
  };

  const handlePipPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pipDragRef.current) return;
    const dx = e.clientX - pipDragRef.current.startX;
    const dy = e.clientY - pipDragRef.current.startY;
    // PiP size: 192×144 — keep it fully inside the viewport with 4px clearance
    const pipW = 196, pipH = 148;
    const newRight  = Math.max(4, Math.min(window.innerWidth  - pipW, pipDragRef.current.startRight  - dx));
    const newBottom = Math.max(4, Math.min(window.innerHeight - pipH - 90, pipDragRef.current.startBottom - dy));
    setPipPos({ bottom: newBottom, right: newRight });
  };

  const handlePipPointerUp = () => {
    isDraggingPip.current = false;
    pipDragRef.current = null;
  };

  // Hardware back button → PiP while call is live (popstate intercept)
  useEffect(() => {
    if (phase !== "connected") return;
    // Push a dummy entry so the very first back gesture is caught here
    window.history.pushState({ pipGuard: true }, "");
    const handlePopstate = () => {
      // If in full video, shrink to PiP; always re-push to keep catching back presses
      if (mobilePanelRef.current === "video") {
        switchPanel("docs");
      }
      window.history.pushState({ pipGuard: true }, "");
    };
    window.addEventListener("popstate", handlePopstate);
    return () => window.removeEventListener("popstate", handlePopstate);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Warn before accidental tab close / hard refresh during active call
  useEffect(() => {
    if (phase !== "connected") return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [phase]);

  if (!roomId || !dailyUrl) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="py-8 text-center">
            <VideoOff className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <h2 className="mb-2 text-xl font-semibold">Video Room Unavailable</h2>
            <p className="mb-4 text-muted-foreground">
              {!roomId
                ? "No video room ID was provided."
                : "This booking was created before video calls were set up. Please book a new consultation to get a working video room."}
            </p>
            <Link href={returnTo}>
              <Button data-testid="button-back-orders">Back to Orders</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Window Closed Screen ────────────────────────────────────────────────
  if (phase === "window_closed") {
    const win = booking ? getCallWindow(booking as any) : null;
    const isBeforeWindow = win?.reason === "before_window";
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-background gap-6 px-4">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-muted">
          <Clock className="h-10 w-10 text-muted-foreground" />
        </div>
        <div className="text-center space-y-2 max-w-sm">
          <h2 className="text-xl font-bold">
            {isBeforeWindow ? "Call hasn't opened yet" : "Call window has ended"}
          </h2>
          <p className="text-muted-foreground text-sm">
            {isBeforeWindow && win?.windowStart
              ? `This consultation is scheduled to open at ${toISTTimeString(win.windowStart)} IST.`
              : win?.windowEnd
              ? `The scheduled call window ended at ${toISTTimeString(win.windowEnd)} IST.`
              : "This call is outside its scheduled time window."}
          </p>
          {!isBeforeWindow && (
            <p className="text-xs text-muted-foreground">
              If you need to continue, ask your administrator to extend the call window.
            </p>
          )}
        </div>
        <Button onClick={() => navigate(returnTo)} data-testid="button-go-back">
          Go Back
        </Button>
      </div>
    );
  }

  if (phase === "ringing" || phase === "declined" || phase === "timeout" || phase === "ended" || phase === "unavailable") {
    const terminalMessages: Partial<Record<CallPhase, string>> = {
      declined: "The other participant declined the call.",
      timeout: "The call timed out before it was answered.",
      ended: "This call has ended.",
      unavailable: "There is no active call session to join.",
    };
    const terminalMessage = terminalMessages[phase];
    const canRetry = phase !== "ended";
    return (
      <div className="flex h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="space-y-5 pt-8 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              {phase === "ringing"
                ? <Phone className="h-7 w-7 animate-pulse text-primary" />
                : <PhoneOff className="h-7 w-7 text-muted-foreground" />}
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">
                {phase === "ringing" ? `Calling ${otherParticipantName}` : "Call not connected"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {phase === "ringing"
                  ? "Waiting for the other participant to answer. The video room will open automatically when they accept."
                  : terminalMessage}
              </p>
              {booking?.patientName && (
                <p className="text-xs text-muted-foreground">Patient: {booking.patientName}</p>
              )}
            </div>
            {phase === "ringing" ? (
              <div className="flex justify-center gap-3">
                <Button variant="outline" onClick={handleCancelRing} data-testid="button-cancel-ring">
                  Cancel call
                </Button>
                <Button variant="ghost" onClick={handleCancelRing} data-testid="button-back-waiting">
                  Back
                </Button>
              </div>
            ) : (
              <div className="flex justify-center gap-3">
                {canRetry && (
                  <Button onClick={handleRetry} data-testid="button-retry-call">
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Try Again
                  </Button>
                )}
                <Button variant="outline" onClick={() => navigate(returnTo)} data-testid="button-back-terminal">
                  Back
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Pre-Call Setup (Seeker Only) ─────────────────────────────────────────
  if (phase === "precall") {
    return (
      <div className="flex h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-lg">
          <CardContent className="pt-6">
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <Stethoscope className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-semibold">Pre-Consultation Setup</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Please provide the on-call doctor details before entering the video room.
              </p>
            </div>

            <div className="space-y-4 mb-6">
              <div className="space-y-2">
                <Label>On-Call Doctor / Case Presenter Name *</Label>
                <Input
                  placeholder="Dr. Name"
                  value={onCallDoctorName}
                  onChange={(e) => setOnCallDoctorName(e.target.value)}
                  data-testid="input-oncall-doctor-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Designation</Label>
                <Input
                  placeholder="e.g., Senior Resident, Attending Physician"
                  value={onCallDoctorDesignation}
                  onChange={(e) => setOnCallDoctorDesignation(e.target.value)}
                  data-testid="input-oncall-doctor-designation"
                />
              </div>
              <div className="rounded-lg border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-2">
                <div className="flex items-start gap-2">
                  <ClipboardList className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Before You Join</p>
                </div>
                <ul className="text-sm text-amber-700 dark:text-amber-300 space-y-1 ml-6 list-disc">
                  <li>Please ensure all clinical reports and investigation results are readily accessible.</li>
                  <li>Have the patient's treatment charts and medication history available.</li>
                  <li>Kindly be at the patient's bedside during the consultation.</li>
                </ul>
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => navigate(returnTo)} data-testid="button-cancel-precall">
                Cancel
              </Button>
              <Button
                onClick={handleEnterRoom}
                disabled={!onCallDoctorName.trim()}
                className="flex-1"
                data-testid="button-enter-room"
              >
                <Video className="mr-2 h-4 w-4" />
                Enter Room
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Connected — Mobile Layout (Swipe Carousel) ───────────────────────────
  if (isMobile) {
    const isSummaryConfirmed = !!(booking as any)?.prescriptionApprovedAt;

    return (
      <div className="flex h-screen flex-col bg-background overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between border-b px-3 py-2 shrink-0 z-20 bg-background">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              data-testid="button-back"
              onClick={() => {
                if (phase === "connected") {
                  // While in a call: toggle between full video and PiP
                  switchPanel(mobilePanel === "video" ? "docs" : "video");
                } else {
                  navigate(returnTo);
                }
              }}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-sm font-semibold leading-tight">Video Consultation</h1>
              <p className="text-xs text-muted-foreground leading-tight truncate max-w-[160px]">
                {booking?.serviceName || "Super Speciality Consultation"}
              </p>
            </div>
          </div>
          <Badge variant="outline" className="gap-1 text-green-600 border-green-600/30 bg-green-600/10 text-xs">
            <Video className="h-3 w-3" />
            Live
          </Badge>
        </header>

        {/* Swipe area — NO touch handlers here; iframe swallows them. Edge strips handle it. */}
        <div className="flex-1 relative overflow-hidden">


          {/* ── Video (always rendered; transitions between full-screen and PiP) ── */}
          <div
            onPointerDown={handlePipPointerDown}
            onPointerMove={handlePipPointerMove}
            onPointerUp={handlePipPointerUp}
            onPointerCancel={handlePipPointerUp}
            style={{
              position: "absolute",
              // No transition while dragging — avoids the 350ms lag on every move update
              transition: isDraggingPip.current ? "none" : "all 0.35s cubic-bezier(0.4,0,0.2,1)",
              touchAction: "none",
              ...(mobilePanel === "video"
                ? { inset: 0, zIndex: 10, borderRadius: 0, cursor: "default" }
                : {
                    bottom: pipPos.bottom,
                    right: pipPos.right,
                    width: 192,
                    height: 144,
                    zIndex: 50,
                    borderRadius: 10,
                    overflow: "hidden",
                    boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
                    border: "2px solid rgba(255,255,255,0.25)",
                    cursor: isDraggingPip.current ? "grabbing" : "grab",
                  }),
            }}
          >
            {/* Drag-handle hint — only visible in PiP mode */}
            {mobilePanel !== "video" && (
              <div style={{
                position: "absolute",
                top: 4,
                left: "50%",
                transform: "translateX(-50%)",
                display: "flex",
                gap: 3,
                zIndex: 51,
                pointerEvents: "none",
              }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{ width: 4, height: 4, borderRadius: "50%", background: "rgba(255,255,255,0.7)" }} />
                ))}
              </div>
            )}
            {isLoading && mobilePanel === "video" && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-background">
                <div className="text-center">
                  <div className="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
                  <p className="text-sm text-muted-foreground">Connecting…</p>
                </div>
              </div>
            )}
            {dailyUrl && dailyToken && (
              <iframe
                ref={iframeRef}
                src={buildDailyUrl(dailyUrl)}
                allow="camera; microphone; fullscreen; display-capture; autoplay"
                style={
                  mobilePanel === "video"
                    ? { width: "100%", height: "100%", border: "none", display: "block" }
                    : {
                        // Render at a larger virtual size, scale to fit PiP width (192/400=0.48),
                        // and shift upward so the Daily.co header (~65px) is clipped off and
                        // the remote camera tile is centred in the PiP window.
                        // With top:-31 the PiP clips original y≈65–365 (skipping header+showing camera).
                        position: "absolute",
                        top: -31,
                        left: 0,
                        width: 400,
                        height: 650,
                        border: "none",
                        display: "block",
                        transform: "scale(0.48)",
                        transformOrigin: "top left",
                      }
                }
                data-testid="video-container"
              />
            )}
            {dailyTokenError && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-background px-6">
                <div className="max-w-sm text-center space-y-3">
                  <VideoOff className="mx-auto h-10 w-10 text-destructive" />
                  <p className="font-medium">Unable to open the secure video room</p>
                  <p className="text-sm text-muted-foreground">{dailyTokenError}</p>
                  <Button onClick={() => setPhase("precall")} variant="outline">
                    Try Again
                  </Button>
                </div>
              </div>
            )}
            {/* Transparent drag-capture overlay — sits above the iframe in PiP mode so
                touch/pointer events reach React handlers instead of being swallowed by the iframe */}
            {mobilePanel !== "video" && (
              <div
                onPointerDown={handlePipPointerDown}
                onPointerMove={handlePipPointerMove}
                onPointerUp={handlePipPointerUp}
                onPointerCancel={handlePipPointerUp}
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 52,
                  touchAction: "none",
                  background: "transparent",
                  cursor: isDraggingPip.current ? "grabbing" : "grab",
                }}
              />
            )}
          </div>

          {/* ── Reports panel (slides in from right) — swipeable on full surface ─ */}
          <div
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 20,
              transform: mobilePanel === "docs" ? "translateX(0)" : "translateX(100%)",
              transition: "transform 0.35s cubic-bezier(0.4,0,0.2,1)",
              background: "var(--background)",
              overflowY: "auto",
              touchAction: "pan-y",
            }}
          >
            <div className="px-3 py-2.5 flex items-center gap-2 text-sm font-semibold border-b bg-muted/40">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Patient Reports &amp; Documents
            </div>
            {booking && (
              <ClinicalPanel
                booking={booking}
                isProvider={isProvider}
                inCallDocs={inCallDocs}
                onDocUploaded={(url, name) =>
                  setInCallDocs(prev =>
                    prev.some(d => d.url === url) ? prev : [...prev, { url, name }]
                  )
                }
              />
            )}
          </div>

          {/* ── Summary panel (slides in from left, provider only) — swipeable ── */}
          {isProvider && (
            <div
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 20,
                transform: mobilePanel === "summary" ? "translateX(0)" : "translateX(-100%)",
                transition: "transform 0.35s cubic-bezier(0.4,0,0.2,1)",
                background: "var(--background)",
                overflowY: "auto",
                touchAction: "pan-y",
              }}
            >
              <div className="px-3 py-2.5 flex items-center gap-2 text-sm font-semibold border-b bg-muted/40">
                <ClipboardList className="h-4 w-4 text-muted-foreground" />
                Consultation Summary
                {isSummaryConfirmed && (
                  <span className="ml-auto flex items-center gap-1 text-xs font-medium text-green-600">
                    <ShieldCheck className="h-3 w-3" /> Signed
                  </span>
                )}
              </div>
              {booking && <InCallSummaryForm booking={booking} />}
            </div>
          )}

          {/* ── Edge swipe zones — sit above the iframe (z-30) to capture touches ── */}
          {/* Left edge: swipe right to navigate */}
          <div
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: 36,
              zIndex: 30,
              touchAction: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-start",
              paddingLeft: 6,
            }}
          >
            <div style={{ width: 4, height: 36, borderRadius: 4, background: "rgba(255,255,255,0.18)" }} />
          </div>
          {/* Right edge: swipe left to navigate */}
          <div
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              bottom: 0,
              width: 36,
              zIndex: 30,
              touchAction: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              paddingRight: 6,
            }}
          >
            <div style={{ width: 4, height: 36, borderRadius: 4, background: "rgba(255,255,255,0.18)" }} />
          </div>
        </div>

        {/* Footer — enlarged pill nav buttons + hangup */}
        <footer className="shrink-0 border-t bg-muted/30 px-3 py-2.5 flex flex-col items-center gap-2 z-20">
          {/* Navigation pills */}
          <div className="flex items-center gap-2">
            {isProvider && (
              <button
                onClick={() => switchPanel("summary")}
                data-testid="button-mobile-panel-summary"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  paddingLeft: 14,
                  paddingRight: 14,
                  paddingTop: 8,
                  paddingBottom: 8,
                  borderRadius: 999,
                  fontSize: 13,
                  fontWeight: 500,
                  transition: "all 0.2s",
                  background: mobilePanel === "summary" ? "hsl(var(--foreground))" : "hsl(var(--muted))",
                  color: mobilePanel === "summary" ? "hsl(var(--background))" : "hsl(var(--muted-foreground))",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <ClipboardList style={{ width: 14, height: 14 }} />
                Summary
              </button>
            )}
            <button
              onClick={() => switchPanel("video")}
              data-testid="button-mobile-panel-video"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                paddingLeft: 14,
                paddingRight: 14,
                paddingTop: 8,
                paddingBottom: 8,
                borderRadius: 999,
                fontSize: 13,
                fontWeight: 500,
                transition: "all 0.2s",
                background: mobilePanel === "video" ? "hsl(var(--foreground))" : "hsl(var(--muted))",
                color: mobilePanel === "video" ? "hsl(var(--background))" : "hsl(var(--muted-foreground))",
                border: "none",
                cursor: "pointer",
              }}
            >
              <Video style={{ width: 14, height: 14 }} />
              Video
            </button>
            <button
              onClick={() => switchPanel("docs")}
              data-testid="button-mobile-panel-docs"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                paddingLeft: 14,
                paddingRight: 14,
                paddingTop: 8,
                paddingBottom: 8,
                borderRadius: 999,
                fontSize: 13,
                fontWeight: 500,
                transition: "all 0.2s",
                background: mobilePanel === "docs" ? "hsl(var(--foreground))" : "hsl(var(--muted))",
                color: mobilePanel === "docs" ? "hsl(var(--background))" : "hsl(var(--muted-foreground))",
                border: "none",
                cursor: "pointer",
              }}
            >
              <FileText style={{ width: 14, height: 14 }} />
              Reports
            </button>
          </div>

          {/* Hangup */}
          <Button
            variant="destructive"
            size="icon"
            onClick={hangUp}
            className="h-12 w-12 rounded-full"
            data-testid="button-hangup"
          >
            <Phone className="h-5 w-5 rotate-[135deg]" />
          </Button>
        </footer>
      </div>
    );
  }

  // ─── Connected — Desktop Layout ────────────────────────────────────────────
  const isSummaryConfirmed = !!(booking as any)?.prescriptionApprovedAt;

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex items-center justify-between border-b px-4 py-3 shrink-0">
        <div className="flex items-center gap-4">
          <Link href={returnTo}>
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-semibold">Video Consultation</h1>
            <p className="text-sm text-muted-foreground">
              {booking?.serviceName || "Super Speciality Consultation"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="gap-1.5 text-green-600 border-green-600/30 bg-green-600/10">
            <Video className="h-3.5 w-3.5" />
            Live
          </Badge>

          {/* Write Summary button — provider only */}
          {isProvider && (
            <Button
              variant={isSummaryConfirmed ? "outline" : "secondary"}
              size="sm"
              onClick={() => setShowSummaryDialog(true)}
              className={isSummaryConfirmed ? "gap-1.5 text-green-600 border-green-600/40 hover:bg-green-600/10" : "gap-1.5"}
              data-testid="button-write-summary"
            >
              {isSummaryConfirmed
                ? <><ShieldCheck className="h-4 w-4" /> Summary Signed</>
                : <><ClipboardList className="h-4 w-4" /> Write Summary</>
              }
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setPanelOpen(o => !o)}
            title={panelOpen ? "Hide patient file" : "Show patient file"}
            data-testid="button-toggle-panel"
          >
            {panelOpen
              ? <PanelRightClose className="h-5 w-5" />
              : <PanelRightOpen className="h-5 w-5" />
            }
          </Button>
        </div>
      </header>

      {/* Main area: video + clinical panel side by side */}
      <div className="flex flex-1 overflow-hidden">
        {/* Video */}
        <div
          ref={containerRef}
          className="relative flex-1 bg-black"
        >
          {isLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background">
              <div className="text-center">
                <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
                <p className="text-muted-foreground">Connecting to video room...</p>
              </div>
            </div>
          )}

          {dailyUrl && dailyToken && (
            <iframe
              ref={iframeRef}
              src={buildDailyUrl(dailyUrl)}
              allow="camera; microphone; fullscreen; display-capture; autoplay"
              className="w-full h-full border-0"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
              }}
              data-testid="video-container"
            />
          )}
          {dailyTokenError && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-background px-6">
              <div className="max-w-sm text-center space-y-3">
                <VideoOff className="mx-auto h-10 w-10 text-destructive" />
                <p className="font-medium">Unable to open the secure video room</p>
                <p className="text-sm text-muted-foreground">{dailyTokenError}</p>
                <Button onClick={() => setPhase("precall")} variant="outline">
                  Try Again
                </Button>
              </div>
            </div>
          )}

        </div>

        {/* Clinical panel */}
        {panelOpen && booking && (
          <ClinicalPanel
            booking={booking}
            isProvider={isProvider}
            inCallDocs={inCallDocs}
            onDocUploaded={(url, name) =>
              setInCallDocs(prev =>
                prev.some(d => d.url === url) ? prev : [...prev, { url, name }]
              )
            }
          />
        )}
      </div>

      <footer className="flex items-center justify-center gap-4 border-t bg-muted/30 px-4 py-4 shrink-0">
        <Button
          variant="destructive"
          size="icon"
          onClick={hangUp}
          className="h-14 w-14 rounded-full"
          data-testid="button-hangup"
        >
          <Phone className="h-6 w-6 rotate-[135deg]" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          onClick={toggleFullscreen}
          className="h-12 w-12 rounded-full"
          data-testid="button-fullscreen"
        >
          {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
        </Button>
      </footer>

      {/* Consultation Summary Dialog (desktop, provider only) */}
      {isProvider && booking && (
        <Dialog open={showSummaryDialog} onOpenChange={setShowSummaryDialog}>
          <DialogContent className="max-w-xl max-h-[90vh] flex flex-col p-0">
            <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
              <DialogTitle className="flex items-center gap-2">
                {isSummaryConfirmed
                  ? <><ShieldCheck className="h-5 w-5 text-green-600" /> Summary — Signed &amp; Locked</>
                  : <><ClipboardList className="h-5 w-5" /> Consultation Summary</>
                }
              </DialogTitle>
              <p className="text-sm text-muted-foreground">
                {booking.patientName} • {booking.serviceName}
              </p>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto">
              <InCallSummaryForm booking={booking} />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
