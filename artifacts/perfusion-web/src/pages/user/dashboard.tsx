import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  FlaskConical,
  Stethoscope,
  Video,
  Download,
  Calendar,
  User,
  FileText,
  Plus,
  RefreshCw,
  Trash2,
  CheckSquare,
  Square,
  X,
  Phone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getCallWindow, callWindowLabel, toISTTimeString, getPostRxStatus } from "@/lib/call-window";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Booking } from "@shared/schema";

interface ActiveConsultation extends Booking {
  consultantSpecialization: string | null;
}

function DashboardCallButton({ bookingId, callbackPhone, status, appointmentSlot, callWindowExtendedUntil, prescriptionApprovedAt, postRxExpiresAt, postRxCallsEnabled }: { bookingId: string; callbackPhone?: string; status: string; appointmentSlot?: string | null; callWindowExtendedUntil?: string | null; prescriptionApprovedAt?: string | null; postRxExpiresAt?: string | null; postRxCallsEnabled?: boolean | null }) {
  const { toast } = useToast();
  const rxStatus = getPostRxStatus({ prescriptionApprovedAt, postRxExpiresAt, postRxCallsEnabled });
  const win = getCallWindow({ appointmentSlot, callWindowExtendedUntil });

  const canCall = prescriptionApprovedAt
    ? !!callbackPhone && rxStatus.callsEnabled
    : status === "booked" && !!callbackPhone && win.open;

  const disabledTitle = prescriptionApprovedAt
    ? !callbackPhone
      ? "No call-back number on this booking"
      : !rxStatus.inWindow
        ? "Post-consultation 24-hour window has expired"
        : !rxStatus.callsEnabled
          ? "Phone calls are currently disabled — ask the consultant to re-enable them"
          : undefined
    : !callbackPhone
    ? "No call-back number on this booking"
    : status !== "booked"
    ? "Only available for active bookings"
    : win.reason === "before_window" && win.windowStart
    ? `Call window opens at ${toISTTimeString(win.windowStart)} IST`
    : win.reason === "expired"
    ? "Slot has ended"
    : undefined;
  const callMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/bookings/${bookingId}/call`),
    onSuccess: () => {
      toast({ title: "Call initiated", description: "You will receive a call on your ward number shortly — numbers are masked for privacy." });
    },
    onError: async (err: any) => {
      let msg = "Failed to initiate call.";
      try { const d = await err?.response?.json?.(); if (d?.error) msg = d.error; } catch {}
      toast({ title: "Call failed", description: msg, variant: "destructive" });
    },
  });
  return (
    <Button
      size="sm"
      variant="outline"
      className="w-full gap-2 border-green-500/30 text-green-700 dark:text-green-400 hover:bg-green-500/5"
      onClick={() => callMutation.mutate()}
      disabled={callMutation.isPending || !canCall}
      title={!canCall ? disabledTitle : undefined}
      data-testid={`button-call-consultant-${bookingId}`}
    >
      {callMutation.isPending
        ? <><Phone className="h-4 w-4 animate-pulse" />Connecting…</>
        : <><Phone className="h-4 w-4" />Call Consultant</>}
    </Button>
  );
}

interface DashboardData {
  activeConsultations: ActiveConsultation[];
  readyReports: Booking[];
  signedPrescriptions: Booking[];
}

function formatAppointmentSlot(slot: string | null | undefined): string {
  if (!slot) return "To be scheduled";
  const d = new Date(slot);
  if (isNaN(d.getTime())) return slot;
  return format(d, "dd MMM yyyy, hh:mm a");
}

function BookingCardSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-5 space-y-3">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="h-3 w-1/3" />
      <Skeleton className="h-8 w-28 mt-2" />
    </div>
  );
}

function EmptyState({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <div className="rounded-xl border border-dashed bg-muted/20 p-8 flex flex-col items-center justify-center gap-2 text-center">
      <Icon className="h-8 w-8 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

export default function UserDashboard() {
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/user/dashboard"],
  });

  const [cleanMode, setCleanMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const activeConsultations = data?.activeConsultations ?? [];
  const readyReports = data?.readyReports ?? [];

  const allCardIds = [
    ...activeConsultations.map((b) => b.id),
    ...readyReports.map((b) => b.id),
  ];
  const allSelected = allCardIds.length > 0 && allCardIds.every((id) => selectedIds.has(id));

  const hideMutation = useMutation({
    mutationFn: (ids: string[]) =>
      apiRequest("POST", "/api/user/dashboard/hide", { ids }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/dashboard"] });
      setSelectedIds(new Set());
      setCleanMode(false);
    },
  });

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(allCardIds));
  }

  function exitCleanMode() {
    setCleanMode(false);
    setSelectedIds(new Set());
  }

  const hasAnyCards = activeConsultations.length > 0 || readyReports.length > 0;

  return (
    <div className="min-h-full bg-background">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-10">

        {/* ── New Booking ───────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-5">
            <Plus className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              New Booking
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link href="/user/consultation">
              <div
                className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-7 cursor-pointer transition-all duration-200 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5"
                data-testid="button-consultation-module"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative flex flex-col gap-5">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 group-hover:bg-primary/15 transition-colors">
                    <Stethoscope className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-base tracking-tight">Super Speciality Consultation</p>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                      Video consultations with specialists — cardiology, neurology, oncology and more
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
                    Book now
                    <span className="transition-transform group-hover:translate-x-0.5">→</span>
                  </span>
                </div>
              </div>
            </Link>

            <Link href="/user/labs">
              <div
                className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-7 cursor-pointer transition-all duration-200 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5"
                data-testid="button-labs-module"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative flex flex-col gap-5">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 group-hover:bg-primary/15 transition-colors">
                    <FlaskConical className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-base tracking-tight">Lab Tests</p>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                      Comprehensive diagnostic tests with rapid turnaround and home collection
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
                    Book now
                    <span className="transition-transform group-hover:translate-x-0.5">→</span>
                  </span>
                </div>
              </div>
            </Link>
          </div>
        </section>

        {/* ── Your Activity ─────────────────────────────────── */}
        <section className="space-y-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                Your Activity
              </h2>
            </div>

            {/* Clean / manage mode controls */}
            {!isLoading && hasAnyCards && (
              cleanMode ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleSelectAll}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    data-testid="button-select-all"
                  >
                    {allSelected ? (
                      <CheckSquare className="h-4 w-4 text-primary" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                    Select all
                  </button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="gap-1.5 text-xs h-8"
                    disabled={selectedIds.size === 0 || hideMutation.isPending}
                    onClick={() => hideMutation.mutate(Array.from(selectedIds))}
                    data-testid="button-remove-selected"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    onClick={exitCleanMode}
                    data-testid="button-exit-clean"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <button
                  onClick={() => setCleanMode(true)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="button-clean-dashboard"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clean dashboard
                </button>
              )
            )}
          </div>

          {/* ── Consultations ───────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-base">Consultations</h3>
              {activeConsultations.length > 0 && (
                <span className="text-xs bg-primary/10 text-primary font-medium px-2.5 py-1 rounded-full">
                  {activeConsultations.length} active
                </span>
              )}
            </div>

            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <BookingCardSkeleton />
                <BookingCardSkeleton />
              </div>
            ) : activeConsultations.length === 0 ? (
              <EmptyState
                icon={Stethoscope}
                message="No consultations — book a super speciality consultation to get started"
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activeConsultations.map((booking) => {
                  const isSigned = !!(booking as any).prescriptionApprovedAt && !!(booking as any).prescriptionPdfUrl;
                  const isSelected = selectedIds.has(booking.id);
                  return (
                    <div
                      key={booking.id}
                      className={`rounded-xl border bg-card p-5 space-y-4 transition-colors ${
                        cleanMode
                          ? isSelected
                            ? "border-destructive/50 bg-destructive/5"
                            : "border-border cursor-pointer hover:border-muted-foreground/30"
                          : "hover:border-primary/30"
                      }`}
                      onClick={cleanMode ? () => toggleSelect(booking.id) : undefined}
                      data-testid={`card-consultation-${booking.id}`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Checkbox in clean mode */}
                        {cleanMode && (
                          <div className="shrink-0 mt-0.5">
                            {isSelected ? (
                              <CheckSquare className="h-4.5 w-4.5 text-destructive" />
                            ) : (
                              <Square className="h-4.5 w-4.5 text-muted-foreground" />
                            )}
                          </div>
                        )}
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 mt-0.5">
                          <Stethoscope className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-sm leading-tight truncate">
                              {booking.serviceName}
                              {booking.consultantSpecialization && (
                                <span className="font-normal text-muted-foreground">
                                  {" "}({booking.consultantSpecialization})
                                </span>
                              )}
                            </p>
                            {(booking as any).isFollowUp && (
                              <Badge className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-0 shrink-0">
                                <RefreshCw className="mr-1 h-2.5 w-2.5" />
                                Follow Up
                              </Badge>
                            )}
                            {isSigned && (
                              <Badge className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 border-0 shrink-0">
                                <FileText className="mr-1 h-2.5 w-2.5" />
                                Signed
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{booking.providerName}</p>
                        </div>
                      </div>

                      <div className="border-t" />

                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                          <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground">Patient:</span>
                          <span className="font-medium truncate">{booking.patientName}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground">Appointment:</span>
                          <span className="font-medium">
                            {formatAppointmentSlot(booking.appointmentSlot)}
                          </span>
                        </div>
                      </div>

                      {/* Action buttons — hidden in clean mode so clicks don't conflict */}
                      {!cleanMode && (
                        <div className="space-y-2">
                          {booking.videoRoomId ? (() => {
                            const prescriptionApprovedAt = (booking as any).prescriptionApprovedAt;
                            const rxStatus = getPostRxStatus(booking as any);
                            if (prescriptionApprovedAt) {
                              if (rxStatus.videoEnabled) {
                                return (
                                  <Link href={`/video/${encodeURIComponent(booking.videoRoomId!)}?returnTo=/user`}>
                                    <Button size="sm" className="w-full gap-2" data-testid={`button-join-call-${booking.id}`}>
                                      <Video className="h-4 w-4" />
                                      Join Video Room
                                    </Button>
                                  </Link>
                                );
                              }
                              return (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button size="sm" className="w-full gap-2" variant="outline" disabled data-testid={`button-join-call-${booking.id}`}>
                                        <Clock className="h-4 w-4" />
                                        {rxStatus.inWindow ? "Video Disabled" : "Consult Ended"}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {rxStatus.inWindow
                                        ? "Video calls are currently disabled for this consultation"
                                        : "Post-consultation 24-hour window has expired"}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              );
                            }
                            const win = getCallWindow(booking as any);
                            if (win.open) {
                              return (
                                <div className="space-y-1">
                                  <Link href={`/video/${encodeURIComponent(booking.videoRoomId!)}?returnTo=/user`}>
                                    <Button
                                      size="sm"
                                      className="w-full gap-2"
                                      data-testid={`button-join-call-${booking.id}`}
                                    >
                                      <Video className="h-4 w-4" />
                                      Join Video Room
                                    </Button>
                                  </Link>
                                  {win.reason === "extended" && win.extendedUntil && (
                                    <p className="text-xs text-center text-amber-600 dark:text-amber-400">
                                      Extended until {toISTTimeString(win.extendedUntil)}
                                    </p>
                                  )}
                                </div>
                              );
                            }
                            return (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="sm"
                                      className="w-full gap-2"
                                      variant="outline"
                                      disabled
                                      data-testid={`button-join-call-${booking.id}`}
                                    >
                                      <Clock className="h-4 w-4" />
                                      {callWindowLabel(win)}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {win.reason === "before_window" && win.windowStart
                                      ? `Call opens at ${toISTTimeString(win.windowStart)} IST`
                                      : win.reason === "expired" && win.windowEnd
                                      ? `Slot ended at ${toISTTimeString(win.windowEnd)} IST. Contact admin to extend.`
                                      : "Call window is not active"}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            );
                          })() : (
                            <Button size="sm" className="w-full" disabled variant="outline">
                              No room assigned yet
                            </Button>
                          )}

                          {isSigned && (
                            <a
                              href={`/api/bookings/${booking.id}/prescription/download`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <Button
                                size="sm"
                                variant="outline"
                                className="w-full gap-2 border-blue-500/30 text-blue-700 dark:text-blue-400 hover:bg-blue-500/5"
                                data-testid={`button-download-prescription-${booking.id}`}
                              >
                                <Download className="h-4 w-4" />
                                Download Consultation Summary
                              </Button>
                            </a>
                          )}

                          <DashboardCallButton
                            bookingId={booking.id}
                            callbackPhone={(booking as any).callbackPhone}
                            status={booking.status}
                            appointmentSlot={(booking as any).appointmentSlot}
                            callWindowExtendedUntil={(booking as any).callWindowExtendedUntil}
                            prescriptionApprovedAt={(booking as any).prescriptionApprovedAt}
                            postRxExpiresAt={(booking as any).postRxExpiresAt}
                            postRxCallsEnabled={(booking as any).postRxCallsEnabled}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Lab Reports ─────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-base">Lab Reports</h3>
              {readyReports.length > 0 && (
                <span className="text-xs bg-green-500/10 text-green-600 dark:text-green-400 font-medium px-2.5 py-1 rounded-full">
                  {readyReports.length} ready
                </span>
              )}
            </div>

            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <BookingCardSkeleton />
                <BookingCardSkeleton />
              </div>
            ) : readyReports.length === 0 ? (
              <EmptyState
                icon={FileText}
                message="No lab reports available yet — reports will appear here once ready"
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {readyReports.map((booking) => {
                  const isSelected = selectedIds.has(booking.id);
                  return (
                    <div
                      key={booking.id}
                      className={`rounded-xl border bg-card p-5 space-y-4 transition-colors ${
                        cleanMode
                          ? isSelected
                            ? "border-destructive/50 bg-destructive/5"
                            : "border-border cursor-pointer hover:border-muted-foreground/30"
                          : "hover:border-green-500/30"
                      }`}
                      onClick={cleanMode ? () => toggleSelect(booking.id) : undefined}
                      data-testid={`card-report-${booking.id}`}
                    >
                      <div className="flex items-start gap-3">
                        {cleanMode && (
                          <div className="shrink-0 mt-0.5">
                            {isSelected ? (
                              <CheckSquare className="h-4.5 w-4.5 text-destructive" />
                            ) : (
                              <Square className="h-4.5 w-4.5 text-muted-foreground" />
                            )}
                          </div>
                        )}
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-500/10 mt-0.5">
                          <FlaskConical className="h-4 w-4 text-green-600 dark:text-green-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm leading-tight truncate">
                            {booking.serviceName}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">{booking.providerName}</p>
                        </div>
                      </div>

                      <div className="border-t" />

                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                          <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground">Patient:</span>
                          <span className="font-medium truncate">{booking.patientName}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground">Booked:</span>
                          <span className="font-medium">
                            {booking.createdAt
                              ? format(new Date(booking.createdAt), "dd MMM yyyy")
                              : "—"}
                          </span>
                        </div>
                      </div>

                      {!cleanMode && (() => {
                        const downloadUrl = booking.processedReportUrl || booking.reportUrl;
                        return downloadUrl ? (
                          <a href={downloadUrl} target="_blank" rel="noopener noreferrer" download>
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full gap-2 border-green-500/30 text-green-700 dark:text-green-400 hover:bg-green-500/5"
                              data-testid={`button-download-report-${booking.id}`}
                            >
                              <Download className="h-4 w-4" />
                              Download Report
                            </Button>
                          </a>
                        ) : (
                          <Button size="sm" variant="outline" className="w-full" disabled>
                            Report processing…
                          </Button>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
