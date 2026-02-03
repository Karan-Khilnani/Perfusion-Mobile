import { useEffect, useRef, useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Video, VideoOff, Phone, Maximize2, Minimize2 } from "lucide-react";
import type { Booking } from "@shared/schema";

export default function VideoRoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const [, navigate] = useLocation();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const urlParams = new URLSearchParams(window.location.search);
  const returnTo = urlParams.get("returnTo") || "/user/orders";

  const { data: booking } = useQuery<Booking>({
    queryKey: ["/api/bookings/room", roomId],
    enabled: !!roomId,
  });

  // Construct Daily.co prebuilt URL from room name
  const getDailyUrl = () => {
    if (!roomId) return null;
    
    // If it's already a full URL, use it directly
    if (roomId.startsWith("https://")) {
      return roomId;
    }
    
    // Use the Daily.co domain from your account
    // Room names from API are used directly
    return `https://srikantgiri.daily.co/${roomId}`;
  };

  const dailyUrl = getDailyUrl();

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 2000);
    return () => clearTimeout(timer);
  }, []);

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
