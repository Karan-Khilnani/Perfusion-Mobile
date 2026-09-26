import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Video,
  FileText,
  ClipboardList,
  Download,
  Calendar,
  Building2,
  User,
  IndianRupee,
  Stethoscope,
  Activity,
  ShieldCheck,
  Loader2,
  FlaskConical,
  ScanLine,
  Clock,
  TrendingUp,
  Image,
  ExternalLink,
  Phone,
  FilePlus,
  FolderOpen,
  ChevronDown,
} from "lucide-react";
import { getCallWindow, callWindowLabel, toISTTimeString, getPostRxStatus } from "@/lib/call-window";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Switch } from "@/components/ui/switch";
import type { Booking, PrescriptionReview } from "@shared/schema";
import { ConsultantSlotEditor } from "@/components/consultant-slot-editor";

interface ActiveConsultation extends Booking {
  seekerHospitalName: string;
}

interface Revenue {
  total: number;
  paid: number;
  pending: number;
}

interface DashboardData {
  providerType: string;
  activeConsultations?: ActiveConsultation[];
  activeLabTestCount?: number;
  activeModalityCount?: number;
  consultant?: {
    id: string;
    availabilityFrom: string | null;
    availabilityTo: string | null;
    digitalSignatureUrl: string | null;
  } | null;
  revenue: Revenue;
}

function formatSlot(slot: string | null | undefined): string {
  if (!slot) return "To be scheduled";
  const d = new Date(slot);
  if (isNaN(d.getTime())) return slot;
  return format(d, "dd MMM yyyy, hh:mm a");
}

function formatRupees(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(value);
}

function PatientDetailsDialog({
  booking,
  trigger,
}: {
  booking: ActiveConsultation;
  trigger: React.ReactNode;
}) {
  const fields: { label: string; value: string | null | undefined }[] = [
    { label: "Name", value: booking.patientName },
    { label: "Age", value: booking.patientAge != null ? `${booking.patientAge} years` : null },
    { label: "Gender", value: booking.patientGender },
    { label: "Contact", value: booking.patientContact },
    { label: "Weight", value: booking.patientWeight },
    { label: "UHID / IP No.", value: booking.uhidIpNumber },
    { label: "IPD No.", value: booking.ipdNumber },
    { label: "Bed No.", value: booking.bedNumber },
    { label: "On-Call Doctor", value: booking.onCallDoctorName },
    { label: "Doctor Designation", value: booking.onCallDoctorDesignation },
    { label: "Provisional Diagnosis", value: booking.provisionalDiagnosis },
    { label: "Clinical Summary", value: booking.clinicalSummary },
    { label: "Examination", value: booking.examination },
    { label: "Investigations", value: booking.investigations },
    {
      label: "Known Allergies",
      value: booking.patientAllergyNotSpecified
        ? "Not specified"
        : booking.patientAllergies || null,
    },
  ];

  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>Patient Details — {booking.patientName}</DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto flex-1 space-y-3 pr-1 pt-2">
          {fields
            .filter((f) => f.value)
            .map((f) => (
              <div key={f.label} className="rounded-lg border bg-muted/30 px-4 py-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">
                  {f.label}
                </p>
                <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap">{f.value}</p>
              </div>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function getFileExt(url: string): string {
  return (url.split(".").pop() ?? "").toLowerCase().split("?")[0];
}
function isImageFile(url: string): boolean {
  return ["jpg", "jpeg", "png", "webp", "gif", "bmp"].includes(getFileExt(url));
}
function getFileName(url: string): string {
  try {
    const parts = url.split("/");
    return decodeURIComponent(parts[parts.length - 1] ?? url).split("?")[0];
  } catch {
    return url;
  }
}

function InlineFileViewer({ url, label }: { url: string; label: string }) {
  const image = isImageFile(url);
  const isPdf = getFileExt(url) === "pdf";
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  return (
    <div className="mb-4 last:mb-0">
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
          data-testid={`img-file-viewer-${label}`}
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
          data-testid={`iframe-file-viewer-${label}`}
        />
      )}
    </div>
  );
}

function FileListDialog({
  title,
  urls,
  trigger,
}: {
  title: string;
  urls: string[];
  trigger: React.ReactNode;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[88vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto flex-1 pt-2 pr-1">
          {urls.map((url, i) => (
            <InlineFileViewer key={url + i} url={url} label={getFileName(url)} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ConsultationCardSkeleton() {
  return (
    <div className="rounded-2xl border bg-card p-4 sm:p-6 space-y-4">
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-4 w-2/5" />
      <div className="grid grid-cols-2 gap-2.5">
        <Skeleton className="h-10 rounded-xl" />
        <Skeleton className="h-10 rounded-xl" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Skeleton className="h-14 rounded-lg" />
        <Skeleton className="h-14 rounded-lg" />
        <Skeleton className="h-14 rounded-lg" />
      </div>
    </div>
  );
}

function RevenueSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-2xl border bg-card p-6 space-y-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-32" />
        </div>
      ))}
    </div>
  );
}

function RevenueSection({ revenue, isLoading, label = "All earnings" }: { revenue: Revenue; isLoading: boolean; label?: string }) {
  if (isLoading) return <RevenueSkeleton />;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className="rounded-2xl border bg-card p-6 space-y-1" data-testid="tile-revenue-total">
        <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Total Revenue</p>
        <p className="text-3xl font-bold tracking-tight">{formatRupees(revenue.total)}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <div className="rounded-2xl border bg-card p-6 space-y-1 border-green-500/20" data-testid="tile-revenue-paid">
        <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Paid</p>
        <p className="text-3xl font-bold tracking-tight text-green-600 dark:text-green-400">
          {formatRupees(revenue.paid)}
        </p>
        <p className="text-xs text-muted-foreground">Cleared payments</p>
      </div>
      <div className="rounded-2xl border bg-card p-6 space-y-1 border-amber-500/20" data-testid="tile-revenue-pending">
        <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Pending</p>
        <p className="text-3xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
          {formatRupees(revenue.pending)}
        </p>
        <p className="text-xs text-muted-foreground">Awaiting payment</p>
      </div>
    </div>
  );
}

function CallSeekerButton({ booking }: { booking: ActiveConsultation }) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const prescriptionApprovedAt = (booking as any).prescriptionApprovedAt;
  const rxStatus = getPostRxStatus(booking as any);
  const win = getCallWindow(booking as any);
  const canCall = prescriptionApprovedAt
    ? rxStatus.callsEnabled
    : (booking as any).status === "booked" && win.open;
  const disabledReason = prescriptionApprovedAt
    ? !rxStatus.inWindow
        ? "Post-consultation 24-hour window has expired"
        : !rxStatus.callsEnabled
          ? "Calls are disabled — toggle on from the post-consultation controls below"
          : undefined
    : (booking as any).status !== "booked"
    ? "Only available for active (booked) consultations"
    : win.reason === "before_window" && win.windowStart
    ? `Call window opens at ${toISTTimeString(win.windowStart)} IST`
    : win.reason === "expired"
    ? "Slot has ended — contact admin to extend if needed"
    : undefined;
  const callMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/call/ring/${booking.id}`, { callType: "voice" }),
    onSuccess: () => {
      if (!booking.videoRoomId) return;
      navigate(`/video/${encodeURIComponent(booking.videoRoomId)}?returnTo=/provider&voice=true&initiated=true`);
    },
    onError: async (err: any) => {
      let msg = "Failed to initiate call.";
      try {
        const data = await err?.response?.json?.();
        if (data?.error) msg = data.error;
      } catch {}
      toast({ title: "Call failed", description: msg, variant: "destructive" });
    },
  });
  return (
    <Button
      variant="outline"
      className="w-full h-10 gap-2 rounded-xl text-sm overflow-hidden border-green-500/40 text-green-700 dark:text-green-400 hover:bg-green-500/5"
      onClick={() => callMutation.mutate()}
      disabled={callMutation.isPending || !canCall}
      title={disabledReason}
      data-testid={`button-call-seeker-${booking.id}`}
    >
      <Phone className="h-4 w-4 shrink-0" />
      <span className="truncate">{callMutation.isPending ? "Ringing…" : "Call Seeker"}</span>
    </Button>
  );
}


function PostRxToggles({ booking }: { booking: ActiveConsultation }) {
  const rxStatus = getPostRxStatus(booking as any);
  if (!rxStatus.inWindow) return null;
  return <PostRxTogglesInner booking={booking} expiresAt={rxStatus.expiresAt} />;
}

function PostRxTogglesInner({ booking, expiresAt }: { booking: ActiveConsultation; expiresAt: Date | null }) {
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
      queryClient.invalidateQueries({ queryKey: ["/api/provider/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/bookings"] });
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
    <div className="rounded-xl border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Post-consultation access</p>
        <span className="text-xs text-muted-foreground">~{hoursLeft}h remaining</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {toggles.map(({ key, label, enabled, field }) => (
          <button
            key={key}
            onClick={() => handleToggle(field)}
            disabled={toggleMutation.isPending}
            className={`flex flex-col items-center gap-1 rounded-lg border py-2 px-1 text-xs font-medium transition-colors ${
              enabled
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-muted-foreground/50 hover:bg-muted/50"
            }`}
            data-testid={`toggle-post-rx-${key}-${booking.id}`}
          >
            <span className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${enabled ? "border-primary bg-primary" : "border-muted-foreground/40"}`}>
              {enabled && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
            </span>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ReviewDownloads({ bookingId }: { bookingId: string }) {
  const { data: reviews = [] } = useQuery<PrescriptionReview[]>({
    queryKey: [`/api/bookings/${bookingId}/prescription-reviews`],
  });
  if (!reviews.length) return null;
  return (
    <>
      {reviews.map((r) => (
        <a
          key={r.id}
          href={`/api/prescription-reviews/${r.id}/download`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button
            size="sm"
            variant="outline"
            className="w-full gap-2 border-indigo-500/30 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-500/5"
          >
            <Download className="h-4 w-4" />
            Review Summary #{r.reviewNumber}
          </Button>
        </a>
      ))}
    </>
  );
}

function ActiveConsultationCard({
  booking,
  navigate,
  onOpenSummary,
  onAddReview
}: {
  booking: ActiveConsultation;
  navigate: (path: string) => void;
  onOpenSummary: (b: ActiveConsultation) => void;
  onAddReview: (b: ActiveConsultation) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const docUrls = (booking.documentUrls ?? []).filter(Boolean);
  const chartUrls = (booking.treatmentChartUrls ?? []).filter(Boolean);

  return (
    <div
      className="rounded-2xl border bg-card flex flex-col"
      data-testid={`card-consultation-${booking.id}`}
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        aria-controls={`actions-${booking.id}`}
        className="flex items-start justify-between p-4 sm:p-6 w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-2xl"
      >
        <div className="space-y-1.5 flex-1 min-w-0 pr-4">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 min-w-0">
            <p className="text-lg sm:text-xl font-bold tracking-tight break-words">{booking.patientName}</p>
            <div className="flex items-center gap-1.5 shrink-0">
              {booking.patientAge && (
                <Badge variant="secondary" className="font-normal text-xs">
                  {booking.patientAge} yrs
                </Badge>
              )}
              {booking.patientGender && (
                <Badge variant="outline" className="font-normal capitalize text-xs">
                  {booking.patientGender}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-start gap-2 text-muted-foreground">
            <Building2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span className="text-sm leading-snug">{booking.seekerHospitalName}</span>
          </div>
          <div className="flex items-start gap-2 text-muted-foreground">
            <Calendar className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span className="text-sm font-medium text-foreground leading-snug">
              {formatSlot(booking.appointmentSlot)}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <Badge variant="outline" className="text-xs uppercase bg-muted/30">
            {booking.status.replace(/_/g, ' ')}
          </Badge>
          <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {isExpanded && (
        <div id={`actions-${booking.id}`} className="px-4 pb-4 sm:px-6 sm:pb-6 space-y-4 pt-2 border-t">
          <div className="grid grid-cols-2 gap-2.5">
            {booking.videoRoomId ? (() => {
              const prescriptionApprovedAt = (booking as any).prescriptionApprovedAt;
              const rxStatus = getPostRxStatus(booking as any);
              const win = getCallWindow(booking as any);
              const videoOpen = prescriptionApprovedAt ? rxStatus.videoEnabled : win.open;
              if (videoOpen) {
                return (
                  <Button
                    className="w-full h-10 gap-2 rounded-xl text-sm overflow-hidden"
                    onClick={() => navigate(`/video/${encodeURIComponent(booking.videoRoomId!)}?returnTo=/provider`)}
                    data-testid={`button-join-call-${booking.id}`}
                  >
                    <Video className="h-4 w-4 shrink-0" />
                    <span className="truncate">Join Video Room</span>
                  </Button>
                );
              }
              return (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        className="w-full h-10 gap-2 rounded-xl text-sm overflow-hidden"
                        disabled
                        variant="outline"
                        data-testid={`button-join-call-${booking.id}`}
                      >
                        <Clock className="h-4 w-4 shrink-0" />
                        <span className="truncate">
                          {prescriptionApprovedAt
                            ? rxStatus.inWindow ? "Video Disabled" : "Consult Ended"
                            : callWindowLabel(win)}
                        </span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {prescriptionApprovedAt
                        ? rxStatus.inWindow
                          ? "Video is disabled — toggle on from the post-consultation controls"
                          : "Post-consultation 24-hour window has expired"
                        : win.reason === "before_window" && win.windowStart
                        ? `Call opens at ${toISTTimeString(win.windowStart)} IST`
                        : win.reason === "expired" && win.windowEnd
                        ? `Slot ended at ${toISTTimeString(win.windowEnd)} IST`
                        : "Call window is not active"}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })() : (
              <Button className="w-full h-10 rounded-xl text-sm overflow-hidden" disabled variant="outline">
                <Video className="h-4 w-4 shrink-0 mr-1.5" />
                <span className="truncate">No Room Yet</span>
              </Button>
            )}

            <Button
              variant="secondary"
              className="w-full h-10 gap-2 rounded-xl text-sm overflow-hidden"
              onClick={() => navigate(`/case-file/${booking.id}`)}
              data-testid={`button-case-file-${booking.id}`}
            >
              <FolderOpen className="h-4 w-4 shrink-0" />
              <span className="truncate">Case File</span>
            </Button>
            <Button
              variant="outline"
              className="w-full h-10 gap-2 rounded-xl text-sm overflow-hidden"
              onClick={() => navigate(`/case-file/${booking.id}?tab=advisories`)}
              data-testid={`button-advise-${booking.id}`}
            >
              <FilePlus className="h-4 w-4 shrink-0" />
              <span className="truncate">Advise</span>
            </Button>

            <Button
              variant="secondary"
              className="w-full h-10 gap-2 rounded-xl text-sm overflow-hidden col-span-2"
              onClick={() => onOpenSummary(booking)}
              data-testid={`button-generate-summary-${booking.id}`}
            >
              <FileText className="h-4 w-4 shrink-0" />
              <span className="truncate">
                {(booking as any).prescriptionApprovedAt
                  ? "View Summary"
                  : (booking as any).prescriptionGeneratedAt
                    ? "Edit Draft"
                    : "Generate Summary"}
              </span>
            </Button>
          </div>

          <CallSeekerButton booking={booking} />
          <PostRxToggles booking={booking} />

          {(booking as any).prescriptionApprovedAt && getPostRxStatus(booking as any).inWindow && (
            <Button
              size="sm"
              variant="outline"
              className="w-full gap-2 border-violet-500/30 text-violet-700 dark:text-violet-400 hover:bg-violet-500/5"
              onClick={() => onAddReview(booking)}
              data-testid={`button-add-review-${booking.id}`}
            >
              <FilePlus className="h-4 w-4" />
              Add Review Summary
            </Button>
          )}

          <PatientDetailsDialog
            booking={booking}
            trigger={
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2"
                data-testid={`button-patient-details-${booking.id}`}
              >
                <User className="h-4 w-4 shrink-0" />
                Patient Details
              </Button>
            }
          />

          {docUrls.length > 0 ? (
            <FileListDialog
              title="Patient Reports"
              urls={docUrls}
              trigger={
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  data-testid={`button-view-reports-${booking.id}`}
                >
                  <Activity className="h-4 w-4 shrink-0" />
                  View Reports
                </Button>
              }
            />
          ) : (
            <Button variant="outline" size="sm" className="w-full gap-2" disabled>
              <Activity className="h-4 w-4 shrink-0" />
              No Reports Uploaded
            </Button>
          )}

          {chartUrls.length > 0 ? (
            <FileListDialog
              title="Treatment Charts"
              urls={chartUrls}
              trigger={
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  data-testid={`button-view-charts-${booking.id}`}
                >
                  <ClipboardList className="h-4 w-4 shrink-0" />
                  View Treatment Chart
                </Button>
              }
            />
          ) : (
            <Button variant="outline" size="sm" className="w-full gap-2" disabled>
              <ClipboardList className="h-4 w-4 shrink-0" />
              No Treatment Chart
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function ConsultationsSection({
  isLoading,
  activeConsultations,
  navigate,
  onOpenSummary,
  onAddReview,
}: {
  isLoading: boolean;
  activeConsultations: ActiveConsultation[];
  navigate: (path: string) => void;
  onOpenSummary: (booking: ActiveConsultation) => void;
  onAddReview: (booking: ActiveConsultation) => void;
}) {
  return (
    <section>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Stethoscope className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold tracking-tight">Active Consultations</h2>
        </div>
        {!isLoading && activeConsultations.length > 0 && (
          <span className="text-sm bg-primary/10 text-primary font-medium px-3 py-1 rounded-full">
            {activeConsultations.length} active
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-5">
          <ConsultationCardSkeleton />
          <ConsultationCardSkeleton />
        </div>
      ) : activeConsultations.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-muted/20 p-12 flex flex-col items-center justify-center gap-3 text-center">
          <Stethoscope className="h-12 w-12 text-muted-foreground/30" />
          <p className="text-lg font-medium text-muted-foreground">No active consultations</p>
          <p className="text-sm text-muted-foreground">
            Consultation bookings assigned to you will appear here
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {activeConsultations.map((booking) => {
            const docUrls = (booking.documentUrls ?? []).filter(Boolean);
            const chartUrls = (booking.treatmentChartUrls ?? []).filter(Boolean);

            return (
              <ActiveConsultationCard
                key={booking.id}
                booking={booking}
                navigate={navigate}
                onOpenSummary={onOpenSummary}
                onAddReview={onAddReview}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

function AvailabilityEditor({ consultant }: { consultant: DashboardData["consultant"] }) {
  const providerConsultants = useQuery<Array<{ id: string; status?: string }>>({
    queryKey: ["/api/provider/my-consultants"],
    enabled: !!consultant,
    refetchOnMount: "always",
  });
  const statusMutation = useMutation({
    mutationFn: async ({ consultantId, status }: { consultantId: string; status: "active" | "paused" }) => {
      const response = await apiRequest("PATCH", `/api/provider/consultants/${consultantId}`, { status });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Could not update availability.");
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/provider/dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/provider/my-consultants"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/consultants"] }),
      ]);
    },
  });
  if (!consultant) return null;
  const availabilityProfile = providerConsultants.data?.find((item) => item.id === consultant.id);
  const availabilityStatus = availabilityProfile?.status;
  const canToggle = availabilityStatus === "active" || availabilityStatus === "paused";
  const isAvailable = availabilityStatus === "active";
  return (
    <Card data-testid="card-availability">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          Availability
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex items-center justify-between gap-4 rounded-lg border p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Accepting new bookings</p>
            <p className="text-xs text-muted-foreground">
              This setting is shared with mobile. Existing consultations are not changed.
            </p>
            <p className={`mt-1 text-sm font-semibold ${isAvailable ? "text-emerald-600" : "text-muted-foreground"}`}>
              {availabilityStatus === "active"
                ? "Available"
                : availabilityStatus === "paused"
                  ? "Unavailable"
                  : providerConsultants.isLoading
                    ? "Loading availability…"
                    : "Status unavailable"}
            </p>
          </div>
          <Switch
            checked={isAvailable}
            disabled={!canToggle || statusMutation.isPending || providerConsultants.isLoading}
            onCheckedChange={(available) => statusMutation.mutate({
              consultantId: consultant.id,
              status: available ? "active" : "paused",
            })}
            aria-label="Accept new consultation bookings"
          />
        </div>
        {statusMutation.isError && (
          <p className="mb-3 text-sm text-destructive" role="alert">
            {statusMutation.error instanceof Error ? statusMutation.error.message : "Could not update availability."}
          </p>
        )}
        {providerConsultants.isError && (
          <p className="mb-3 text-sm text-destructive" role="alert">
            Could not load the current availability. Refresh this page to try again.
          </p>
        )}
        <ConsultantSlotEditor
          consultantId={consultant.id}
          initialFrom={consultant.availabilityFrom}
          initialTo={consultant.availabilityTo}
          initialDays={(consultant as any).availableDays}
          initialSlotSeries={(consultant as any).slotSeries ?? undefined}
          invalidateKeys={[["/api/provider/dashboard"], ["/api/provider/my-consultants"]]}
        />
      </CardContent>
    </Card>
  );
}

export default function ProviderDashboard() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/provider/dashboard"],
  });

  const [showSummaryDialog, setShowSummaryDialog] = useState(false);
  const [summaryBooking, setSummaryBooking] = useState<ActiveConsultation | null>(null);
  const [showPostRxDialog, setShowPostRxDialog] = useState(false);
  const [postRxBooking, setPostRxBooking] = useState<ActiveConsultation | null>(null);
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [reviewBooking, setReviewBooking] = useState<ActiveConsultation | null>(null);
  const [reviewDiagnosis, setReviewDiagnosis] = useState("");
  const [reviewMedications, setReviewMedications] = useState("");
  const [reviewPhysicianNotes, setReviewPhysicianNotes] = useState("");
  const [reviewFollowUp, setReviewFollowUp] = useState("");
  const [reviewAdvice, setReviewAdvice] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [medications, setMedications] = useState("");
  const [physicianNotes, setPhysicianNotes] = useState("");
  const [followUp, setFollowUp] = useState("");

  const saveDraftMutation = useMutation({
    mutationFn: async ({ id, ...body }: { id: string; diagnosis: string; medications: string; advice: string; followUp: string; physicianNotes: string }) => {
      const res = await apiRequest("PATCH", `/api/bookings/${id}/prescription`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/bookings"] });
      toast({ title: "Draft Saved", description: "Consultation summary draft saved. Use \"Confirm & Sign\" to lock it permanently." });
    },
    onError: () => {
      toast({ title: "Failed", description: "Failed to save consultation summary draft.", variant: "destructive" });
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async ({ id, ...body }: { id: string; diagnosis: string; medications: string; physicianNotes: string; followUp: string }) => {
      const res = await apiRequest("POST", `/api/bookings/${id}/prescription/confirm`, body);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/bookings"] });
      setShowSummaryDialog(false);
      setSummaryBooking(null);
      setPostRxBooking(data as ActiveConsultation);
      setShowPostRxDialog(true);
      toast({ title: "Summary Confirmed & Signed", description: "Clinical advisory locked. You can re-enable video, calls, or uploads for up to 24 hours." });
    },
    onError: (error: any) => {
      toast({ title: "Confirmation Failed", description: error?.message || "Failed to confirm consultation summary.", variant: "destructive" });
    },
  });

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
      queryClient.invalidateQueries({ queryKey: ["/api/provider/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/bookings"] });
      setShowReviewDialog(false);
      setReviewBooking(null);
      setReviewDiagnosis(""); setReviewMedications(""); setReviewPhysicianNotes(""); setReviewFollowUp(""); setReviewAdvice("");
      toast({ title: "Review Summary Added", description: "The review summary has been confirmed and a PDF has been generated for the patient." });
    },
    onError: (error: any) => {
      toast({ title: "Failed", description: error?.message || "Failed to add review summary.", variant: "destructive" });
    },
  });

  const openReviewDialog = (booking: ActiveConsultation) => {
    setReviewBooking(booking);
    setReviewDiagnosis(""); setReviewMedications(""); setReviewPhysicianNotes(""); setReviewFollowUp(""); setReviewAdvice("");
    setShowReviewDialog(true);
  };

  const openSummaryDialog = (booking: ActiveConsultation) => {
    setSummaryBooking(booking);
    setDiagnosis(booking.prescriptionDiagnosis || "");
    setMedications(booking.prescriptionMedications || "");
    setPhysicianNotes((booking as any).prescriptionPhysicianNotes || "");
    setFollowUp(booking.prescriptionFollowUp || "");
    setShowSummaryDialog(true);
  };

  const handleSaveDraft = () => {
    if (!summaryBooking || !diagnosis) return;
    saveDraftMutation.mutate({ id: summaryBooking.id, diagnosis, medications, advice: "", followUp, physicianNotes });
  };

  const providerType = data?.providerType;
  const activeConsultations = data?.activeConsultations ?? [];
  const revenue = data?.revenue ?? { total: 0, paid: 0, pending: 0 };
  const isApproved = !!(summaryBooking as any)?.prescriptionApprovedAt;
  const isBusy = saveDraftMutation.isPending || confirmMutation.isPending;

  // ── Lab dashboard ──────────────────────────────────────────────────────────
  if (!isLoading && providerType === "lab") {
    return (
      <div className="min-h-full bg-background">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-10 sm:space-y-12">
          <section>
            <div className="flex items-center gap-2 mb-6">
              <FlaskConical className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-semibold tracking-tight">Lab Overview</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-2xl border bg-card p-6 space-y-1" data-testid="tile-lab-tests">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Active Tests</p>
                <p className="text-4xl font-bold tracking-tight">{data?.activeLabTestCount ?? 0}</p>
                <p className="text-xs text-muted-foreground">Tests in your catalog</p>
              </div>
              <div className="rounded-2xl border bg-card p-6 space-y-1">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Total Revenue</p>
                <p className="text-4xl font-bold tracking-tight">{formatRupees(revenue.total)}</p>
                <p className="text-xs text-muted-foreground">All lab bookings</p>
              </div>
            </div>
          </section>
          <section>
            <div className="flex items-center gap-2 mb-6">
              <IndianRupee className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-semibold tracking-tight">Revenue</h2>
            </div>
            <RevenueSection revenue={revenue} isLoading={false} label="From lab bookings" />
          </section>
        </div>
      </div>
    );
  }

  // ── Teleradiology dashboard ────────────────────────────────────────────────
  if (!isLoading && providerType === "teleradiology") {
    return (
      <div className="min-h-full bg-background">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-10 sm:space-y-12">
          <section>
            <div className="flex items-center gap-2 mb-6">
              <ScanLine className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-semibold tracking-tight">Teleradiology Overview</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-2xl border bg-card p-6 space-y-1" data-testid="tile-modalities">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Active Modalities</p>
                <p className="text-4xl font-bold tracking-tight">{data?.activeModalityCount ?? 0}</p>
                <p className="text-xs text-muted-foreground">Imaging services offered</p>
              </div>
              <div className="rounded-2xl border bg-card p-6 space-y-1">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Total Revenue</p>
                <p className="text-4xl font-bold tracking-tight">{formatRupees(revenue.total)}</p>
                <p className="text-xs text-muted-foreground">All teleradiology bookings</p>
              </div>
            </div>
          </section>
          <section>
            <div className="flex items-center gap-2 mb-6">
              <IndianRupee className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-semibold tracking-tight">Revenue</h2>
            </div>
            <RevenueSection revenue={revenue} isLoading={false} label="From teleradiology bookings" />
          </section>
        </div>
      </div>
    );
  }

  // ── Hospital dashboard ─────────────────────────────────────────────────────
  if (!isLoading && providerType === "hospital") {
    return (
      <div className="min-h-full bg-background">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-10 sm:space-y-12">
          <section>
            <div className="flex items-center gap-2 mb-6">
              <TrendingUp className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-semibold tracking-tight">Overview</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-2xl border bg-card p-6 space-y-1" data-testid="tile-active-consultations">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Active Consultations</p>
                <p className="text-4xl font-bold tracking-tight">{activeConsultations.length}</p>
                <p className="text-xs text-muted-foreground">In progress</p>
              </div>
              <div className="rounded-2xl border bg-card p-6 space-y-1" data-testid="tile-active-lab-tests">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Lab Tests</p>
                <p className="text-4xl font-bold tracking-tight">{data?.activeLabTestCount ?? 0}</p>
                <p className="text-xs text-muted-foreground">Tests in catalog</p>
              </div>
              <div className="rounded-2xl border bg-card p-6 space-y-1">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Total Revenue</p>
                <p className="text-3xl font-bold tracking-tight">{formatRupees(revenue.total)}</p>
                <p className="text-xs text-muted-foreground">All services</p>
              </div>
            </div>
          </section>

          <ConsultationsSection
            isLoading={false}
            activeConsultations={activeConsultations}
            navigate={navigate}
            onOpenSummary={openSummaryDialog}
            onAddReview={openReviewDialog}
          />

          <section>
            <div className="flex items-center gap-2 mb-6">
              <IndianRupee className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-semibold tracking-tight">Revenue</h2>
            </div>
            <RevenueSection revenue={revenue} isLoading={false} label="All services combined" />
          </section>
        </div>

        <Dialog open={showSummaryDialog} onOpenChange={setShowSummaryDialog}>
          <SummaryDialogContent
            summaryBooking={summaryBooking}
            isApproved={isApproved}
            isBusy={isBusy}
            diagnosis={diagnosis}
            setDiagnosis={setDiagnosis}
            physicianNotes={physicianNotes}
            setPhysicianNotes={setPhysicianNotes}
            medications={medications}
            setMedications={setMedications}
            followUp={followUp}
            setFollowUp={setFollowUp}
            onSaveDraft={handleSaveDraft}
            saveDraftPending={saveDraftMutation.isPending}
            onConfirm={() => summaryBooking && confirmMutation.mutate({ id: summaryBooking.id, diagnosis, medications, physicianNotes, followUp })}
            confirmPending={confirmMutation.isPending}
            onClose={() => setShowSummaryDialog(false)}
          />
        </Dialog>

        <Dialog open={showPostRxDialog} onOpenChange={(open) => { setShowPostRxDialog(open); if (!open) setPostRxBooking(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Post-Consultation Access</DialogTitle>
              <DialogDescription>
                All features are now off. Re-enable video, calls, or uploads for the patient for up to 24 hours.
              </DialogDescription>
            </DialogHeader>
            {postRxBooking && <PostRxToggles booking={postRxBooking} />}
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

  // ── Consultant dashboard (default) ─────────────────────────────────────────
  return (
    <div className="min-h-full bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-10 sm:space-y-12">

        {isLoading ? (
          <div className="space-y-5">
            <ConsultationCardSkeleton />
            <ConsultationCardSkeleton />
          </div>
        ) : (
          <>
            {data?.consultant && (
              <AvailabilityEditor consultant={data.consultant} />
            )}

            <ConsultationsSection
              isLoading={false}
              activeConsultations={activeConsultations}
              navigate={navigate}
              onOpenSummary={openSummaryDialog}
              onAddReview={openReviewDialog}
            />
          </>
        )}

        <section>
          <div className="flex items-center gap-2 mb-6">
            <IndianRupee className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold tracking-tight">Revenue</h2>
          </div>
          <RevenueSection revenue={revenue} isLoading={isLoading} label="All consultation earnings" />
        </section>

      </div>

      <Dialog open={showSummaryDialog} onOpenChange={setShowSummaryDialog}>
        <SummaryDialogContent
          summaryBooking={summaryBooking}
          isApproved={isApproved}
          isBusy={isBusy}
          diagnosis={diagnosis}
          setDiagnosis={setDiagnosis}
          physicianNotes={physicianNotes}
          setPhysicianNotes={setPhysicianNotes}
          medications={medications}
          setMedications={setMedications}
          followUp={followUp}
          setFollowUp={setFollowUp}
          onSaveDraft={handleSaveDraft}
          saveDraftPending={saveDraftMutation.isPending}
          onConfirm={() => summaryBooking && confirmMutation.mutate({ id: summaryBooking.id, diagnosis, medications, physicianNotes, followUp })}
          confirmPending={confirmMutation.isPending}
          onClose={() => setShowSummaryDialog(false)}
        />
      </Dialog>

      <Dialog open={showPostRxDialog} onOpenChange={(open) => { setShowPostRxDialog(open); if (!open) setPostRxBooking(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Post-Consultation Access</DialogTitle>
            <DialogDescription>
              All features are now off. Re-enable video, calls, or uploads for the patient for up to 24 hours.
            </DialogDescription>
          </DialogHeader>
          {postRxBooking && <PostRxToggles booking={postRxBooking} />}
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

function SummaryDialogContent({
  summaryBooking,
  isApproved,
  isBusy,
  diagnosis, setDiagnosis,
  physicianNotes, setPhysicianNotes,
  medications, setMedications,
  followUp, setFollowUp,
  onSaveDraft,
  saveDraftPending,
  onConfirm,
  confirmPending,
  onClose,
}: {
  summaryBooking: ActiveConsultation | null;
  isApproved: boolean;
  isBusy: boolean;
  diagnosis: string; setDiagnosis: (v: string) => void;
  physicianNotes: string; setPhysicianNotes: (v: string) => void;
  medications: string; setMedications: (v: string) => void;
  followUp: string; setFollowUp: (v: string) => void;
  onSaveDraft: () => void;
  saveDraftPending: boolean;
  onConfirm: () => void;
  confirmPending: boolean;
  onClose: () => void;
}) {
  return (
    <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
      <DialogHeader className="shrink-0">
        <DialogTitle className="flex items-center gap-2">
          {isApproved ? (
            <>
              <ShieldCheck className="h-5 w-5 text-green-600" />
              Summary — Signed &amp; Locked
            </>
          ) : (summaryBooking as any)?.prescriptionGeneratedAt ? (
            "Edit Summary Draft"
          ) : (
            "Generate Summary"
          )}
        </DialogTitle>
        <DialogDescription>
          {summaryBooking?.patientName} • {summaryBooking?.serviceName}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 overflow-y-auto flex-1 pr-1">
        {isApproved ? (
          <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800 p-4 space-y-3">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-400 font-medium">
              <ShieldCheck className="h-4 w-4" />
              This consultation summary has been digitally confirmed and is permanently locked
            </div>
            <p className="text-sm text-muted-foreground">
              Confirmed on: <span className="font-medium">{summaryBooking && new Date((summaryBooking as any).prescriptionApprovedAt).toLocaleString("en-IN", { dateStyle: "long", timeStyle: "medium", timeZone: "Asia/Kolkata" })}</span>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Diagnosis</p>
                <p className="font-medium mt-0.5">{summaryBooking?.prescriptionDiagnosis || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Follow-up</p>
                <p className="font-medium mt-0.5">{summaryBooking?.prescriptionFollowUp || "—"}</p>
              </div>
            </div>
            {summaryBooking?.prescriptionMedications && (
              <div className="text-sm">
                <p className="text-xs text-muted-foreground">Clinical Advisory</p>
                <p className="font-medium mt-0.5 whitespace-pre-wrap">{summaryBooking.prescriptionMedications}</p>
              </div>
            )}
            {(summaryBooking as any)?.prescriptionPdfUrl && (
              <a
                href={(summaryBooking as any).prescriptionPdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-green-300 bg-white dark:bg-transparent px-3 py-2 text-sm font-medium text-green-700 dark:text-green-400 hover:bg-green-50 transition-colors"
                data-testid="link-summary-pdf-signed"
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
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
                rows={3}
                data-testid="input-summary-diagnosis"
              />
            </div>
            <div className="space-y-2">
              <Label>Physician Notes</Label>
              <Textarea
                placeholder="Clinical observations, recommendations, special instructions..."
                value={physicianNotes}
                onChange={(e) => setPhysicianNotes(e.target.value)}
                rows={3}
                data-testid="input-summary-physician-notes"
              />
            </div>
            <div className="space-y-2">
              <Label>Clinical Advisory</Label>
              <Textarea
                placeholder={"Add neutral clinical observations, recommendations, or care considerations..."}
                value={medications}
                onChange={(e) => setMedications(e.target.value)}
                rows={5}
                data-testid="input-summary-medications"
              />
            </div>
            <div className="space-y-2">
              <Label>Follow-up</Label>
              <Input
                placeholder="e.g., After 1 week, or if symptoms persist"
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
                data-testid="input-summary-followup"
              />
            </div>
          </>
        )}
      </div>
      <DialogFooter className="shrink-0 mt-4 gap-2 flex-col sm:flex-row">
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
        {!isApproved && (
          <>
            <Button
              variant="secondary"
              onClick={onSaveDraft}
              disabled={!diagnosis || isBusy}
              data-testid="button-save-draft"
            >
              {saveDraftPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</>
              ) : (
                "Save Draft"
              )}
            </Button>
            <Button
              onClick={onConfirm}
              disabled={!diagnosis || isBusy}
              className="bg-green-700 hover:bg-green-800 text-white"
              data-testid="button-confirm-sign"
            >
              {confirmPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Confirming...</>
              ) : (
                <><ShieldCheck className="mr-2 h-4 w-4" />Confirm &amp; Sign</>
              )}
            </Button>
          </>
        )}
      </DialogFooter>
    </DialogContent>
  );
}
