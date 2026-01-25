import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ClipboardList, RefreshCw, Video } from "lucide-react";
import { Link } from "wouter";
import type { Booking, BookingStatus } from "@shared/schema";
import { format } from "date-fns";

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

  const { data: bookings, isLoading, refetch } = useQuery<Booking[]>({
    queryKey: ["/api/provider/bookings"],
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

  const pendingBookings = bookings?.filter((b) => b.status === "booked") || [];
  const activeBookings = bookings?.filter((b) => ["sample_collected", "processing"].includes(b.status)) || [];
  const completedBookings = bookings?.filter((b) => ["report_ready", "completed", "cancelled"].includes(b.status)) || [];

  const BookingRow = ({ booking }: { booking: Booking }) => (
    <div
      className="flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
      data-testid={`booking-row-${booking.id}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="font-medium">{booking.serviceName}</p>
          <StatusBadge status={booking.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          Patient: {booking.patientName} ({booking.patientAge} yrs)
        </p>
        {booking.provisionalDiagnosis && (
          <p className="mt-1 text-sm text-muted-foreground">
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
        <span className="font-medium">₹{booking.amount}</span>
        {booking.bookingType === "consultation" && booking.videoRoomId && (
          <Link href={`/video/${booking.videoRoomId}?returnTo=/provider/bookings`}>
            <Button size="sm" variant="outline" data-testid={`button-join-video-${booking.id}`}>
              <Video className="mr-2 h-3.5 w-3.5" />
              Join Call
            </Button>
          </Link>
        )}
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
      </div>
    </div>
  );

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
                pendingBookings.map((booking) => (
                  <BookingRow key={booking.id} booking={booking} />
                ))
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
                activeBookings.map((booking) => (
                  <BookingRow key={booking.id} booking={booking} />
                ))
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
                completedBookings.map((booking) => (
                  <BookingRow key={booking.id} booking={booking} />
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
