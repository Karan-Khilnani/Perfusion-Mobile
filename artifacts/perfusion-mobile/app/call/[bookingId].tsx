import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAudioPlayer } from "expo-audio";
import { router, useLocalSearchParams } from "expo-router";
import { enterPiPAndroid, useIsInPiPMode } from "@stream-io/video-react-native-sdk";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Linking,
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CallMedia } from "@/components/CallMedia";
import { StreamCallMedia } from "@/components/StreamCallMedia";
import { apiFetch } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";
import { endNativeCallForSession } from "@/lib/native-calls";

interface CallInfo {
  videoRoomId?: string;
  serviceName?: string;
  patientName?: string;
  seekerHospitalName?: string;
  seekerCity?: string | null;
}

interface CallStatus {
  status: "none" | "ringing" | "accepted" | "declined" | "timeout" | "ended";
  isCaller?: boolean;
  callType?: "voice" | "video";
  mediaProvider?: "daily" | "stream";
  videoRoomUrl?: string;
  sessionGeneration?: string;
}

interface StreamCredentials {
  apiKey: string;
  token: string;
  callId: string;
  callType: string;
  userId: string;
  userName: string;
  sessionGeneration: string;
}

export default function CallScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { bookingId, mode, generation } = useLocalSearchParams<{
    bookingId: string;
    mode?: "voice" | "video";
    generation?: string;
  }>();
  const [roomAttempt, setRoomAttempt] = useState(0);
  const [permissionsReady, setPermissionsReady] = useState(Platform.OS !== "android");
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [roomError, setRoomError] = useState(false);
  const [streamAttempt, setStreamAttempt] = useState(0);
  const [endPending, setEndPending] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);
  const [permissionNeedsSettings, setPermissionNeedsSettings] = useState(false);
  const [permissionRequesting, setPermissionRequesting] = useState(false);
  const [streamCredentialsTimedOut, setStreamCredentialsTimedOut] = useState(false);
  const [streamCredentialRetry, setStreamCredentialRetry] = useState(0);
  const [cancelingOutgoingCall, setCancelingOutgoingCall] = useState(false);
  const isInPiPMode = useIsInPiPMode();
  const pipEnteringRef = useRef(false);
  const returningFromCallRef = useRef(false);
  const acceptedGenerationRef = useRef<string | null>(null);
  const ringbackSuppressed = useRef(false);
  const ringback = useAudioPlayer(require("../../assets/audio/perfusion_ringback.mp3"));
  const permissionRequestRef = useRef<Promise<boolean> | null>(null);

  const { data: booking } = useQuery<CallInfo>({
    queryKey: ["booking", bookingId],
    queryFn: async () => {
      const res = await apiFetch(`/api/bookings/${bookingId}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!bookingId,
  });
  const callTitle = booking?.seekerHospitalName || booking?.serviceName || "Consultation";

  const {
    data: callStatus,
    isLoading: statusLoading,
    isError: statusError,
    isFetchedAfterMount: statusFetchedAfterMount,
    refetch: refetchCallStatus,
  } = useQuery<CallStatus>({
    queryKey: ["call-status", bookingId, generation || "current"],
    queryFn: async () => {
      const res = await apiFetch(`/api/call/status/${bookingId}`);
      if (!res.ok) throw new Error("Call status unavailable");
      return res.json();
    },
    enabled: !!bookingId,
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "ringing" ? 1000 : status === "accepted" ? 2000 : false;
    },
  });
  const currentSession =
    !generation ||
    !callStatus ||
    !callStatus.sessionGeneration ||
    callStatus.sessionGeneration === generation;
  const currentStatus = currentSession ? callStatus?.status : "ended";
  // The session is authoritative; the route mode is only used while it loads.
  const callMode = callStatus?.callType || (mode === "voice" ? "voice" : "video");

  const isStreamCall = callStatus?.mediaProvider === "stream";
  const returnFromCall = useCallback(() => {
    if (returningFromCallRef.current) return;
    returningFromCallRef.current = true;
    queryClient.removeQueries({
      queryKey: ["call-status", bookingId, generation || "current"],
    });
    queryClient.removeQueries({
      queryKey: ["stream-call-credentials", bookingId, callStatus?.sessionGeneration],
    });
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  }, [bookingId, callStatus?.sessionGeneration, generation, queryClient]);

  const requestMediaPermissions = useCallback(async () => {
    if (Platform.OS !== "android") return true;
    if (permissionRequestRef.current) return permissionRequestRef.current;

    const request = (async () => {
      setPermissionRequesting(true);
      const requiredPermissions = callMode === "video"
        ? [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, PermissionsAndroid.PERMISSIONS.CAMERA]
        : [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];

      try {
        const alreadyGranted = await Promise.all(
          requiredPermissions.map((permission) => PermissionsAndroid.check(permission)),
        );
        const missingPermissions = requiredPermissions.filter(
          (_permission, index) => !alreadyGranted[index],
        );
        const results: Record<string, string> = missingPermissions.length
          ? await PermissionsAndroid.requestMultiple(missingPermissions) as Record<string, string>
          : {};
        const deniedPermissions = requiredPermissions.filter((permission, index) => {
          return !alreadyGranted[index] &&
            results[permission] !== PermissionsAndroid.RESULTS.GRANTED;
        });
        setPermissionsReady(deniedPermissions.length === 0);
        setPermissionDenied(deniedPermissions.length > 0);
        setPermissionNeedsSettings(deniedPermissions.some(
          (permission) => results[permission] === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
        ));
        return deniedPermissions.length === 0;
      } catch {
        setPermissionsReady(false);
        setPermissionDenied(true);
        return false;
      } finally {
        setPermissionRequesting(false);
      }
    })();

    permissionRequestRef.current = request;
    try {
      return await request;
    } finally {
      if (permissionRequestRef.current === request) permissionRequestRef.current = null;
    }
  }, [callMode]);

  useEffect(() => {
    const shouldPreflightPermissions =
      currentStatus === "accepted" ||
      (currentStatus === "ringing" && callStatus?.isCaller === true);
    if (Platform.OS !== "android" || !shouldPreflightPermissions) return;
    void requestMediaPermissions();
  }, [callMode, callStatus?.isCaller, currentStatus, requestMediaPermissions]);

  useEffect(() => {
    if (
      Platform.OS === "web" ||
      currentStatus !== "ringing" ||
      !callStatus?.isCaller ||
      cancelingOutgoingCall
    ) {
      ringbackSuppressed.current = true;
      ringback.pause();
      return;
    }

    ringbackSuppressed.current = false;
    let active = true;
    let stopTimeout: ReturnType<typeof setTimeout> | undefined;
    let nextBurstTimeout: ReturnType<typeof setTimeout> | undefined;
    // Each burst is played once; the timer below controls the ring cadence.
    ringback.loop = false;

    const playRingbackBurst = async () => {
      if (!active || ringbackSuppressed.current) return;
      await ringback.seekTo(0).catch(() => {});
      if (!active || ringbackSuppressed.current) return;
      ringback.play();
      stopTimeout = setTimeout(() => {
        ringback.pause();
        nextBurstTimeout = setTimeout(() => void playRingbackBurst(), 4000);
      }, 2000);
    };

    void playRingbackBurst();
    return () => {
      active = false;
      if (stopTimeout) clearTimeout(stopTimeout);
      if (nextBurstTimeout) clearTimeout(nextBurstTimeout);
      ringback.pause();
      void ringback.seekTo(0).catch(() => {});
    };
  }, [callStatus?.isCaller, callStatus?.sessionGeneration, cancelingOutgoingCall, currentStatus, ringback]);

  const { data: tokenData, isError: tokenError } = useQuery<{ token: string; userName: string }>({
    queryKey: ["daily-token", bookingId, callStatus?.videoRoomUrl],
    queryFn: async () => {
      const encodedUrl = encodeURIComponent(callStatus!.videoRoomUrl!);
      const res = await apiFetch(
        `/api/bookings/room/${encodedUrl}/daily-token`
      );
      if (!res.ok) throw new Error("Token error");
      return res.json();
    },
    enabled: !isStreamCall && !!callStatus?.videoRoomUrl && currentStatus === "accepted",
  });
  const {
    data: streamCredentials,
    isLoading: streamCredentialsLoading,
    isError: streamCredentialsError,
    refetch: refetchStreamCredentials,
  } = useQuery<StreamCredentials>({
    queryKey: ["stream-call-credentials", bookingId, callStatus?.sessionGeneration],
    queryFn: async () => {
      const res = await apiFetch(`/api/call/stream-credentials/${bookingId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Could not load secure call credentials.");
      }
      const data = (await res.json()) as StreamCredentials;
      if (
        !data.apiKey || !data.token || !data.callId || !data.callType ||
        !data.userId || !data.userName ||
        (callStatus?.sessionGeneration && data.sessionGeneration !== callStatus.sessionGeneration)
      ) {
        throw new Error("The secure call credentials are incomplete or belong to another call.");
      }
      return data;
    },
    enabled: isStreamCall && currentStatus === "accepted",
    retry: 1,
  });

  useEffect(() => {
    if (!isStreamCall || currentStatus !== "accepted" || !streamCredentialsLoading) {
      setStreamCredentialsTimedOut(false);
      return;
    }
    const timeout = setTimeout(() => setStreamCredentialsTimedOut(true), 20000);
    return () => clearTimeout(timeout);
  }, [currentStatus, isStreamCall, streamCredentialRetry, streamCredentialsLoading]);

  const roomUrl = useMemo(() => {
    if (!callStatus?.videoRoomUrl || !tokenData?.token || currentStatus !== "accepted") return null;
    const separator = callStatus.videoRoomUrl.includes("?") ? "&" : "?";
    const params = [
      `t=${encodeURIComponent(tokenData.token)}`,
      "prejoinUI=false",
      callMode === "voice" ? "startVideoOff=true" : null,
    ]
      .filter(Boolean)
      .join("&");
    return `${callStatus.videoRoomUrl}${separator}${params}`;
  }, [callStatus?.videoRoomUrl, callMode, currentStatus, tokenData?.token]);

  const handleEndCall = useCallback(async () => {
    if (endPending) return;
    const cancelingOutgoing =
      currentStatus === "ringing" && callStatus?.isCaller === true;
    if (cancelingOutgoing) {
      setCancelingOutgoingCall(true);
      ringbackSuppressed.current = true;
      ringback.pause();
      void ringback.seekTo(0).catch(() => {});
    }
    setEndPending(true);
    setEndError(null);
    const sessionGeneration = generation || callStatus?.sessionGeneration;
    try {
      let action: "cancel" | "decline" | "end" | null =
        currentStatus === "ringing"
          ? callStatus?.isCaller ? "cancel" : "decline"
          : currentStatus === "accepted" ? "end" : null;
      if (action) {
        if (!sessionGeneration) throw new Error("Call identity is missing. Please try again.");
        const failureMessage = "Could not end the call. Please try again.";
        for (let attempt = 0; attempt < 2; attempt++) {
          const response = await apiFetch(`/api/call/${action}/${bookingId}`, {
            method: "POST",
            body: JSON.stringify({ sessionGeneration }),
          });
          if (response.ok || response.status === 404) break;
          if (response.status !== 409) throw new Error(failureMessage);

          // The recipient may have answered just as the caller cancelled.
          // Reconcile the same generation before leaving, so an accepted call
          // is never abandoned while the other participant remains connected.
          const latestResponse = await apiFetch(`/api/call/status/${bookingId}`);
          if (!latestResponse.ok) throw new Error(failureMessage);
          const latest: CallStatus = await latestResponse.json();
          if (
            latest.sessionGeneration !== sessionGeneration ||
            latest.status === "none" ||
            latest.status === "declined" ||
            latest.status === "timeout" ||
            latest.status === "ended"
          ) {
            break;
          }
          if (attempt === 1) throw new Error(failureMessage);
          if (latest.status === "accepted") action = "end";
          else if (latest.status === "ringing") action = latest.isCaller ? "cancel" : "decline";
          else throw new Error(failureMessage);
        }
      }
      if (sessionGeneration) {
        await endNativeCallForSession(bookingId, sessionGeneration);
      }
      returnFromCall();
    } catch (error) {
      setEndError(error instanceof Error ? error.message : "Could not end the call.");
      if (cancelingOutgoing) {
        ringbackSuppressed.current = false;
        setCancelingOutgoingCall(false);
        void refetchCallStatus();
      }
    } finally {
      setEndPending(false);
    }
  }, [bookingId, callStatus?.sessionGeneration, callStatus?.isCaller, currentStatus, endPending, generation, refetchCallStatus, returnFromCall, ringback]);

  // The system may end a call from the other device, or the accepted session
  // may expire while this screen is open. Never clear another generation's call.
  useEffect(() => {
    if (currentStatus === "accepted" && currentSession && callStatus?.sessionGeneration) {
      acceptedGenerationRef.current = callStatus.sessionGeneration;
    }
  }, [callStatus?.sessionGeneration, currentSession, currentStatus]);

  useEffect(() => {
    if (!callStatus || statusLoading || (!generation && !statusFetchedAfterMount)) return;
    const terminal =
      callStatus.status === "none" ||
      callStatus.status === "declined" ||
      callStatus.status === "timeout" ||
      callStatus.status === "ended" ||
      (!!generation &&
        !!callStatus.sessionGeneration &&
        callStatus.sessionGeneration !== generation);
    if (!terminal) return;

    const endedGeneration =
      acceptedGenerationRef.current ||
      (callStatus.sessionGeneration === generation
        ? callStatus.sessionGeneration
        : null);
    acceptedGenerationRef.current = null;
    if (endedGeneration) {
      void endNativeCallForSession(bookingId, endedGeneration);
    }
    returnFromCall();
  }, [
    bookingId,
    callStatus,
    generation,
    returnFromCall,
    statusFetchedAfterMount,
    statusLoading,
  ]);

  // A normal Back would unmount the Stream media while leaving the server call
  // accepted. Keep the Activity and media mounted in Android picture-in-picture.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (isInPiPMode) return true;
      if (statusLoading && generation) return true;
      if (currentStatus !== "accepted" && currentStatus !== "ringing") return false;
      if (currentStatus === "accepted" && isStreamCall) {
        if (pipEnteringRef.current) return true;
        pipEnteringRef.current = true;
        void Promise.resolve(enterPiPAndroid(9, 16))
          .then((entered) => {
            if (entered === false) {
              Alert.alert("Picture-in-picture unavailable", "The call is still active. Stay on this screen and use the red button when you want to end it.");
            }
          })
          .catch(() => Alert.alert("Picture-in-picture unavailable", "The call is still active. Stay on this screen and use the red button when you want to end it."))
          .finally(() => { pipEnteringRef.current = false; });
      } else {
        Alert.alert(
          currentStatus === "ringing" ? "Cancel this call?" : "Call still connecting",
          "Leaving this screen would disconnect the call without ending it.",
          [
            { text: "Stay", style: "cancel" },
            { text: "End call", style: "destructive", onPress: () => { void handleEndCall(); } },
          ],
        );
      }
      return true;
    });
    return () => subscription.remove();
  }, [currentStatus, generation, handleEndCall, isInPiPMode, isStreamCall, statusLoading]);

  const showConnectingCallUi =
    statusLoading ||
    (statusError && !callStatus) ||
    (currentStatus === "accepted" &&
      isStreamCall &&
      streamCredentialsLoading &&
      !streamCredentialsTimedOut) ||
    (currentStatus === "accepted" &&
      !isStreamCall &&
      !!callStatus?.videoRoomUrl &&
      !roomUrl &&
      !tokenError &&
      !statusError) ||
    (currentStatus === "accepted" &&
      Platform.OS === "android" &&
      !permissionsReady &&
      !permissionDenied);

  if (showConnectingCallUi) {
    return (
      <View style={[styles.roomContainer, { backgroundColor: colors.callBackground }]}>
        <View style={[styles.callConnectingCenter, isInPiPMode && styles.callConnectingCompact]}>
          {!isInPiPMode && (
            <>
              <View style={[styles.avatarArea, { backgroundColor: `${colors.conversationPrimary}18` }]}>
                <Ionicons
                  name={callMode === "voice" ? "call-outline" : "videocam-outline"}
                  size={52}
                  color={colors.conversationPrimary}
                />
              </View>
              <Text style={[styles.connectingTitle, { color: colors.callForeground }]}>
                {callTitle}
              </Text>
              {booking?.patientName && (
                <Text style={styles.patientName}>{booking.patientName}</Text>
              )}
              {booking?.seekerCity && (
                <Text style={styles.patientCity}>City: {booking.seekerCity}</Text>
              )}
            </>
          )}
          {statusError && !callStatus ? (
            <>
              <Text style={[styles.roomErrorText, { color: colors.callForeground }]}>
                Call details could not be loaded. Check your connection and try again.
              </Text>
              <Pressable onPress={() => void refetchCallStatus()}>
                <Text style={[styles.retryText, { color: colors.callForeground }]}>Try again</Text>
              </Pressable>
            </>
          ) : (
            <>
              <ActivityIndicator color={colors.callForeground} size={isInPiPMode ? "small" : "large"} />
              <Text style={[styles.hint, { color: colors.callForeground }]}>
                {isInPiPMode ? "Connecting…" : "Connecting securely to your call…"}
              </Text>
            </>
          )}
        </View>
        {!isInPiPMode && callStatus && (
          <View style={[styles.roomHeader, { top: insets.top + 8 }]}>
            <Pressable
              onPress={handleEndCall}
              disabled={endPending}
              style={[styles.leaveRoomButton, { backgroundColor: colors.destructive }]}
              accessibilityLabel="End call"
              testID="leave-in-app-call"
            >
              <Ionicons name="call" size={22} color={colors.callForeground} style={{ transform: [{ rotate: "135deg" }] }} />
            </Pressable>
            {endError && <Text style={[styles.roomErrorText, { color: colors.callForeground }]} accessibilityRole="alert">{endError}</Text>}
          </View>
        )}
      </View>
    );
  }

  if (currentStatus === "accepted" && Platform.OS !== "web" && permissionDenied) {
    return (
      <View style={[styles.permissionScreen, { backgroundColor: colors.background }]}>
        <Ionicons
          name={callMode === "voice" ? "mic-off-outline" : "videocam-off-outline"}
          size={48}
          color={colors.primary}
        />
        <Text style={[styles.permissionTitle, { color: colors.foreground }]}>
          {callMode === "voice" ? "Microphone access is required" : "Camera and microphone access are required"}
        </Text>
        <Text style={[styles.permissionText, { color: colors.mutedForeground }]}>
          {callMode === "voice"
            ? "Allow microphone access in Android to continue this call."
            : "Allow camera and microphone access in Android to continue this call."}
        </Text>
        {permissionNeedsSettings ? (
          <>
            <Pressable
              onPress={() => Linking.openSettings()}
              style={[styles.settingsButton, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.settingsButtonText}>Open Settings</Text>
            </Pressable>
            <Pressable
              onPress={() => void requestMediaPermissions()}
              disabled={permissionRequesting}
              style={styles.permissionRetry}
            >
              <Text style={[styles.retryText, { color: colors.primary }]}>
                I enabled access — check again
              </Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            onPress={() => void requestMediaPermissions()}
            disabled={permissionRequesting}
            style={[styles.settingsButton, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.settingsButtonText}>
              {permissionRequesting ? "Requesting access…" : "Allow access"}
            </Text>
          </Pressable>
        )}
        <Pressable onPress={handleEndCall} disabled={endPending} style={styles.endBtn}>
          <Text style={[styles.endBtnText, { color: colors.destructive }]}>Leave</Text>
        </Pressable>
        {endError && <Text style={[styles.permissionText, { color: colors.destructive }]} accessibilityRole="alert">{endError}</Text>}
      </View>
    );
  }

  if (currentStatus === "accepted" && isStreamCall && Platform.OS !== "web") {
    return (
      <View style={styles.roomContainer}>
        {streamCredentials ? (
          <StreamCallMedia
            key={`${streamCredentials.callId}:${streamCredentials.sessionGeneration}:${streamAttempt}`}
            credentials={streamCredentials}
            voiceCall={callMode === "voice"}
            compact={isInPiPMode}
            bookingId={bookingId}
            participantTitle={booking?.patientName || callTitle}
            participantSubtitle={booking?.seekerHospitalName || booking?.serviceName}
            onEndCall={() => void handleEndCall()}
            endPending={endPending}
            endError={endError}
          />
        ) : streamCredentialsTimedOut ? (
          <View style={styles.roomError}>
            <Text style={styles.roomErrorText} accessibilityRole="alert">
              Secure call setup is taking too long. Check your connection and try again.
            </Text>
            <Pressable
              onPress={() => {
                setStreamCredentialsTimedOut(false);
                setStreamCredentialRetry((attempt) => attempt + 1);
                void refetchStreamCredentials();
              }}
              testID="retry-stream-credentials"
            >
              <Text style={[styles.retryText, { color: colors.primary }]}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.roomError}>
            <Text style={styles.roomErrorText} accessibilityRole="alert">
              {streamCredentialsError ? "Could not load secure Stream call credentials." : "Preparing secure Stream call…"}
            </Text>
            {streamCredentialsError && (
              <Pressable onPress={() => void refetchStreamCredentials()}>
                <Text style={[styles.retryText, { color: colors.primary }]}>Try again</Text>
              </Pressable>
            )}
          </View>
        )}
        {!isInPiPMode && !streamCredentials && <View style={[styles.roomHeader, { top: insets.top + 8 }]}>
          <Pressable
            onPress={handleEndCall}
            disabled={endPending}
            style={[styles.leaveRoomButton, { backgroundColor: colors.destructive }]}
            accessibilityLabel="End call"
            testID="leave-in-app-call"
          >
            <Ionicons name="call" size={22} color={colors.callForeground} style={{ transform: [{ rotate: "135deg" }] }} />
          </Pressable>
          {endError && <Text style={[styles.roomErrorText, { color: colors.callForeground }]} accessibilityRole="alert">{endError}</Text>}
        </View>}
      </View>
    );
  }

  if (currentStatus === "accepted" && isStreamCall && Platform.OS === "web") {
    return (
      <View style={[styles.container, { backgroundColor: colors.callBackground }]}>
        <Text style={[styles.hint, { color: colors.callForeground }]}>
          Native Stream calls are available in the installed iOS or Android app.
        </Text>
        <Pressable onPress={handleEndCall} disabled={endPending} style={styles.endBtn}>
          <Text style={[styles.endBtnText, { color: colors.callForeground }]}>End call</Text>
        </Pressable>
        {endError && <Text style={[styles.roomErrorText, { color: colors.callForeground }]} accessibilityRole="alert">{endError}</Text>}
      </View>
    );
  }

  if (currentStatus === "accepted" && !isStreamCall && roomUrl) {
    return (
      <View style={styles.roomContainer}>
        <CallMedia key={roomAttempt} url={roomUrl} onError={() => setRoomError(true)} />
        <View style={[styles.roomHeader, { top: insets.top + 8 }]}>
          <Pressable
            onPress={handleEndCall}
            disabled={endPending}
            style={[styles.leaveRoomButton, { backgroundColor: colors.destructive }]}
            accessibilityLabel="End call"
            testID="leave-in-app-call"
          >
            <Ionicons name="call" size={22} color={colors.callForeground} style={{ transform: [{ rotate: "135deg" }] }} />
          </Pressable>
          {endError && <Text style={[styles.roomErrorText, { color: colors.callForeground }]} accessibilityRole="alert">{endError}</Text>}
        </View>
        {roomError && (
          <View style={styles.roomError}>
            <Text style={styles.roomErrorText}>The secure call could not be loaded.</Text>
            <Pressable onPress={() => { setRoomError(false); setRoomAttempt((n) => n + 1); }}>
              <Text style={[styles.retryText, { color: colors.primary }]}>Try again</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.callBackground,
          paddingTop: Platform.OS === "web" ? 67 + insets.top : insets.top + 16,
          paddingBottom:
            Platform.OS === "web" ? 34 + insets.bottom : insets.bottom + 32,
        },
      ]}
    >
      <View style={styles.topBar}>
        <Pressable onPress={handleEndCall} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color={colors.callForeground} />
        </Pressable>
        <Text style={styles.topTitle}>
          {callTitle}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.body}>
        <View
          style={[
            styles.avatarArea,
            { backgroundColor: `${colors.conversationPrimary}18` },
          ]}
        >
          <Ionicons name={callMode === "voice" ? "call-outline" : "videocam-outline"} size={58} color={colors.conversationPrimary} />
        </View>
        <Text style={[styles.consultTitle, { color: colors.callForeground }]}>
          {callTitle}
        </Text>
        {booking?.patientName && (
          <Text style={styles.patientName}>{booking.patientName}</Text>
        )}
        {booking?.seekerCity && (
          <Text style={styles.patientCity}>City: {booking.seekerCity}</Text>
        )}
        <Text style={[styles.hint, { color: colors.callForeground }]}>
          {currentStatus === "ringing" && callStatus?.isCaller && permissionDenied
            ? "Allow microphone access before the other participant answers so you can join quickly."
            : currentStatus === "ringing"
            ? callStatus?.isCaller ? `Calling… Waiting for the other participant to answer` : "Incoming call…"
            : statusError || tokenError ? "Unable to connect to the secure call. Please try again."
            : currentStatus === "declined" ? "The call was declined."
            : currentStatus === "timeout" ? "No answer. The call timed out."
            : currentStatus === "none" ? "There is no active call. Start a new call from the consultation."
            : "The call has ended."}
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={handleEndCall}
          disabled={endPending}
          style={({ pressed }) => [
            styles.endBtn,
            { opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Ionicons name={currentStatus === "ringing" ? "call" : "arrow-back"} size={22} color={colors.callForeground} style={currentStatus === "ringing" ? { transform: [{ rotate: "135deg" }] } : undefined} />
          <Text style={[styles.endBtnText, { color: colors.callForeground }]}>{currentStatus === "ringing" ? "Cancel call" : "Back to consultation"}</Text>
        </Pressable>
        {endError && <Text style={[styles.roomErrorText, { color: colors.callForeground }]} accessibilityRole="alert">{endError}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  roomContainer: {
    flex: 1,
    backgroundColor: "#0A0A0A",
  },
  callConnectingCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 28,
  },
  callConnectingCompact: {
    gap: 4,
    paddingHorizontal: 8,
  },
  connectingTitle: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  webView: {
    flex: 1,
    backgroundColor: "#0A0A0A",
  },
  roomHeader: {
    position: "absolute",
    left: 12,
  },
  leaveRoomButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(10,10,10,0.72)",
  },
  roomError: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    paddingHorizontal: 32,
    backgroundColor: "#0A0A0A",
  },
  roomErrorText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
  retryText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  permissionScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingHorizontal: 28,
  },
  permissionTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  permissionText: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  permissionRetry: {
    minHeight: 44,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  settingsButton: {
    minHeight: 50,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  settingsButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  container: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: 24,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
    flex: 1,
    textAlign: "center",
  },
  body: {
    alignItems: "center",
    gap: 12,
  },
  avatarArea: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  consultTitle: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    textAlign: "center",
  },
  patientName: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
  },
  patientCity: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
  },
  hint: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.5)",
    textAlign: "center",
    marginTop: 8,
  },
  actions: {
    gap: 14,
    paddingBottom: 8,
  },
  joinBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 56,
    borderRadius: 14,
  },
  joinBtnText: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
  },
  endBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 44,
  },
  endBtnText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: "#EF4444",
  },
});
