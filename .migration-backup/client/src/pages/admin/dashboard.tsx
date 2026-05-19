import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Building, 
  Users, 
  Clock, 
  CheckCircle, 
  IndianRupee,
  Stethoscope,
  FlaskConical,
  ScanLine,
  CalendarDays,
  TrendingUp,
  ClipboardList,
  AlertCircle,
  XCircle
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { Link } from "wouter";
import type { Booking } from "@shared/schema";

interface AdminStats {
  overview: {
    totalBookings: number;
    totalProviders: number;
    totalUsers: number;
    totalRevenue: number;
    pendingRevenue: number;
  };
  byType: {
    consultation: number;
    lab: number;
    teleradiology: number;
  };
  byStatus: {
    pending: number;
    booked: number;
    confirmed: number;
    completed: number;
    cancelled: number;
  };
  services: {
    consultants: number;
    labTests: number;
    modalities: number;
  };
  recentBookings: Booking[];
}

export default function AdminDashboard() {
  const { data: stats, isLoading } = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  const getBookingTypeIcon = (type: string) => {
    switch (type) {
      case "consultation":
        return <Stethoscope className="h-4 w-4" />;
      case "lab":
        return <FlaskConical className="h-4 w-4" />;
      case "teleradiology":
        return <ScanLine className="h-4 w-4" />;
      default:
        return <ClipboardList className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-500";
      case "booked":
        return "bg-blue-500";
      case "confirmed":
        return "bg-green-500";
      case "completed":
        return "bg-emerald-600";
      case "cancelled":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  return (
    <div className="space-y-6" data-testid="page-admin-dashboard">
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-admin-title">Admin Dashboard</h1>
        <p className="text-muted-foreground" data-testid="text-admin-subtitle">
          Platform monitoring and analytics
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Bookings</CardTitle>
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-bookings">
              {stats?.overview.totalBookings || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats?.byStatus.completed || 0} completed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <IndianRupee className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600" data-testid="text-total-revenue">
              {(stats?.overview.totalRevenue || 0).toLocaleString("en-IN", { 
                style: "currency", 
                currency: "INR",
                maximumFractionDigits: 0
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {(stats?.overview.pendingRevenue || 0).toLocaleString("en-IN", { 
                style: "currency", 
                currency: "INR",
                maximumFractionDigits: 0
              })} pending
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-users">
              {stats?.overview.totalUsers || 0}
            </div>
            <p className="text-xs text-muted-foreground">Registered users</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Providers</CardTitle>
            <Building className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-providers">
              {stats?.overview.totalProviders || 0}
            </div>
            <p className="text-xs text-muted-foreground">Active providers</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Bookings by Service
            </CardTitle>
            <CardDescription>Distribution across services</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Stethoscope className="h-4 w-4 text-primary" />
                <span>Consultations</span>
              </div>
              <Badge variant="secondary">{stats?.byType.consultation || 0}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-blue-500" />
                <span>Lab Tests</span>
              </div>
              <Badge variant="secondary">{stats?.byType.lab || 0}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ScanLine className="h-4 w-4 text-purple-500" />
                <span>Teleradiology</span>
              </div>
              <Badge variant="secondary">{stats?.byType.teleradiology || 0}</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Booking Status
            </CardTitle>
            <CardDescription>Current status breakdown</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-yellow-500" />
                <span>Pending/Booked</span>
              </div>
              <Badge className="bg-yellow-500">
                {(stats?.byStatus.pending || 0) + (stats?.byStatus.booked || 0)}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span>Confirmed</span>
              </div>
              <Badge className="bg-green-500">{stats?.byStatus.confirmed || 0}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-emerald-600" />
                <span>Completed</span>
              </div>
              <Badge className="bg-emerald-600">{stats?.byStatus.completed || 0}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-500" />
                <span>Cancelled</span>
              </div>
              <Badge className="bg-red-500">{stats?.byStatus.cancelled || 0}</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Service Catalog
            </CardTitle>
            <CardDescription>Available services count</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span>Consultants</span>
              <Badge variant="outline">{stats?.services.consultants || 0}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>Lab Tests</span>
              <Badge variant="outline">{stats?.services.labTests || 0}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>Radiology Modalities</span>
              <Badge variant="outline">{stats?.services.modalities || 0}</Badge>
            </div>
            <div className="pt-2 text-center">
              <Link href="/admin/lab-tests" className="text-sm text-primary hover:underline">
                Manage Services
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Bookings</CardTitle>
          <CardDescription>Latest platform activity</CardDescription>
        </CardHeader>
        <CardContent>
          {stats?.recentBookings && stats.recentBookings.length > 0 ? (
            <div className="space-y-3">
              {stats.recentBookings.map((booking) => (
                <div 
                  key={booking.id} 
                  className="flex items-center justify-between rounded-lg border p-3"
                  data-testid={`booking-recent-${booking.id}`}
                >
                  <div className="flex items-center gap-3">
                    {getBookingTypeIcon(booking.bookingType)}
                    <div>
                      <p className="font-medium">{booking.serviceName}</p>
                      <p className="text-xs text-muted-foreground">
                        {booking.patientName} - {booking.createdAt ? format(new Date(booking.createdAt), "MMM d, yyyy") : "N/A"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-medium">
                      {parseFloat(booking.amount || "0").toLocaleString("en-IN", {
                        style: "currency",
                        currency: "INR",
                        maximumFractionDigits: 0
                      })}
                    </span>
                    <Badge className={getStatusColor(booking.status)}>
                      {booking.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              No bookings yet
            </div>
          )}
          <div className="mt-4 text-center">
            <Link href="/admin/bookings" className="text-sm text-primary hover:underline">
              View All Bookings
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
