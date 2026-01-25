import { useEffect, useRef, useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Video, VideoOff, Mic, MicOff, Phone, Users, Maximize2, Minimize2 } from "lucide-react";
import type { Booking } from "@shared/schema";

declare global {
  interface Window {
    JitsiMeetExternalAPI: any;
  }
}

export default function VideoRoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const [, navigate] = useLocation();
  const jitsiContainerRef = useRef<HTMLDivElement>(null);
  const jitsiApiRef = useRef<any>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [participantCount, setParticipantCount] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  const { data: booking } = useQuery<Booking>({
    queryKey: ["/api/bookings/room", roomId],
    enabled: !!roomId,
  });

  useEffect(() => {
    if (!roomId || !jitsiContainerRef.current) return;

    const loadJitsiScript = () => {
      return new Promise<void>((resolve, reject) => {
        if (window.JitsiMeetExternalAPI) {
          resolve();
          return;
        }

        const script = document.createElement("script");
        script.src = "https://meet.jit.si/external_api.js";
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load Jitsi API"));
        document.body.appendChild(script);
      });
    };

    const initJitsi = async () => {
      try {
        await loadJitsiScript();
        
        if (jitsiApiRef.current) {
          jitsiApiRef.current.dispose();
        }

        const domain = "meet.jit.si";
        const options = {
          roomName: roomId,
          width: "100%",
          height: "100%",
          parentNode: jitsiContainerRef.current,
          configOverwrite: {
            startWithAudioMuted: false,
            startWithVideoMuted: false,
            prejoinPageEnabled: false,
            disableDeepLinking: true,
            toolbarButtons: [
              "microphone",
              "camera",
              "closedcaptions",
              "desktop",
              "fullscreen",
              "fodeviceselection",
              "hangup",
              "chat",
              "recording",
              "settings",
              "raisehand",
              "videoquality",
              "filmstrip",
              "tileview",
            ],
          },
          interfaceConfigOverwrite: {
            TOOLBAR_BUTTONS: [
              "microphone",
              "camera",
              "closedcaptions",
              "desktop",
              "fullscreen",
              "fodeviceselection",
              "hangup",
              "chat",
              "recording",
              "settings",
              "raisehand",
              "videoquality",
              "filmstrip",
              "tileview",
            ],
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            DEFAULT_BACKGROUND: "#1a1a2e",
            DISABLE_JOIN_LEAVE_NOTIFICATIONS: false,
            MOBILE_APP_PROMO: false,
          },
        };

        const api = new window.JitsiMeetExternalAPI(domain, options);
        jitsiApiRef.current = api;

        api.addListener("videoConferenceJoined", () => {
          setIsLoading(false);
        });

        api.addListener("participantJoined", () => {
          setParticipantCount((prev) => prev + 1);
        });

        api.addListener("participantLeft", () => {
          setParticipantCount((prev) => Math.max(1, prev - 1));
        });

        api.addListener("audioMuteStatusChanged", (event: { muted: boolean }) => {
          setIsAudioMuted(event.muted);
        });

        api.addListener("videoMuteStatusChanged", (event: { muted: boolean }) => {
          setIsVideoMuted(event.muted);
        });

        api.addListener("readyToClose", () => {
          navigate("/user/orders");
        });

      } catch (error) {
        console.error("Failed to initialize Jitsi:", error);
        setIsLoading(false);
      }
    };

    initJitsi();

    return () => {
      if (jitsiApiRef.current) {
        jitsiApiRef.current.dispose();
        jitsiApiRef.current = null;
      }
    };
  }, [roomId, navigate]);

  const toggleAudio = () => {
    if (jitsiApiRef.current) {
      jitsiApiRef.current.executeCommand("toggleAudio");
    }
  };

  const toggleVideo = () => {
    if (jitsiApiRef.current) {
      jitsiApiRef.current.executeCommand("toggleVideo");
    }
  };

  const hangUp = () => {
    if (jitsiApiRef.current) {
      jitsiApiRef.current.executeCommand("hangup");
    }
    navigate("/user/orders");
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      jitsiContainerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
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

  if (!roomId) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="py-8 text-center">
            <VideoOff className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <h2 className="mb-2 text-xl font-semibold">Invalid Room</h2>
            <p className="mb-4 text-muted-foreground">
              No video room ID was provided.
            </p>
            <Link href="/user/orders">
              <Button data-testid="button-back-orders">Back to Orders</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-4">
          <Link href="/user/orders">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-semibold">Video Consultation</h1>
            <p className="text-sm text-muted-foreground">Room: {roomId}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="gap-1.5">
            <Users className="h-3.5 w-3.5" />
            {participantCount} participant{participantCount !== 1 ? "s" : ""}
          </Badge>
          <Badge variant="outline" className="gap-1.5 text-green-600 border-green-600/30 bg-green-600/10">
            <Video className="h-3.5 w-3.5" />
            Live
          </Badge>
        </div>
      </header>

      <div className="relative flex-1">
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background">
            <div className="text-center">
              <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
              <p className="text-muted-foreground">Connecting to video room...</p>
            </div>
          </div>
        )}
        <div
          ref={jitsiContainerRef}
          className="h-full w-full"
          data-testid="video-container"
        />
      </div>

      <footer className="flex items-center justify-center gap-4 border-t bg-muted/30 px-4 py-4">
        <Button
          variant={isAudioMuted ? "destructive" : "secondary"}
          size="icon"
          onClick={toggleAudio}
          className="h-12 w-12 rounded-full"
          data-testid="button-toggle-audio"
        >
          {isAudioMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </Button>
        <Button
          variant={isVideoMuted ? "destructive" : "secondary"}
          size="icon"
          onClick={toggleVideo}
          className="h-12 w-12 rounded-full"
          data-testid="button-toggle-video"
        >
          {isVideoMuted ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
        </Button>
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
