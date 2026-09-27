import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  ParticipantView,
  StreamCall,
  StreamVideo,
  StreamVideoClient,
  useCall,
  useCallStateHooks,
} from "@stream-io/video-react-native-sdk";

interface StreamCredentials {
  apiKey: string;
  token: string;
  callId: string;
  callType: string;
  userId: string;
  userName: string;
  sessionGeneration: string;
}

interface StreamCallMediaProps {
  credentials: StreamCredentials;
  voiceCall: boolean;
  onError: (message: string) => void;
}

export function StreamCallMedia({ credentials, voiceCall, onError }: StreamCallMediaProps) {
  const [client, setClient] = useState<StreamVideoClient | null>(null);
  const [call, setCall] = useState<ReturnType<StreamVideoClient["call"]> | null>(null);

  useEffect(() => {
    let disposed = false;
    let activeClient: StreamVideoClient | null = null;
    let activeCall: ReturnType<StreamVideoClient["call"]> | null = null;

    const connect = async () => {
      try {
        activeClient = new StreamVideoClient({
          apiKey: credentials.apiKey,
          user: { id: credentials.userId, name: credentials.userName },
          token: credentials.token,
        });
        activeCall = activeClient.call(credentials.callType, credentials.callId);
        if (voiceCall) await activeCall.camera.disable();
        await activeCall.join({ create: false });
        if (voiceCall) await activeCall.camera.disable();
        else await activeCall.camera.enable();
        await activeCall.microphone.enable();
        if (disposed) {
          await activeCall.leave();
          await activeClient.disconnectUser();
          return;
        }
        setClient(activeClient);
        setCall(activeCall);
      } catch (error) {
        if (!disposed) {
          onError(error instanceof Error ? error.message : "Could not join the secure Stream call.");
        }
        if (activeCall) await activeCall.leave().catch(() => undefined);
        if (activeClient) await activeClient.disconnectUser().catch(() => undefined);
      }
    };

    void connect();
    return () => {
      disposed = true;
      if (activeCall) void activeCall.leave().catch(() => undefined);
      if (activeClient) void activeClient.disconnectUser().catch(() => undefined);
    };
  }, [credentials.apiKey, credentials.callId, credentials.callType, credentials.sessionGeneration, credentials.token, credentials.userId, credentials.userName, onError, voiceCall]);

  if (!client || !call) {
    return (
      <View style={styles.connecting}>
        <ActivityIndicator color="#FFFFFF" size="large" />
        <Text style={styles.connectingText}>Connecting securely to Stream…</Text>
      </View>
    );
  }

  return (
    <StreamVideo client={client}>
      <StreamCall call={call}>
        <ActiveStreamCall voiceCall={voiceCall} />
      </StreamCall>
    </StreamVideo>
  );
}

function ActiveStreamCall({ voiceCall }: { voiceCall: boolean }) {
  const call = useCall();
  const { useParticipants } = useCallStateHooks();
  const participants = useParticipants();
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(!voiceCall);
  const [controlError, setControlError] = useState<string | null>(null);

  const toggleMicrophone = async () => {
    try {
      await call?.microphone.toggle();
      setMuted((value) => !value);
      setControlError(null);
    } catch {
      setControlError("Microphone could not be changed. Check microphone permissions.");
    }
  };

  const toggleCamera = async () => {
    try {
      await call?.camera.toggle();
      setCameraOn((value) => !value);
      setControlError(null);
    } catch {
      setControlError("Camera could not be changed. Check camera permissions.");
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.providerLabel}>
        <View style={styles.liveDot} />
        <Text style={styles.providerText}>STREAM · SECURE CALL</Text>
      </View>
      <View style={styles.participants}>
        {participants.length === 0 ? (
          <View style={styles.waiting}>
            <Ionicons name="person-circle-outline" size={76} color="#FFFFFF" />
            <Text style={styles.waitingText}>Waiting for the other participant…</Text>
          </View>
        ) : (
          participants.map((participant) => (
            <View key={participant.sessionId} style={styles.participantTile}>
              <ParticipantView participant={participant} />
              <Text style={styles.participantName}>
                {participant.name || "Participant"}
              </Text>
            </View>
          ))
        )}
      </View>
      {!!controlError && (
        <Text style={styles.controlError} accessibilityRole="alert">{controlError}</Text>
      )}
      <View style={styles.controls}>
        <Pressable
          style={[styles.control, muted && styles.controlActive]}
          onPress={() => void toggleMicrophone()}
          accessibilityLabel={muted ? "Unmute microphone" : "Mute microphone"}
          testID="stream-toggle-microphone"
        >
          <Ionicons name={muted ? "mic-off" : "mic"} size={23} color="#FFFFFF" />
          <Text style={styles.controlLabel}>{muted ? "Unmute" : "Mute"}</Text>
        </Pressable>
        <Pressable
          style={[styles.control, !cameraOn && styles.controlActive]}
          onPress={() => void toggleCamera()}
          accessibilityLabel={cameraOn ? "Turn camera off" : "Turn camera on"}
          testID="stream-toggle-camera"
        >
          <Ionicons name={cameraOn ? "videocam" : "videocam-off"} size={23} color="#FFFFFF" />
          <Text style={styles.controlLabel}>{cameraOn ? "Video on" : "Video off"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0A0A0A",
    justifyContent: "space-between",
    padding: 20,
    paddingTop: 76,
    paddingBottom: 34,
  },
  connecting: {
    flex: 1,
    backgroundColor: "#0A0A0A",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  connectingText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Inter_500Medium",
  },
  providerLabel: {
    position: "absolute",
    top: 18,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.12)",
    zIndex: 2,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#34D399",
  },
  providerText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
  },
  participants: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  participantTile: {
    flex: 1,
    width: "100%",
    maxHeight: "100%",
    overflow: "hidden",
    borderRadius: 18,
    backgroundColor: "#202126",
  },
  participantName: {
    position: "absolute",
    left: 12,
    bottom: 12,
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
  },
  waiting: {
    alignItems: "center",
    gap: 12,
  },
  waitingText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  controlError: {
    color: "#FCA5A5",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 8,
  },
  controls: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 22,
  },
  control: {
    minWidth: 76,
    height: 72,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: 18,
    backgroundColor: "#33343B",
  },
  controlActive: {
    backgroundColor: "#4B2B32",
  },
  controlLabel: {
    color: "#FFFFFF",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
});