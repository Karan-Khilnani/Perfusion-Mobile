import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { IndianRupee, TrendingUp, Clock, CheckCircle, FileText, Calendar } from "lucide-react";
import type { Booking } from "@shared/schema";

export default function ProviderBillingPage() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const queryParams = new URLSearchParams();
  if (startDate) queryParams.set("startDate", new Date(startDate).toISOString());
  if (endDate) queryParams.set("endDate", new Date(endDate).toISOString());

  const { data: bookings, isLoading } = useQuery<Booking[]>({
    queryKey: ["/api/billing/provider-earnings", startDate, endDate],
    queryFn: async () => {
      const res = await fetch(`/api/billing/provider-earnings?${queryParams.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const totalEarnings = bookings?.reduce((sum, b) => sum + parseFloat(b.basePrice || b.amount || "0"), 0) || 0;
  const paidEarnings = bookings?.filter(b => b.paymentStatus === "paid").reduce((sum, b) => sum + parseFloat(b.basePrice || b.amount || "0"), 0) || 0;
  const pendingEarnings = totalEarnings - paidEarnings;
  const totalBookings = bookings?.length || 0;

  const byType: Record<string, { count: number; earnings: number }> = {};
  bookings?.forEach(b => {
    if (!byType[b.bookingType]) byType[b.bookingType] = { count: 0, earnings: 0 };
    byType[b.bookingType].count++;
    byType[b.bookingType].earnings += parseFloat(b.basePrice || b.amount || "0");
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-provider-billing-title">Billing</h1>
        <p className="text-muted-foreground">Your earnings and payment status</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card data-testid="card-total-earnings">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-500/10 p-2"><IndianRupee className="h-5 w-5 text-blue-500" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Total Earnings</p>
                <p className="text-xl font-bold">₹{totalEarnings.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-paid-earnings">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-green-500/10 p-2"><CheckCircle className="h-5 w-5 text-green-500" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Paid</p>
                <p className="text-xl font-bold">₹{paidEarnings.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-pending-earnings">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-orange-500/10 p-2"><Clock className="h-5 w-5 text-orange-500" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-xl font-bold">₹{pendingEarnings.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-total-services">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-purple-500/10 p-2"><TrendingUp className="h-5 w-5 text-purple-500" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Services Delivered</p>
                <p className="text-xl font-bold">{totalBookings}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">From</label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" data-testid="input-provider-start-date" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">To</label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" data-testid="input-provider-end-date" />
            </div>
          </div>
        </CardContent>
      </Card>

      {Object.keys(byType).length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          {Object.entries(byType).map(([type, data]) => (
            <Card key={type} data-testid={`card-type-${type}`}>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground capitalize">{type}</div>
                <div className="text-lg font-bold">₹{data.earnings.toFixed(2)}</div>
                <div className="text-sm text-muted-foreground">{data.count} service{data.count !== 1 ? "s" : ""}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          {[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : !bookings?.length ? (
        <Card>
          <CardContent className="p-8 text-center">
            <FileText className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-2 text-muted-foreground">No earnings found for this period</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {bookings.map((booking) => (
            <Card key={booking.id} data-testid={`card-earning-${booking.id}`}>
              <CardContent className="p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{booking.serviceName}</span>
                      <Badge variant="outline" className="text-xs capitalize">{booking.bookingType}</Badge>
                      {booking.paymentStatus === "paid" ? (
                        <Badge className="bg-green-600">Settled</Badge>
                      ) : (
                        <Badge variant="outline">Pending Settlement</Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Patient: {booking.patientName}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <Calendar className="mr-1 inline h-3 w-3" />
                      {booking.createdAt ? new Date(booking.createdAt).toLocaleDateString() : "N/A"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-green-600">₹{parseFloat(booking.basePrice || booking.amount || "0").toFixed(2)}</div>
                    <div className="text-xs text-muted-foreground">Your earnings</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
