import { useEffect, useRef, useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Video, VideoOff, Phone, Maximize2, Minimize2, Stethoscope, ClipboardList } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { Booking } from "@shared/schema";

export default function VideoRoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const [, navigate] = useLocation();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showPreCallDialog, setShowPreCallDialog] = useState(true);
  const [onCallDoctorName, setOnCallDoctorName] = useState("");
  const [onCallDoctorDesignation, setOnCallDoctorDesignation] = useState("");
  const [callStarted, setCallStarted] = useState(false);

  const urlParams = new URLSearchParams(window.location.search);
  const returnTo = urlParams.get("returnTo") || "/user/orders";
  const isProvider = returnTo.includes("/provider");

  const { data: booking } = useQuery<Booking>({
    queryKey: ["/api/bookings/room", roomId],
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

  useEffect(() => {
    if (callStarted) {
      const timer = setTimeout(() => setIsLoading(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [callStarted]);

  const handleJoinCall = async () => {
    if (booking && !isProvider && onCallDoctorName.trim()) {
      try {
        await apiRequest("PATCH", `/api/bookings/${booking.id}/on-call-doctor`, {
          onCallDoctorName: onCallDoctorName.trim(),
          onCallDoctorDesignation: onCallDoctorDesignation.trim() || null,
        });
      } catch (e) {
        console.error("Failed to save on-call doctor info:", e);
      }
    }
    setShowPreCallDialog(false);
    setCallStarted(true);
  };

  const hangUp = () => {
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

  return (
    <div className="flex h-screen flex-col bg-background">
      <Dialog open={showPreCallDialog && !isProvider} onOpenChange={setShowPreCallDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-primary" />
              Pre-Consultation Setup
            </DialogTitle>
            <DialogDescription>
              Please provide the on-call doctor details before joining the consultation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
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
                <li>Please ensure all clinical reports, investigation results, and relevant medical records are readily accessible.</li>
                <li>Have the patient's treatment charts and medication history available for reference.</li>
                <li>Kindly be at the patient's bedside during the consultation for optimal clinical assessment and real-time examination support.</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => navigate(returnTo)} data-testid="button-cancel-precall">
              Cancel
            </Button>
            <Button
              onClick={handleJoinCall}
              disabled={!onCallDoctorName.trim()}
              data-testid="button-join-call-confirm"
            >
              <Video className="mr-2 h-4 w-4" />
              Join Consultation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isProvider && showPreCallDialog && (() => { setShowPreCallDialog(false); setCallStarted(true); return null; })()}

      <header className="flex items-center justify-between border-b px-4 py-3">
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
        </div>
      </header>

      <div 
        ref={containerRef}
        className="relative flex-1 bg-black"
        style={{ minHeight: "500px" }}
      >
        {callStarted && isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background">
            <div className="text-center">
              <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
              <p className="text-muted-foreground">Connecting to video room...</p>
            </div>
          </div>
        )}
        
        {callStarted && dailyUrl && (
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

        {!callStarted && (
          <div className="absolute inset-0 flex items-center justify-center bg-background">
            <div className="text-center">
              <Video className="mx-auto mb-4 h-16 w-16 text-muted-foreground/50" />
              <p className="text-muted-foreground">Complete pre-consultation setup to join the call</p>
            </div>
          </div>
        )}
      </div>

      <footer className="flex items-center justify-center gap-4 border-t bg-muted/30 px-4 py-4">
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
    </div>
  );
}
