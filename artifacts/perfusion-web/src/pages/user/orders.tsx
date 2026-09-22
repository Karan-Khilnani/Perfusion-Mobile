import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/status-badge";
import { BookingTimeline } from "@/components/booking-timeline";
import { ClipboardList, FlaskConical, Stethoscope, Calendar, IndianRupee, ChevronRight, ChevronDown, Video, Scan, Download, FileText, Upload, Paperclip, X, Search, CheckCircle2, Clock, RefreshCw, Phone, FolderOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getCallWindow, callWindowLabel, toISTTimeString, getPostRxStatus } from "@/lib/call-window";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import type { Booking, BookingType, PrescriptionReview } from "@shared/schema";
import { format, differenceInDays } from "date-fns";
import { useLocation } from "wouter";
import { useEffect, useRef } from "react";
import { ExternalLink, Image as ImageIcon, Maximize2 } from "lucide-react";
import { MobilePdfViewer } from "@/components/mobile-pdf-viewer";

const typeIcons: Record<BookingType, typeof FlaskConical> = {
  lab: FlaskConical,
  consultation: Stethoscope,
  teleradiology: Scan,
};

const typeLabels: Record<BookingType, string> = {
  lab: "Lab Test",
  consultation: "Consultation",
  teleradiology: "Teleradiology",
};

async function uploadFile(file: File): Promise<string> {
  const { uploadFileAsBase64 } = await import("@/lib/uploadFile");
  return uploadFileAsBase64(file);
}

function validUrls(urls: string[] | null | undefined): string[] {
  return (urls || []).filter((u) => u && u !== "undefined" && u !== "null");
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
    const raw = decodeURIComponent(parts[parts.length - 1] ?? url);
    return raw.split("?")[0];
  } catch {
    return url;
  }
}

function InlineDocument({ url, label }: { url: string; label: string }) {
  const image = isImageFile(url);
  const isPdf = getFileExt(url) === "pdf";
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const [imgError, setImgError] = useState(false);
  const [fileOk, setFileOk] = useState<boolean | null>(null);
  const [maximized, setMaximized] = useState(false);
  const [pdfError, setPdfError] = useState(false);

  useEffect(() => {
    if (image) return;
    setFileOk(null);
    fetch(url, { method: "HEAD", credentials: "include" })
      .then(r => setFileOk(r.ok))
      .catch(() => setFileOk(false));
  }, [url, image]);

  const FallbackCard = ({ reason }: { reason: string }) => (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-3 w-full rounded border bg-muted/40 px-4 py-3 hover:bg-muted/70 transition-colors"
    >
      <FileText className="h-8 w-8 text-muted-foreground shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{label}</p>
        <p className="text-xs text-muted-foreground">{reason}</p>
      </div>
      <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
    </a>
  );


  return (
    <>
      <div className="mb-3 last:mb-0">
        <div className="flex items-center justify-between mb-1.5 gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {image
              ? <ImageIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              : <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            }
            <span className="text-xs text-muted-foreground truncate">{label}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setMaximized(true)}
              className="text-muted-foreground hover:text-primary transition-colors"
              title="Open fullscreen"
              data-testid={`button-maximize-doc-${label}`}
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
            <a href={url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary transition-colors" title="Open in new tab">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>

        {image ? (
          imgError ? (
            <FallbackCard reason="Image unavailable — tap to open directly" />
          ) : (
            <img
              src={url}
              alt={label}
              className="w-full rounded border object-contain max-h-[600px] bg-muted cursor-pointer"
              onError={() => setImgError(true)}
              onClick={() => setMaximized(true)}
            />
          )
        ) : isMobile && isPdf ? (
          pdfError ? (
            <FallbackCard reason="PDF preview unavailable — tap to open directly" />
          ) : (
            <MobilePdfViewer
              url={url}
              onError={() => setPdfError(true)}
              maxHeight={500}
              testId={`pdf-doc-${label}`}
            />
          )
        ) : fileOk === false ? (
          <FallbackCard reason="File unavailable — tap to open directly" />
        ) : fileOk === null ? (
          <div className="w-full rounded border bg-muted/30 animate-pulse" style={{ height: isMobile ? 380 : 500 }} />
        ) : (
          <iframe
            src={url}
            title={label}
            className="w-full rounded border bg-white"
            style={{ height: 500 }}
          />
        )}
      </div>

      {/* Fullscreen dialog — works on all mobile browsers */}
      <Dialog open={maximized} onOpenChange={setMaximized}>
        <DialogContent className="max-w-none w-screen h-[100dvh] p-0 flex flex-col gap-0 rounded-none">
          <DialogHeader className="px-4 py-2 border-b flex-row items-center justify-between shrink-0">
            <DialogTitle className="text-sm font-medium truncate pr-8">{label}</DialogTitle>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground hover:text-primary transition-colors shrink-0"
              title="Open in new tab"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </DialogHeader>
          <div className="flex-1 overflow-auto bg-muted/20">
            {image ? (
              <img
                src={url}
                alt={label}
                className="w-full h-full object-contain"
              />
            ) : isMobile && isPdf ? (
              pdfError ? (
                <div className="p-4">
                  <FallbackCard reason="PDF preview unavailable — tap to open directly" />
                </div>
              ) : (
                <MobilePdfViewer
                  url={url}
                  onError={() => setPdfError(true)}
                  className="w-full bg-white"
                  testId={`pdf-fullscreen-${label}`}
                />
              )
            ) : (
              <>
                <iframe
                  src={url}
                  title={label}
                  className="w-full h-full bg-white"
                  style={{ minHeight: "calc(100dvh - 52px)" }}
                />
                <p className="text-xs text-center text-muted-foreground py-2">
                  PDF not loading?{" "}
                  <a href={url} target="_blank" rel="noreferrer" className="text-primary underline">
                    Open directly
                  </a>
                </p>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function OrdersPage() {
  const [, navigate] = useLocation();
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [uploadBooking, setUploadBooking] = useState<Booking | null>(null);
  const [uploadCategory, setUploadCategory] = useState<"reports" | "charts">("reports");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const { toast } = useToast();

  const { data: bookings, isLoading } = useQuery<Booking[]>({
    queryKey: ["/api/bookings"],
  });

  const selectedBooking = bookings?.find(b => b.id === selectedBookingId) || null;

  const handleUploadFiles = async () => {
    if (!uploadBooking || pendingFiles.length === 0) return;
    setUploadingFiles(true);
    try {
      for (const file of pendingFiles) {
        const fileUrl = await uploadFile(file);
        if (uploadCategory === "reports") {
          await apiRequest("PATCH", `/api/bookings/${uploadBooking.id}/documents`, { documentUrl: fileUrl });
        } else {
          await apiRequest("PATCH", `/api/bookings/${uploadBooking.id}/treatment-charts`, { chartUrl: fileUrl });
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      setShowUploadDialog(false);
      setUploadBooking(null);
      setPendingFiles([]);
      toast({ title: "Uploaded", description: `${pendingFiles.length} file(s) uploaded as ${uploadCategory === "reports" ? "reports" : "treatment charts"}.` });
    } catch {
      toast({ title: "Upload Failed", description: "Failed to upload one or more files.", variant: "destructive" });
    } finally {
      setUploadingFiles(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setPendingFiles(prev => [...prev, ...files]);
  };

  const removeFile = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  };

  const [listSearch, setListSearch] = useState("");
  const [listStatusFilter, setListStatusFilter] = useState<"all" | "ready" | "pending">("all");
  const [listDateFrom, setListDateFrom] = useState("");
  const [listDateTo, setListDateTo] = useState("");

  const labBookings = bookings?.filter((b) => b.bookingType === "lab") || [];
  const consultationBookings = bookings?.filter((b) => b.bookingType === "consultation") || [];
  const teleradiologyBookings = bookings?.filter((b) => b.bookingType === "teleradiology") || [];

  const filterListBookings = (list: Booking[]) => {
    let filtered = list;
    if (listSearch.trim()) {
      const q = listSearch.toLowerCase();
      filtered = filtered.filter((b) =>
        b.patientName.toLowerCase().includes(q) ||
        (b as any).uhidIpNumber?.toLowerCase().includes(q) ||
        (b as any).bookingNumber?.toLowerCase().includes(q) ||
        b.id.toLowerCase().includes(q) ||
        b.serviceName.toLowerCase().includes(q) ||
        (b as any).accessionNumber?.toLowerCase().includes(q)
      );
    }
    if (listStatusFilter === "ready") {
      filtered = filtered.filter((b) => !!b.reportUrl);
    } else if (listStatusFilter === "pending") {
      filtered = filtered.filter((b) => !b.reportUrl);
    }
    if (listDateFrom) {
      const from = new Date(listDateFrom);
      from.setHours(0, 0, 0, 0);
      filtered = filtered.filter((b) => new Date(b.createdAt!) >= from);
    }
    if (listDateTo) {
      const to = new Date(listDateTo);
      to.setHours(23, 59, 59, 999);
      filtered = filtered.filter((b) => new Date(b.createdAt!) <= to);
    }
    return filtered;
  };

  const [expandedBookingIds, setExpandedBookingIds] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) => {
    setExpandedBookingIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const BookingCard = ({ booking, key }: { booking: Booking, key?: string }) => {
    const Icon = typeIcons[booking.bookingType as BookingType];
    const canFollowUp = booking.bookingType === "consultation" &&
      booking.createdAt &&
      differenceInDays(new Date(), new Date(booking.createdAt)) < 7 &&
      !["cancelled"].includes(booking.status);
    const isExpanded = expandedBookingIds.has(booking.id);

    return (
      <div key={key} className="flex flex-col border rounded-lg bg-card shadow-sm transition-all overflow-hidden" data-testid={`card-booking-${booking.id}`}>
        <button
          onClick={() => {
            if (booking.bookingType === "consultation") {
              toggleExpand(booking.id);
            } else {
              setSelectedBookingId(booking.id);
            }
          }}
          aria-expanded={isExpanded}
          aria-controls={`booking-expansion-${booking.id}`}
          className={`flex items-start justify-between gap-3 p-4 text-left w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
            selectedBooking?.id === booking.id && booking.bookingType !== "consultation" ? "ring-2 ring-primary" : ""
          }`}
        >
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1 pr-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-medium leading-tight">{booking.serviceName}</h3>
                {(booking as any).isFollowUp && (
                  <Badge className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-0">
                    Follow Up
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{booking.providerName}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {format(new Date(booking.createdAt!), "MMM d, yyyy")}
                </span>
                {parseFloat(booking.amount) > 0 && (
                  <span className="flex items-center gap-1">
                    <IndianRupee className="h-3 w-3" />
                    {booking.amount}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <StatusBadge status={booking.status} />
            {booking.bookingType === "consultation" ? (
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </button>

        {isExpanded && booking.bookingType === "consultation" && (
          <div id={`booking-expansion-${booking.id}`} className="px-4 pb-4 pt-2 border-t bg-muted/20">
            <div className="flex flex-wrap gap-2 items-center">
              {(() => {
                const rxStatus = getPostRxStatus(booking as any);
                const win = getCallWindow(booking as any);
                const prescriptionApprovedAt = (booking as any).prescriptionApprovedAt;
                const videoOpen = prescriptionApprovedAt ? rxStatus.videoEnabled : win.open;

                if (videoOpen && booking.videoRoomId) {
                  return (
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/video/${encodeURIComponent(booking.videoRoomId!)}?returnTo=/user/orders`);
                      }}
                      className="h-8 gap-1.5"
                    >
                      <Video className="h-3.5 w-3.5" />
                      Join Video
                    </Button>
                  );
                } else if (!prescriptionApprovedAt && !win.open && booking.videoRoomId) {
                  return (
                    <Button size="sm" variant="outline" disabled className="h-8 gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      {callWindowLabel(win)}
                    </Button>
                  );
                }
                return null;
              })()}

              <Button
                size="sm"
                variant="secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/case-file/${booking.id}`);
                }}
                className="h-8 gap-1.5"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                Case File
              </Button>

              {(booking as any).prescriptionApprovedAt && (
                <a
                  href={`/api/bookings/${booking.id}/prescription-trail/download`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button size="sm" variant="outline" className="h-8 gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-900/30">
                    <Download className="h-3.5 w-3.5" />
                    Advisory
                  </Button>
                </a>
              )}

              {canFollowUp && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-900/30"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/user/consultation/${booking.serviceId}/book?parentBookingId=${booking.id}`);
                  }}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Follow-Up
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  function PrescriptionReviewTrail({ bookingId, compact = false }: { bookingId: string; compact?: boolean }) {
    const { data: reviews = [] } = useQuery<PrescriptionReview[]>({
      queryKey: [`/api/bookings/${bookingId}/prescription-reviews`],
      staleTime: 0,
      refetchOnMount: "always",
      refetchOnWindowFocus: "always",
      refetchInterval: compact ? false : 15_000,
    });
    if (!reviews.length) return null;
    if (compact) {
      return (
        <p className="text-xs text-indigo-700 dark:text-indigo-300">
          Includes {reviews.length} follow-up {reviews.length === 1 ? "summary" : "summaries"}
        </p>
      );
    }
    return (
      <div className="mt-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h4 className="font-medium text-indigo-700 dark:text-indigo-300">Follow-up Summary Trail</h4>
          <a
            href={`/api/bookings/${bookingId}/prescription-trail/download`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button size="sm" variant="outline" className="h-8 gap-1">
              <Download className="h-3.5 w-3.5" />
              Download Complete PDF
            </Button>
          </a>
        </div>
        {reviews.map((r) => (
          <div key={r.id} className="rounded-md border border-indigo-200 bg-indigo-50/50 p-3 dark:border-indigo-900 dark:bg-indigo-950/20">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">Review Summary #{r.reviewNumber}</p>
              <p className="text-xs text-muted-foreground">
                {format(new Date(r.approvedAt), "MMM d, yyyy · h:mm a")}
              </p>
            </div>
            <div className="mt-2 grid gap-2 text-sm">
              {r.diagnosis && <div><span className="text-xs font-medium text-muted-foreground">Diagnosis</span><p>{r.diagnosis}</p></div>}
              {r.physicianNotes && <div><span className="text-xs font-medium text-muted-foreground">Physician Notes</span><p className="whitespace-pre-line">{r.physicianNotes}</p></div>}
              {r.medications && <div><span className="text-xs font-medium text-muted-foreground">Clinical Advisory</span><p className="whitespace-pre-line">{r.medications}</p></div>}
              {r.advice && <div><span className="text-xs font-medium text-muted-foreground">Advice</span><p className="whitespace-pre-line">{r.advice}</p></div>}
              {r.followUp && <div><span className="text-xs font-medium text-muted-foreground">Follow-up</span><p>{r.followUp}</p></div>}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const CallConsultantButton = ({ bookingId, videoRoomId, status, appointmentSlot, callWindowExtendedUntil, prescriptionApprovedAt, postRxExpiresAt, postRxCallsEnabled }: { bookingId: string; videoRoomId?: string | null; status: string; appointmentSlot?: string | null; callWindowExtendedUntil?: string | null; prescriptionApprovedAt?: string | null; postRxExpiresAt?: string | null; postRxCallsEnabled?: boolean | null }) => {
    const { toast } = useToast();
    const [, navigate] = useLocation();
    const rxStatus = getPostRxStatus({ prescriptionApprovedAt, postRxExpiresAt, postRxCallsEnabled });
    const win = getCallWindow({ appointmentSlot, callWindowExtendedUntil });
    const canCall = prescriptionApprovedAt
      ? rxStatus.callsEnabled
      : status === "booked" && win.open;
    const callMutation = useMutation({
      mutationFn: () => apiRequest("POST", `/api/call/ring/${bookingId}`, { callType: "voice" }),
      onSuccess: () => {
        if (!videoRoomId) return;
        navigate(`/video/${encodeURIComponent(videoRoomId)}?returnTo=/user/orders&voice=true&initiated=true`);
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

    const description = prescriptionApprovedAt
      ? !rxStatus.inWindow
          ? "Post-consultation 24-hour window has expired"
          : !rxStatus.callsEnabled
            ? "Voice calls are currently disabled for this consultation"
            : "Start a secure in-app voice call with your consultant"
      : status !== "booked"
      ? "Voice calls are only available for active consultations"
      : win.reason === "before_window" && win.windowStart
      ? `Call window opens at ${toISTTimeString(win.windowStart)} IST — same window as video call`
      : win.reason === "expired"
      ? "Slot has ended — contact admin to extend if needed"
      : "Start a secure in-app voice call with your consultant";

    return (
      <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4">
        <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
          <Phone className="h-5 w-5" />
          <span className="font-medium">In-app Voice Call</span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        <Button
          className="mt-3 gap-2"
          variant="outline"
          onClick={() => callMutation.mutate()}
          disabled={callMutation.isPending || !canCall}
          data-testid="button-call-consultant"
          title={!canCall ? description : undefined}
        >
          {callMutation.isPending ? (
            <><Phone className="h-4 w-4 animate-pulse" />Ringing…</>
          ) : (
            <><Phone className="h-4 w-4" />Call Consultant</>
          )}
        </Button>
      </div>
    );
  };

  const BookingDetails = ({ booking }: { booking: Booking }) => {
    const [, navigate] = useLocation();
    const { toast } = useToast();
    const isWithinFollowUpWindow = booking.bookingType === "consultation" &&
      booking.createdAt &&
      differenceInDays(new Date(), new Date(booking.createdAt)) < 7;

    const [downloadingReceipt, setDownloadingReceipt] = useState(false);
    async function handleDownloadReceipt() {
      setDownloadingReceipt(true);
      try {
        const res = await fetch(`/api/bookings/${booking.id}/receipt?type=seeker`, { credentials: "include" });
        if (!res.ok) throw new Error("Failed to generate receipt");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `receipt-${(booking as any).bookingNumber || booking.id.slice(0, 8)}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      } catch {
        toast({ title: "Download failed", description: "Could not generate receipt. Please try again.", variant: "destructive" });
      } finally {
        setDownloadingReceipt(false);
      }
    }

    return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 flex-wrap">
          {typeLabels[booking.bookingType as BookingType]} Details
          {(booking as any).isFollowUp && (
            <Badge className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-0">
              Follow Up
            </Badge>
          )}
          <StatusBadge status={booking.status} />
          <Button
            size="sm"
            variant="outline"
            className="ml-auto gap-1.5 text-xs"
            onClick={handleDownloadReceipt}
            disabled={downloadingReceipt}
            data-testid={`button-download-receipt-${booking.id}`}
          >
            <Download className="h-3.5 w-3.5" />
            {downloadingReceipt ? "Generating…" : "Download Receipt"}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <dl className="space-y-3">
          <div className="flex justify-between border-b pb-2">
            <dt className="text-muted-foreground">Booking ID</dt>
            <dd className="font-mono text-sm">{(booking as any).bookingNumber || booking.id}</dd>
          </div>
          <div className="flex justify-between border-b pb-2">
            <dt className="text-muted-foreground">Service</dt>
            <dd>{booking.serviceName}</dd>
          </div>
          <div className="flex justify-between border-b pb-2">
            <dt className="text-muted-foreground">Provider</dt>
            <dd>{booking.providerName}</dd>
          </div>
          <div className="flex justify-between border-b pb-2">
            <dt className="text-muted-foreground">Patient</dt>
            <dd>{booking.patientName}</dd>
          </div>
          <div className="flex justify-between border-b pb-2">
            <dt className="text-muted-foreground">Age</dt>
            <dd>{booking.patientAge} years</dd>
          </div>
          {booking.appointmentSlot && (
            <div className="flex justify-between border-b pb-2">
              <dt className="text-muted-foreground">Appointment</dt>
              <dd>{booking.appointmentSlot}</dd>
            </div>
          )}
          {parseFloat(booking.amount) > 0 && (
            <div className="flex justify-between border-b pb-2">
              <dt className="text-muted-foreground">Amount</dt>
              <dd className="font-semibold">₹{booking.amount}</dd>
            </div>
          )}
          <div className="flex justify-between border-b pb-2">
            <dt className="text-muted-foreground">Payment Status</dt>
            <dd className="capitalize">{booking.paymentStatus}</dd>
          </div>
          <div className="flex justify-between pb-2">
            <dt className="text-muted-foreground">Created</dt>
            <dd>{format(new Date(booking.createdAt!), "PPpp")}</dd>
          </div>
        </dl>

        {booking.reportUrl && (
          <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4">
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400 mb-1">
              <FileText className="h-5 w-5" />
              <span className="font-medium">Report Available</span>
            </div>
            {booking.reportNotes && (
              <p className="mb-3 text-sm italic text-muted-foreground">
                Provider notes: {booking.reportNotes}
              </p>
            )}
            <InlineDocument
              url={booking.processedReportUrl || booking.reportUrl}
              label={getFileName(booking.processedReportUrl || booking.reportUrl) || "Report"}
            />
          </div>
        )}

        <div>
          <h4 className="mb-4 font-medium">Order Status</h4>
          <BookingTimeline status={booking.status} bookingType={booking.bookingType as BookingType} />
        </div>

        {isWithinFollowUpWindow && !["cancelled"].includes(booking.status) && (
          <div className="rounded-lg border border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-900/10 p-4">
            <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 mb-1">
              <RefreshCw className="h-4 w-4" />
              <span className="font-medium text-sm">Follow-Up Available</span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Book a follow-up consultation for this patient with the same specialist within 7 days of the original booking.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="border-blue-300 text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-900/30"
              onClick={() => navigate(`/user/consultation/${booking.serviceId}/book?parentBookingId=${booking.id}`)}
              data-testid="button-book-follow-up"
            >
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Book Follow Up
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
    );
  };

  const ListFilters = () => (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search patient, IP number, booking ID, test..."
              className="pl-9"
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
              data-testid="input-list-search"
            />
          </div>
        </div>
        <Select value={listStatusFilter} onValueChange={(v) => setListStatusFilter(v as any)}>
          <SelectTrigger className="w-[130px]" data-testid="select-report-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="ready">Report Ready</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Input type="date" className="w-[140px]" value={listDateFrom} onChange={(e) => setListDateFrom(e.target.value)} data-testid="input-date-from" />
          <span className="text-xs text-muted-foreground">to</span>
          <Input type="date" className="w-[140px]" value={listDateTo} onChange={(e) => setListDateTo(e.target.value)} data-testid="input-date-to" />
        </div>
        {(listSearch || listStatusFilter !== "all" || listDateFrom || listDateTo) && (
          <Button variant="ghost" size="sm" onClick={() => { setListSearch(""); setListStatusFilter("all"); setListDateFrom(""); setListDateTo(""); }} data-testid="button-clear-filters">
            <X className="mr-1 h-3 w-3" /> Clear
          </Button>
        )}
      </div>
    </div>
  );

  const LabRadiologyListView = ({ list, type }: { list: Booking[]; type: "lab" | "teleradiology" }) => {
    const filtered = filterListBookings(list);
    return (
      <div className="space-y-3">
        <ListFilters />
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              {list.length === 0 ? `No ${type === "lab" ? "lab" : "radiology"} bookings yet` : "No results match your filters"}
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Date</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Booking #</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">IP / UHID</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Patient</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{type === "lab" ? "Test" : "Modality"}</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Report</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Slot / Expected</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => {
                  const reportReady = !!b.reportUrl;
                  return (
                    <tr
                      key={b.id}
                      className={`border-b hover:bg-muted/30 cursor-pointer transition-colors ${selectedBookingId === b.id ? "bg-primary/5" : ""}`}
                      onClick={() => setSelectedBookingId(b.id)}
                      data-testid={`row-booking-${b.id}`}
                    >
                      <td className="px-3 py-2 whitespace-nowrap">{format(new Date(b.createdAt!), "dd/MM/yy")}</td>
                      <td className="px-3 py-2 whitespace-nowrap font-mono text-xs" title={(b as any).bookingNumber || b.id}>{(b as any).bookingNumber || b.id.substring(0, 12).toUpperCase()}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{(b as any).uhidIpNumber || "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span>{b.patientName}</span>
                        <span className="text-muted-foreground ml-1 text-xs">
                          {b.patientAge}y/{(b.patientGender || "").charAt(0).toUpperCase() || "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2 max-w-[180px] truncate" title={b.serviceName}>{b.serviceName}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {reportReady ? (
                          <Badge variant="default" className="text-xs gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Ready
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs gap-1">
                            <Clock className="h-3 w-3" /> Pending
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs">
                        {b.appointmentSlot
                          ? b.appointmentSlot
                          : format(new Date(b.createdAt!), "dd/MM/yy hh:mm a")}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {reportReady ? (
                          <a
                            href={b.processedReportUrl || b.reportUrl!}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            data-testid={`button-download-report-${b.id}`}
                          >
                            <Button size="sm" variant="default" className="h-7 text-xs gap-1">
                              <Download className="h-3 w-3" /> Download
                            </Button>
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Showing {filtered.length} of {list.length} · Click a row to view full details
        </p>
      </div>
    );
  };

  const EmptyState = ({ type }: { type: string }) => (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <ClipboardList className="mb-4 h-12 w-12 text-muted-foreground/50" />
        <h3 className="mb-2 text-lg font-medium">No {type} bookings yet</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Your {type.toLowerCase()} bookings will appear here
        </p>
        <Link href={`/user/${type === "Lab" ? "labs" : type === "Consultation" ? "consultation" : "critical-care"}`}>
          <Button>Browse {type} Services</Button>
        </Link>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Your Orders</h1>
        <p className="text-muted-foreground">
          Track all your bookings and appointments
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Tabs defaultValue="all" className="space-y-4">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="all" data-testid="tab-all-orders">
                All ({bookings?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="lab" data-testid="tab-lab-orders">
                Labs ({labBookings.length})
              </TabsTrigger>
              <TabsTrigger value="consultation" data-testid="tab-consultation-orders">
                Consult ({consultationBookings.length})
              </TabsTrigger>
              <TabsTrigger value="teleradiology" data-testid="tab-teleradiology-orders">
                Radiology ({teleradiologyBookings.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="space-y-3">
              {isLoading ? (
                [...Array(3)].map((_, i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <Skeleton className="h-10 w-10 rounded-lg" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-3/4" />
                          <Skeleton className="h-3 w-1/2" />
                        </div>
                        <Skeleton className="h-6 w-20" />
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : !bookings?.length ? (
                <EmptyState type="All" />
              ) : (
                bookings.map((booking) => BookingCard({ booking, key: booking.id }))
              )}
            </TabsContent>

            <TabsContent value="lab" className="space-y-3">
              {labBookings.length === 0 ? (
                <EmptyState type="Lab" />
              ) : (
                <LabRadiologyListView list={labBookings} type="lab" />
              )}
            </TabsContent>

            <TabsContent value="consultation" className="space-y-3">
              {consultationBookings.length === 0 ? (
                <EmptyState type="Consultation" />
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="flex-1 min-w-[200px]">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search by patient name..."
                          className="pl-9"
                          value={listSearch}
                          onChange={(e) => setListSearch(e.target.value)}
                          data-testid="input-consultation-search"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input type="date" className="w-[140px]" value={listDateFrom} onChange={(e) => setListDateFrom(e.target.value)} data-testid="input-consult-date-from" />
                      <span className="text-xs text-muted-foreground">to</span>
                      <Input type="date" className="w-[140px]" value={listDateTo} onChange={(e) => setListDateTo(e.target.value)} data-testid="input-consult-date-to" />
                    </div>
                    {(listSearch || listDateFrom || listDateTo) && (
                      <Button variant="ghost" size="sm" onClick={() => { setListSearch(""); setListDateFrom(""); setListDateTo(""); }} data-testid="button-clear-consult-filters">
                        <X className="mr-1 h-3 w-3" /> Clear
                      </Button>
                    )}
                  </div>
                  {(() => {
                    let filtered = consultationBookings;
                    if (listSearch.trim()) {
                      const q = listSearch.toLowerCase();
                      filtered = filtered.filter((b) => b.patientName.toLowerCase().includes(q));
                    }
                    if (listDateFrom) {
                      const from = new Date(listDateFrom); from.setHours(0,0,0,0);
                      filtered = filtered.filter((b) => new Date(b.createdAt!) >= from);
                    }
                    if (listDateTo) {
                      const to = new Date(listDateTo); to.setHours(23,59,59,999);
                      filtered = filtered.filter((b) => new Date(b.createdAt!) <= to);
                    }
                    return filtered.length === 0 ? (
                      <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No results match your filters</CardContent></Card>
                    ) : (
                      <>
                        <div className="rounded-md border overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b bg-muted/50">
                                <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Date</th>
                                <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Patient</th>
                                <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Consultant</th>
                                <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Department</th>
                                <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Booked Slot</th>
                                <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Status</th>
                                <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Clinical Advisory</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filtered.map((b) => (
                                <tr
                                  key={b.id}
                                  className={`border-b hover:bg-muted/30 cursor-pointer transition-colors ${selectedBookingId === b.id ? "bg-primary/5" : ""}`}
                                  onClick={() => setSelectedBookingId(b.id)}
                                  data-testid={`row-consultation-${b.id}`}
                                >
                                  <td className="px-3 py-2 whitespace-nowrap">{format(new Date(b.createdAt!), "dd/MM/yy")}</td>
                                  <td className="px-3 py-2 whitespace-nowrap">
                                    <span>{b.patientName}</span>
                                    <span className="text-muted-foreground ml-1 text-xs">{b.patientAge}y/{(b.patientGender || "").charAt(0).toUpperCase() || "—"}</span>
                                  </td>
                                  <td className="px-3 py-2 whitespace-nowrap">{b.serviceName}</td>
                                  <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">{(b as any).specialization || "—"}</td>
                                  <td className="px-3 py-2 whitespace-nowrap text-xs">{b.appointmentSlot || "—"}</td>
                                  <td className="px-3 py-2 whitespace-nowrap">
                                    <Badge variant={b.status === "completed" ? "default" : "outline"} className="text-xs">
                                      {b.status}
                                    </Badge>
                                  </td>
                                  <td className="px-3 py-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                    {(b as any).prescriptionApprovedAt ? (
                                      <div className="flex flex-col gap-1 items-start">
                                        <a
                                          href={`/api/bookings/${b.id}/prescription-trail/download`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          data-testid={`button-download-prescription-${b.id}`}
                                        >
                                          <Button size="sm" variant="default" className="h-7 text-xs gap-1">
                                            <Download className="h-3 w-3" /> Complete Summary
                                          </Button>
                                        </a>
                                        <PrescriptionReviewTrail bookingId={b.id} compact />
                                      </div>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">—</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <p className="text-xs text-muted-foreground">Showing {filtered.length} of {consultationBookings.length} · Click a row to view details</p>
                      </>
                    );
                  })()}
                </div>
              )}
            </TabsContent>

            <TabsContent value="teleradiology" className="space-y-3">
              {teleradiologyBookings.length === 0 ? (
                <EmptyState type="Teleradiology" />
              ) : (
                <LabRadiologyListView list={teleradiologyBookings} type="teleradiology" />
              )}
            </TabsContent>
          </Tabs>
        </div>

        <div className="lg:sticky lg:top-6">
          {selectedBooking ? (
            <BookingDetails booking={selectedBooking} />
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <ClipboardList className="mb-4 h-12 w-12 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">
                  Select a booking to view details
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload {uploadCategory === "reports" ? "Reports" : "Treatment Charts"}</DialogTitle>
            <DialogDescription>
              {uploadCategory === "reports"
                ? "Upload patient reports, lab results, or medical records. You can select multiple files."
                : "Upload treatment records, nursing charts, or medication charts. You can select multiple files."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border-2 border-dashed border-muted-foreground/25 p-4">
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Select files to upload</p>
                <Input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  onChange={handleFileSelect}
                  multiple
                  className="max-w-xs"
                  data-testid="input-upload-files"
                />
              </div>
            </div>
            {pendingFiles.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">{pendingFiles.length} file(s) selected</p>
                {pendingFiles.map((file, i) => (
                  <div key={i} className="flex items-center justify-between rounded border p-2 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 shrink-0" />
                      <span className="truncate">{file.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">({(file.size / 1024).toFixed(0)} KB)</span>
                    </div>
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeFile(i)} data-testid={`button-remove-file-${i}`}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUploadDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUploadFiles}
              disabled={pendingFiles.length === 0 || uploadingFiles}
              data-testid="button-submit-upload"
            >
              {uploadingFiles ? "Uploading..." : `Upload ${pendingFiles.length} File(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
