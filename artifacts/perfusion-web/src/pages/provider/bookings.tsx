import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ClipboardList, RefreshCw, Video, Upload, Stethoscope, FlaskConical, ScanLine, FileText, Download, Paperclip, FileSignature, Loader2, File, ShieldCheck, Lock, Clock, Image, ExternalLink, FilePlus, FolderOpen, ChevronDown } from "lucide-react";
import { getCallWindow, callWindowLabel, toISTTimeString, getPostRxStatus } from "@/lib/call-window";
import { Link } from "wouter";
import type { Booking, BookingStatus, BookingType, Provider, PrescriptionReview } from "@shared/schema";
import { format } from "date-fns";

function docFileExt(url: string): string {
  return (url.split(".").pop() ?? "").toLowerCase().split("?")[0];
}
function docIsImage(url: string): boolean {
  return ["jpg", "jpeg", "png", "webp", "gif", "bmp"].includes(docFileExt(url));
}
function docFileName(url: string): string {
  try {
    const parts = url.split("/");
    return decodeURIComponent(parts[parts.length - 1] ?? url).split("?")[0];
  } catch {
    return url;
  }
}

function DocInlineViewer({ url, index, prefix }: { url: string; index: number; prefix: string }) {
  const image = docIsImage(url);
  const isPdf = docFileExt(url) === "pdf";
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const label = docFileName(url);

  return (
    <div className="mb-4 last:mb-0" data-testid={`doc-viewer-${prefix}-${index}`}>
      <div className="flex items-center justify-between mb-1.5 gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {image
            ? <Image className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            : <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
          <span className="text-xs text-muted-foreground truncate">{label}</span>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
          title="Open in new tab"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
      {image ? (
        <img
          src={url}
          alt={label}
          className="w-full rounded border object-contain max-h-[500px] bg-muted"
        />
      ) : isPdf && isMobile ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 w-full rounded border bg-muted/40 px-4 py-3 hover:bg-muted/70 transition-colors"
        >
          <FileText className="h-8 w-8 text-red-500 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{label}</p>
            <p className="text-xs text-muted-foreground">Tap to open PDF</p>
          </div>
          <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
        </a>
      ) : (
        <iframe
          src={url}
          title={label}
          className="w-full rounded border bg-white"
          style={{ height: "480px" }}
        />
      )}
    </div>
  );
}

function PostRxToggles({ booking }: { booking: Booking }) {
  const rxStatus = getPostRxStatus(booking as any);
  if (!rxStatus.inWindow) return null;
  return <PostRxTogglesInner booking={booking} expiresAt={rxStatus.expiresAt} />;
}

function PostRxTogglesInner({ booking, expiresAt }: { booking: Booking; expiresAt: Date | null }) {
  const { toast } = useToast();
  const hoursLeft = expiresAt
    ? Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60)))
    : 0;
  const [localState, setLocalState] = useState({
    videoEnabled: !!(booking as any).postRxVideoEnabled,
    callsEnabled: !!(booking as any).postRxCallsEnabled,
    uploadsEnabled: !!(booking as any).postRxUploadsEnabled,
  });
  useEffect(() => {
    setLocalState({
      videoEnabled: !!(booking as any).postRxVideoEnabled,
      callsEnabled: !!(booking as any).postRxCallsEnabled,
      uploadsEnabled: !!(booking as any).postRxUploadsEnabled,
    });
  }, [(booking as any).postRxVideoEnabled, (booking as any).postRxCallsEnabled, (booking as any).postRxUploadsEnabled]);
  const toggleMutation = useMutation({
    mutationFn: (patch: { videoEnabled?: boolean; callsEnabled?: boolean; uploadsEnabled?: boolean }) =>
      apiRequest("PATCH", `/api/bookings/${booking.id}/post-rx-features`, patch).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/bookings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/dashboard"] });
    },
    onError: async (err: any, variables) => {
      setLocalState((prev) => {
        const reverted = { ...prev };
        for (const k of Object.keys(variables) as (keyof typeof variables)[]) {
          reverted[k] = !variables[k];
        }
        return reverted;
      });
      let msg = "Failed to update.";
      try { const d = await (err as any)?.response?.json?.(); if (d?.error) msg = d.error; } catch {}
      toast({ title: "Update failed", description: msg, variant: "destructive" });
    },
  });
  function handleToggle(field: "videoEnabled" | "callsEnabled" | "uploadsEnabled") {
    if (toggleMutation.isPending) return;
    const next = !localState[field];
    setLocalState((prev) => ({ ...prev, [field]: next }));
    toggleMutation.mutate({ [field]: next });
  }
  const toggles: { key: string; label: string; enabled: boolean; field: "videoEnabled" | "callsEnabled" | "uploadsEnabled" }[] = [
    { key: "video", label: "Video", enabled: localState.videoEnabled, field: "videoEnabled" },
    { key: "calls", label: "Calls", enabled: localState.callsEnabled, field: "callsEnabled" },
    { key: "uploads", label: "Uploads", enabled: localState.uploadsEnabled, field: "uploadsEnabled" },
  ];
  return (
    <div className="rounded-lg border bg-muted/20 p-2.5 space-y-2 w-full">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">Post-consultation access</p>
        <span className="text-xs text-muted-foreground">~{hoursLeft}h left</span>
      </div>
      <div className="flex gap-2">
        {toggles.map(({ key, label, enabled, field }) => (
          <button
            key={key}
            onClick={() => handleToggle(field)}
            disabled={toggleMutation.isPending}
            className={`flex-1 flex flex-col items-center gap-0.5 rounded-lg border py-1.5 text-xs font-medium transition-colors ${
              enabled
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-muted-foreground/50"
            }`}
            data-testid={`toggle-post-rx-${key}-${booking.id}`}
          >
            <span className={`h-3.5 w-3.5 rounded-full border-2 flex items-center justify-center ${enabled ? "border-primary bg-primary" : "border-muted-foreground/40"}`}>
              {enabled && <span className="h-1 w-1 rounded-full bg-white" />}
            </span>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

const statusOptions: { value: BookingStatus; label: string }[] = [
  { value: "booked", label: "Booked" },
  { value: "sample_collected", label: "Sample Collected" },
  { value: "processing", label: "Processing" },
  { value: "report_ready", label: "Report Ready" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

export default function ProviderBookingsPage() {
  const { toast } = useToast();
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [reportUrl, setReportUrl] = useState("");
  const [reportNotes, setReportNotes] = useState("");
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [showDocsDialog, setShowDocsDialog] = useState(false);
  const [docsBooking, setDocsBooking] = useState<Booking | null>(null);
  const [showPrescriptionDialog, setShowPrescriptionDialog] = useState(false);
  const [prescriptionBooking, setPrescriptionBooking] = useState<Booking | null>(null);
  const [showPostRxDialog, setShowPostRxDialog] = useState(false);
  const [postRxBooking, setPostRxBooking] = useState<Booking | null>(null);
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [reviewBooking, setReviewBooking] = useState<Booking | null>(null);
  const [reviewDiagnosis, setReviewDiagnosis] = useState("");
  const [reviewMedications, setReviewMedications] = useState("");
  const [reviewPhysicianNotes, setReviewPhysicianNotes] = useState("");
  const [reviewFollowUp, setReviewFollowUp] = useState("");
  const [reviewAdvice, setReviewAdvice] = useState("");
  const [prescriptionDiagnosis, setPrescriptionDiagnosis] = useState("");
  const [prescriptionMedications, setPrescriptionMedications] = useState("");
  const [prescriptionAdvice, setPrescriptionAdvice] = useState("");
  const [prescriptionFollowUp, setPrescriptionFollowUp] = useState("");
  const [prescriptionPhysicianNotes, setPrescriptionPhysicianNotes] = useState("");
  const [uploadMethod, setUploadMethod] = useState<"file" | "url">("file");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: provider } = useQuery<Provider>({
    queryKey: ["/api/providers/me"],
    retry: false,
  });

  const bookingTypesByProviderType: Record<string, BookingType[]> = {
    lab: ["lab"],
    consultant: ["consultation"],
    hospital: ["lab", "consultation", "teleradiology"],
    teleradiology: ["teleradiology"],
    transport: [],
  };

  const allBookingTypes: BookingType[] = ["lab", "consultation", "teleradiology"];

  const allowedBookingTypes: BookingType[] = provider
    ? (bookingTypesByProviderType[provider.type] ?? allBookingTypes)
    : allBookingTypes;

  const { data: bookings, isLoading, refetch } = useQuery<Booking[]>({
    queryKey: ["/api/provider/bookings"],
  });

  const filteredBookings = bookings?.filter((b) => allowedBookingTypes.includes(b.bookingType)) ?? [];

  const addReviewMutation = useMutation({
    mutationFn: async ({ id, ...body }: { id: string; diagnosis: string; medications: string; physicianNotes: string; followUp: string; advice: string }) => {
      const res = await apiRequest("POST", `/api/bookings/${id}/prescription-reviews`, body);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.message || "Failed to add review summary");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/bookings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/dashboard"] });
      setShowReviewDialog(false);
      setReviewBooking(null);
      setReviewDiagnosis(""); setReviewMedications(""); setReviewPhysicianNotes(""); setReviewFollowUp(""); setReviewAdvice("");
      toast({ title: "Review Summary Added", description: "The review summary has been confirmed and a PDF generated for the patient." });
    },
    onError: (error: any) => {
      toast({ title: "Failed", description: error?.message || "Failed to add review summary.", variant: "destructive" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: BookingStatus }) => {
      const response = await apiRequest("PATCH", `/api/bookings/${id}/status`, { status });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/bookings"] });
      toast({
        title: "Status Updated",
        description: "Booking status has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Update Failed",
        description: "Failed to update booking status.",
        variant: "destructive",
      });
    },
  });

  const uploadReportMutation = useMutation({
    mutationFn: async ({ id, reportUrl, reportNotes }: { id: string; reportUrl: string; reportNotes: string }) => {
      const response = await apiRequest("PATCH", `/api/bookings/${id}/status`, {
        status: "report_ready",
        reportUrl,
        reportNotes
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/bookings"] });
      resetReportDialog();
      toast({
        title: "Report Uploaded",
        description: "Report has been uploaded and is now available for the patient.",
      });
    },
    onError: () => {
      setIsUploading(false);
      toast({
        title: "Upload Failed",
        description: "Failed to upload report.",
        variant: "destructive",
      });
    },
  });

  const handleUploadReport = async () => {
    if (!selectedBooking) return;

    setIsUploading(true);
    try {
      let finalReportUrl = reportUrl;

      // If file upload method and file is selected, upload the file first
      if (uploadMethod === "file" && selectedFile) {
        const formData = new FormData();
        formData.append("file", selectedFile);

        const response = await fetch("/api/upload/report", {
          method: "POST",
          body: formData,
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error("Failed to upload file");
        }

        const data = await response.json();
        finalReportUrl = data.url;
      }

      if (!finalReportUrl) {
        toast({
          title: "Error",
          description: "Please select a file or enter a URL",
          variant: "destructive",
        });
        setIsUploading(false);
        return;
      }

      uploadReportMutation.mutate({
        id: selectedBooking.id,
        reportUrl: finalReportUrl,
        reportNotes
      });
      // Note: resetReportDialog is called in mutation onSuccess
    } catch (error) {
      toast({
        title: "Upload Failed",
        description: "Failed to upload the report file",
        variant: "destructive",
      });
      setIsUploading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const resetReportDialog = () => {
    setShowReportDialog(false);
    setSelectedBooking(null);
    setReportUrl("");
    setReportNotes("");
    setSelectedFile(null);
    setUploadMethod("file");
    setIsUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const prescriptionMutation = useMutation({
    mutationFn: async ({ id, diagnosis, medications, advice, followUp, physicianNotes }: {
      id: string;
      diagnosis: string;
      medications: string;
      advice: string;
      followUp: string;
      physicianNotes: string;
    }) => {
      const response = await apiRequest("PATCH", `/api/bookings/${id}/prescription`, {
        diagnosis,
        medications,
        advice,
        followUp,
        physicianNotes,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/bookings"] });
      toast({
        title: "Draft Saved",
        description: "Consultation summary draft saved. Use \"Confirm & Sign\" to lock it permanently.",
      });
    },
    onError: () => {
      toast({
        title: "Failed",
        description: "Failed to save consultation summary draft.",
        variant: "destructive",
      });
    },
  });

  const confirmPrescriptionMutation = useMutation({
    mutationFn: async ({ id, diagnosis, medications, physicianNotes, followUp }: {
      id: string;
      diagnosis: string;
      medications: string;
      physicianNotes: string;
      followUp: string;
    }) => {
      const response = await apiRequest("POST", `/api/bookings/${id}/prescription/confirm`, {
        diagnosis,
        medications,
        physicianNotes,
        followUp,
      });
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/bookings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/dashboard"] });
      setShowPrescriptionDialog(false);
      setPrescriptionBooking(null);
      setPrescriptionDiagnosis("");
      setPrescriptionMedications("");
      setPrescriptionAdvice("");
      setPrescriptionFollowUp("");
      setPrescriptionPhysicianNotes("");
      setPostRxBooking(data as Booking);
      setShowPostRxDialog(true);
      toast({
        title: "Summary Confirmed & Signed",
        description: "Clinical advisory locked. You can re-enable video, calls, or uploads for up to 24 hours.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Confirmation Failed",
        description: error?.message || "Failed to confirm consultation summary.",
        variant: "destructive",
      });
    },
  });

  const openPrescriptionDialog = (booking: Booking) => {
    setPrescriptionBooking(booking);
    setPrescriptionDiagnosis(booking.prescriptionDiagnosis || "");
    setPrescriptionMedications(booking.prescriptionMedications || "");
    setPrescriptionAdvice(booking.prescriptionAdvice || "");
    setPrescriptionFollowUp(booking.prescriptionFollowUp || "");
    setPrescriptionPhysicianNotes((booking as any).prescriptionPhysicianNotes || "");
    setShowPrescriptionDialog(true);
  };

  const handleSavePrescription = () => {
    if (!prescriptionBooking || !prescriptionDiagnosis) return;
    prescriptionMutation.mutate({
      id: prescriptionBooking.id,
      diagnosis: prescriptionDiagnosis,
      medications: prescriptionMedications,
      advice: prescriptionAdvice,
      followUp: prescriptionFollowUp,
      physicianNotes: prescriptionPhysicianNotes,
    });
  };

  const getBookingIcon = (type: string) => {
    switch (type) {
      case "consultation": return <Stethoscope className="h-4 w-4" />;
      case "lab": return <FlaskConical className="h-4 w-4" />;
      case "teleradiology": return <ScanLine className="h-4 w-4" />;
      default: return null;
    }
  };

  const pendingBookings = filteredBookings.filter((b) => ["booked", "pending", "confirmed"].includes(b.status));
  const activeBookings = filteredBookings.filter((b) => ["sample_collected", "processing"].includes(b.status));
  const completedBookings = filteredBookings.filter((b) => ["report_ready", "completed", "cancelled"].includes(b.status));

  const [expandedBookingIds, setExpandedBookingIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedBookingIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const BookingRow = ({ booking, key }: { booking: Booking, key?: string }) => {
    const isExpanded = expandedBookingIds.has(booking.id);

    return (
    <div
      key={key}
      className="flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
      data-testid={`booking-row-${booking.id}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
            {getBookingIcon(booking.bookingType)}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium">{booking.serviceName}</p>
              <Badge variant="outline" className="text-xs capitalize">
                {booking.bookingType}
              </Badge>
              {(booking as any).isFollowUp && (
                <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                  Follow Up
                </Badge>
              )}
              <StatusBadge status={booking.status} />
              {booking.bookingType === "consultation" && (
                <button
                  onClick={() => toggleExpand(booking.id)}
                  aria-expanded={isExpanded}
                  aria-controls={`booking-actions-${booking.id}`}
                  className="ml-auto flex items-center text-xs text-muted-foreground hover:text-foreground focus:outline-none sm:hidden"
                >
                  {isExpanded ? 'Hide Actions' : 'Show Actions'}
                </button>
              )}
            </div>
          </div>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Patient: {booking.patientName} ({booking.patientAge} yrs) • <span className="font-mono">{(booking as any).bookingNumber || booking.id.substring(0, 12).toUpperCase()}</span>
        </p>
        {booking.accessionNumber && (
          <p className="text-sm text-muted-foreground">
            Accession #: {booking.accessionNumber}
          </p>
        )}
        {booking.provisionalDiagnosis && (
          <p className="text-sm text-muted-foreground">
            Diagnosis: {booking.provisionalDiagnosis}
          </p>
        )}
        {booking.appointmentSlot && (
          <p className="text-sm text-muted-foreground">
            Appointment: {booking.appointmentSlot}
          </p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          Created: {format(new Date(booking.createdAt!), "PPp")}
        </p>
      </div>
      <div className="flex flex-col items-start gap-2 sm:items-end">
        <span className="font-medium">
          ₹{(booking.bookingType === "lab" || booking.bookingType === "teleradiology") && (booking as any).providerPrice
            ? (booking as any).providerPrice
            : booking.amount}
        </span>
        {(booking.bookingType === "lab" || booking.bookingType === "teleradiology") && (booking as any).providerPrice && (
          <span className="text-xs text-muted-foreground">Your rate</span>
        )}

        {booking.bookingType === "consultation" && isExpanded && (
          <div id={`booking-actions-${booking.id}`} className="flex flex-col gap-2 items-end w-full sm:w-auto pt-2 border-t sm:border-t-0 sm:pt-0">
            {booking.videoRoomId ? (() => {
              const prescriptionApprovedAt = (booking as any).prescriptionApprovedAt;
              const rxStatus = getPostRxStatus(booking as any);
              const win = getCallWindow(booking as any);
              const videoOpen = prescriptionApprovedAt ? rxStatus.videoEnabled : win.open;
              if (videoOpen) {
                return (
                  <div className="flex flex-col items-end gap-0.5 w-full sm:w-auto">
                    <Link href={`/video/${encodeURIComponent(booking.videoRoomId!)}?returnTo=/provider/bookings`}>
                      <Button size="sm" variant="outline" className="w-full sm:w-auto" data-testid={`button-join-video-${booking.id}`}>
                        <Video className="mr-2 h-3.5 w-3.5" />
                        Join Video Room
                      </Button>
                    </Link>
                    {!prescriptionApprovedAt && win.reason === "extended" && win.extendedUntil && (
                      <span className="text-xs text-amber-600 dark:text-amber-400">
                        Extended until {toISTTimeString(win.extendedUntil)}
                      </span>
                    )}
                  </div>
                );
              }
              return (
                <Button size="sm" variant="outline" className="w-full sm:w-auto" disabled data-testid={`button-join-video-${booking.id}`}>
                  <Clock className="mr-2 h-3.5 w-3.5" />
                  {prescriptionApprovedAt
                    ? rxStatus.inWindow ? "Video Disabled" : "Consult Ended"
                    : callWindowLabel(win)}
                </Button>
              );
            })() : (
              <Button size="sm" variant="outline" className="w-full sm:w-auto" disabled>
                <Video className="mr-2 h-3.5 w-3.5" />
                No Room Yet
              </Button>
            )}

            <div className="flex gap-2 w-full sm:w-auto">
              <Link href={`/case-file/${booking.id}`}>
                <Button size="sm" className="w-full sm:w-auto" data-testid={`button-case-file-${booking.id}`}>
                  <FolderOpen className="mr-2 h-3.5 w-3.5" />
                  Case File
                </Button>
              </Link>
              <Link href={`/case-file/${booking.id}?tab=advisories`}>
                <Button size="sm" variant="outline" className="w-full sm:w-auto" data-testid={`button-advise-${booking.id}`}>
                  <FilePlus className="mr-2 h-3.5 w-3.5" />
                  Advise
                </Button>
              </Link>
            </div>

            {(booking as any).prescriptionApprovedAt ? (
              <div className="flex flex-col items-end gap-1 w-full sm:w-auto mt-2">
                <div className="flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Summary Signed
                </div>
                <div className="flex gap-2 mt-2 w-full sm:w-auto">
                  <a href={`/api/bookings/${booking.id}/prescription-trail/download`} target="_blank" rel="noopener noreferrer" className="w-full sm:w-auto">
                    <Button size="sm" variant="outline" className="w-full sm:w-auto text-green-600">
                      <Download className="mr-2 h-3.5 w-3.5" />
                      Advisory
                    </Button>
                  </a>
                  <Button size="sm" variant="secondary" className="w-full sm:w-auto" onClick={() => openPrescriptionDialog(booking)}>
                    <FileText className="mr-2 h-3.5 w-3.5" />
                    Details
                  </Button>
                </div>
              </div>
            ) : (
              <Button size="sm" variant="default" className="w-full sm:w-auto mt-2" onClick={() => openPrescriptionDialog(booking)}>
                <FileSignature className="mr-2 h-3.5 w-3.5" />
                {(booking as any).prescriptionGeneratedAt ? "Edit Summary Draft" : "Generate Summary"}
              </Button>
            )}

            {(booking as any).prescriptionApprovedAt && getPostRxStatus(booking as any).inWindow && (
              <Button size="sm" variant="outline" className="w-full sm:w-auto mt-2 text-violet-600 border-violet-200" onClick={() => {
                setReviewBooking(booking);
                setReviewDiagnosis(booking.prescriptionDiagnosis || "");
                setShowReviewDialog(true);
              }}>
                <FilePlus className="mr-2 h-3.5 w-3.5" />
                Add Review Summary
              </Button>
            )}

            <div className="mt-2 w-full sm:w-auto">
              <PostRxToggles booking={booking} />
            </div>

            <p className="mt-2 text-sm text-muted-foreground">
              Consultation status follows its schedule.
            </p>
          </div>
        )}

        {(booking.bookingType === "lab" || booking.bookingType === "teleradiology") && !booking.reportUrl && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setSelectedBooking(booking);
              setShowReportDialog(true);
            }}
            data-testid={`button-upload-report-${booking.id}`}
          >
            <Upload className="mr-2 h-3.5 w-3.5" />
            Upload Report
          </Button>
        )}
        {(booking.bookingType === "lab" || booking.bookingType === "teleradiology") && booking.reportUrl && (
          <a href={booking.reportUrl} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="outline" className="text-green-600" data-testid={`button-view-report-${booking.id}`}>
              <Download className="mr-2 h-3.5 w-3.5" />
              View Report
            </Button>
          </a>
        )}
        {(booking.bookingType === "lab" || booking.bookingType === "teleradiology") && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setDocsBooking(booking);
              setShowDocsDialog(true);
            }}
            data-testid={`button-view-docs-${booking.id}`}
          >
            <Paperclip className="mr-1 h-3.5 w-3.5" />
            {(() => {
              const docCount = booking.documentUrls?.length || 0;
              const chartCount = ((booking as any).treatmentChartUrls as string[] | null)?.length || 0;
              const total = docCount + chartCount;
              return total > 0 ? `${total} doc(s)` : "Documents";
            })()}
          </Button>
        )}

        {booking.bookingType === "consultation" && (
          <button
            onClick={() => toggleExpand(booking.id)}
            aria-expanded={isExpanded}
            aria-controls={`booking-actions-${booking.id}`}
            className="hidden sm:flex mt-2 items-center text-xs text-muted-foreground hover:text-foreground focus:outline-none"
          >
            <ChevronDown className={`h-4 w-4 mr-1 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
            {isExpanded ? 'Hide Actions' : 'Show Actions'}
          </button>
        )}

        {booking.bookingType !== "consultation" && (
          <Select
            value={booking.status}
            onValueChange={(value) =>
              updateStatusMutation.mutate({ id: booking.id, status: value as BookingStatus })
            }
            disabled={updateStatusMutation.isPending}
          >
            <SelectTrigger className="w-40" data-testid={`select-status-${booking.id}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
    );
  };

  const EmptyState = ({ message }: { message: string }) => (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <ClipboardList className="mb-4 h-12 w-12 text-muted-foreground/50" />
      <p className="text-muted-foreground">{message}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Booking Requests</h1>
          <p className="text-muted-foreground">
            Manage incoming booking requests and update status
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => refetch()}
          disabled={isLoading}
          data-testid="button-refresh"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="pending" data-testid="tab-pending">
            Pending ({pendingBookings.length})
          </TabsTrigger>
          <TabsTrigger value="active" data-testid="tab-active">
            Active ({activeBookings.length})
          </TabsTrigger>
          <TabsTrigger value="completed" data-testid="tab-completed">
            Completed ({completedBookings.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <Card>
            <CardHeader>
              <CardTitle>Pending Bookings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                [...Array(3)].map((_, i) => (
                  <div key={i} className="rounded-lg border p-4">
                    <Skeleton className="mb-2 h-5 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                ))
              ) : pendingBookings.length === 0 ? (
                <EmptyState message="No pending bookings" />
              ) : (
                pendingBookings.map((booking) => BookingRow({ booking, key: booking.id }))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="active">
          <Card>
            <CardHeader>
              <CardTitle>Active Bookings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                [...Array(3)].map((_, i) => (
                  <div key={i} className="rounded-lg border p-4">
                    <Skeleton className="mb-2 h-5 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                ))
              ) : activeBookings.length === 0 ? (
                <EmptyState message="No active bookings" />
              ) : (
                activeBookings.map((booking) => BookingRow({ booking, key: booking.id }))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="completed">
          <Card>
            <CardHeader>
              <CardTitle>Completed Bookings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                [...Array(3)].map((_, i) => (
                  <div key={i} className="rounded-lg border p-4">
                    <Skeleton className="mb-2 h-5 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                ))
              ) : completedBookings.length === 0 ? (
                <EmptyState message="No completed bookings" />
              ) : (
                completedBookings.map((booking) => BookingRow({ booking, key: booking.id }))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showReportDialog} onOpenChange={(open) => !open && resetReportDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Report</DialogTitle>
            <DialogDescription>
              Upload the report for {selectedBooking?.patientName}'s {selectedBooking?.serviceName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button
                variant={uploadMethod === "file" ? "default" : "outline"}
                size="sm"
                onClick={() => setUploadMethod("file")}
                data-testid="button-upload-file-method"
              >
                <File className="mr-2 h-4 w-4" />
                Upload File
              </Button>
              <Button
                variant={uploadMethod === "url" ? "default" : "outline"}
                size="sm"
                onClick={() => setUploadMethod("url")}
                data-testid="button-upload-url-method"
              >
                <Download className="mr-2 h-4 w-4" />
                Enter URL
              </Button>
            </div>

            {uploadMethod === "file" ? (
              <div className="space-y-2">
                <Label>Select Report File</Label>
                <Input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.gif,.dcm"
                  onChange={handleFileSelect}
                  ref={fileInputRef}
                  data-testid="input-report-file"
                />
                {selectedFile && (
                  <p className="text-sm text-muted-foreground">
                    Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Accepted formats: PDF, JPEG, PNG, GIF, DICOM (max 50MB)
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Report URL</Label>
                <Input
                  placeholder="https://example.com/report.pdf"
                  value={reportUrl}
                  onChange={(e) => setReportUrl(e.target.value)}
                  data-testid="input-report-url"
                />
                <p className="text-xs text-muted-foreground">
                  Enter the URL where the report PDF is hosted
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="Any additional notes for the patient..."
                value={reportNotes}
                onChange={(e) => setReportNotes(e.target.value)}
                data-testid="input-report-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetReportDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleUploadReport}
              disabled={(uploadMethod === "file" ? !selectedFile : !reportUrl) || isUploading || uploadReportMutation.isPending}
              data-testid="button-submit-report"
            >
              {isUploading || uploadReportMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                "Upload Report"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDocsDialog} onOpenChange={setShowDocsDialog}>
        <DialogContent className="max-w-2xl max-h-[88vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>Patient Documents</DialogTitle>
            <DialogDescription>
              Documents uploaded by {docsBooking?.patientName} for this booking
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 space-y-5 pr-1 pt-2">
            {docsBooking?.documentUrls && docsBooking.documentUrls.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                  Reports ({docsBooking.documentUrls.length})
                </p>
                {docsBooking.documentUrls.map((url, i) => (
                  <DocInlineViewer key={url + i} url={url} index={i} prefix="report" />
                ))}
              </div>
            )}
            {(docsBooking as any)?.treatmentChartUrls && ((docsBooking as any).treatmentChartUrls as string[]).length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                  Treatment Charts ({((docsBooking as any).treatmentChartUrls as string[]).length})
                </p>
                {((docsBooking as any).treatmentChartUrls as string[]).map((url, i) => (
                  <DocInlineViewer key={url + i} url={url} index={i} prefix="chart" />
                ))}
              </div>
            )}
            {(!docsBooking?.documentUrls || docsBooking.documentUrls.length === 0) &&
             (!(docsBooking as any)?.treatmentChartUrls || ((docsBooking as any)?.treatmentChartUrls as string[])?.length === 0) && (
              <p className="text-center text-muted-foreground py-8">No documents uploaded for this booking.</p>
            )}
          </div>
          <DialogFooter className="shrink-0">
            <Button onClick={() => setShowDocsDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showPrescriptionDialog} onOpenChange={setShowPrescriptionDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              {(prescriptionBooking as any)?.prescriptionApprovedAt ? (
                <>
                  <ShieldCheck className="h-5 w-5 text-green-600" />
                  Summary — Signed & Locked
                </>
              ) : (prescriptionBooking as any)?.prescriptionGeneratedAt ? (
                "Edit Summary Draft"
              ) : (
                "Generate Summary"
              )}
            </DialogTitle>
            <DialogDescription>
              {prescriptionBooking?.patientName} • {prescriptionBooking?.serviceName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto flex-1 pr-1">
            {(prescriptionBooking as any)?.prescriptionApprovedAt ? (
              <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800 p-4 space-y-3">
                <div className="flex items-center gap-2 text-green-700 dark:text-green-400 font-medium">
                  <ShieldCheck className="h-4 w-4" />
                  This consultation summary has been digitally confirmed and is permanently locked
                </div>
                <p className="text-sm text-muted-foreground">
                  Confirmed on: <span className="font-medium">{new Date((prescriptionBooking as any).prescriptionApprovedAt).toLocaleString("en-IN", { dateStyle: "long", timeStyle: "medium", timeZone: "Asia/Kolkata" })}</span>
                </p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Diagnosis</p>
                    <p className="font-medium mt-0.5">{prescriptionBooking?.prescriptionDiagnosis || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Follow-up</p>
                    <p className="font-medium mt-0.5">{prescriptionBooking?.prescriptionFollowUp || "—"}</p>
                  </div>
                </div>
                {prescriptionBooking?.prescriptionMedications && (
                  <div className="text-sm">
                    <p className="text-xs text-muted-foreground">Clinical Advisory</p>
                    <p className="font-medium mt-0.5 whitespace-pre-wrap">{prescriptionBooking.prescriptionMedications}</p>
                  </div>
                )}
                {(prescriptionBooking as any)?.prescriptionPdfUrl && (
                  <a
                    href={(prescriptionBooking as any).prescriptionPdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-green-300 bg-white dark:bg-transparent px-3 py-2 text-sm font-medium text-green-700 dark:text-green-400 hover:bg-green-50 transition-colors"
                    data-testid="link-prescription-pdf-signed"
                  >
                    <Download className="h-4 w-4" />
                    Download Signed PDF
                  </a>
                )}
              </div>
            ) : (
              <>
                <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-300">
                  <strong>Save Draft</strong> to save changes, or <strong>Confirm &amp; Sign</strong> to permanently lock this consultation summary with a medicolegal audit trail. Signed summaries cannot be edited.
                </div>
                <div className="space-y-2">
                  <Label>Diagnosis <span className="text-destructive">*</span></Label>
                  <Textarea
                    placeholder="Enter diagnosis details..."
                    value={prescriptionDiagnosis}
                    onChange={(e) => setPrescriptionDiagnosis(e.target.value)}
                    rows={3}
                    data-testid="input-prescription-diagnosis"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Physician Notes</Label>
                  <Textarea
                    placeholder="Clinical observations, recommendations, special instructions..."
                    value={prescriptionPhysicianNotes}
                    onChange={(e) => setPrescriptionPhysicianNotes(e.target.value)}
                    rows={3}
                    data-testid="input-prescription-physician-notes"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Clinical Advisory</Label>
                  <Textarea
                    placeholder="Add neutral clinical observations, recommendations, or care considerations..."
                    value={prescriptionMedications}
                    onChange={(e) => setPrescriptionMedications(e.target.value)}
                    rows={5}
                    data-testid="input-prescription-medications"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Follow-up</Label>
                  <Input
                    placeholder="e.g., After 1 week, or if symptoms persist"
                    value={prescriptionFollowUp}
                    onChange={(e) => setPrescriptionFollowUp(e.target.value)}
                    data-testid="input-prescription-followup"
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter className="shrink-0 mt-4 gap-2">
            <Button variant="outline" onClick={() => setShowPrescriptionDialog(false)}>
              Close
            </Button>
            {!(prescriptionBooking as any)?.prescriptionApprovedAt && (
              <>
                <Button
                  variant="secondary"
                  onClick={handleSavePrescription}
                  disabled={!prescriptionDiagnosis || prescriptionMutation.isPending || confirmPrescriptionMutation.isPending}
                  data-testid="button-save-prescription"
                >
                  {prescriptionMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Draft"
                  )}
                </Button>
                <Button
                  onClick={() => prescriptionBooking && confirmPrescriptionMutation.mutate({
                    id: prescriptionBooking.id,
                    diagnosis: prescriptionDiagnosis,
                    medications: prescriptionMedications,
                    physicianNotes: prescriptionPhysicianNotes,
                    followUp: prescriptionFollowUp,
                  })}
                  disabled={!prescriptionDiagnosis || prescriptionMutation.isPending || confirmPrescriptionMutation.isPending}
                  className="bg-green-700 hover:bg-green-800 text-white"
                  data-testid="button-confirm-prescription"
                >
                  {confirmPrescriptionMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Confirming...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="mr-2 h-4 w-4" />
                      Confirm &amp; Sign
                    </>
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showPostRxDialog} onOpenChange={(open) => { setShowPostRxDialog(open); if (!open) setPostRxBooking(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Post-Consultation Access</DialogTitle>
            <DialogDescription>
              All features are now disabled. Re-enable video, calls, or uploads for the patient for up to 24 hours.
            </DialogDescription>
          </DialogHeader>
          {postRxBooking && <PostRxToggles booking={postRxBooking} />}
          {postRxBooking && !getPostRxStatus(postRxBooking as any).inWindow && (
            <p className="text-sm text-muted-foreground text-center py-2">
              The 24-hour post-consultation window has expired.
            </p>
          )}
          <DialogFooter>
            <Button onClick={() => { setShowPostRxDialog(false); setPostRxBooking(null); }}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showReviewDialog} onOpenChange={(open) => { if (!open) { setShowReviewDialog(false); setReviewBooking(null); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FilePlus className="h-5 w-5 text-violet-600" />
              Add Review Summary
            </DialogTitle>
            <DialogDescription>
              {reviewBooking?.patientName} · Additional clinical advisory based on new reports or follow-up assessment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Diagnosis <span className="text-destructive">*</span></label>
              <Textarea placeholder="Updated or confirmed diagnosis..." value={reviewDiagnosis} onChange={(e) => setReviewDiagnosis(e.target.value)} className="min-h-[80px]" />
            </div>
            <div>
                  <label className="text-sm font-medium mb-1 block">Clinical Advisory</label>
                  <Textarea placeholder="Add neutral clinical observations, recommendations, or care considerations..." value={reviewMedications} onChange={(e) => setReviewMedications(e.target.value)} className="min-h-[80px]" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Physician Notes</label>
              <Textarea placeholder="Any additional physician notes..." value={reviewPhysicianNotes} onChange={(e) => setReviewPhysicianNotes(e.target.value)} className="min-h-[60px]" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Advice</label>
              <Textarea placeholder="Advice for the patient..." value={reviewAdvice} onChange={(e) => setReviewAdvice(e.target.value)} className="min-h-[60px]" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Follow-up</label>
              <Input placeholder="e.g. 1 week, after lab results..." value={reviewFollowUp} onChange={(e) => setReviewFollowUp(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setShowReviewDialog(false); setReviewBooking(null); }}>Cancel</Button>
            <Button
              onClick={() => reviewBooking && addReviewMutation.mutate({ id: reviewBooking.id, diagnosis: reviewDiagnosis, medications: reviewMedications, physicianNotes: reviewPhysicianNotes, followUp: reviewFollowUp, advice: reviewAdvice })}
              disabled={!reviewDiagnosis.trim() || addReviewMutation.isPending}
              className="gap-2"
            >
              {addReviewMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating PDF…</> : <><ShieldCheck className="h-4 w-4" /> Confirm & Sign Review</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
