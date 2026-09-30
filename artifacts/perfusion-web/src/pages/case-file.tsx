import { useState, useRef, useEffect, useMemo } from "react";
import { useParams, Link } from "wouter";
import { useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import {
  useGetCaseFile, getGetCaseFileQueryKey,
  getCaseFileMessages, getGetCaseFileMessagesQueryKey,
  useCreateCaseFileMessage,
  useGetCaseFileVitals, getGetCaseFileVitalsQueryKey,
  useCreateCaseFileVital,
  useGetCaseFileAdvisories, getGetCaseFileAdvisoriesQueryKey,
  useCreateCaseFileAdvisory,
  useCreateCaseFileAttachment,
  useUpdateCaseFileFollowUpAccess,
  getListConsultationDevicesQueryKey,
  useListConsultationDevices,
  useAssignConsultationCallbackDevice,
  getListCallbackDeviceRemindersQueryKey,
} from "@workspace/api-client-react";
import { useCallEvents, CallEvent } from "@/hooks/use-call-events";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft, Send, Paperclip, Activity, FileText,
  Stethoscope, Clock, ShieldCheck, User, Plus, X, Video, Image as ImageIcon, ExternalLink,
  Phone, PhoneCall
} from "lucide-react";
import { format } from "date-fns";

function getComorbidityEntries(value: string | null | undefined): string[] {
  return (value || "")
    .split(/\r\n|\n|\r/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function videoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => { resolve(video.duration); video.src = ""; URL.revokeObjectURL(url); };
    video.onerror = () => { reject(new Error("Could not read video duration.")); video.src = ""; URL.revokeObjectURL(url); };
    video.src = url;
  });
}

export default function CaseFilePage() {
  const { bookingId: paramBookingId } = useParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();

  const bookingId = paramBookingId || "";

  // Queries
  const { data: caseFile, isLoading: loadingCaseFile } = useGetCaseFile(bookingId, {
    query: {
      enabled: !!bookingId,
      queryKey: getGetCaseFileQueryKey(bookingId),
      refetchInterval: 15000,
      refetchOnWindowFocus: true
    }
  });

  const {
    data: messagesData,
    isLoading: loadingMessages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  } = useInfiniteQuery({
    queryKey: getGetCaseFileMessagesQueryKey(bookingId),
    queryFn: ({ pageParam }) => getCaseFileMessages(bookingId, { cursor: pageParam as string | undefined, limit: 50 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
    enabled: !!bookingId,
    refetchInterval: 15000,
    refetchOnWindowFocus: true
  });

  const { data: vitals, isLoading: loadingVitals } = useGetCaseFileVitals(bookingId, {
    query: {
      enabled: !!bookingId,
      queryKey: getGetCaseFileVitalsQueryKey(bookingId),
      refetchInterval: 15000,
      refetchOnWindowFocus: true
    }
  });

  const { data: advisories, isLoading: loadingAdvisories } = useGetCaseFileAdvisories(bookingId, {
    query: {
      enabled: !!bookingId,
      queryKey: getGetCaseFileAdvisoriesQueryKey(bookingId),
      refetchInterval: 15000,
      refetchOnWindowFocus: true
    }
  });

  const { data: callbackDevices, isLoading: callbackDevicesLoading, isError: callbackDevicesError, error: callbackDevicesErrorDetails } = useListConsultationDevices({
    query: {
      queryKey: [...getListConsultationDevicesQueryKey(), user?.id],
      enabled: !!caseFile?.capabilities.canManageCallbackDevice,
      refetchOnWindowFocus: true,
      refetchInterval: 60000,
      staleTime: 0,
    },
  });
  const eligibleCallbackDevices = useMemo(
    () => (callbackDevices ?? []).filter((device) => !!device.installationId?.trim() && !!device.staffName?.trim()),
    [callbackDevices],
  );
  const assignCallbackDeviceMutation = useAssignConsultationCallbackDevice({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCaseFileQueryKey(bookingId) });
        queryClient.invalidateQueries({ queryKey: getListCallbackDeviceRemindersQueryKey() });
        toast({ title: "Call-back device confirmed" });
      },
      onError: (error) => toast({ title: "Could not confirm device", description: error.message, variant: "destructive" }),
    },
  });

  // Mutations
  const sendMessageMutation = useCreateCaseFileMessage({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetCaseFileMessagesQueryKey(bookingId) })
    }
  });

  const attachMutation = useCreateCaseFileAttachment({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetCaseFileMessagesQueryKey(bookingId) })
    }
  });

  const updateAccessMutation = useUpdateCaseFileFollowUpAccess({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetCaseFileQueryKey(bookingId) })
    }
  });

  const addVitalMutation = useCreateCaseFileVital({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCaseFileVitalsQueryKey(bookingId) });
        queryClient.invalidateQueries({ queryKey: getGetCaseFileQueryKey(bookingId) });
      }
    }
  });

  const composeAdvisoryMutation = useCreateCaseFileAdvisory({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCaseFileAdvisoriesQueryKey(bookingId) });
        queryClient.invalidateQueries({ queryKey: getGetCaseFileQueryKey(bookingId) });
      }
    }
  });

  // Call Events SSE for real-time invalidation
  useCallEvents(
    (event: CallEvent) => {
      if (event.bookingId === bookingId) {
        if (event.type === "document_uploaded" || event.type === "case_file_updated") {
          queryClient.invalidateQueries({ queryKey: getGetCaseFileQueryKey(bookingId) });
          queryClient.invalidateQueries({ queryKey: getGetCaseFileMessagesQueryKey(bookingId) });
          queryClient.invalidateQueries({ queryKey: getGetCaseFileVitalsQueryKey(bookingId) });
          queryClient.invalidateQueries({ queryKey: getGetCaseFileAdvisoriesQueryKey(bookingId) });
        }
      }
    },
    () => {
      // Reconcile missed events on connect/reconnect
      queryClient.invalidateQueries({ queryKey: getGetCaseFileQueryKey(bookingId) });
      queryClient.invalidateQueries({ queryKey: getGetCaseFileMessagesQueryKey(bookingId) });
      queryClient.invalidateQueries({ queryKey: getGetCaseFileVitalsQueryKey(bookingId) });
      queryClient.invalidateQueries({ queryKey: getGetCaseFileAdvisoriesQueryKey(bookingId) });
    }
  );

  // Auto-scroll chat
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const lastMessageIdRef = useRef<string | null>(null);

  // We determine the "latest" message by looking at msgs after processing, so we'll do this effect lower down.

  const [messageInput, setMessageInput] = useState("");
  const [selectedCallbackDeviceId, setSelectedCallbackDeviceId] = useState("");
  useEffect(() => {
    if (selectedCallbackDeviceId && !eligibleCallbackDevices.some((device) => device.id === selectedCallbackDeviceId)) {
      setSelectedCallbackDeviceId("");
    }
  }, [eligibleCallbackDevices, selectedCallbackDeviceId]);
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return params.get("tab") || "overview";
    }
    return "overview";
  });

  // Dialog States
  const [showAttachDialog, setShowAttachDialog] = useState(false);
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [attachDuration, setAttachDuration] = useState<number | null>(null);
  const [attachPreview, setAttachPreview] = useState<string | null>(null);
  const [checkingVideo, setCheckingVideo] = useState(false);
  const [attachCategory, setAttachCategory] = useState<string>("");
  const [attachSource, setAttachSource] = useState<"camera" | "photo_gallery" | "document">("document");

  const [showVitalDialog, setShowVitalDialog] = useState(false);
  const [vitalData, setVitalData] = useState({
    systolicBp: "", diastolicBp: "", heartRate: "", respiratoryRate: "",
    intake: "", output: "", hourlyUrineOutput: "", gcs: ""
  });

  const [showAdvisoryDialog, setShowAdvisoryDialog] = useState(false);
  const [advisoryNarrative, setAdvisoryNarrative] = useState("");

  const handleSendMessage = () => {
    if (!messageInput.trim()) return;
    sendMessageMutation.mutate({ bookingId, data: { body: messageInput.trim() } }, {
      onSuccess: () => {
        setMessageInput("");
      },
      onError: (err: any) => {
        toast({ title: "Failed to send message", description: err?.message || "Please try again.", variant: "destructive" });
      }
    });
  };

  const selectAttachment = async (file: File | null) => {
    setAttachFile(null);
    setAttachDuration(null);
    if (attachPreview) URL.revokeObjectURL(attachPreview);
    setAttachPreview(null);
    if (!file) return;
    const video = file.type.startsWith("video/") || /\.(mp4|mov|webm)$/i.test(file.name);
    if (file.size > (video ? 75 : 25) * 1024 * 1024) {
      toast({ title: "File too large", description: video ? "Choose a video smaller than 75 MB." : "Choose a file smaller than 25 MB.", variant: "destructive" });
      return;
    }
    if (video) {
      setCheckingVideo(true);
      try {
        const seconds = await videoDuration(file);
        if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("Could not read video duration.");
        if (seconds > 120.05) throw new Error("Video must be 2 minutes or less.");
        setAttachDuration(seconds);
      } catch (error: any) {
        toast({ title: "Video not selected", description: error.message, variant: "destructive" });
        setCheckingVideo(false);
        return;
      }
      setCheckingVideo(false);
    }
    setAttachPreview(URL.createObjectURL(file));
    setAttachFile(file);
  };

  const handleAttachFile = () => {
    if (!attachFile || checkingVideo || attachMutation.isPending) return;
    const categoryToUse = caseFile?.capabilities.canAttach && !isProvider ? attachCategory : "uncategorized";
    if (!isProvider && !attachCategory) {
      toast({ title: "Required", description: "Please select a category", variant: "destructive" });
      return;
    }

    attachMutation.mutate({
      bookingId,
      data: { file: attachFile, source: attachSource, category: categoryToUse as any }
    }, {
      onSuccess: () => {
        setShowAttachDialog(false);
        setAttachFile(null);
        if (attachPreview) URL.revokeObjectURL(attachPreview);
        setAttachPreview(null);
        setAttachDuration(null);
        setAttachCategory("");
        toast({ title: "File attached" });
      },
      onError: (err: any) => {
        toast({ title: "Attachment Failed", description: err?.message || "Failed to attach file.", variant: "destructive" });
      }
    });
  };

  const handleAddVital = () => {
    addVitalMutation.mutate({
      bookingId,
      data: {
        observedAt: new Date().toISOString(),
        systolicBp: vitalData.systolicBp ? Number(vitalData.systolicBp) : null,
        diastolicBp: vitalData.diastolicBp ? Number(vitalData.diastolicBp) : null,
        heartRate: vitalData.heartRate ? Number(vitalData.heartRate) : null,
        respiratoryRate: vitalData.respiratoryRate ? Number(vitalData.respiratoryRate) : null,
        intake: vitalData.intake ? Number(vitalData.intake) : null,
        output: vitalData.output ? Number(vitalData.output) : null,
        hourlyUrineOutput: vitalData.hourlyUrineOutput ? Number(vitalData.hourlyUrineOutput) : null,
        gcs: vitalData.gcs ? Number(vitalData.gcs) : null,
      }
    }, {
      onSuccess: () => {
        setShowVitalDialog(false);
        setVitalData({
          systolicBp: "", diastolicBp: "", heartRate: "", respiratoryRate: "",
          intake: "", output: "", hourlyUrineOutput: "", gcs: ""
        });
        toast({ title: "Vitals recorded" });
      },
      onError: (err: any) => {
        toast({ title: "Failed to record vitals", description: err?.message || "Please try again.", variant: "destructive" });
      }
    });
  };

  const handleComposeAdvisory = () => {
    if (!advisoryNarrative.trim()) return;
    composeAdvisoryMutation.mutate({
      bookingId,
      data: { narrative: advisoryNarrative }
    }, {
      onSuccess: () => {
        setShowAdvisoryDialog(false);
        setAdvisoryNarrative("");
        toast({ title: "Advisory added" });
        setActiveTab("advisories");
      },
      onError: (err: any) => {
        toast({ title: "Failed to publish advisory", description: err?.message || "Please try again.", variant: "destructive" });
      }
    });
  };

  const msgs = (() => {
    if (!messagesData) return [];
    const all = messagesData.pages.flatMap(p => p.messages);
    const unique = Array.from(new Map(all.map(m => [m.id, m])).values());
    return unique.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  })();

  useEffect(() => {
    if (msgs.length > 0) {
      const latestMsg = msgs[msgs.length - 1];
      // Scroll to bottom if this is the first load OR if a new message was added at the end
      if (lastMessageIdRef.current !== latestMsg.id) {
        lastMessageIdRef.current = latestMsg.id;
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, [msgs]);

  const isProvider = user?.role === "provider";
  const returnPath = isProvider ? "/provider/bookings" : "/user/orders";

  if (!bookingId) return null;
  if (loadingCaseFile) return <CaseFileSkeleton />;
  if (!caseFile) return <div className="p-8 text-center text-muted-foreground">Case file not found.</div>;

  const caps = caseFile.capabilities;
  const comorbidityEntries = getComorbidityEntries(caseFile.summary.comorbidities);
  const callbackDevice = caseFile.booking.callbackDevice;
  const selectedCallbackDeviceIsEligible = eligibleCallbackDevices.some((device) => device.id === selectedCallbackDeviceId);
  const assignedCallbackDeviceIsEligible = eligibleCallbackDevices.some((device) => device.id === callbackDevice?.deviceId);
  const selectedCallbackDevice = selectedCallbackDeviceIsEligible
    ? selectedCallbackDeviceId
    : assignedCallbackDeviceIsEligible ? callbackDevice?.deviceId || "" : "";

  const vts = vitals || [];
  const advs = advisories || [];

  return (
    <div className="flex flex-col h-[100dvh] bg-background">
      {/* Header */}
      <header className="flex-none bg-card border-b px-4 h-16 flex items-center justify-between z-10 shadow-sm">
        <div className="flex items-center gap-4 min-w-0">
          <Link href={returnPath}>
            <Button variant="ghost" size="icon" className="shrink-0 -ml-2 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <h1 className="font-semibold text-base truncate leading-none">
                {caseFile.booking.patientName}
              </h1>
              {(caseFile.booking.patientAge != null || caseFile.booking.patientGender != null) && (
                <span className="text-xs text-muted-foreground leading-none">
                  ({[caseFile.booking.patientAge ? `${caseFile.booking.patientAge}y` : null, caseFile.booking.patientGender ? caseFile.booking.patientGender.charAt(0).toUpperCase() : null].filter(Boolean).join('/')})
                </span>
              )}
              <Badge variant="outline" className="ml-1 text-[10px] uppercase font-semibold text-muted-foreground bg-muted/30 py-0 h-4 items-center">
                {caseFile.booking.status.replace(/_/g, ' ')}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground truncate mt-1">
              {[
                caseFile.booking.serviceName,
                caseFile.booking.providerName,
                (caseFile.booking as any).seekerHospitalName || null
              ].filter(Boolean).join(" • ")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isProvider && caps.canToggleFollowUp && (
            <div className="hidden sm:flex items-center gap-2 mr-4 text-sm bg-muted/50 px-3 py-1 rounded-full border border-muted">
              <span className="font-medium text-muted-foreground text-xs uppercase tracking-wider">Follow-up</span>
              <button
                onClick={() => {
                  const isEnabled = caseFile.booking.postRxCallsEnabled || caseFile.booking.postRxVideoEnabled;
                  updateAccessMutation.mutate({ bookingId, data: { callsEnabled: !isEnabled, videoEnabled: !isEnabled } });
                }}
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full transition-colors ${caseFile.booking.postRxCallsEnabled || caseFile.booking.postRxVideoEnabled ? 'bg-primary text-primary-foreground font-medium' : 'text-muted-foreground hover:bg-muted'}`}
                disabled={updateAccessMutation.isPending}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${caseFile.booking.postRxCallsEnabled || caseFile.booking.postRxVideoEnabled ? 'bg-primary-foreground' : 'bg-muted-foreground'}`} />
                {caseFile.booking.postRxCallsEnabled || caseFile.booking.postRxVideoEnabled ? 'Ongoing' : 'Paused'}
              </button>
            </div>
          )}
        </div>
      </header>

      {user?.role === "care_seeker" && caseFile.booking.bookingType === "consultation" && <section className="flex-none border-b bg-card px-4 py-2" data-testid="case-file-callback-device">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <PhoneCall className="h-4 w-4 shrink-0 text-primary" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Consultation call-back device</span>
            <span className="truncate text-sm font-medium" data-testid="text-callback-device-name">
              {callbackDevice?.deviceId
                ? `${callbackDevice.staffName?.trim() || "Staff name missing"} · ${callbackDevice.deviceName || "Device name missing"}`
                : "Not selected"}
            </span>
            {callbackDevice?.due && (
              <Badge variant="destructive" className="gap-1" data-testid="badge-callback-device-due">
                <span className="h-2 w-2 animate-pulse rounded-full bg-current" />Confirmation due
              </Badge>
            )}
          </div>
          {caps.canManageCallbackDevice && (
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              {callbackDevicesError && <p role="alert" className="w-full text-xs text-destructive">Could not load registered devices. {callbackDevicesErrorDetails?.message}</p>}
              {callbackDevicesLoading ? (
                <span className="text-xs text-muted-foreground">Loading staff/device pairs…</span>
              ) : eligibleCallbackDevices.length ? (
                <Select value={selectedCallbackDevice} onValueChange={setSelectedCallbackDeviceId}>
                  <SelectTrigger className="h-8 w-full sm:w-56" data-testid="select-case-file-callback-device">
                    <SelectValue placeholder="Choose staff and device" />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleCallbackDevices.map((device) => (
                      <SelectItem key={device.id} value={device.id} data-testid={`option-case-file-callback-device-${device.id}`}>
                        {device.staffName?.trim() || "Staff name missing"} · {device.deviceName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Link href="/user/profile" className="text-xs text-primary underline">Register a staff/device pair in Profile</Link>
              )}
              {!callbackDevicesLoading && eligibleCallbackDevices.length > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={!selectedCallbackDevice || assignCallbackDeviceMutation.isPending}
                  onClick={() => assignCallbackDeviceMutation.mutate({ bookingId, data: { deviceId: selectedCallbackDevice } })}
                  data-testid="button-confirm-callback-device"
                >
                  {callbackDevice?.deviceId === selectedCallbackDevice ? "Reconfirm pair" : "Choose pair"}
                </Button>
              )}
            </div>
          )}
        </div>
        {callbackDevice?.dueAt && callbackDevice.due && (
          <p className="mt-1 pl-6 text-xs text-muted-foreground">Please reconfirm this device for the next call-back.</p>
        )}
      </section>}

      <section data-testid="section-comorbidities" className="flex-none border-b bg-card px-4 py-2.5">
        <h2 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Comorbidities / Past Illness
        </h2>
        {comorbidityEntries.length ? (
          <div className="flex flex-wrap gap-1.5">
            {comorbidityEntries.map((entry, index) => (
              <Badge
                key={`${index}-${entry}`}
                variant="secondary"
                className="whitespace-normal text-left"
                data-testid={`case-file-comorbidity-${index}`}
              >
                {entry}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-xs italic text-muted-foreground" data-testid="empty-comorbidities">
            Not provided
          </p>
        )}
      </section>

      {/* Context Strip */}
      <div className="flex-none bg-muted/40 border-b px-4 py-1.5 flex items-center gap-3 text-xs overflow-x-auto whitespace-nowrap cursor-pointer hover:bg-muted/60 transition-colors" onClick={() => setActiveTab("overview")}>
        {caseFile.profile.allergies && caseFile.profile.allergies.toLowerCase() !== "none noted" && (
          <Badge variant="destructive" className="h-5 px-1.5 text-[10px] uppercase font-bold shrink-0">{caseFile.profile.allergies}</Badge>
        )}
        <span className="text-muted-foreground font-medium shrink-0">Complaint:</span>
        <span className="font-medium text-foreground truncate">{caseFile.summary.presentingComplaint || "Not recorded"}</span>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden flex-col md:flex-row">

        {/* Left Pane - Context */}
        <aside className="w-full md:w-[400px] lg:w-[450px] border-r bg-sidebar flex-none flex flex-col overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
            <div className="px-4 pt-3 pb-0 border-b bg-card shrink-0">
              <TabsList className="w-full bg-muted/50 p-1">
                <TabsTrigger value="overview" className="flex-1 text-xs data-[state=active]:bg-card">Overview</TabsTrigger>
                <TabsTrigger value="vitals" className="flex-1 text-xs data-[state=active]:bg-card">
                  Vitals {caseFile.latestVitalsFreshness === 'fresh' && <span className="ml-1.5 h-1.5 w-1.5 rounded-full bg-primary inline-block"/>}
                </TabsTrigger>
                <TabsTrigger value="advisories" className="flex-1 text-xs data-[state=active]:bg-card">Advisories</TabsTrigger>
              </TabsList>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-4">
                <TabsContent value="overview" className="m-0 space-y-6">
                  {/* Clinical Summary */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2 text-primary">
                      <FileText className="h-4 w-4" /> Clinical Summary
                    </h3>
                    <div className="bg-card rounded-xl p-4 border text-sm space-y-3 shadow-sm">
                      <div>
                        <span className="text-xs font-semibold text-muted-foreground uppercase">Presenting Complaint</span>
                        <p className="mt-1 whitespace-pre-wrap">{caseFile.summary.presentingComplaint || "Not provided."}</p>
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-muted-foreground uppercase">Present Illness</span>
                        <p className="mt-1 whitespace-pre-wrap">{caseFile.summary.presentIllness || "Not provided."}</p>
                      </div>
                      <div className="space-y-2">
                        <span className="text-xs font-semibold text-muted-foreground uppercase">Clinical Details</span>
                        <div>
                          <span className="text-[11px] font-medium text-muted-foreground uppercase">Examination</span>
                          <p className="mt-0.5 whitespace-pre-wrap">{caseFile.summary.examination || "Not provided."}</p>
                        </div>
                        <div>
                          <span className="text-[11px] font-medium text-muted-foreground uppercase">Investigations</span>
                          <p className="mt-0.5 whitespace-pre-wrap">{caseFile.summary.investigations || "Not provided."}</p>
                        </div>
                      </div>
                      {caseFile.summary.workingDiagnosis && (
                        <div className="bg-primary/5 p-2 rounded border border-primary/10">
                          <span className="text-xs font-semibold text-primary uppercase">Provisional Diagnosis</span>
                          <p className="mt-0.5 font-medium text-primary-foreground">{caseFile.summary.workingDiagnosis}</p>
                        </div>
                      )}
                      <div>
                        <span className="text-xs font-semibold text-muted-foreground uppercase">Clinical Summary</span>
                        <p className="mt-1 whitespace-pre-wrap">{caseFile.summary.clinicalSummary || "Not recorded."}</p>
                      </div>
                      {(caseFile.summary.submittedByUserId || caseFile.summary.submittedAt) && (
                        <div className="pt-2 border-t text-[10px] text-muted-foreground uppercase tracking-wider">
                          Submitted {caseFile.summary.submittedAt && `on ${format(new Date(caseFile.summary.submittedAt), "MMM d, yyyy h:mm a")}`}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Patient Profile */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2 text-primary">
                      <User className="h-4 w-4" /> Patient Profile
                    </h3>
                    <div className="bg-card rounded-xl p-4 border text-sm space-y-3 shadow-sm">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <span className="text-xs font-semibold text-muted-foreground uppercase">Allergies</span>
                          <p className="mt-0.5 font-medium text-destructive">{caseFile.profile.allergies || "None noted"}</p>
                        </div>
                        <div>
                          <span className="text-xs font-semibold text-muted-foreground uppercase">Patient-wide Comorbidities</span>
                          <p className="mt-0.5 font-medium">{caseFile.profile.comorbidities || "None noted"}</p>
                        </div>
                      </div>
                      {caseFile.profile.baselineMedications && (
                        <div>
                          <span className="text-xs font-semibold text-muted-foreground uppercase">Baseline Meds</span>
                          <p className="mt-0.5 whitespace-pre-wrap">{caseFile.profile.baselineMedications}</p>
                        </div>
                      )}
                      {caseFile.profile.baselineParameters && (
                        <div>
                          <span className="text-xs font-semibold text-muted-foreground uppercase">Baseline Parameters</span>
                          <p className="mt-0.5 whitespace-pre-wrap">{caseFile.profile.baselineParameters}</p>
                        </div>
                      )}
                      {caseFile.profile.pastAdmissions && (
                        <div>
                          <span className="text-xs font-semibold text-muted-foreground uppercase">Past Admissions</span>
                          <p className="mt-0.5 whitespace-pre-wrap">{caseFile.profile.pastAdmissions}</p>
                        </div>
                      )}
                      {caseFile.profile.emergencyContact && (
                        <div>
                          <span className="text-xs font-semibold text-muted-foreground uppercase">Emergency Contact</span>
                          <p className="mt-0.5 whitespace-pre-wrap">{caseFile.profile.emergencyContact}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="vitals" className="m-0 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold flex items-center gap-2 text-primary">
                      <Activity className="h-4 w-4" /> Vitals Flowsheet
                    </h3>
                    {caps.canAddVitals && (
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setShowVitalDialog(true)}>
                        <Plus className="h-3 w-3" /> Record
                      </Button>
                    )}
                  </div>

                  {loadingVitals ? (
                    <div className="space-y-2"><Skeleton className="h-24 w-full"/><Skeleton className="h-24 w-full"/></div>
                  ) : vts.length === 0 ? (
                    <div className="bg-card rounded-xl p-6 border text-center text-muted-foreground shadow-sm">
                      <Activity className="h-8 w-8 mx-auto mb-2 opacity-20" />
                      <p className="text-sm">No vitals recorded yet.</p>
                    </div>
                  ) : (
                    <div className="bg-card border rounded-xl overflow-x-auto shadow-sm">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-muted/50 border-b">
                          <tr>
                            <th className="px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Time</th>
                            <th className="px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">BP</th>
                            <th className="px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">HR</th>
                            <th className="px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">RR</th>
                            <th className="px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">GCS</th>
                            <th className="px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">I/O</th>
                            <th className="px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Urine/h</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {vts.map(vital => (
                            <tr key={vital.id} className="hover:bg-muted/30 transition-colors">
                              <td className="px-3 py-2.5 whitespace-nowrap font-medium">{format(new Date(vital.observedAt), "MMM d, HH:mm")}</td>
                              <td className="px-3 py-2.5 whitespace-nowrap">{(vital.systolicBp != null) && (vital.diastolicBp != null) ? `${vital.systolicBp}/${vital.diastolicBp}` : '—'}</td>
                              <td className="px-3 py-2.5 whitespace-nowrap">{vital.heartRate != null ? vital.heartRate : '—'}</td>
                              <td className="px-3 py-2.5 whitespace-nowrap">{vital.respiratoryRate != null ? vital.respiratoryRate : '—'}</td>
                              <td className="px-3 py-2.5 whitespace-nowrap">{vital.gcs != null ? vital.gcs : '—'}</td>
                              <td className="px-3 py-2.5 whitespace-nowrap">
                                {(vital.intake != null || vital.output != null) ? `${vital.intake ?? 0} / ${vital.output ?? 0}` : '—'}
                              </td>
                              <td className="px-3 py-2.5 whitespace-nowrap">{vital.hourlyUrineOutput != null ? vital.hourlyUrineOutput : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="advisories" className="m-0 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold flex items-center gap-2 text-primary">
                      <ShieldCheck className="h-4 w-4" /> Advisory Trail
                    </h3>
                    {caps.canComposeAdvisory && (
                      <Button size="sm" className="h-7 text-xs gap-1" onClick={() => setShowAdvisoryDialog(true)}>
                        <Plus className="h-3 w-3" /> Advise
                      </Button>
                    )}
                  </div>

                  {loadingAdvisories ? (
                    <div className="space-y-2"><Skeleton className="h-32 w-full"/></div>
                  ) : advs.length === 0 ? (
                    <div className="bg-card rounded-xl p-6 border text-center text-muted-foreground shadow-sm">
                      <Stethoscope className="h-8 w-8 mx-auto mb-2 opacity-20" />
                      <p className="text-sm">No clinical advisories yet.</p>
                    </div>
                  ) : (
                    <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-muted before:to-transparent">
                      {advs.map((adv) => (
                        <div key={adv.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                          <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-background bg-primary text-primary-foreground shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                            <ShieldCheck className="h-4 w-4" />
                          </div>
                          <div className="w-[calc(100%-4rem)] md:w-[calc(100%-3rem)] bg-card border rounded-xl p-4 shadow-sm">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-semibold text-primary">Clinical Advisory</span>
                              <span className="text-[10px] text-muted-foreground">{format(new Date(adv.authoredAt), "MMM d, h:mm a")}</span>
                            </div>
                            <p className="text-sm whitespace-pre-wrap">{adv.narrative}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </div>
            </ScrollArea>
          </Tabs>
        </aside>

        {/* Right Pane - Chat Stream */}
        <main className="flex-1 flex flex-col min-w-0 bg-background relative">
          <div className="flex-none p-3 border-b bg-card/50 backdrop-blur shrink-0 z-10 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Secure Messaging</h2>
            {caps.readOnly && <Badge variant="secondary" className="text-[10px]">Read Only</Badge>}
          </div>

          {/* Docked Vitals Strip */}
          {caseFile.latestVitals && (
            <div
              className="flex-none bg-muted/30 border-b p-2 flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors shrink-0 z-10"
              onClick={() => setActiveTab("vitals")}
            >
              <div className="flex items-center gap-3 text-xs overflow-x-auto whitespace-nowrap">
                <div className="flex items-center gap-1.5 shrink-0">
                  <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className={`h-2 w-2 rounded-full ${
                    caseFile.latestVitalsFreshness === 'fresh' ? 'bg-green-500' :
                    caseFile.latestVitalsFreshness === 'aging' ? 'bg-amber-500' : 'bg-red-500'
                  }`} />
                  <span className="font-semibold">{format(new Date(caseFile.latestVitals.observedAt), "HH:mm")}</span>
                </div>
                {caseFile.latestVitals.systolicBp && caseFile.latestVitals.diastolicBp && (
                  <span className="shrink-0"><span className="text-muted-foreground">BP:</span> {caseFile.latestVitals.systolicBp}/{caseFile.latestVitals.diastolicBp}</span>
                )}
                {caseFile.latestVitals.heartRate && (
                  <span className="shrink-0"><span className="text-muted-foreground">HR:</span> {caseFile.latestVitals.heartRate}</span>
                )}
                {caseFile.latestVitals.respiratoryRate && (
                  <span className="shrink-0"><span className="text-muted-foreground">RR:</span> {caseFile.latestVitals.respiratoryRate}</span>
                )}
                {caseFile.latestVitals.gcs && (
                  <span className="shrink-0"><span className="text-muted-foreground">GCS:</span> {caseFile.latestVitals.gcs}</span>
                )}
                {(caseFile.latestVitals.intake || caseFile.latestVitals.output) && (
                  <span className="shrink-0"><span className="text-muted-foreground">I/O:</span> {caseFile.latestVitals.intake||0}/{caseFile.latestVitals.output||0}</span>
                )}
              </div>
              {!isProvider && caps.canAddVitals && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 rounded-full shrink-0 ml-2"
                  onClick={(e) => { e.stopPropagation(); setShowVitalDialog(true); }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}

          <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
            {loadingMessages && msgs.length === 0 ? (
              <div className="space-y-4">
                <Skeleton className="h-16 w-2/3 rounded-xl rounded-bl-none" />
                <Skeleton className="h-16 w-2/3 ml-auto rounded-xl rounded-br-none" />
              </div>
            ) : msgs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-50 py-12">
                <Send className="h-12 w-12 mb-4" />
                <p>No messages yet. Start the conversation.</p>
              </div>
            ) : (
              <div className="space-y-4 pb-4">
                {hasNextPage && (
                  <div className="flex justify-center pb-4 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        // Capture current scroll position and height to maintain relative position
                        const scrollNode = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
                        if (scrollNode) {
                          const prevHeight = scrollNode.scrollHeight;
                          const prevScrollTop = scrollNode.scrollTop;

                          fetchNextPage().then(() => {
                            // After React renders, adjust scroll
                            requestAnimationFrame(() => {
                              const newHeight = scrollNode.scrollHeight;
                              scrollNode.scrollTop = prevScrollTop + (newHeight - prevHeight);
                            });
                          });
                        } else {
                          fetchNextPage();
                        }
                      }}
                      disabled={isFetchingNextPage}
                      className="text-xs"
                    >
                      {isFetchingNextPage ? "Loading..." : "Load earlier messages"}
                    </Button>
                  </div>
                )}
                {msgs.map((msg) => {
                  const isMe = msg.senderRole === user?.role;
                  return (
                    <div key={msg.id} className={`flex flex-col max-w-[85%] ${isMe ? 'ml-auto items-end' : 'mr-auto items-start'}`}>
                      {!isMe && <span className="text-[10px] text-muted-foreground mb-1 ml-1 capitalize">{msg.senderRole}</span>}

                      {msg.kind === 'attachment' && msg.attachment ? (
                        <div className={`p-3 rounded-2xl border ${isMe ? 'bg-primary/5 border-primary/20 rounded-br-sm' : 'bg-card border-border rounded-bl-sm'} shadow-sm`}>
                          <AttachmentViewer attachment={msg.attachment} bookingId={bookingId} />
                        </div>
                      ) : msg.kind === 'clinical_advisory_reference' ? (
                        <div className={`p-4 rounded-2xl border ${isMe ? 'bg-primary/10 border-primary/30 rounded-br-sm' : 'bg-card border-border rounded-bl-sm'} shadow-sm w-full min-w-[250px]`}>
                          <div className="flex items-center gap-2 mb-2 text-primary">
                            <ShieldCheck className="h-4 w-4" />
                            <span className="font-semibold text-xs uppercase tracking-wide">Clinical Advisory</span>
                          </div>
                          <p className="whitespace-pre-wrap text-sm">
                            {(() => {
                              try {
                                const parsed = JSON.parse(msg.body || "{}");
                                return parsed.narrative || msg.body;
                              } catch {
                                return msg.body;
                              }
                            })()}
                          </p>
                        </div>
                      ) : (
                        <div className={`px-4 py-2 rounded-2xl text-sm ${
                          isMe
                            ? 'bg-primary text-primary-foreground rounded-br-sm shadow-sm'
                            : 'bg-card border text-card-foreground rounded-bl-sm shadow-sm'
                        }`}>
                          <p className="whitespace-pre-wrap">{msg.body}</p>
                        </div>
                      )}

                      <span className="text-[10px] text-muted-foreground mt-1 opacity-70">
                        {format(new Date(msg.createdAt), "h:mm a")}
                      </span>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            )}
          </ScrollArea>

          {/* Composer */}
          <div className="flex-none p-3 bg-card border-t shrink-0">
            {!caps.canMessage ? (
              <div className="text-center p-2 text-sm text-muted-foreground">Messaging is disabled for this case file.</div>
            ) : (
              <div className="flex items-end gap-2">
                {caps.canAttach && (
                  <Button
                    variant="outline"
                    size="icon"
                    className="shrink-0 h-10 w-10 rounded-full text-muted-foreground hover:text-foreground"
                    onClick={() => setShowAttachDialog(true)}
                  >
                    <Paperclip className="h-5 w-5" />
                  </Button>
                )}
                <Textarea
                  placeholder="Type a secure message..."
                  className="min-h-[40px] max-h-[120px] resize-none rounded-xl py-2.5 bg-muted/50 border-transparent focus-visible:bg-background focus-visible:ring-primary"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                />
                <Button
                  size="icon"
                  className="shrink-0 h-10 w-10 rounded-full"
                  disabled={!messageInput.trim() || sendMessageMutation.isPending}
                  onClick={handleSendMessage}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Dialogs */}
      <Dialog open={showAttachDialog} onOpenChange={setShowAttachDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Attach to Case File</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Source <span className="text-red-500">*</span></Label>
              <Select value={attachSource} onValueChange={(val: any) => setAttachSource(val)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="document">Document</SelectItem>
                  <SelectItem value="camera">Camera</SelectItem>
                  <SelectItem value="photo_gallery">Photo Gallery</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {!isProvider && (
              <div className="space-y-2">
                <Label>Document Category <span className="text-red-500">*</span></Label>
                <Select value={attachCategory} onValueChange={setAttachCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lab">Lab Report</SelectItem>
                    <SelectItem value="radiology">Radiology/Imaging</SelectItem>
                    <SelectItem value="treatment_chart">Treatment Chart</SelectItem>
                    <SelectItem value="general">General</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>File</Label>
              <Input
                type="file"
                onChange={(e) => void selectAttachment(e.target.files?.[0] || null)}
                accept={attachSource === "camera" ? "image/*,video/*" : "image/*,video/mp4,video/quicktime,video/webm,.pdf,.doc,.docx,.dcm"}
                capture={attachSource === "camera" ? "environment" : undefined}
              />
              {checkingVideo && <p className="text-sm text-muted-foreground">Checking video duration…</p>}
              {attachFile && attachDuration !== null && attachPreview && (
                <div className="space-y-2">
                  <video src={attachPreview} controls preload="metadata" className="w-full max-h-52 rounded-lg bg-black" />
                  <p className="text-sm">Review video · {Math.floor(attachDuration / 60)}:{String(Math.floor(attachDuration % 60)).padStart(2, "0")} · {attachFile.name}</p>
                  <Button variant="outline" onClick={() => void selectAttachment(null)}>Remove video</Button>
                </div>
              )}
            </div>

            <Button
              className="w-full mt-2"
              disabled={!attachFile || checkingVideo || (!isProvider && !attachCategory) || attachMutation.isPending}
              onClick={handleAttachFile}
            >
              {attachMutation.isPending ? "Uploading…" : "Send attachment"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showVitalDialog} onOpenChange={setShowVitalDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record Vitals</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label className="text-xs">Systolic BP (mmHg)</Label>
              <Input type="number" value={vitalData.systolicBp} onChange={e=>setVitalData({...vitalData, systolicBp: e.target.value})} placeholder="120" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Diastolic BP (mmHg)</Label>
              <Input type="number" value={vitalData.diastolicBp} onChange={e=>setVitalData({...vitalData, diastolicBp: e.target.value})} placeholder="80" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Heart Rate (bpm)</Label>
              <Input type="number" value={vitalData.heartRate} onChange={e=>setVitalData({...vitalData, heartRate: e.target.value})} placeholder="72" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Resp. Rate (bpm)</Label>
              <Input type="number" value={vitalData.respiratoryRate} onChange={e=>setVitalData({...vitalData, respiratoryRate: e.target.value})} placeholder="16" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">GCS</Label>
              <Input type="number" value={vitalData.gcs} onChange={e=>setVitalData({...vitalData, gcs: e.target.value})} placeholder="15" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Hourly Urine (ml)</Label>
              <Input type="number" value={vitalData.hourlyUrineOutput} onChange={e=>setVitalData({...vitalData, hourlyUrineOutput: e.target.value})} placeholder="50" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">24h Intake (ml)</Label>
              <Input type="number" value={vitalData.intake} onChange={e=>setVitalData({...vitalData, intake: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">24h Output (ml)</Label>
              <Input type="number" value={vitalData.output} onChange={e=>setVitalData({...vitalData, output: e.target.value})} />
            </div>
            <Button className="col-span-2 mt-2" onClick={handleAddVital} disabled={addVitalMutation.isPending}>
              Save Vitals
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showAdvisoryDialog} onOpenChange={setShowAdvisoryDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Compose Clinical Advisory</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Advisory Narrative</Label>
              <Textarea
                placeholder="Enter clinical advice, medication changes, or follow-up instructions..."
                className="min-h-[150px]"
                value={advisoryNarrative}
                onChange={e=>setAdvisoryNarrative(e.target.value)}
              />
            </div>
            <Button
              className="w-full mt-2"
              disabled={!advisoryNarrative.trim() || composeAdvisoryMutation.isPending}
              onClick={handleComposeAdvisory}
            >
              Sign & Publish Advisory
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AttachmentViewer({ attachment, bookingId }: { attachment: any; bookingId: string }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [openUrl, setOpenUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const endpoint = `/api/bookings/${encodeURIComponent(bookingId)}/case-file/attachments/${encodeURIComponent(attachment.id)}/signed-url`;
  const getUrl = async (disposition: "inline" | "attachment") => {
    const response = await fetch(`${endpoint}?disposition=${disposition}`, { credentials: "include" });
    if (!response.ok) throw new Error("Could not retrieve this attachment.");
    return (await response.json()).url as string;
  };
  const isImg = attachment.originalFilename?.match(/\.(jpeg|jpg|gif|png|webp)($|\?)/i) || attachment.mimeType?.startsWith('image/');
  const isVideo = attachment.mimeType?.startsWith("video/") || /\.(mp4|mov|webm)$/i.test(attachment.originalFilename || "");
  useEffect(() => {
    if (!isImg && !isVideo) return;
    let active = true;
    getUrl("inline").then((url) => { if (active) setPreviewUrl(url); }).catch(() => { if (active) setError("Preview unavailable. Try opening the file."); });
    return () => { active = false; };
  }, [bookingId, attachment.id]);
  const open = async (disposition: "inline" | "attachment") => {
    if (busy) return;
    const newTab = (disposition === "attachment" || (!isImg && !isVideo))
      ? window.open("", "_blank") : null;
    setBusy(true);
    setError(null);
    try {
      const url = await getUrl(disposition);
      if (newTab) newTab.location.replace(url);
      else if (disposition === "attachment") throw new Error("Your browser blocked the download window. Allow pop-ups and try again.");
      else if (isImg || isVideo) setOpenUrl(url);
      else throw new Error("Your browser blocked the file window. Allow pop-ups and try again.");
    } catch (err: any) {
      newTab?.close();
      setError(err.message || "Could not open file.");
    } finally {
      setBusy(false);
    }
  };
  const mediaLabel = isImg ? "Image" : isVideo ? "Video" : attachment.mimeType === "application/pdf" ? "PDF" : "Document";
  const duration = isVideo && attachment.durationSeconds
    ? `${Math.floor(attachment.durationSeconds / 60)}:${String(Math.floor(attachment.durationSeconds % 60)).padStart(2, "0")}`
    : null;

  return (
    <div className="flex flex-col gap-2 min-w-0 w-[min(70vw,320px)] max-w-full">
      <button type="button" onClick={() => void open("inline")} disabled={busy} aria-label={`Open ${mediaLabel}`} className="block w-full overflow-hidden rounded-xl border border-border/50 bg-muted/50 hover:bg-muted/70">
        {isImg ? (
          previewUrl
            ? <img src={previewUrl} alt={mediaLabel} className="block w-full max-h-[380px] object-contain" loading="lazy" />
            : <div className="flex h-[230px] items-center justify-center"><ImageIcon className="h-7 w-7 text-muted-foreground" /></div>
        ) : isVideo ? (
          <div className="relative flex min-h-[210px] max-h-[380px] items-center justify-center bg-slate-900 text-white">
            {previewUrl && <video src={previewUrl} preload="metadata" muted playsInline className="block w-full max-h-[380px] object-contain" />}
            <span className="absolute z-10 rounded-full bg-black/60 p-3"><Video className="h-6 w-6" /></span>
            {duration && <span className="absolute bottom-2 left-2 z-10 rounded bg-black/70 px-1.5 py-0.5 text-[11px]">{duration}</span>}
          </div>
        ) : (
          <div className="flex min-h-[90px] items-center gap-3 px-4 py-3 text-left">
            <FileText className="h-6 w-6 shrink-0 text-primary" />
            <div className="min-w-0">
              <div className="text-sm font-medium">{mediaLabel}</div>
              {attachment.category && attachment.category !== "uncategorized" && <div className="text-xs text-muted-foreground capitalize">{attachment.category.replace(/_/g, " ")}</div>}
            </div>
          </div>
        )}
      </button>
      {!isImg && !isVideo && <button type="button" onClick={() => void open("attachment")} disabled={busy} className="text-xs text-primary underline text-left">Download original</button>}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <Dialog open={!!openUrl} onOpenChange={(open) => { if (!open) setOpenUrl(null); }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>{mediaLabel}</DialogTitle></DialogHeader>
          {openUrl && (isImg ? <img src={openUrl} alt={mediaLabel} className="max-h-[75vh] max-w-full object-contain mx-auto" /> :
            <video key={openUrl} src={openUrl} controls autoPlay playsInline className="w-full max-h-[75vh] bg-black" onError={() => setError("Playback unavailable on this browser. Download the original video to view it.")} />)}
          <button type="button" onClick={() => void open("attachment")} className="text-sm text-primary underline">Download original</button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CaseFileSkeleton() {
  return (
    <div className="flex flex-col h-[100dvh]">
      <header className="flex-none bg-card border-b px-4 h-16 flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-8 w-24" />
      </header>
      <div className="flex-1 flex overflow-hidden flex-col md:flex-row">
        <aside className="w-full md:w-[400px] lg:w-[450px] border-r bg-sidebar p-4 space-y-6">
          <Skeleton className="h-10 w-full rounded-md" />
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </aside>
        <main className="flex-1 p-4 flex flex-col justify-end gap-4">
          <Skeleton className="h-16 w-2/3 rounded-xl rounded-bl-none" />
          <Skeleton className="h-16 w-2/3 ml-auto rounded-xl rounded-br-none" />
          <Skeleton className="h-12 w-full rounded-xl mt-4" />
        </main>
      </div>
    </div>
  );
}