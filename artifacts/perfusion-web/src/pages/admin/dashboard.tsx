import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
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
  XCircle,
  Download,
  MessageSquare,
  Copy,
  Check,
  Share2,
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
  const { toast } = useToast();
  const { data: stats, isLoading } = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
  });
  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/users"],
  });

  const [waMessageBooking, setWaMessageBooking] = useState<any | null>(null);
  const [copiedTab, setCopiedTab] = useState<string | null>(null);

  async function downloadAdminReceipt(bookingId: string, type: "seeker" | "provider", bookingNumber?: string) {
    try {
      const res = await fetch(`/api/bookings/${bookingId}/receipt?type=${type}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to generate receipt");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `receipt-${bookingNumber || bookingId.slice(0, 8)}-${type}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Download failed", description: "Could not generate receipt. Please try again.", variant: "destructive" });
    }
  }

  function generateWhatsAppMessages(booking: any): { label: string; message: string }[] {
    const bookingRef = booking.bookingNumber || booking.id.substring(0, 12).toUpperCase();
    const seeker = users.find((u: any) => u.id === booking.userId);
    const seekerHospital = seeker?.hospitalName || "Referring Hospital";
    const bookedOn = booking.createdAt ? format(new Date(booking.createdAt), "dd MMM yyyy, h:mm a") : "—";
    const portalUrl = window.location.origin;

    if (booking.bookingType === "consultation") {
      const slot = booking.appointmentSlot || "As scheduled";
      const videoLine = booking.videoRoomId
        ? `🎥 *Video Call:* Log in to ${portalUrl} and join from My Bookings`
        : "";

      const seekerMsg = [
        `*Consultation Booking Confirmed* ✅`,
        ``,
        `📋 *Booking Ref:* ${bookingRef}`,
        `👤 *Patient:* ${booking.patientName} (${booking.patientAge} yrs)`,
        `🩺 *Consultant:* ${booking.serviceName}`,
        booking.providerName ? `🏥 *Provider:* ${booking.providerName}` : "",
        `🕐 *Slot:* ${slot}`,
        videoLine,
        ``,
        `Please ensure the patient is ready at the scheduled time. Join the video call from the Perfusion portal at your appointment time.`,
        ``,
        `_Perfusion Healthcare Platform_`,
      ].filter(Boolean).join("\n");

      const consultantMsg = [
        `*Consultation Appointment* 📅`,
        ``,
        `📋 *Booking Ref:* ${bookingRef}`,
        `👤 *Patient:* ${booking.patientName} (${booking.patientAge} yrs)`,
        `🏥 *From:* ${seekerHospital}`,
        `🕐 *Slot:* ${slot}`,
        videoLine,
        ``,
        `Please log in to the Perfusion portal at ${portalUrl} to join the video call at the scheduled time.`,
        ``,
        `_Perfusion Healthcare Platform_`,
      ].filter(Boolean).join("\n");

      return [
        { label: "Seeker", message: seekerMsg },
        { label: "Consultant", message: consultantMsg },
      ];
    }

    if (booking.bookingType === "lab") {
      const urgencyBanner = booking.urgency === "emergency" ? `🚨 *URGENT / EMERGENCY*\n` : "";

      const seekerMsg = [
        `*Lab Test Booking Confirmed* 🔬`,
        ``,
        urgencyBanner,
        `📋 *Booking Ref:* ${bookingRef}`,
        `👤 *Patient:* ${booking.patientName} (${booking.patientAge} yrs)`,
        booking.patientContact ? `📞 *Patient Contact:* ${booking.patientContact}` : "",
        `🧪 *Test:* ${booking.serviceName}`,
        booking.providerName ? `🏥 *Processing Lab:* ${booking.providerName}` : "",
        `📅 *Booked On:* ${bookedOn}`,
        ``,
        `A sample collection agent will be in touch shortly. Please keep the patient ready as per the test requirements.`,
        ``,
        `_Perfusion Healthcare Platform_`,
      ].filter(Boolean).join("\n");

      const agentMsg = [
        `*Sample Pickup Assignment* 🚗`,
        ``,
        urgencyBanner,
        `📋 *Booking Ref:* ${bookingRef}`,
        `🧪 *Test:* ${booking.serviceName}`,
        `👤 *Patient:* ${booking.patientName} (${booking.patientAge} yrs)`,
        booking.patientContact ? `📞 *Patient Contact:* ${booking.patientContact}` : "",
        booking.callbackPhone
          ? `📞 *Ward Contact:* ${booking.callbackPhone}${booking.callbackWardName ? ` (${booking.callbackWardName})` : ""}`
          : "",
        `🏥 *Pickup From:* ${seekerHospital}`,
        booking.providerName ? `📦 *Deliver To:* ${booking.providerName}` : "",
        `📅 *Booked On:* ${bookedOn}`,
        ``,
        `Please collect the sample and deliver to the lab at the earliest. Handle with care.`,
        ``,
        `_Perfusion Healthcare Platform_`,
      ].filter(Boolean).join("\n");

      const labMsg = [
        `*Incoming Sample Alert* 🧪`,
        ``,
        urgencyBanner,
        `📋 *Booking Ref:* ${bookingRef}`,
        `🔬 *Test:* ${booking.serviceName}`,
        `👤 *Patient:* ${booking.patientName} (${booking.patientAge} yrs)`,
        `🏥 *From:* ${seekerHospital}`,
        `📅 *Booked On:* ${bookedOn}`,
        ``,
        `Sample is being dispatched. Please prepare for processing upon arrival.`,
        ``,
        `_Perfusion Healthcare Platform_`,
      ].filter(Boolean).join("\n");

      return [
        { label: "Seeker", message: seekerMsg },
        { label: "Delivery Agent", message: agentMsg },
        { label: "Lab Provider", message: labMsg },
      ];
    }

    return [];
  }

  async function copyToClipboard(text: string, tabKey: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedTab(tabKey);
      setTimeout(() => setCopiedTab(null), 2000);
    } catch {
      toast({ title: "Copy failed", description: "Could not copy to clipboard.", variant: "destructive" });
    }
  }

  async function shareMessage(text: string, label: string) {
    if (navigator.share) {
      try {
        await navigator.share({ text });
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          toast({ title: "Share failed", description: "Could not open share dialog.", variant: "destructive" });
        }
      }
    } else {
      await copyToClipboard(text, label);
    }
  }

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
                  className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                  data-testid={`booking-recent-${booking.id}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {getBookingTypeIcon(booking.bookingType)}
                    <div className="min-w-0">
                      <p className="font-medium truncate">{booking.serviceName}</p>
                      <p className="text-xs text-muted-foreground">
                        {booking.patientName} · {booking.createdAt ? format(new Date(booking.createdAt), "MMM d, yyyy") : "N/A"}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <span className="font-medium text-sm">
                      {parseFloat(booking.amount || "0").toLocaleString("en-IN", {
                        style: "currency",
                        currency: "INR",
                        maximumFractionDigits: 0
                      })}
                    </span>
                    <Badge className={getStatusColor(booking.status)}>
                      {booking.status}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => downloadAdminReceipt(booking.id, "seeker", (booking as any).bookingNumber)}
                      data-testid={`button-dash-seeker-receipt-${booking.id}`}
                      title="Download patient receipt"
                    >
                      <Download className="mr-1 h-3.5 w-3.5" />
                      Patient Receipt
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => downloadAdminReceipt(booking.id, "provider", (booking as any).bookingNumber)}
                      data-testid={`button-dash-provider-receipt-${booking.id}`}
                      title="Download partner receipt"
                    >
                      <Download className="mr-1 h-3.5 w-3.5" />
                      Partner Receipt
                    </Button>
                    {(booking.bookingType === "consultation" || booking.bookingType === "lab") && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-green-700 dark:text-green-400 border-green-200 dark:border-green-800 hover:bg-green-50 dark:hover:bg-green-950/20"
                        onClick={() => { setWaMessageBooking(booking); setCopiedTab(null); }}
                        data-testid={`button-dash-wa-message-${booking.id}`}
                      >
                        <MessageSquare className="mr-1 h-3.5 w-3.5" />
                        WA Msg
                      </Button>
                    )}
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

      {/* WhatsApp Message Dialog */}
      {waMessageBooking && (() => {
        const messages = generateWhatsAppMessages(waMessageBooking);
        const defaultTab = messages[0]?.label ?? "";
        return (
          <Dialog open={!!waMessageBooking} onOpenChange={(open) => { if (!open) { setWaMessageBooking(null); setCopiedTab(null); } }}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-green-600" />
                  WhatsApp Messages
                </DialogTitle>
                <DialogDescription>
                  {waMessageBooking.bookingType === "consultation" ? "2 messages" : "3 messages"} ready — share directly or copy to paste into WhatsApp.
                </DialogDescription>
              </DialogHeader>
              <Tabs defaultValue={defaultTab} className="w-full">
                <TabsList className={`grid w-full ${messages.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
                  {messages.map((m) => (
                    <TabsTrigger key={m.label} value={m.label}>{m.label}</TabsTrigger>
                  ))}
                </TabsList>
                {messages.map((m) => (
                  <TabsContent key={m.label} value={m.label} className="space-y-3 mt-3">
                    <Textarea
                      readOnly
                      value={m.message}
                      className="min-h-[260px] font-mono text-xs resize-none bg-muted/40"
                      onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                    />
                    <div className="flex gap-2">
                      <Button
                        className="flex-1"
                        onClick={() => shareMessage(m.message, m.label)}
                      >
                        <Share2 className="mr-2 h-4 w-4" />
                        Share
                      </Button>
                      <Button
                        className="flex-1"
                        variant={copiedTab === m.label ? "secondary" : "outline"}
                        onClick={() => copyToClipboard(m.message, m.label)}
                      >
                        {copiedTab === m.label ? (
                          <><Check className="mr-2 h-4 w-4 text-green-600" />Copied!</>
                        ) : (
                          <><Copy className="mr-2 h-4 w-4" />Copy</>
                        )}
                      </Button>
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            </DialogContent>
          </Dialog>
        );
      })()}
    </div>
  );
}
