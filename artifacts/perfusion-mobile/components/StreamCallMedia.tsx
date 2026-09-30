import React, {
  type ComponentProps,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Animated,
  Linking,
  PanResponder,
  Pressable,
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ParticipantView,
  StreamCall,
  StreamVideo,
  StreamVideoClient,
  useCall,
  useAutoEnterPiPEffect,
  useCallStateHooks,
  callManager,
  useAudioDeviceStatus,
} from "@stream-io/video-react-native-sdk";

import { useColors } from "@/hooks/useColors";
import { BRAND_GRADIENT, END_CALL_GRADIENT, designTokens } from "@/constants/designTokens";
import { elevatedShadow } from "@/constants/nativeShadows";

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
  compact?: boolean;
  bookingId: string;
  participantTitle: string;
  participantSubtitle?: string;
  onEndCall: () => void;
  endPending?: boolean;
  endError?: string | null;
}

const STREAM_CONNECT_TIMEOUT_MS = 25000;

export function StreamCallMedia({
  credentials,
  voiceCall,
  compact = false,
  bookingId,
  participantTitle,
  participantSubtitle,
  onEndCall,
  endPending = false,
  endError,
}: StreamCallMediaProps) {
  const colors = useColors();
  const [client, setClient] = useState<StreamVideoClient | null>(null);
  const [call, setCall] = useState<ReturnType<StreamVideoClient["call"]> | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);

  useEffect(() => {
    let disposed = false;
    let timedOut = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let activeClient: StreamVideoClient | null = null;
    let activeCall: ReturnType<StreamVideoClient["call"]> | null = null;

    const connect = async () => {
      activeClient = new StreamVideoClient({
        apiKey: credentials.apiKey,
        user: { id: credentials.userId, name: credentials.userName },
        token: credentials.token,
      });
      activeCall = activeClient.call(credentials.callType, credentials.callId);
      await activeCall.join({ create: false });
      if (disposed || timedOut) return;
      if (voiceCall) {
        await activeCall.camera.disable();
      }
      await activeCall.microphone.enable();
      if (disposed || timedOut) return;
      if (!voiceCall) {
        await activeCall.camera.enable();
      }
    };

    setClient(null);
    setCall(null);
    setConnectionError(null);

    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        timedOut = true;
        reject(new Error("The call is taking too long to connect. Check your connection and try again."));
      }, STREAM_CONNECT_TIMEOUT_MS);
    });

    void Promise.race([connect(), timeoutPromise])
      .then(() => {
        if (disposed || timedOut || !activeClient || !activeCall) return;
        setClient(activeClient);
        setCall(activeCall);
      })
      .catch(async (error: unknown) => {
        if (!disposed) {
          setConnectionError(
            error instanceof Error
              ? error.message
              : "Could not join the secure Stream call. Check your connection and try again.",
          );
        }
        if (activeCall) await activeCall.leave().catch(() => undefined);
        if (activeClient) await activeClient.disconnectUser().catch(() => undefined);
      })
      .finally(() => {
        if (timeout) clearTimeout(timeout);
      });

    return () => {
      disposed = true;
      if (timeout) clearTimeout(timeout);
      if (activeCall) void activeCall.leave().catch(() => undefined);
      if (activeClient) void activeClient.disconnectUser().catch(() => undefined);
    };
  }, [credentials.apiKey, credentials.callId, credentials.callType, credentials.sessionGeneration, credentials.token, credentials.userId, credentials.userName, retryAttempt, voiceCall]);

  if (connectionError) {
    return (
      <View style={[styles.connecting, { backgroundColor: colors.callBackground }]}>
        <View style={styles.connectionGlyph}>
          <Ionicons name="videocam-outline" size={28} color="#FFFFFF" />
        </View>
        <Text style={styles.connectionError} accessibilityRole="alert">
          {connectionError}
        </Text>
        <Pressable
          onPress={() => {
            setConnectionError(null);
            setRetryAttempt((attempt) => attempt + 1);
          }}
          testID="retry-stream-connection"
        >
          <LinearGradient colors={BRAND_GRADIENT} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Try again</Text>
          </LinearGradient>
        </Pressable>
      </View>
    );
  }

  if (!client || !call) {
    return (
      <View style={[styles.connecting, { backgroundColor: colors.callBackground }]}>
        <LinearGradient colors={BRAND_GRADIENT} style={styles.connectionGlyph}>
          <Ionicons name={voiceCall ? "call-outline" : "videocam-outline"} size={28} color="#FFFFFF" />
        </LinearGradient>
        <Text style={styles.connectingText}>Connecting securely…</Text>
      </View>
    );
  }

  return (
    <StreamVideo client={client}>
      <StreamCall call={call}>
        <ActiveStreamCall
          voiceCall={voiceCall}
          compact={compact}
          bookingId={bookingId}
          participantTitle={participantTitle}
          participantSubtitle={participantSubtitle}
          localDisplayName={credentials.userName}
          onEndCall={onEndCall}
          endPending={endPending}
          endError={endError}
        />
      </StreamCall>
    </StreamVideo>
  );
}

function ActiveStreamCall({
  voiceCall,
  compact,
  bookingId,
  participantTitle,
  participantSubtitle,
  localDisplayName,
  onEndCall,
  endPending,
  endError,
}: {
  voiceCall: boolean;
  compact: boolean;
  bookingId: string;
  participantTitle: string;
  participantSubtitle?: string;
  localDisplayName: string;
  onEndCall: () => void;
  endPending: boolean;
  endError?: string | null;
}) {
  useAutoEnterPiPEffect(false);
  const call = useCall();
  const { useParticipants, useLocalParticipant, useCallCallingState } = useCallStateHooks();
  const participants = useParticipants();
  const localParticipant = useLocalParticipant();
  const callingState = useCallCallingState();
  const audioDeviceStatus = useAudioDeviceStatus();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(!voiceCall);
  const [videoActive, setVideoActive] = useState(!voiceCall);
  const [upgradingToVideo, setUpgradingToVideo] = useState(false);
  const [controlError, setControlError] = useState<string | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const hideControlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callStartedAt = useRef<number | null>(null);
  const cameraActionInFlight = useRef(false);
  const remoteUpgradeHandled = useRef(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const dragPosition = useRef({ x: 0, y: 0 });
  const dragOrigin = useRef({ x: 0, y: 0 });
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  useEffect(() => {
    if (participants.length > 0 && callStartedAt.current === null) {
      callStartedAt.current = Date.now();
    }
  }, [participants.length]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (callStartedAt.current !== null) {
        setElapsedSeconds(Math.floor((Date.now() - callStartedAt.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const revealControls = useCallback(() => {
    if (hideControlsTimeout.current) clearTimeout(hideControlsTimeout.current);
    setControlsVisible(true);
    Animated.timing(controlsOpacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    if (!compact) {
      hideControlsTimeout.current = setTimeout(() => {
        Animated.timing(controlsOpacity, { toValue: 0, duration: 280, useNativeDriver: true }).start(({ finished }) => {
          if (finished) setControlsVisible(false);
        });
      }, 4000);
    }
  }, [compact, controlsOpacity]);

  useEffect(() => {
    revealControls();
    return () => {
      if (hideControlsTimeout.current) clearTimeout(hideControlsTimeout.current);
    };
  }, [revealControls]);

  const panResponder = useMemo(() => {
    const baseLeft = window.width - 128;
    const baseTop = insets.top + 108;
    const minX = Math.min(0, 14 - baseLeft);
    const minY = insets.top + 12 - baseTop;
    const maxY = window.height - insets.bottom - 164 - baseTop;
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4,
      onPanResponderGrant: () => {
        dragOrigin.current = { ...dragPosition.current };
        revealControls();
      },
      onPanResponderMove: (_event, gesture) => {
        const x = Math.max(minX, Math.min(0, dragOrigin.current.x + gesture.dx));
        const y = Math.max(minY, Math.min(maxY, dragOrigin.current.y + gesture.dy));
        dragPosition.current = { x, y };
        pan.setValue({ x, y });
      },
      onPanResponderRelease: () => {
        const currentX = dragPosition.current.x;
        const snapX = currentX < minX / 2 ? minX : 0;
        dragPosition.current = { ...dragPosition.current, x: snapX };
        Animated.spring(pan, {
          toValue: dragPosition.current,
          damping: 18,
          stiffness: 180,
          useNativeDriver: false,
        }).start();
      },
    });
  }, [insets.bottom, insets.top, pan, revealControls, window.height, window.width]);

  const remoteVideoActive = participants.some((participant) => {
    if (participant.userId === localParticipant?.userId || !participant.videoStream) return false;
    return participant.videoStream
      .getVideoTracks()
      .some((track) => track.readyState === "live");
  });

  const ensureCameraPermission = useCallback(async () => {
    if (Platform.OS === "web") return false;
    try {
      const current = await ImagePicker.getCameraPermissionsAsync();
      const permission = current.granted
        ? current
        : await ImagePicker.requestCameraPermissionsAsync();
      if (permission.granted) return true;

      const message = permission.canAskAgain
        ? "Camera permission is required to enable video. Your audio call will continue."
        : "Camera permission is blocked. Enable camera access in Settings to use video. Your audio call will continue.";
      setControlError(message);
      if (!permission.canAskAgain) {
        Alert.alert("Camera permission required", message, [
          { text: "Not now", style: "cancel" },
          {
            text: "Open Settings",
            onPress: () => { void Linking.openSettings().catch(() => undefined); },
          },
        ]);
      }
      return false;
    } catch {
      setControlError("Camera permission could not be checked. Your audio call is still active.");
      return false;
    }
  }, []);

  const enableLocalCameraForVideo = useCallback(async () => {
    if (!call) return false;
    if (cameraOn) {
      setVideoActive(true);
      return true;
    }
    if (cameraActionInFlight.current) return false;

    cameraActionInFlight.current = true;
    setUpgradingToVideo(true);
    setControlError(null);
    try {
      if (!(await ensureCameraPermission())) return false;

      // Enable video on the current Stream call; do not leave or rejoin the session.
      await call.camera.enable();
      const deadline = Date.now() + 5000;
      let hasLiveVideoTrack = false;
      while (Date.now() < deadline) {
        hasLiveVideoTrack = Boolean(
          call.camera.state.mediaStream
            ?.getVideoTracks()
            .some((track) => track.readyState === "live"),
        );
        if (hasLiveVideoTrack) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (!hasLiveVideoTrack) {
        throw new Error("The camera video track could not be started.");
      }

      setCameraOn(true);
      setVideoActive(true);
      return true;
    } catch (error) {
      await call.camera.disable().catch(() => undefined);
      setCameraOn(false);
      const reason = error instanceof Error ? error.message : "Camera could not be enabled.";
      setControlError(`${reason} Your audio call is still active.`);
      return false;
    } finally {
      cameraActionInFlight.current = false;
      setUpgradingToVideo(false);
    }
  }, [call, cameraOn, ensureCameraPermission]);

  useEffect(() => {
    if (!voiceCall || !remoteVideoActive) return;

    // A published remote video track is the signal to switch this same call
    // into its existing video layout and make the local camera available.
    setVideoActive(true);
    if (remoteUpgradeHandled.current) return;
    remoteUpgradeHandled.current = true;
    if (!cameraOn) void enableLocalCameraForVideo();
  }, [cameraOn, enableLocalCameraForVideo, remoteVideoActive, voiceCall]);

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
    if (!call || cameraActionInFlight.current) return;
    if (!cameraOn) {
      await enableLocalCameraForVideo();
      return;
    }

    cameraActionInFlight.current = true;
    try {
      await call.camera.disable();
      setCameraOn(false);
      setControlError(null);
    } catch {
      setControlError("Camera could not be changed. Your audio call is still active.");
    } finally {
      cameraActionInFlight.current = false;
    }
  };

  const flipCamera = async () => {
    try {
      await call?.camera.flip();
      setControlError(null);
    } catch {
      setControlError("Camera could not be flipped.");
    }
  };

  const toggleSpeaker = async () => {
    const devices = audioDeviceStatus?.devices || [];
    const speakerOn = audioDeviceStatus?.currentEndpointType === "Speaker";
    const target = speakerOn
      ? devices.find((device) => device.type === "Earpiece") || devices.find((device) => device.type !== "Speaker")
      : devices.find((device) => device.type === "Speaker");
    if (!target) {
      setControlError("Speaker routing is not available on this device.");
      return;
    }
    try {
      await callManager.audioDevices.select(target.id);
      setControlError(null);
    } catch {
      setControlError("Audio output could not be changed.");
    }
  };

  const openCaseFile = (focus?: "summary" | "advisory") => {
    revealControls();
    const destination = focus
      ? `/case-file/${encodeURIComponent(bookingId)}?focus=${focus}`
      : `/case-file/${encodeURIComponent(bookingId)}`;
    router.push(destination as never);
  };

  const stateText = String(callingState || "").toLowerCase();
  const connectionLabel = stateText.includes("reconnect")
    ? "Reconnecting"
    : participants.length > 0
      ? "Connected"
      : "Connecting";
  const statusColor = connectionLabel === "Connected"
    ? designTokens.color.greenBright
    : connectionLabel === "Reconnecting"
      ? designTokens.color.gold
      : designTokens.color.coral;
  const durationLabel = `${String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:${String(elapsedSeconds % 60).padStart(2, "0")}`;
  const speakerOn = audioDeviceStatus?.currentEndpointType === "Speaker";
  const fallbackName = participantTitle.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");

  if (compact) {
    return (
      <View style={styles.compactStage}>
        {participants.length ? (
          <ParticipantView
            participant={participants[0]}
            style={styles.participantFill}
            objectFit="cover"
            videoZOrder={0}
            ParticipantVideoFallback={CallVideoFallback}
          />
        ) : (
          <LinearGradient colors={BRAND_GRADIENT} style={styles.compactWaiting}>
            <Text style={styles.compactInitials}>{fallbackName || "P"}</Text>
          </LinearGradient>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container} onTouchStart={revealControls}>
      {!videoActive || participants.length === 0 ? (
        <LinearGradient colors={BRAND_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.waitingStage}>
          <View style={styles.waitingAvatar}>
            <Text style={styles.waitingInitials}>{fallbackName || "P"}</Text>
          </View>
          <Text style={styles.waitingTitle}>{participantTitle}</Text>
          {!!participantSubtitle && <Text style={styles.waitingSubtitle}>{participantSubtitle}</Text>}
          {voiceCall && !videoActive && <Text style={styles.voiceCallLabel}>Voice consultation</Text>}
        </LinearGradient>
      ) : (
        <View style={styles.remoteStage}>
          <ParticipantView
            participant={participants[0]}
            style={styles.participantFill}
            objectFit="cover"
            videoZOrder={0}
            ParticipantVideoFallback={CallVideoFallback}
          />
        </View>
      )}

      {videoActive && (
        <Animated.View
          style={[styles.selfView, { top: insets.top + 108, right: 16, transform: pan.getTranslateTransform() }]}
          {...panResponder.panHandlers}
          accessibilityLabel="Your draggable camera preview"
        >
          {localParticipant && cameraOn ? (
            <ParticipantView
              participant={localParticipant}
              style={styles.participantFill}
              objectFit="cover"
              videoZOrder={1}
              ParticipantVideoFallback={CallVideoFallback}
            />
          ) : cameraOn ? (
            <View style={styles.videoFallback}>
              <Ionicons name="videocam-outline" size={22} color="#FFFFFF" />
              <Text style={styles.videoFallbackText}>Connecting camera…</Text>
            </View>
          ) : (
            <LinearGradient colors={["#5A4250", designTokens.color.callScrim]} style={styles.selfPlaceholder}>
              <Ionicons name="videocam-off-outline" size={22} color="#FFFFFF" />
              <Text style={styles.selfInitials}>Camera off</Text>
            </LinearGradient>
          )}
          <View style={styles.selfLabel}>
            <Text style={styles.selfLabelText}>You</Text>
          </View>
        </Animated.View>
      )}

      {controlsVisible && (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: controlsOpacity }]} pointerEvents="box-none">
          <LinearGradient
            colors={["rgba(30,12,22,.76)", "rgba(30,12,22,0)"]}
            style={styles.topScrim}
            pointerEvents="none"
          />
          <LinearGradient
            colors={["rgba(30,12,22,0)", "rgba(30,12,22,.82)"]}
            style={styles.bottomScrim}
            pointerEvents="none"
          />
          <View style={[styles.topBar, { top: insets.top + 12 }]} pointerEvents="box-none">
            <View style={styles.identityPill}>
              <View style={[styles.liveDot, { backgroundColor: statusColor }]} />
              <View style={styles.identityText}>
                <Text style={styles.identityTitle} numberOfLines={1}>{participantTitle}</Text>
                <Text style={styles.identityMeta} numberOfLines={1}>
                  {participantSubtitle ? `${participantSubtitle} · ` : ""}{durationLabel} · {connectionLabel}
                </Text>
              </View>
            </View>
            <Pressable
              style={({ pressed }) => [styles.topCaseButton, { opacity: pressed ? 0.78 : 1 }]}
              onPress={() => openCaseFile("summary")}
              onPressIn={revealControls}
              accessibilityRole="button"
              accessibilityLabel="Open Case File"
              testID="stream-open-case-file"
            >
              <Ionicons name="folder-outline" size={19} color="#FFFFFF" />
            </Pressable>
          </View>

          <View style={[styles.bottomStack, { bottom: insets.bottom + 18 }]} pointerEvents="box-none">
            <View style={styles.quickAccess}>
              <QuickAccess icon="chatbubble-ellipses-outline" label="Chat" onPress={() => openCaseFile()} testID="stream-open-chat" />
              <QuickAccess icon="folder-outline" label="Case File" onPress={() => openCaseFile("summary")} testID="stream-open-case-file-quick" />
              <QuickAccess icon="create-outline" label="Advise" onPress={() => openCaseFile("advisory")} testID="stream-open-advisory" />
            </View>
            <View style={styles.mainControls}>
              <StreamControl
                icon={muted ? "mic-off" : "mic"}
                label={muted ? "Unmute" : "Mute"}
                active={muted}
                onPress={() => void toggleMicrophone()}
                onPressIn={revealControls}
                accessibilityLabel={muted ? "Unmute microphone" : "Mute microphone"}
                testID="stream-toggle-microphone"
              />
              {voiceCall && !videoActive ? (
                <StreamControl
                  icon="videocam"
                  label={upgradingToVideo ? "Enabling…" : "Video"}
                  onPress={() => void enableLocalCameraForVideo()}
                  onPressIn={revealControls}
                  disabled={upgradingToVideo}
                  accessibilityLabel={upgradingToVideo ? "Enabling video" : "Upgrade audio call to video"}
                  testID="stream-upgrade-to-video"
                />
              ) : videoActive ? (
                <StreamControl
                  icon={cameraOn ? "videocam" : "videocam-off"}
                  label={upgradingToVideo ? "Enabling…" : cameraOn ? "Camera" : "Camera off"}
                  active={!cameraOn}
                  onPress={() => void toggleCamera()}
                  onPressIn={revealControls}
                  disabled={upgradingToVideo}
                  accessibilityLabel={upgradingToVideo ? "Enabling camera" : cameraOn ? "Turn camera off" : "Turn camera on"}
                  testID="stream-toggle-camera"
                />
              ) : null}
              <StreamControl
                icon={speakerOn ? "volume-high" : "volume-medium"}
                label="Speaker"
                active={speakerOn}
                onPress={() => void toggleSpeaker()}
                onPressIn={revealControls}
                accessibilityLabel={speakerOn ? "Use earpiece audio" : "Use speaker audio"}
                testID="stream-toggle-speaker"
              />
              {videoActive && (
                <StreamControl
                  icon="camera-reverse"
                  label="Flip"
                  onPress={() => void flipCamera()}
                  onPressIn={revealControls}
                  accessibilityLabel="Flip camera"
                  testID="stream-flip-camera"
                />
              )}
              <Pressable
                onPress={onEndCall}
                onPressIn={revealControls}
                disabled={endPending}
                style={({ pressed }) => [styles.endCallPressable, { opacity: endPending ? 0.55 : pressed ? 0.88 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] }]}
                accessibilityRole="button"
                accessibilityLabel="End call"
                testID="stream-end-call"
              >
                <LinearGradient colors={END_CALL_GRADIENT} style={styles.endCallButton}>
                  <Ionicons name="call" size={22} color="#FFFFFF" style={styles.hangupIcon} />
                </LinearGradient>
                <Text style={styles.controlLabel}>End</Text>
              </Pressable>
            </View>
            {(controlError || endError) && (
              <Text style={styles.controlError} accessibilityRole="alert">{endError || controlError}</Text>
            )}
          </View>
        </Animated.View>
      )}
    </View>
  );
}

function CallVideoFallback({
  participant,
}: {
  participant: ComponentProps<typeof ParticipantView>["participant"];
}) {
  return (
    <View style={styles.videoFallback}>
      <Ionicons name="videocam-off-outline" size={26} color="#FFFFFF" />
      <Text style={styles.videoFallbackText}>
        {participant.isLocalParticipant ? "Camera unavailable" : "Remote video unavailable"}
      </Text>
    </View>
  );
}

function StreamControl({
  icon,
  label,
  active,
  onPress,
  onPressIn,
  disabled = false,
  accessibilityLabel,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active?: boolean;
  onPress: () => void;
  onPressIn: () => void;
  disabled?: boolean;
  accessibilityLabel: string;
  testID: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      disabled={disabled}
      style={({ pressed }) => [styles.controlButton, active && styles.controlActive, { opacity: disabled ? 0.52 : pressed ? 0.86 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] }]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      <Ionicons name={icon} size={21} color="#FFFFFF" />
      <Text style={styles.controlLabel}>{label}</Text>
    </Pressable>
  );
}

function QuickAccess({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.quickButton, { opacity: pressed ? 0.8 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] }]}
      accessibilityRole="button"
      testID={testID}
    >
      <Ionicons name={icon} size={19} color="#FFFFFF" />
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: "hidden", backgroundColor: designTokens.color.callScrim },
  participantFill: { flex: 1 },
  connecting: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 28 },
  connectingText: { color: "#FFFFFF", fontSize: 15, fontFamily: "Inter_500Medium" },
  connectionGlyph: { width: 62, height: 62, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  connectionError: { color: "#FFFFFF", fontSize: 15, lineHeight: 22, fontFamily: "Inter_400Regular", textAlign: "center" },
  retryButton: { minHeight: 48, minWidth: 132, paddingHorizontal: 24, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  retryButtonText: { color: "#FFFFFF", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  compactStage: { flex: 1, overflow: "hidden", backgroundColor: designTokens.color.callScrim },
  compactWaiting: { flex: 1, alignItems: "center", justifyContent: "center" },
  compactInitials: { color: "#FFFFFF", fontSize: 24, fontFamily: "Sora_700Bold" },
  remoteStage: { ...StyleSheet.absoluteFillObject, overflow: "hidden", backgroundColor: designTokens.color.callScrim },
  waitingStage: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", paddingHorizontal: 36, gap: 10 },
  waitingAvatar: { width: 112, height: 112, borderRadius: 36, backgroundColor: "rgba(255,255,255,.14)", alignItems: "center", justifyContent: "center", marginBottom: 8 },
  waitingInitials: { color: "#FFFFFF", fontSize: 35, fontFamily: "Sora_700Bold" },
  waitingTitle: { color: "#FFFFFF", fontSize: 22, lineHeight: 29, fontFamily: "Sora_700Bold", textAlign: "center" },
  waitingSubtitle: { color: "rgba(255,255,255,.78)", fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  voiceCallLabel: { color: "rgba(255,255,255,.72)", fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 8 },
  selfView: { position: "absolute", zIndex: 4, width: 112, height: 156, borderRadius: 18, overflow: "hidden", backgroundColor: "#3A2931", borderWidth: 1.5, borderColor: "rgba(255,255,255,.72)", ...elevatedShadow },
  selfPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  selfInitials: { color: "#FFFFFF", fontSize: 18, fontFamily: "Sora_600SemiBold" },
  videoFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 12,
    backgroundColor: designTokens.color.callScrim,
  },
  videoFallbackText: {
    color: "#FFFFFF",
    fontSize: 11,
    textAlign: "center",
    fontFamily: "Inter_500Medium",
  },
  selfLabel: { position: "absolute", bottom: 7, left: 7, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: "rgba(30,12,22,.68)" },
  selfLabelText: { color: "#FFFFFF", fontSize: 10, fontFamily: "Inter_600SemiBold" },
  topScrim: { position: "absolute", top: 0, left: 0, right: 0, height: 220 },
  bottomScrim: { position: "absolute", bottom: 0, left: 0, right: 0, height: 370 },
  topBar: { position: "absolute", left: 16, right: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  identityPill: { minHeight: 54, maxWidth: "82%", flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 18, backgroundColor: "rgba(46,31,40,.78)" },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  identityText: { minWidth: 0, flex: 1 },
  identityTitle: { color: "#FFFFFF", fontSize: 14, fontFamily: "Sora_600SemiBold" },
  identityMeta: { color: "rgba(255,255,255,.76)", fontSize: 10, marginTop: 2, fontFamily: "Inter_500Medium" },
  topCaseButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(46,31,40,.78)" },
  bottomStack: { position: "absolute", left: 14, right: 14, gap: 12 },
  quickAccess: { flexDirection: "row", justifyContent: "center", gap: 8 },
  quickButton: { width: 86, minHeight: 54, borderRadius: 16, alignItems: "center", justifyContent: "center", gap: 3, backgroundColor: "rgba(255,255,255,.15)" },
  quickLabel: { color: "#FFFFFF", fontSize: 10, fontFamily: "Inter_500Medium" },
  mainControls: { flexDirection: "row", justifyContent: "center", alignItems: "flex-start", gap: 7 },
  controlButton: { width: 56, height: 64, borderRadius: 18, alignItems: "center", justifyContent: "center", gap: 4, backgroundColor: "rgba(255,255,255,.17)" },
  controlActive: { backgroundColor: "rgba(240,101,74,.84)" },
  controlLabel: { color: "#FFFFFF", fontSize: 9, fontFamily: "Inter_600SemiBold" },
  endCallPressable: { width: 58, minHeight: 64, alignItems: "center", justifyContent: "center", gap: 4 },
  endCallButton: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  hangupIcon: { transform: [{ rotate: "135deg" }] },
  controlError: { color: "#FFFFFF", fontSize: 11, lineHeight: 15, textAlign: "center", fontFamily: "Inter_500Medium", paddingHorizontal: 8 },
});