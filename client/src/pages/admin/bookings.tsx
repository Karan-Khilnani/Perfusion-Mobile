import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { Search, Plus, Edit, Eye, Filter, Stethoscope, FlaskConical, ScanLine, Download, Upload, File, Loader2, ShieldCheck, FileSignature } from "lucide-react";
import type { Booking, Consultant, LabTest, RadiologyModality, BookingStatus } from "@shared/schema";

type BookingFilter = "all" | "consultation" | "lab" | "teleradiology";

export default function AdminBookingsPage() {
  const { toast } = useToast();
  const [filter, setFilter] = useState<BookingFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createType, setCreateType] = useState<"consultation" | "lab" | "teleradiology">("consultation");
  
  // Report upload state
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [reportBooking, setReportBooking] = useState<Booking | null>(null);
  const [uploadMethod, setUploadMethod] = useState<"file" | "url">("file");
  const [reportUrl, setReportUrl] = useState("");
  const [reportNotes, setReportNotes] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: bookings = [], isLoading } = useQuery<Booking[]>({
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
    onError: () => {
      toast({ title: "Error", description: "Failed to create booking.", variant: "destructive" });
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
                      {booking.bookingType === "consultation" && (booking as any).prescriptionApprovedAt && (
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                            <ShieldCheck className="h-3 w-3" />
                            Rx Signed &amp; Locked
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date((booking as any).prescriptionApprovedAt), "PPp")}
                          </span>
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
                            Rx Draft (unsigned)
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={booking.status} />
                    {booking.bookingType === "consultation" && (booking as any).prescriptionApprovedAt && (booking as any).prescriptionPdfUrl && (
                      <a href={(booking as any).prescriptionPdfUrl} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="outline" className="text-green-700 dark:text-green-400" data-testid={`button-view-signed-rx-${booking.id}`}>
                          <Download className="mr-1 h-3.5 w-3.5" />
                          Signed Rx
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
    </div>
  );
}
