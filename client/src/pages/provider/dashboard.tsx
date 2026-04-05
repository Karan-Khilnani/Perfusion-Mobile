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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
    <div className="rounded-2xl border bg-card p-7 space-y-5">
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-4 w-2/5" />
      <Skeleton className="h-12 w-full rounded-xl" />
      <div className="flex gap-3">
        <Skeleton className="h-10 flex-1 rounded-lg" />
        <Skeleton className="h-10 flex-1 rounded-lg" />
        <Skeleton className="h-10 flex-1 rounded-lg" />
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
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-12">

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
                    className="rounded-2xl border bg-card p-7 space-y-5"
                    data-testid={`card-consultation-${booking.id}`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <User className="h-5 w-5 text-muted-foreground shrink-0" />
                        <p className="text-2xl font-bold tracking-tight">{booking.patientName}</p>
                      </div>
                      <div className="flex items-center gap-2 ml-7">
                        <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                        <p className="text-base text-muted-foreground">{booking.seekerHospitalName}</p>
                      </div>
                      <div className="flex items-center gap-2 ml-7">
                        <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                        <p className="text-base font-medium">{formatSlot(booking.appointmentSlot)}</p>
                      </div>
                    </div>

                    {booking.videoRoomId ? (
                      <Link href={`/video/${encodeURIComponent(booking.videoRoomId)}?returnTo=/provider`}>
                        <Button
                          size="lg"
                          className="w-full h-14 text-lg gap-3 rounded-xl"
                          data-testid={`button-join-call-${booking.id}`}
                        >
                          <Video className="h-6 w-6" />
                          Join Video Call
                        </Button>
                      </Link>
                    ) : (
                      <Button size="lg" className="w-full h-14 text-lg rounded-xl" disabled variant="outline">
                        <Video className="h-5 w-5 mr-2" />
                        Call Room Not Assigned Yet
                      </Button>
                    )}

                    <div className="flex flex-wrap gap-3">
                      {docUrls.length > 0 ? (
                        <FileListDialog
                          title="Patient Documents"
                          urls={docUrls}
                          trigger={
                            <Button
                              variant="outline"
                              className="flex-1 min-w-[140px] gap-2"
                              data-testid={`button-view-docs-${booking.id}`}
                            >
                              <FileText className="h-4 w-4" />
                              View Documents ({docUrls.length})
                            </Button>
                          }
                        />
                      ) : (
                        <Button variant="outline" className="flex-1 min-w-[140px] gap-2" disabled>
                          <FileText className="h-4 w-4" />
                          No Documents
                        </Button>
                      )}

                      {chartUrls.length > 0 ? (
                        <FileListDialog
                          title="Treatment Charts"
                          urls={chartUrls}
                          trigger={
                            <Button
                              variant="outline"
                              className="flex-1 min-w-[140px] gap-2"
                              data-testid={`button-view-charts-${booking.id}`}
                            >
                              <ClipboardList className="h-4 w-4" />
                              View Treatment Charts ({chartUrls.length})
                            </Button>
                          }
                        />
                      ) : (
                        <Button variant="outline" className="flex-1 min-w-[140px] gap-2" disabled>
                          <ClipboardList className="h-4 w-4" />
                          No Treatment Charts
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
