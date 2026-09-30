import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, Platform } from "react-native";
import { router } from "expo-router";

import { useAuth } from "@/contexts/AuthContext";
import { AppAlert } from "@/components/AppAlert";
import { apiFetch } from "@/hooks/useApi";
import {
  endNativeCallForSession,
  getFullScreenCallAccess,
  getNativeActiveCallSession,
  initializeNativeCalls,
  openFullScreenCallSettings,
  reportNativeIncomingCall,
} from "@/lib/native-calls";
import { getPushDeviceId } from "@/lib/push-device";

export interface IncomingCallData {
  bookingId: string;
  sessionGeneration?: string;
  callerName: string;
  callerRole: string;
  videoRoomUrl: string;
  serviceName?: string;
  subtitle?: string;
  callType?: "voice" | "video";
}

export interface ActiveCallSession {
  bookingId: string;
  mode?: "voice" | "video";
  generation?: string;
}

interface CallContextType {
  incomingCall: IncomingCallData | null;
  activeCall: ActiveCallSession | null;
  callMinimized: boolean;
  startActiveCall: (session: ActiveCallSession) => void;
  setCallMinimized: (minimized: boolean) => void;
  clearActiveCall: (session: ActiveCallSession) => void;
  acceptCall: (bookingId: string) => Promise<void>;
  declineCall: (bookingId: string) => Promise<void>;
  dismissCall: () => void;
}

const CallContext = createContext<CallContextType | null>(null);
const FULL_SCREEN_ACCESS_PROMPTED_KEY = "full-screen-call-access-prompted";

function sessionKey(
  call: Pick<IncomingCallData, "bookingId" | "sessionGeneration">,
) {
  return `${call.bookingId}:${call.sessionGeneration || ""}`;
}

async function getRequiredInstallationId(): Promise<string> {
  const installationId = await getPushDeviceId();
  if (!installationId.trim()) {
    throw new Error("This device does not have a valid installation identity.");
  }
  return installationId;
}

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(
    null
  );
  const [activeCall, setActiveCall] = useState<ActiveCallSession | null>(null);
  const [callMinimized, setCallMinimized] = useState(false);
  const endedSessionRef = useRef<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nativeReportedSessionRef = useRef<string | null>(null);
  const incomingCheckInFlightRef = useRef(false);

  const startActiveCall = useCallback((session: ActiveCallSession) => {
    const normalized = { ...session, generation: session.generation || undefined };
    if (endedSessionRef.current === `${normalized.bookingId}:${normalized.generation || ""}`) return;
    // A stale route must not replace or tear down an already mounted session.
    setActiveCall((current) =>
      current
        ? current
        : normalized,
    );
    setCallMinimized(false);
  }, []);
  const clearActiveCall = useCallback((session: ActiveCallSession) => {
    const generation = session.generation || undefined;
    endedSessionRef.current = `${session.bookingId}:${generation || ""}`;
    setActiveCall((current) =>
      current?.bookingId === session.bookingId && current.generation === generation
        ? null
        : current,
    );
  }, []);

  useEffect(() => {
    if (user) return;
    setActiveCall(null);
    setCallMinimized(false);
  }, [user]);

  useEffect(() => {
    if (Platform.OS !== "android" || !user?.id) return;
    let active = true;

    void (async () => {
      // Do not show a setup message when Android already permits full-screen
      // calls, or in Expo Go / older builds without the native bridge.
      if (getFullScreenCallAccess() !== false) return;
      const alreadyPrompted = await AsyncStorage.getItem(FULL_SCREEN_ACCESS_PROMPTED_KEY);
      if (!active || alreadyPrompted === "true") return;
      await AsyncStorage.setItem(FULL_SCREEN_ACCESS_PROMPTED_KEY, "true");
      if (!active) return;

      AppAlert.alert(
        "Enable full-screen call alerts",
        "Android has blocked full-screen call alerts, so incoming calls may appear only as banners. Enable access to show Answer and Decline over the lock screen.",
        [
          { text: "Not now", style: "cancel" },
          {
            text: "Open Settings",
            onPress: () => {
              if (!openFullScreenCallSettings()) {
                AppAlert.alert(
                  "Open Android settings",
                  "Find Perfusion in your phone's app settings and enable full-screen call alerts.",
                );
              }
            },
          },
        ],
      );
    })().catch((error) => {
      console.warn("[call-context] Could not check full-screen call access", error);
    });

    return () => { active = false; };
  }, [user?.id]);

  const checkIncomingCall = useCallback(async () => {
    if (!user || incomingCheckInFlightRef.current) return;
    incomingCheckInFlightRef.current = true;
    try {
      let installationId: string;
      try {
        installationId = await getRequiredInstallationId();
      } catch (error) {
        setIncomingCall(null);
        console.warn(
          "[call-context] Could not load the installation identity for incoming calls",
          error,
        );
        return;
      }
      if (!installationId) {
        setIncomingCall(null);
        console.warn("[call-context] No installation identity is available for incoming calls");
        return;
      }
      const res = await apiFetch(
        `/api/call/incoming?installationId=${encodeURIComponent(installationId)}`,
      );
      if (res.ok) {
        const data = (await res.json()) as IncomingCallData | null;
        if (data?.bookingId) {
          const key = sessionKey(data);
          if (Platform.OS !== "web") {
            if (nativeReportedSessionRef.current === key) {
              setIncomingCall(null);
              return;
            }
            const nativeReported = await reportNativeIncomingCall(data);
            if (nativeReported) {
              nativeReportedSessionRef.current = key;
              setIncomingCall(null);
              return;
            }
          }
          setIncomingCall((current) =>
            current && sessionKey(current) === key ? current : data,
          );
        } else {
          setIncomingCall(null);
        }
      }
    } catch (error) {
      console.warn("[call-context] Could not check for an incoming call", error);
    } finally {
      incomingCheckInFlightRef.current = false;
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setIncomingCall(null);
      nativeReportedSessionRef.current = null;
      return;
    }
    checkIncomingCall();
    pollRef.current = setInterval(checkIncomingCall, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [checkIncomingCall, user]);

  const reconcileNativeCall = useCallback(async () => {
    if (!user || Platform.OS === "web") return;
    const session = await getNativeActiveCallSession();
    const bookingId = session?.incomingCallEvent?.metadata?.bookingId;
    const sessionGeneration =
      session?.incomingCallEvent?.metadata?.sessionGeneration;
    if (
      typeof bookingId !== "string" ||
      typeof sessionGeneration !== "string" ||
      !sessionGeneration
    ) {
      nativeReportedSessionRef.current = null;
      return;
    }

    const key = `${bookingId}:${sessionGeneration}`;
    try {
      const response = await apiFetch(`/api/call/status/${bookingId}`);
      if (!response.ok) return;
      const status: {
        status?: string;
        sessionGeneration?: string;
      } = await response.json();
      if (
        status.sessionGeneration !== sessionGeneration ||
        (status.status !== "ringing" && status.status !== "accepted")
      ) {
        await endNativeCallForSession(bookingId, sessionGeneration);
        if (nativeReportedSessionRef.current === key) {
          nativeReportedSessionRef.current = null;
        }
        setIncomingCall((current) =>
          current && sessionKey(current) === key ? null : current,
        );
        return;
      }
      nativeReportedSessionRef.current = key;
    } catch (error) {
      console.warn("[call-context] Could not reconcile the system call", error);
    }
  }, [user]);

  useEffect(() => {
    if (!user || Platform.OS === "web") return;
    if (AppState.currentState === "active") {
      reconcileNativeCall();
      checkIncomingCall();
    }
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        reconcileNativeCall();
        checkIncomingCall();
      }
    });
    return () => subscription.remove();
  }, [checkIncomingCall, reconcileNativeCall, user]);

  useEffect(() => {
    if (!user || Platform.OS === "web") return;

    let cleanup = () => {};
    let cancelled = false;
    initializeNativeCalls({
      onAnswered: async (bookingId, sessionGeneration) => {
        const installationId =
          user.role === "care_seeker" ? await getRequiredInstallationId() : undefined;
        const response = await apiFetch(`/api/call/accept/${bookingId}`, {
          method: "POST",
          body: JSON.stringify({
            sessionGeneration,
            ...(installationId ? { installationId } : {}),
          }),
        });
        if (!response.ok) throw new Error("Could not accept call");
        const result: { callType?: "voice" | "video"; sessionGeneration?: string } = await response.json();
        setIncomingCall(null);
        router.push(`/call/${bookingId}?mode=${result.callType === "voice" ? "voice" : "video"}&generation=${result.sessionGeneration || ""}`);
      },
      onEnded: async (bookingId, sessionGeneration) => {
        const statusResponse = await apiFetch(`/api/call/status/${bookingId}`);
        if (!statusResponse.ok) {
          throw new Error("Could not verify the call before ending it");
        }
        const status: {
          status?: string;
          sessionGeneration?: string;
          isCaller?: boolean;
        } = await statusResponse.json();
        if (status.sessionGeneration !== sessionGeneration) {
          const key = `${bookingId}:${sessionGeneration}`;
          if (nativeReportedSessionRef.current === key) {
            nativeReportedSessionRef.current = null;
          }
          return;
        }
        const action =
          status.status === "accepted"
            ? "end"
            : status.status === "ringing"
              ? status.isCaller
                ? "cancel"
                : "decline"
              : null;
        if (action) {
          const installationId =
            action === "decline" && user.role === "care_seeker"
              ? await getRequiredInstallationId()
              : undefined;
          const response = await apiFetch(`/api/call/${action}/${bookingId}`, {
            method: "POST",
            body: JSON.stringify({
              sessionGeneration,
              ...(installationId ? { installationId } : {}),
            }),
          });
          if (!response.ok && response.status !== 404 && response.status !== 409) {
            throw new Error("Could not end the system call");
          }
        }
        const key = `${bookingId}:${sessionGeneration}`;
        if (nativeReportedSessionRef.current === key) {
          nativeReportedSessionRef.current = null;
        }
        setIncomingCall(null);
      },
      onToken: async (token, tokenType) => {
        await apiFetch("/api/push/mobile-token", {
          method: "POST",
          body: JSON.stringify({
            token,
            platform: Platform.OS,
            tokenType,
            deviceId: await getPushDeviceId(),
          }),
        });
      },
    }).then((dispose) => {
      if (cancelled) dispose();
      else cleanup = dispose;
    });

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [user]);

  const acceptCall = async (bookingId: string) => {
    const installationId =
      user?.role === "care_seeker" ? await getRequiredInstallationId() : undefined;
    const response = await apiFetch(`/api/call/accept/${bookingId}`, {
      method: "POST",
      body: JSON.stringify({
        sessionGeneration: incomingCall?.sessionGeneration,
        ...(installationId ? { installationId } : {}),
      }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.error || "Could not accept call");
    }
    setIncomingCall(null);
  };

  const declineCall = async (bookingId: string) => {
    const installationId =
      user?.role === "care_seeker" ? await getRequiredInstallationId() : undefined;
    const response = await apiFetch(`/api/call/decline/${bookingId}`, {
      method: "POST",
      body: JSON.stringify({
        sessionGeneration: incomingCall?.sessionGeneration,
        ...(installationId ? { installationId } : {}),
      }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.error || "Could not decline call");
    }
    setIncomingCall(null);
  };

  const dismissCall = () => setIncomingCall(null);

  return (
    <CallContext.Provider
      value={{ incomingCall, activeCall, callMinimized, startActiveCall, setCallMinimized, clearActiveCall, acceptCall, declineCall, dismissCall }}
    >
      {children}
    </CallContext.Provider>
  );
}

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCall must be used within CallProvider");
  return ctx;
}
