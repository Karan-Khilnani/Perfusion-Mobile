import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Booking } from "@shared/schema";

interface ActiveConsultation extends Booking {
  consultantSpecialization: string | null;
}

interface DashboardData {
  activeConsultations: ActiveConsultation[];
  readyReports: Booking[];
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

  const activeConsultations = data?.activeConsultations ?? [];
  const readyReports = data?.readyReports ?? [];

  return (
    <div className="min-h-full bg-background">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-10">

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

        <section className="space-y-8">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Your Activity
            </h2>
          </div>

          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-base">Active Consultations</h3>
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
                message="No active consultations — book a super speciality consultation to get started"
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activeConsultations.map((booking) => (
                  <div
                    key={booking.id}
                    className="rounded-xl border bg-card p-5 space-y-4 hover:border-primary/30 transition-colors"
                    data-testid={`card-consultation-${booking.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 mt-0.5">
                        <Stethoscope className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm leading-tight truncate">
                          {booking.serviceName}
                          {booking.consultantSpecialization && (
                            <span className="font-normal text-muted-foreground">
                              {" "}({booking.consultantSpecialization})
                            </span>
                          )}
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
                        <span className="text-muted-foreground">Appointment:</span>
                        <span className="font-medium">
                          {formatAppointmentSlot(booking.appointmentSlot)}
                        </span>
                      </div>
                    </div>

                    {booking.videoRoomId ? (
                      <Link href={`/video/${encodeURIComponent(booking.videoRoomId)}?returnTo=/user`}>
                        <Button
                          size="sm"
                          className="w-full gap-2"
                          data-testid={`button-join-call-${booking.id}`}
                        >
                          <Video className="h-4 w-4" />
                          Join Call
                        </Button>
                      </Link>
                    ) : (
                      <Button size="sm" className="w-full" disabled variant="outline">
                        No room assigned yet
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

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
                {readyReports.map((booking) => (
                  <div
                    key={booking.id}
                    className="rounded-xl border bg-card p-5 space-y-4 hover:border-green-500/30 transition-colors"
                    data-testid={`card-report-${booking.id}`}
                  >
                    <div className="flex items-start gap-3">
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

                    {booking.processedReportUrl ? (
                      <a
                        href={booking.processedReportUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        download
                      >
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
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
