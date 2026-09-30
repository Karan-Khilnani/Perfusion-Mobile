import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  auditBookingAccessCopy,
  generateAdminBookingMessages,
  getAdminMessageAudience,
  type AdminBookingWithAccess,
} from "@/lib/admin-booking-messages";
import { format } from "date-fns";
import { Search, Plus, Edit, Eye, Filter, Stethoscope, FlaskConical, ScanLine, Download, Upload, File, Loader2, ShieldCheck, FileSignature, Clock, TimerReset, Phone, MessageSquare, Copy, Check, Share2 } from "lucide-react";
import type { Booking, Consultant, LabTest, RadiologyModality, BookingStatus } from "@shared/schema";

type BookingFilter = "all" | "consultation" | "lab" | "teleradiology";
type EmergencyCallbackDevice = {
  bookingId: string;
  deviceName: string;
  phoneNumber: string;
};

export default function AdminBookingsPage() {
  const { toast } = useToast();
  const [filter, setFilter] = useState<BookingFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createType, setCreateType] = useState<"consultation" | "lab" | "teleradiology">("consultation");
  
  // WhatsApp message state
  const [waMessageBooking, setWaMessageBooking] = useState<any | null>(null);
  const [copiedTab, setCopiedTab] = useState<string | null>(null);

  // Call logs state
  const [callLogsBookingId, setCallLogsBookingId] = useState<string | null>(null);
  const { data: callLogsData = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/bookings", callLogsBookingId, "call-logs"],
    queryFn: () =>
      apiRequest("GET", `/api/admin/bookings/${callLogsBookingId}/call-logs`).then((r) => r.json()),
    enabled: !!callLogsBookingId,
  });

  // Emergency device details are intentionally fetched only after an admin opens a booking's reveal dialog.
  const [emergencyDeviceBookingId, setEmergencyDeviceBookingId] = useState<string | null>(null);
  const emergencyDeviceQueryKey = ["/api/admin/bookings", emergencyDeviceBookingId, "callback-device"];
  const {
    data: emergencyDevice,
    isLoading: emergencyDeviceLoading,
    isError: emergencyDeviceIsError,
    error: emergencyDeviceError,
  } = useQuery<EmergencyCallbackDevice | null>({
    queryKey: emergencyDeviceQueryKey,
    queryFn: async () => {
      if (!emergencyDeviceBookingId) throw new Error("Select a consultation to reveal its emergency device.");
      const response = await fetch(`/api/admin/bookings/${encodeURIComponent(emergencyDeviceBookingId)}/callback-device`, {
        credentials: "include",
        cache: "no-store",
      });
      if (response.status === 403) {
        const error = new Error("Emergency device details are unavailable because this consultation is closed or access is denied.") as Error & { status: number };
        error.status = 403;
        throw error;
      }
      if (!response.ok) {
        const details = await response.json().catch(() => ({}));
        throw new Error(details.message || `Could not load emergency device (${response.status}).`);
      }
      return response.json() as Promise<EmergencyCallbackDevice | null>;
    },
    enabled: !!emergencyDeviceBookingId,
    retry: false,
    staleTime: 0,
  });

  const closeEmergencyDeviceDialog = () => {
    if (emergencyDeviceBookingId) {
      queryClient.removeQueries({
        queryKey: ["/api/admin/bookings", emergencyDeviceBookingId, "callback-device"],
        exact: true,
      });
    }
    setEmergencyDeviceBookingId(null);
  };

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

  async function copyToClipboard(text: string, tabKey: string) {
    try {
      if (!waMessageBooking) throw new Error("Booking is unavailable");
      const audience = getAdminMessageAudience(tabKey);
      if (audience) {
        await auditBookingAccessCopy(waMessageBooking.id, "all_bookings", audience);
      }
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
        if (!waMessageBooking) throw new Error("Booking is unavailable");
        const audience = getAdminMessageAudience(label);
        if (audience) {
          await auditBookingAccessCopy(waMessageBooking.id, "all_bookings", audience);
        }
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

  // Set callback phone state
  const [callbackPhoneBooking, setCallbackPhoneBooking] = useState<Booking | null>(null);
  const [callbackPhoneInput, setCallbackPhoneInput] = useState("+91");
  const setCallbackMutation = useMutation({
    mutationFn: ({ id, phone }: { id: string; phone: string }) =>
      apiRequest("PATCH", `/api/admin/bookings/${id}`, { callbackPhone: phone }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bookings"] });
      setCallbackPhoneBooking(null);
      setCallbackPhoneInput("+91");
      toast({ title: "Callback number saved", description: "The seeker's ward call-back number has been updated." });
    },
    onError: () => {
      toast({ title: "Save failed", description: "Could not update the callback number.", variant: "destructive" });
    },
  });

  // Extend call window state
  const [extendWindowBooking, setExtendWindowBooking] = useState<Booking | null>(null);
  const [extendDurationMinutes, setExtendDurationMinutes] = useState<number>(60);
  const [extendCustomMinutes, setExtendCustomMinutes] = useState("");
  const [extendUseCustom, setExtendUseCustom] = useState(false);

  // Report upload state
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [reportBooking, setReportBooking] = useState<Booking | null>(null);
  const [uploadMethod, setUploadMethod] = useState<"file" | "url">("file");
  const [reportUrl, setReportUrl] = useState("");
  const [reportNotes, setReportNotes] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: bookings = [], isLoading } = useQuery<AdminBookingWithAccess[]>({
    queryKey: ["/api/admin/bookings"],
  });

  const { data: consultants = [] } = useQuery<Consultant[]>({
    queryKey: ["/api/consultants"],
  });

  const { data: labTests = [] } = useQuery<LabTest[]>({
    queryKey: ["/api/lab-tests"],
  });

  const { data: modalities = [] } = useQuery<RadiologyModality[]>({
    queryKey: ["/api/radiology-modalities"],
  });

  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/users"],
  });

  const updateBookingMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Booking> }) => {
      const response = await apiRequest("PATCH", `/api/admin/bookings/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bookings"] });
      setSelectedBooking(null);
      toast({ title: "Booking Updated", description: "Booking has been updated successfully." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update booking.", variant: "destructive" });
    },
  });

  const extendCallWindowMutation = useMutation({
    mutationFn: async ({ id, durationMinutes }: { id: string; durationMinutes: number }) => {
      const response = await apiRequest("PATCH", `/api/bookings/${id}/call-window/extend`, { durationMinutes });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bookings"] });
      const until = data.extendedUntil
        ? new Date(data.extendedUntil).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true })
        : "";
      toast({ title: "Call Window Extended", description: `Window is now open until ${until} IST.` });
      setExtendWindowBooking(null);
      setExtendCustomMinutes("");
      setExtendUseCustom(false);
      setExtendDurationMinutes(60);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to extend call window.", variant: "destructive" });
    },
  });

  const bulkCompletestaleMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/bookings/bulk-complete-stale");
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bookings"] });
      toast({
        title: "Done",
        description: data.updated > 0
          ? `${data.updated} past booking${data.updated === 1 ? "" : "s"} marked as completed.`
          : "No stale bookings found — everything is already up to date.",
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to mark stale bookings.", variant: "destructive" });
    },
  });

  const createBookingMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/admin/bookings", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bookings"] });
      setShowCreateDialog(false);
      toast({ title: "Booking Created", description: "Booking has been created successfully." });
    },
    onError: (error) => {
      toast({
        title: "Booking could not be created",
        description: error instanceof Error ? error.message : "Please check the booking details and try again.",
        variant: "destructive",
      });
    },
  });

  const filteredBookings = bookings.filter((booking) => {
    const matchesFilter = filter === "all" || booking.bookingType === filter;
    const matchesSearch =
      !searchTerm ||
      booking.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      booking.serviceName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      booking.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (booking as any).bookingNumber?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const stats = {
    total: bookings.length,
    consultations: bookings.filter((b) => b.bookingType === "consultation").length,
    labs: bookings.filter((b) => b.bookingType === "lab").length,
    teleradiology: bookings.filter((b) => b.bookingType === "teleradiology").length,
    pending: bookings.filter((b) => b.status === "booked").length,
    completed: bookings.filter((b) => b.status === "completed").length,
    revenue: bookings.reduce((sum, b) => sum + parseFloat(b.amount), 0),
  };

  const getBookingIcon = (type: string) => {
    switch (type) {
      case "consultation": return <Stethoscope className="h-4 w-4" />;
      case "lab": return <FlaskConical className="h-4 w-4" />;
      case "teleradiology": return <ScanLine className="h-4 w-4" />;
      default: return null;
    }
  };

  const handleCreateBooking = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const userId = formData.get("userId") as string;
    const serviceId = formData.get("serviceId") as string;
    const patientName = formData.get("patientName") as string;
    const patientAge = parseInt(formData.get("patientAge") as string);
    const patientContact = formData.get("patientContact") as string;
    const clinicalSummary = createType === "consultation"
      ? (formData.get("clinicalSummary") as string)
      : undefined;

    let serviceName = "";
    let amount = "0";

    if (createType === "consultation") {
      const consultant = consultants.find((c) => c.id === serviceId);
      serviceName = consultant?.name || "";
      amount = consultant?.consultationFee || "0";
    } else if (createType === "lab") {
      const test = labTests.find((t) => t.id === serviceId);
      serviceName = test?.testName || "";
      amount = test?.cost || "0";
    } else {
      const modality = modalities.find((m) => m.id === serviceId);
      serviceName = modality?.name || "";
      amount = "500";
    }

    createBookingMutation.mutate({
      userId,
      bookingType: createType,
      serviceId,
      serviceName,
      patientName,
      patientAge,
      patientContact,
      ...(createType === "consultation" ? { clinicalSummary } : {}),
      amount,
      status: "booked",
      paymentStatus: "pending",
    });
  };

  const handleUpdateStatus = (id: string, status: BookingStatus) => {
    updateBookingMutation.mutate({ id, data: { status } });
  };

  const resetReportDialog = () => {
    setShowReportDialog(false);
    setReportBooking(null);
    setReportUrl("");
    setReportNotes("");
    setSelectedFile(null);
    setUploadMethod("file");
    setIsUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const openReportDialog = (booking: Booking) => {
    setReportBooking(booking);
    setShowReportDialog(true);
  };

  const handleUploadReport = async () => {
    if (!reportBooking) return;
    
    setIsUploading(true);
    try {
      let finalReportUrl = reportUrl;
      
      if (uploadMethod === "file" && selectedFile) {
        const formData = new FormData();
        formData.append("file", selectedFile);
        
        const response = await fetch("/api/upload/report", {
          method: "POST",
          body: formData,
          credentials: "include",
        });
        
        if (!response.ok) {
          throw new Error("Failed to upload file");
        }
        
        const data = await response.json();
        finalReportUrl = data.url;
      }
      
      if (!finalReportUrl) {
        toast({
          title: "Error",
          description: "Please select a file or enter a URL",
          variant: "destructive",
        });
        setIsUploading(false);
        return;
      }
      
      // Update booking with report URL and status
      updateBookingMutation.mutate({
        id: reportBooking.id,
        data: {
          status: "report_ready" as BookingStatus,
          reportUrl: finalReportUrl,
          reportNotes,
        },
      }, {
        onSuccess: () => {
          resetReportDialog();
        },
        onError: () => {
          setIsUploading(false);
        }
      });
    } catch (error) {
      toast({
        title: "Upload Failed",
        description: "Failed to upload the report file",
        variant: "destructive",
      });
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="page-admin-bookings">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">All Platform Activity</h1>
          <p className="text-muted-foreground">Monitor and manage all bookings across the platform</p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-booking">
              <Plus className="mr-2 h-4 w-4" />
              Create Booking
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create Booking for User</DialogTitle>
              <DialogDescription>Create a booking on behalf of a seeker</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateBooking} className="space-y-4">
              <div className="space-y-2">
                <Label>Booking Type</Label>
                <Select value={createType} onValueChange={(v) => setCreateType(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="consultation">Consultation</SelectItem>
                    <SelectItem value="lab">Lab Test</SelectItem>
                    <SelectItem value="teleradiology">Teleradiology</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Select User</Label>
                <Select name="userId" required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a user" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.firstName} {user.lastName} ({user.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Select Service</Label>
                <Select name="serviceId" required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a service" />
                  </SelectTrigger>
                  <SelectContent>
                    {createType === "consultation" &&
                      consultants.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} - ₹{c.consultationFee}
                        </SelectItem>
                      ))}
                    {createType === "lab" &&
                      labTests.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.testName} - ₹{t.cost}
                        </SelectItem>
                      ))}
                    {createType === "teleradiology" &&
                      modalities.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Patient Name</Label>
                <Input name="patientName" required placeholder="Full name" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Patient Age</Label>
                  <Input name="patientAge" type="number" required placeholder="Age" />
                </div>
                <div className="space-y-2">
                  <Label>Contact</Label>
                  <Input name="patientContact" placeholder="Phone" />
                </div>
              </div>
              {createType === "consultation" && (
                <div className="space-y-2">
                  <Label htmlFor="admin-clinical-summary">Clinical Summary / Reason for Consultation</Label>
                  <Textarea
                    id="admin-clinical-summary"
                    name="clinicalSummary"
                    required
                    minLength={10}
                    placeholder="Describe the patient's symptoms, current condition, and reason for consultation"
                  />
                  <p className="text-xs text-muted-foreground">
                    Required for the consultant to review before the appointment.
                  </p>
                </div>
              )}
              <DialogFooter>
                <Button type="submit" disabled={createBookingMutation.isPending}>
                  {createBookingMutation.isPending ? "Creating..." : "Create Booking"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-4 lg:grid-cols-7">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Bookings</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Consultations</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">{stats.consultations}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Lab Tests</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{stats.labs}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Teleradiology</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-purple-600">{stats.teleradiology}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">₹{stats.revenue.toFixed(0)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Bookings</CardTitle>
              <CardDescription>View and manage all platform activity</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-64 pl-9"
                  data-testid="input-search-bookings"
                />
              </div>
              <Select value={filter} onValueChange={(v) => setFilter(v as BookingFilter)}>
                <SelectTrigger className="w-40">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="consultation">Consultations</SelectItem>
                  <SelectItem value="lab">Lab Tests</SelectItem>
                  <SelectItem value="teleradiology">Teleradiology</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => bulkCompletestaleMutation.mutate()}
                disabled={bulkCompletestaleMutation.isPending}
                data-testid="button-bulk-complete-stale"
                title="Mark all past bookings (reminder already sent) as Completed"
              >
                {bulkCompletestaleMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <TimerReset className="mr-2 h-4 w-4" />
                )}
                Clear Past Bookings
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Loading...</div>
          ) : filteredBookings.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">No bookings found</div>
          ) : (
            <div className="space-y-3">
              {filteredBookings.map((booking) => (
                <div
                  key={booking.id}
                  className="flex items-center justify-between gap-4 rounded-lg border p-4"
                  data-testid={`booking-row-${booking.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                      {getBookingIcon(booking.bookingType)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{booking.serviceName}</p>
                        <Badge variant="outline" className="text-xs capitalize">
                          {booking.bookingType}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {booking.patientName} ({booking.patientAge} yrs) - ₹{booking.amount}
                      </p>
                      <p className="text-xs font-mono text-muted-foreground">
                        {(booking as any).bookingNumber || booking.id.substring(0, 12).toUpperCase()} • {booking.createdAt && format(new Date(booking.createdAt), "PPp")}
                      </p>
                      {booking.bookingType === "consultation" && (
                        <p className="text-xs text-muted-foreground">
                          {(booking as any).callbackPhone
                            ? <>Ward call-back: {(booking as any).callbackPhone}{(booking as any).callbackWardName ? ` (${(booking as any).callbackWardName})` : ""}</>
                            : <span className="text-amber-600 dark:text-amber-400">No ward call-back number set</span>
                          }
                        </p>
                      )}
                      {booking.bookingType === "consultation" && (booking as any).prescriptionApprovedAt && (
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                            <ShieldCheck className="h-3 w-3" />
                            Advisory Signed &amp; Locked
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date((booking as any).prescriptionApprovedAt), "PPp")}
                          </span>
                          {(booking as any).prescriptionApprovedByUserId && (
                            <span className="font-mono text-xs text-muted-foreground">
                              User: {((booking as any).prescriptionApprovedByUserId as string).substring(0, 8)}…
                            </span>
                          )}
                          {(booking as any).prescriptionApproverIp && (
                            <span className="font-mono text-xs text-muted-foreground">
                              IP: {(booking as any).prescriptionApproverIp}
                            </span>
                          )}
                        </div>
                      )}
                      {booking.bookingType === "consultation" && !(booking as any).prescriptionApprovedAt && (booking as any).prescriptionGeneratedAt && (
                        <div className="mt-1 flex items-center gap-1">
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                            <FileSignature className="h-3 w-3" />
                            Advisory Draft (unsigned)
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={booking.status} />
                    {booking.bookingType === "consultation" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setCallbackPhoneBooking(booking);
                            setCallbackPhoneInput((booking as any).callbackPhone || "+91");
                          }}
                          data-testid={`button-set-callback-${booking.id}`}
                        >
                          <Phone className="mr-1 h-3.5 w-3.5" />
                          {(booking as any).callbackPhone ? "Edit Ward Callback" : "Set Ward Callback"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEmergencyDeviceBookingId(booking.id)}
                          data-testid={`button-emergency-device-${booking.id}`}
                        >
                          <ShieldCheck className="mr-1 h-3.5 w-3.5" />
                          Emergency device
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setCallLogsBookingId(booking.id)}
                          data-testid={`button-call-logs-${booking.id}`}
                        >
                          <Phone className="mr-1 h-3.5 w-3.5" />
                          Call Logs
                        </Button>
                      </>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => downloadAdminReceipt(booking.id, "seeker", (booking as any).bookingNumber)}
                      data-testid={`button-seeker-receipt-${booking.id}`}
                    >
                      <Download className="mr-1 h-3.5 w-3.5" />
                      Patient Receipt
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => downloadAdminReceipt(booking.id, "provider", (booking as any).bookingNumber)}
                      data-testid={`button-provider-receipt-${booking.id}`}
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
                        data-testid={`button-wa-message-${booking.id}`}
                      >
                        <MessageSquare className="mr-1 h-3.5 w-3.5" />
                        WA Msg
                      </Button>
                    )}
                    {booking.bookingType === "consultation" && booking.videoRoomId && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setExtendWindowBooking(booking);
                          setExtendDurationMinutes(60);
                          setExtendCustomMinutes("");
                          setExtendUseCustom(false);
                        }}
                        data-testid={`button-extend-window-${booking.id}`}
                      >
                        <TimerReset className="mr-1 h-3.5 w-3.5" />
                        Extend Window
                      </Button>
                    )}
                    {booking.bookingType === "consultation" && (booking as any).prescriptionApprovedAt && (booking as any).prescriptionPdfUrl && (
                      <a href={(booking as any).prescriptionPdfUrl} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="outline" className="text-green-700 dark:text-green-400" data-testid={`button-view-signed-rx-${booking.id}`}>
                          <Download className="mr-1 h-3.5 w-3.5" />
                          Signed Advisory
                        </Button>
                      </a>
                    )}
                    {(booking.bookingType === "lab" || booking.bookingType === "teleradiology") && (
                      booking.reportUrl ? (
                        <a href={booking.reportUrl} target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="outline" className="text-green-600" data-testid={`button-view-report-${booking.id}`}>
                            <Download className="mr-1 h-3.5 w-3.5" />
                            View Report
                          </Button>
                        </a>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openReportDialog(booking)}
                          data-testid={`button-upload-report-${booking.id}`}
                        >
                          <Upload className="mr-1 h-3.5 w-3.5" />
                          Upload Report
                        </Button>
                      )
                    )}
                    <Select
                      value={booking.status}
                      onValueChange={(v) => handleUpdateStatus(booking.id, v as BookingStatus)}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="booked">Booked</SelectItem>
                        <SelectItem value="sample_collected">Sample Collected</SelectItem>
                        <SelectItem value="processing">Processing</SelectItem>
                        <SelectItem value="report_ready">Report Ready</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Extend Call Window Dialog */}
      <Dialog open={!!extendWindowBooking} onOpenChange={(open) => { if (!open) { setExtendWindowBooking(null); setExtendCustomMinutes(""); setExtendUseCustom(false); setExtendDurationMinutes(60); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TimerReset className="h-5 w-5 text-amber-600" />
              Extend Call Window
            </DialogTitle>
            <DialogDescription>
              Opens or re-opens the video call window for {extendWindowBooking?.patientName}'s {extendWindowBooking?.serviceName} booking.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium">How long should the window stay open?</Label>
              <div className="grid grid-cols-4 gap-2">
                {[30, 60, 120, 240].map((mins) => (
                  <Button
                    key={mins}
                    size="sm"
                    variant={!extendUseCustom && extendDurationMinutes === mins ? "default" : "outline"}
                    onClick={() => { setExtendDurationMinutes(mins); setExtendUseCustom(false); }}
                    data-testid={`button-extend-preset-${mins}`}
                  >
                    {mins < 60 ? `${mins}m` : `${mins / 60}h`}
                  </Button>
                ))}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Button
                  size="sm"
                  variant={extendUseCustom ? "default" : "outline"}
                  onClick={() => setExtendUseCustom(true)}
                  data-testid="button-extend-custom"
                >
                  Custom
                </Button>
                {extendUseCustom && (
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min="1"
                      max="480"
                      placeholder="minutes"
                      value={extendCustomMinutes}
                      onChange={(e) => setExtendCustomMinutes(e.target.value)}
                      className="w-28 h-8"
                      data-testid="input-extend-custom-minutes"
                    />
                    <span className="text-sm text-muted-foreground">min</span>
                  </div>
                )}
              </div>
            </div>
            {(() => {
              const dur = extendUseCustom ? parseInt(extendCustomMinutes || "0", 10) : extendDurationMinutes;
              if (dur > 0) {
                const until = new Date(Date.now() + dur * 60 * 1000).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true });
                return (
                  <p className="flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-400 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 px-3 py-2">
                    <Clock className="h-4 w-4 shrink-0" />
                    Window will be open until <strong>{until} IST</strong>
                  </p>
                );
              }
              return null;
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtendWindowBooking(null)} data-testid="button-extend-cancel">
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!extendWindowBooking) return;
                const dur = extendUseCustom ? parseInt(extendCustomMinutes || "0", 10) : extendDurationMinutes;
                if (!dur || dur <= 0) return;
                extendCallWindowMutation.mutate({ id: extendWindowBooking.id, durationMinutes: dur });
              }}
              disabled={extendCallWindowMutation.isPending || (extendUseCustom && (!parseInt(extendCustomMinutes || "0", 10) || parseInt(extendCustomMinutes || "0", 10) <= 0))}
              data-testid="button-extend-confirm"
            >
              {extendCallWindowMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TimerReset className="mr-2 h-4 w-4" />}
              Extend Window
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showReportDialog} onOpenChange={(open) => !open && resetReportDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Report</DialogTitle>
            <DialogDescription>
              Upload report for {reportBooking?.patientName}'s {reportBooking?.serviceName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button
                variant={uploadMethod === "file" ? "default" : "outline"}
                size="sm"
                onClick={() => setUploadMethod("file")}
                data-testid="button-upload-file-method"
              >
                <File className="mr-2 h-4 w-4" />
                Upload File
              </Button>
              <Button
                variant={uploadMethod === "url" ? "default" : "outline"}
                size="sm"
                onClick={() => setUploadMethod("url")}
                data-testid="button-upload-url-method"
              >
                <Download className="mr-2 h-4 w-4" />
                Enter URL
              </Button>
            </div>

            {uploadMethod === "file" ? (
              <div className="space-y-2">
                <Label>Select Report File</Label>
                <Input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.gif,.dcm"
                  onChange={handleFileSelect}
                  ref={fileInputRef}
                  data-testid="input-report-file"
                />
                {selectedFile && (
                  <p className="text-sm text-muted-foreground">
                    Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Accepted formats: PDF, JPEG, PNG, GIF, DICOM (max 50MB)
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Report URL</Label>
                <Input
                  placeholder="https://example.com/report.pdf"
                  value={reportUrl}
                  onChange={(e) => setReportUrl(e.target.value)}
                  data-testid="input-report-url"
                />
                <p className="text-xs text-muted-foreground">
                  Enter the URL where the report PDF is hosted
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="Any additional notes for the patient..."
                value={reportNotes}
                onChange={(e) => setReportNotes(e.target.value)}
                data-testid="input-report-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetReportDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleUploadReport}
              disabled={(uploadMethod === "file" ? !selectedFile : !reportUrl) || isUploading || updateBookingMutation.isPending}
              data-testid="button-submit-report"
            >
              {isUploading || updateBookingMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                "Upload Report"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Call Logs Dialog */}
      <Dialog open={!!callLogsBookingId} onOpenChange={(open) => { if (!open) setCallLogsBookingId(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-primary" />
              Call Logs
            </DialogTitle>
            <DialogDescription>
              Exotel bridge call history for this booking
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto space-y-2 py-1">
            {callLogsData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No calls logged for this booking</p>
            ) : (
              callLogsData.map((log: any) => (
                <div key={log.id} className="rounded-lg border px-4 py-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium capitalize">{log.caller_role === "seeker" ? "Seeker → Consultant" : "Consultant → Seeker"}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      log.status === "initiated" || log.status === "completed"
                        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                    }`}>
                      {log.status}
                    </span>
                  </div>
                  {(log.caller_phone_masked || log.callee_phone_masked) && (
                    <p className="text-xs text-muted-foreground">
                      {log.caller_phone_masked ?? "—"} → {log.callee_phone_masked ?? "—"}
                    </p>
                  )}
                  {log.duration_seconds != null && (
                    <p className="text-xs text-muted-foreground">Duration: {log.duration_seconds}s</p>
                  )}
                  {log.exotel_call_sid && (
                    <p className="text-xs font-mono text-muted-foreground">SID: {log.exotel_call_sid}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {log.created_at ? format(new Date(log.created_at), "PPp") : "—"}
                  </p>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Emergency device details are audited by the admin-only reveal endpoint. */}
      <Dialog open={!!emergencyDeviceBookingId} onOpenChange={(open) => { if (!open) closeEmergencyDeviceDialog(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              Emergency device
            </DialogTitle>
            <DialogDescription>
              Personal number for emergency use only. This number is separate from the Ward call-back number.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-20 py-2" aria-live="polite" data-testid="emergency-device-details">
            {emergencyDeviceLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />Loading emergency device…
              </div>
            ) : emergencyDeviceIsError ? (
              <p role="alert" className="text-sm text-destructive">
                {(emergencyDeviceError as (Error & { status?: number }) | null)?.status === 403
                  ? "Emergency device details are unavailable because this consultation is closed or access is denied."
                  : emergencyDeviceError?.message || "Could not load emergency device details. Please try again."}
              </p>
            ) : emergencyDevice ? (
              <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Assigned device</p>
                  <p className="font-medium" data-testid="text-emergency-device-name">{emergencyDevice.deviceName}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Personal number · emergency use only</p>
                  <p className="font-mono text-lg" data-testid="text-emergency-device-phone">{emergencyDevice.phoneNumber}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground" data-testid="text-emergency-device-unassigned">
                No emergency device is assigned to this consultation.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeEmergencyDeviceDialog} data-testid="button-close-emergency-device">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Set / Edit Callback Phone Dialog */}
      <Dialog open={!!callbackPhoneBooking} onOpenChange={(open) => { if (!open) { setCallbackPhoneBooking(null); setCallbackPhoneInput("+91"); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="h-4 w-4" />
              {callbackPhoneBooking && (callbackPhoneBooking as any).callbackPhone ? "Edit Call-back Number" : "Set Call-back Number"}
            </DialogTitle>
            <DialogDescription>
              The ward call-back number Exotel will ring first when a call is initiated for this consultation booking.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label htmlFor="callbackPhoneInput">Ward call-back phone number</Label>
              <PhoneInput
                id="callbackPhoneInput"
                value={callbackPhoneInput}
                onChange={(e) => setCallbackPhoneInput(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCallbackPhoneBooking(null); setCallbackPhoneInput("+91"); }}>
              Cancel
            </Button>
            <Button
              disabled={!/^\+91\d{10}$/.test(callbackPhoneInput) || setCallbackMutation.isPending}
              onClick={() => callbackPhoneBooking && setCallbackMutation.mutate({ id: callbackPhoneBooking.id, phone: callbackPhoneInput.trim() })}
            >
              {setCallbackMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* WhatsApp Message Dialog */}
      {waMessageBooking && (() => {
        const messages = generateAdminBookingMessages(waMessageBooking, users, window.location.origin);
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
