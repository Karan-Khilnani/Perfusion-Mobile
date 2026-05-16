import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Video, VideoOff, Phone, Maximize2, Minimize2, Stethoscope, ClipboardList, PhoneOff, RefreshCw, PanelRightClose, PanelRightOpen, FileText, ShieldCheck } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useCallEvents, type CallEvent } from "@/hooks/use-call-events";
import { ClinicalPanel } from "@/components/clinical-panel";
import { InCallSummaryForm } from "@/components/in-call-summary-form";
import type { Booking } from "@shared/schema";

type CallPhase =
  | "precall"
  | "ringing"
  | "connected"
  | "declined"
  | "timeout";

type MobilePanel = "video" | "docs" | "summary";

export default function VideoRoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const [, navigate] = useLocation();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [onCallDoctorName, setOnCallDoctorName] = useState("");
  const [onCallDoctorDesignation, setOnCallDoctorDesignation] = useState("");
  const [panelOpen, setPanelOpen] = useState(true);
  const [inCallDocs, setInCallDocs] = useState<{ url: string; name: string }[]>([]);
  const [phase, setPhase] = useState<CallPhase>("precall");
  const [ringingSeconds, setRingingSeconds] = useState(0);
  const [showSummaryDialog, setShowSummaryDialog] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("video");
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const touchStartXRef = useRef<number>(0);

  // Tracks whether we've applied the initial accepted=true jump (avoid re-render loop)
  const joinedAsCalleeApplied = useRef(false);

  // Use refs for timers to avoid stale closures
  const ringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ringingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const phaseRef = useRef<CallPhase>("precall");
  // Stable ref to latest booking so unmount cleanup can access it
  const bookingRef = useRef<Booking | null>(null);

  const urlParams = new URLSearchParams(window.location.search);
  const returnTo = urlParams.get("returnTo") || "/user/orders";
  const isProvider = returnTo.includes("/provider");
  // If the user accepted an incoming call, skip precall and go straight to connected
  const joinedAsCallee = urlParams.get("accepted") === "true";

  const { data: booking } = useQuery<Booking>({
    queryKey: ["/api/bookings/room", roomId],
    queryFn: async () => {
      const decoded = decodeURIComponent(roomId || "");
      const res = await fetch(`/api/bookings/room/${encodeURIComponent(decoded)}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!roomId,
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

  function clearRingTimer() {
    if (ringTimeoutRef.current) {
      clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
    }
    if (ringingIntervalRef.current) {
      clearInterval(ringingIntervalRef.current);
      ringingIntervalRef.current = null;
    }
  }

  // Listen for call events (accepted/declined/timeout from the other side)
  const handleCallEvent = useCallback((event: CallEvent) => {
    if (!booking) return;
    if (event.bookingId !== booking.id) return;
    const currentPhase = phaseRef.current;

    if (event.type === "call_accepted" && currentPhase === "ringing") {
      clearRingTimer();
      setPhase("connected");
    } else if (event.type === "call_declined" && currentPhase === "ringing") {
      clearRingTimer();
      setPhase("declined");
    } else if (event.type === "call_timeout" && currentPhase === "ringing") {
      clearRingTimer();
      setPhase("timeout");
    } else if (event.type === "document_uploaded" && event.url && event.fileName) {
      setInCallDocs(prev => {
        if (prev.some(d => d.url === event.url)) return prev;
        return [...prev, { url: event.url!, name: event.fileName! }];
      });
    }
  }, [booking]);

  useCallEvents(handleCallEvent);

  useEffect(() => {
    if (phase === "connected") {
      const timer = setTimeout(() => setIsLoading(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [phase]);

  const handleRing = useCallback(async () => {
    if (!booking) return;

    // Save on-call doctor info for seeker
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
    setRingingSeconds(0);

    const interval = setInterval(() => {
      setRingingSeconds(s => s + 1);
    }, 1000);
    ringingIntervalRef.current = interval;

    try {
      await apiRequest("POST", `/api/call/ring/${booking.id}`, {});
    } catch (e) {
      console.error("Failed to ring:", e);
    }

    const t = setTimeout(() => {
      clearInterval(interval);
      ringingIntervalRef.current = null;
      setPhase("timeout");
    }, 300000);
    ringTimeoutRef.current = t;
  }, [booking, isProvider, onCallDoctorName, onCallDoctorDesignation]);

  // Provider skips pre-call form and rings immediately (unless they accepted an incoming call)
  useEffect(() => {
    if (isProvider && !joinedAsCallee && phase === "precall" && booking) {
      handleRing();
    }
  }, [isProvider, joinedAsCallee, booking, handleRing, phase]);

  const handleCancelRing = async () => {
    clearRingTimer();
    if (booking) {
      try {
        await apiRequest("POST", `/api/call/cancel/${booking.id}`, {});
      } catch {}
    }
    navigate(returnTo);
  };

  const handleRetry = () => {
    setRingingSeconds(0);
    setPhase("precall");
  };

  const hangUp = () => {
    clearRingTimer();
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
      clearRingTimer();
      if (phaseRef.current === "ringing" && bookingRef.current) {
        apiRequest("POST", `/api/call/cancel/${bookingRef.current.id}`, {}).catch(() => {});
      }
    };
  }, []);

  // ── Touch / swipe handlers for mobile carousel ────────────────────────────
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartXRef.current;
    if (Math.abs(dx) < 50) return; // ignore tiny swipes

    if (dx > 0) {
      // Swiped right → show docs (or go back to video if on summary)
      setMobilePanel(p => (p === "summary" ? "video" : "docs"));
    } else {
      // Swiped left → show summary (or go back to video if on docs)
      setMobilePanel(p => (p === "docs" ? "video" : "summary"));
    }
  };

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

  // ─── Ringing / Calling Screen ─────────────────────────────────────────────
  if (phase === "ringing") {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-background gap-8 px-4">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" style={{ animationDuration: "1.2s" }} />
          <div className="relative flex h-28 w-28 items-center justify-center rounded-full bg-primary/10 border-2 border-primary/30">
            <Phone className="h-12 w-12 text-primary animate-pulse" />
          </div>
        </div>

        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold">Calling...</h2>
          <p className="text-muted-foreground">
            {booking?.serviceName || "Consultation call"}
          </p>
          <p className="text-sm text-muted-foreground tabular-nums">
            {ringingSeconds}s
          </p>
        </div>

        <p className="text-sm text-muted-foreground max-w-xs text-center">
          The other party is being notified. They will receive a ring even if the app is closed.
        </p>

        <div className="flex flex-col items-center gap-2">
          <Button
            variant="destructive"
            size="icon"
            onClick={handleCancelRing}
            className="rounded-full h-14 w-14"
            data-testid="button-cancel-ring"
          >
            <PhoneOff className="h-6 w-6" />
          </Button>
          <span className="text-sm text-muted-foreground">Cancel</span>
        </div>
      </div>
    );
  }

  // ─── Declined Screen ─────────────────────────────────────────────────────
  if (phase === "declined") {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-background gap-6 px-4">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-destructive/10">
          <PhoneOff className="h-10 w-10 text-destructive" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold">Call Declined</h2>
          <p className="text-muted-foreground">The other party is unavailable right now.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={handleRetry} variant="outline" data-testid="button-retry-ring">
            <RefreshCw className="mr-2 h-4 w-4" />
            Try Again
          </Button>
          <Button onClick={() => navigate(returnTo)} data-testid="button-go-back">
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  // ─── Timeout / No Answer Screen ──────────────────────────────────────────
  if (phase === "timeout") {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-background gap-6 px-4">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-muted">
          <Phone className="h-10 w-10 text-muted-foreground" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold">No Answer</h2>
          <p className="text-muted-foreground">The other party didn't respond in time.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={handleRetry} variant="outline" data-testid="button-retry-ring">
            <RefreshCw className="mr-2 h-4 w-4" />
            Call Again
          </Button>
          <Button onClick={() => navigate(returnTo)} data-testid="button-go-back">
            Go Back
          </Button>
        </div>
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
                Please provide the on-call doctor details, then we'll ring the consultant.
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
                onClick={handleRing}
                disabled={!onCallDoctorName.trim()}
                className="flex-1"
                data-testid="button-ring-consultant"
              >
                <Phone className="mr-2 h-4 w-4" />
                Call Consultant
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
            <Link href={returnTo}>
              <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
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

        {/* Swipe area */}
        <div
          className="flex-1 relative overflow-hidden"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* ── Video (always rendered; transitions between full-screen and PiP) ── */}
          <div
            style={{
              position: "absolute",
              transition: "all 0.35s cubic-bezier(0.4,0,0.2,1)",
              ...(mobilePanel === "video"
                ? { inset: 0, zIndex: 10, borderRadius: 0 }
                : {
                    bottom: 72,
                    right: 12,
                    width: 128,
                    height: 96,
                    zIndex: 50,
                    borderRadius: 10,
                    overflow: "hidden",
                    boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
                    border: "2px solid rgba(255,255,255,0.2)",
                  }),
            }}
          >
            {isLoading && mobilePanel === "video" && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-background">
                <div className="text-center">
                  <div className="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
                  <p className="text-sm text-muted-foreground">Connecting…</p>
                </div>
              </div>
            )}
            {dailyUrl && (
              <iframe
                ref={iframeRef}
                src={dailyUrl}
                allow="camera; microphone; fullscreen; display-capture; autoplay"
                style={{ width: "100%", height: "100%", border: "none", display: "block" }}
                data-testid="video-container"
              />
            )}
          </div>

          {/* ── Reports panel (right → slides in from right) ─────────────────── */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 20,
              transform: mobilePanel === "docs" ? "translateX(0)" : "translateX(100%)",
              transition: "transform 0.35s cubic-bezier(0.4,0,0.2,1)",
              background: "var(--background)",
              overflowY: "auto",
            }}
          >
            <div className="px-3 pt-3 pb-1 flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <FileText className="h-4 w-4" />
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

          {/* ── Summary panel (left → slides in from left, provider only) ──────── */}
          {isProvider && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 20,
                transform: mobilePanel === "summary" ? "translateX(0)" : "translateX(-100%)",
                transition: "transform 0.35s cubic-bezier(0.4,0,0.2,1)",
                background: "var(--background)",
                overflowY: "auto",
              }}
            >
              <div className="px-3 pt-3 pb-1 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <ClipboardList className="h-4 w-4" />
                Consultation Summary
                {isSummaryConfirmed && (
                  <span className="ml-auto flex items-center gap-1 text-xs text-green-600">
                    <ShieldCheck className="h-3 w-3" /> Signed
                  </span>
                )}
              </div>
              {booking && <InCallSummaryForm booking={booking} />}
            </div>
          )}
        </div>

        {/* Footer — navigation dots + hangup */}
        <footer className="shrink-0 border-t bg-muted/30 px-4 py-3 flex flex-col items-center gap-2 z-20">
          {/* Dots */}
          <div className="flex items-center gap-3">
            {isProvider && (
              <button
                className="flex flex-col items-center gap-0.5"
                onClick={() => setMobilePanel("summary")}
                data-testid="button-mobile-panel-summary"
              >
                <div
                  className={`h-2 w-2 rounded-full transition-colors ${
                    mobilePanel === "summary" ? "bg-primary" : "bg-muted-foreground/30"
                  }`}
                />
                <span className="text-[10px] text-muted-foreground">Summary</span>
              </button>
            )}
            <button
              className="flex flex-col items-center gap-0.5"
              onClick={() => setMobilePanel("video")}
              data-testid="button-mobile-panel-video"
            >
              <div
                className={`h-2.5 w-2.5 rounded-full transition-colors ${
                  mobilePanel === "video" ? "bg-primary scale-125" : "bg-muted-foreground/30"
                }`}
              />
              <span className="text-[10px] text-muted-foreground">Video</span>
            </button>
            <button
              className="flex flex-col items-center gap-0.5"
              onClick={() => setMobilePanel("docs")}
              data-testid="button-mobile-panel-docs"
            >
              <div
                className={`h-2 w-2 rounded-full transition-colors ${
                  mobilePanel === "docs" ? "bg-primary" : "bg-muted-foreground/30"
                }`}
              />
              <span className="text-[10px] text-muted-foreground">Reports</span>
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

          {dailyUrl && (
            <iframe
              ref={iframeRef}
              src={dailyUrl}
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
