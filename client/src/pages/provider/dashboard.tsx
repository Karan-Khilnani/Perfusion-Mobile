import { useState } from "react";
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
} from "lucide-react";
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
import type { Booking } from "@shared/schema";
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 pt-2">
          {urls.map((url, i) => (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              download
              className="flex items-center gap-2 rounded-lg border p-3 text-sm hover:bg-muted/50 transition-colors"
            >
              <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate text-primary underline-offset-2 hover:underline">
                File {i + 1}
              </span>
            </a>
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

function ConsultationsSection({
  isLoading,
  activeConsultations,
  onOpenSummary,
  navigate,
}: {
  isLoading: boolean;
  activeConsultations: ActiveConsultation[];
  onOpenSummary: (b: ActiveConsultation) => void;
  navigate: (path: string) => void;
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
              <div
                key={booking.id}
                className="rounded-2xl border bg-card p-4 sm:p-6 space-y-4"
                data-testid={`card-consultation-${booking.id}`}
              >
                <div className="space-y-1.5">
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

                <div className="grid grid-cols-2 gap-2.5">
                  {booking.videoRoomId ? (
                    <Button
                      className="w-full h-10 gap-2 rounded-xl text-sm overflow-hidden"
                      onClick={() => navigate(`/video/${encodeURIComponent(booking.videoRoomId!)}?returnTo=/provider`)}
                      data-testid={`button-join-call-${booking.id}`}
                    >
                      <Video className="h-4 w-4 shrink-0" />
                      <span className="truncate">Join Call</span>
                    </Button>
                  ) : (
                    <Button className="w-full h-10 rounded-xl text-sm overflow-hidden" disabled variant="outline">
                      <Video className="h-4 w-4 shrink-0 mr-1.5" />
                      <span className="truncate">No Room Yet</span>
                    </Button>
                  )}

                  <Button
                    variant="secondary"
                    className="w-full h-10 gap-2 rounded-xl text-sm overflow-hidden"
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

                <div className="grid grid-cols-3 gap-2">
                  <PatientDetailsDialog
                    booking={booking}
                    trigger={
                      <Button
                        variant="outline"
                        className="w-full flex flex-col items-center gap-1 h-auto py-2.5 px-1"
                        data-testid={`button-patient-details-${booking.id}`}
                      >
                        <User className="h-4 w-4 shrink-0" />
                        <span className="text-[10px] sm:text-xs leading-tight text-center">Patient Details</span>
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
                          className="w-full flex flex-col items-center gap-1 h-auto py-2.5 px-1"
                          data-testid={`button-view-reports-${booking.id}`}
                        >
                          <Activity className="h-4 w-4 shrink-0" />
                          <span className="text-[10px] sm:text-xs leading-tight text-center">View Reports</span>
                        </Button>
                      }
                    />
                  ) : (
                    <Button variant="outline" className="w-full flex flex-col items-center gap-1 h-auto py-2.5 px-1" disabled>
                      <Activity className="h-4 w-4 shrink-0" />
                      <span className="text-[10px] sm:text-xs leading-tight text-center">No Reports</span>
                    </Button>
                  )}

                  {chartUrls.length > 0 ? (
                    <FileListDialog
                      title="Treatment Charts"
                      urls={chartUrls}
                      trigger={
                        <Button
                          variant="outline"
                          className="w-full flex flex-col items-center gap-1 h-auto py-2.5 px-1"
                          data-testid={`button-view-charts-${booking.id}`}
                        >
                          <ClipboardList className="h-4 w-4 shrink-0" />
                          <span className="text-[10px] sm:text-xs leading-tight text-center">Treatment Charts</span>
                        </Button>
                      }
                    />
                  ) : (
                    <Button variant="outline" className="w-full flex flex-col items-center gap-1 h-auto py-2.5 px-1" disabled>
                      <ClipboardList className="h-4 w-4 shrink-0" />
                      <span className="text-[10px] sm:text-xs leading-tight text-center">No Charts</span>
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function AvailabilityEditor({ consultant }: { consultant: DashboardData["consultant"] }) {
  if (!consultant) return null;
  return (
    <Card data-testid="card-availability">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          Availability
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ConsultantSlotEditor
          consultantId={consultant.id}
          initialFrom={consultant.availabilityFrom}
          initialTo={consultant.availabilityTo}
          initialDays={(consultant as any).availableDays}
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/bookings"] });
      setShowSummaryDialog(false);
      setSummaryBooking(null);
      toast({ title: "Summary Confirmed & Signed", description: "The consultation summary is now locked with a medicolegal audit trail." });
    },
    onError: (error: any) => {
      toast({ title: "Confirmation Failed", description: error?.message || "Failed to confirm consultation summary.", variant: "destructive" });
    },
  });

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
            onOpenSummary={openSummaryDialog}
            navigate={navigate}
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
              onOpenSummary={openSummaryDialog}
              navigate={navigate}
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
                <p className="text-xs text-muted-foreground">Treatment Plan</p>
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
              <Label>Suggested Treatment Plan</Label>
              <Textarea
                placeholder={"List medications with dosage and frequency, procedures, therapy...\ne.g., Tab. Paracetamol 500mg - 1 tablet twice daily after meals for 5 days"}
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
