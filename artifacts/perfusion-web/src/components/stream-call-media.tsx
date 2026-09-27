import { useEffect, useState } from "react";
import {
  SpeakerLayout,
  StreamCall,
  StreamVideo,
  StreamVideoClient,
} from "@stream-io/video-react-sdk";
import "@stream-io/video-react-sdk/dist/css/styles.css";
import { Mic, MicOff, Video, VideoOff } from "lucide-react";

export type StreamCallCredentials = {
  apiKey: string;
  token: string;
  callId: string;
  callType: string;
  userId: string;
  userName: string;
  sessionGeneration: number | string;
};

type Props = {
  credentials: StreamCallCredentials;
  voiceCall: boolean;
};

export function StreamCallMedia({ credentials, voiceCall }: Props) {
  const [client, setClient] = useState<StreamVideoClient | null>(null);
  const [call, setCall] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(!voiceCall);

  useEffect(() => {
    let cancelled = false;
    let videoClient: StreamVideoClient | null = null;
    let streamCall: any = null;
    setError(null);
    setClient(null);
    setCall(null);

    const connect = async () => {
      try {
        videoClient = new StreamVideoClient({
          apiKey: credentials.apiKey,
          user: { id: credentials.userId, name: credentials.userName },
          token: credentials.token,
        });
        streamCall = videoClient.call(credentials.callType, credentials.callId);
        // Keep voice sessions audio-only from the start. In particular, disable
        // camera before joining so there is never a transient video publication.
        if (voiceCall) await streamCall.camera.disable();
        await streamCall.join({ create: false });
        if (!voiceCall) await streamCall.camera.enable();
        await streamCall.microphone.enable();
        if (cancelled) {
          await streamCall.leave();
          await videoClient.disconnectUser();
          return;
        }
        setClient(videoClient);
        setCall(streamCall);
      } catch (connectError) {
        if (!cancelled) {
          setError(connectError instanceof Error ? connectError.message : "Could not join the Stream video room.");
        }
        if (streamCall) {
          try { await streamCall.leave(); } catch {}
        }
        if (videoClient) {
          try { await videoClient.disconnectUser(); } catch {}
        }
      }
    };
    void connect();

    return () => {
      cancelled = true;
      if (streamCall) void streamCall.leave().catch(() => {});
      if (videoClient) void videoClient.disconnectUser().catch(() => {});
    };
  }, [
    credentials.apiKey,
    credentials.token,
    credentials.callId,
    credentials.callType,
    credentials.userId,
    credentials.userName,
    credentials.sessionGeneration,
    voiceCall,
  ]);

  const toggleMicrophone = async () => {
    if (!call) return;
    try {
      if (micEnabled) await call.microphone.disable();
      else await call.microphone.enable();
      setMicEnabled(!micEnabled);
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Could not change microphone state.");
    }
  };

  const toggleCamera = async () => {
    if (!call) return;
    try {
      if (cameraEnabled) await call.camera.disable();
      else await call.camera.enable();
      setCameraEnabled(!cameraEnabled);
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Could not change camera state.");
    }
  };

  if (error) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-neutral-950 px-6 text-white">
        <div className="max-w-sm text-center">
          <VideoOff className="mx-auto mb-3 h-9 w-9 text-red-400" />
          <p className="font-medium">Unable to join the secure Stream room</p>
          <p className="mt-2 text-sm text-white/70">{error}</p>
        </div>
      </div>
    );
  }

  if (!client || !call) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-neutral-950 text-white">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-white/30 border-t-white" />
          <p className="text-sm text-white/75">Connecting to secure video room…</p>
        </div>
      </div>
    );
  }

  return (
    <StreamVideo client={client}>
      <StreamCall call={call}>
        <div className="absolute inset-0 flex flex-col bg-neutral-950">
          <div className="min-h-0 flex-1">
            <SpeakerLayout participantsBarPosition="bottom" />
          </div>
          <div className="flex shrink-0 items-center justify-center gap-3 bg-black/70 px-3 py-2">
            <button
              type="button"
              onClick={() => void toggleMicrophone()}
              aria-label={micEnabled ? "Mute microphone" : "Enable microphone"}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
            >
              {micEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5 text-red-300" />}
            </button>
            {!voiceCall && (
              <button
                type="button"
                onClick={() => void toggleCamera()}
                aria-label={cameraEnabled ? "Turn camera off" : "Turn camera on"}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
              >
                {cameraEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5 text-red-300" />}
              </button>
            )}
          </div>
        </div>
      </StreamCall>
    </StreamVideo>
  );
}