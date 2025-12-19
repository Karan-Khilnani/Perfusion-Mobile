import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/status-badge";
import { BookingTimeline } from "@/components/booking-timeline";
import { ClipboardList, FlaskConical, Stethoscope, HeartPulse, Calendar, DollarSign, ChevronRight } from "lucide-react";
import type { Booking, BookingType } from "@shared/schema";
import { format } from "date-fns";

const typeIcons: Record<BookingType, typeof FlaskConical> = {
  lab: FlaskConical,
  consultation: Stethoscope,
  critical_care: HeartPulse,
};

const typeLabels: Record<BookingType, string> = {
  lab: "Lab Test",
  consultation: "Consultation",
  critical_care: "Critical Care",
};

export default function OrdersPage() {
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

  const { data: bookings, isLoading } = useQuery<Booking[]>({
    queryKey: ["/api/bookings"],
  });

  const labBookings = bookings?.filter((b) => b.bookingType === "lab") || [];
  const consultationBookings = bookings?.filter((b) => b.bookingType === "consultation") || [];
  const criticalCareBookings = bookings?.filter((b) => b.bookingType === "critical_care") || [];

  const BookingCard = ({ booking }: { booking: Booking }) => {
    const Icon = typeIcons[booking.bookingType as BookingType];
    
    return (
      <Card
        className={`cursor-pointer overflow-visible transition-all ${
          selectedBooking?.id === booking.id ? "ring-2 ring-primary" : ""
        }`}
        onClick={() => setSelectedBooking(booking)}
        data-testid={`card-booking-${booking.id}`}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-medium leading-tight">{booking.serviceName}</h3>
                <p className="text-sm text-muted-foreground">{booking.providerName}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {format(new Date(booking.createdAt!), "MMM d, yyyy")}
                  </span>
                  {parseFloat(booking.amount) > 0 && (
                    <span className="flex items-center gap-1">
                      <DollarSign className="h-3 w-3" />
                      {booking.amount}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <StatusBadge status={booking.status} />
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const BookingDetails = ({ booking }: { booking: Booking }) => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {typeLabels[booking.bookingType as BookingType]} Details
          <StatusBadge status={booking.status} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <dl className="space-y-3">
          <div className="flex justify-between border-b pb-2">
            <dt className="text-muted-foreground">Booking ID</dt>
            <dd className="font-mono text-sm">{booking.id}</dd>
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
          {booking.orderingPhysician && (
            <div className="flex justify-between border-b pb-2">
              <dt className="text-muted-foreground">Ordering Physician</dt>
              <dd>{booking.orderingPhysician}</dd>
            </div>
          )}
          {parseFloat(booking.amount) > 0 && (
            <div className="flex justify-between border-b pb-2">
              <dt className="text-muted-foreground">Amount</dt>
              <dd className="font-semibold">${booking.amount}</dd>
            </div>
          )}
          <div className="flex justify-between border-b pb-2">
            <dt className="text-muted-foreground">Payment Status</dt>
            <dd className="capitalize">{booking.paymentStatus}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Created</dt>
            <dd>{format(new Date(booking.createdAt!), "PPpp")}</dd>
          </div>
        </dl>

        <div>
          <h4 className="mb-4 font-medium">Order Status</h4>
          <BookingTimeline status={booking.status} bookingType={booking.bookingType as BookingType} />
        </div>
      </CardContent>
    </Card>
  );

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
              <TabsTrigger value="critical" data-testid="tab-critical-orders">
                Critical ({criticalCareBookings.length})
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
                bookings.map((booking) => (
                  <BookingCard key={booking.id} booking={booking} />
                ))
              )}
            </TabsContent>

            <TabsContent value="lab" className="space-y-3">
              {labBookings.length === 0 ? (
                <EmptyState type="Lab" />
              ) : (
                labBookings.map((booking) => (
                  <BookingCard key={booking.id} booking={booking} />
                ))
              )}
            </TabsContent>

            <TabsContent value="consultation" className="space-y-3">
              {consultationBookings.length === 0 ? (
                <EmptyState type="Consultation" />
              ) : (
                consultationBookings.map((booking) => (
                  <BookingCard key={booking.id} booking={booking} />
                ))
              )}
            </TabsContent>

            <TabsContent value="critical" className="space-y-3">
              {criticalCareBookings.length === 0 ? (
                <EmptyState type="Critical Care" />
              ) : (
                criticalCareBookings.map((booking) => (
                  <BookingCard key={booking.id} booking={booking} />
                ))
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
    </div>
  );
}
