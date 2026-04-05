import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { Booking } from "@shared/schema";

interface ActiveConsultation extends Booking {
  seekerHospitalName: string;
}

interface Revenue {
  total: number;
  paid: number;
  pending: number;
}

interface DashboardData {
  activeConsultations: ActiveConsultation[];
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
    <div className="rounded-2xl border bg-card p-6 space-y-5">
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-4 w-2/5" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-11 rounded-xl" />
        <Skeleton className="h-11 rounded-xl" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Skeleton className="h-9 rounded-lg" />
        <Skeleton className="h-9 rounded-lg" />
        <Skeleton className="h-9 rounded-lg" />
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

export default function ProviderDashboard() {
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/provider/dashboard"],
  });

  const activeConsultations = data?.activeConsultations ?? [];
  const revenue = data?.revenue ?? { total: 0, paid: 0, pending: 0 };

  return (
    <div className="min-h-full bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-10 sm:space-y-12">

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
                        <Link href={`/video/${encodeURIComponent(booking.videoRoomId)}?returnTo=/provider`}>
                          <Button
                            className="w-full h-10 gap-2 rounded-xl text-sm"
                            data-testid={`button-join-call-${booking.id}`}
                          >
                            <Video className="h-4 w-4 shrink-0" />
                            Join Call
                          </Button>
                        </Link>
                      ) : (
                        <Button className="w-full h-10 rounded-xl text-sm" disabled variant="outline">
                          <Video className="h-4 w-4 mr-1.5 shrink-0" />
                          No Room Yet
                        </Button>
                      )}

                      <Link href="/provider/bookings">
                        <Button
                          variant="secondary"
                          className="w-full h-10 gap-2 rounded-xl text-sm"
                          data-testid={`button-generate-summary-${booking.id}`}
                        >
                          <FileText className="h-4 w-4 shrink-0" />
                          Generate Summary
                        </Button>
                      </Link>
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

        <section>
          <div className="flex items-center gap-2 mb-6">
            <IndianRupee className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold tracking-tight">Revenue</h2>
          </div>

          {isLoading ? (
            <RevenueSkeleton />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-2xl border bg-card p-6 space-y-1" data-testid="tile-revenue-total">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Total Revenue</p>
                <p className="text-3xl font-bold tracking-tight">{formatRupees(revenue.total)}</p>
                <p className="text-xs text-muted-foreground">All consultation earnings</p>
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
          )}
        </section>

      </div>
    </div>
  );
}
