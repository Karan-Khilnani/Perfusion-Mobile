import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ClipboardList, RefreshCw, Video, Upload, Stethoscope, FlaskConical, ScanLine, FileText, Download, Paperclip, FileSignature, Loader2, File } from "lucide-react";
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
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [reportUrl, setReportUrl] = useState("");
  const [reportNotes, setReportNotes] = useState("");
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [showDocsDialog, setShowDocsDialog] = useState(false);
  const [docsBooking, setDocsBooking] = useState<Booking | null>(null);
  const [showPrescriptionDialog, setShowPrescriptionDialog] = useState(false);
  const [prescriptionBooking, setPrescriptionBooking] = useState<Booking | null>(null);
  const [prescriptionDiagnosis, setPrescriptionDiagnosis] = useState("");
  const [prescriptionMedications, setPrescriptionMedications] = useState("");
  const [prescriptionAdvice, setPrescriptionAdvice] = useState("");
  const [prescriptionFollowUp, setPrescriptionFollowUp] = useState("");
  const [uploadMethod, setUploadMethod] = useState<"file" | "url">("file");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const uploadReportMutation = useMutation({
    mutationFn: async ({ id, reportUrl, reportNotes }: { id: string; reportUrl: string; reportNotes: string }) => {
      const response = await apiRequest("PATCH", `/api/bookings/${id}/status`, { 
        status: "report_ready",
        reportUrl,
        reportNotes 
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/bookings"] });
      resetReportDialog();
      toast({
        title: "Report Uploaded",
        description: "Report has been uploaded and is now available for the patient.",
      });
    },
    onError: () => {
      setIsUploading(false);
      toast({
        title: "Upload Failed",
        description: "Failed to upload report.",
        variant: "destructive",
      });
    },
  });

  const handleUploadReport = async () => {
    if (!selectedBooking) return;
    
    setIsUploading(true);
    try {
      let finalReportUrl = reportUrl;
      
      // If file upload method and file is selected, upload the file first
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
      
      uploadReportMutation.mutate({ 
        id: selectedBooking.id, 
        reportUrl: finalReportUrl,
        reportNotes 
      });
      // Note: resetReportDialog is called in mutation onSuccess
    } catch (error) {
      toast({
        title: "Upload Failed",
        description: "Failed to upload the report file",
        variant: "destructive",
      });
      setIsUploading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const resetReportDialog = () => {
    setShowReportDialog(false);
    setSelectedBooking(null);
    setReportUrl("");
    setReportNotes("");
    setSelectedFile(null);
    setUploadMethod("file");
    setIsUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const prescriptionMutation = useMutation({
    mutationFn: async ({ id, diagnosis, medications, advice, followUp }: { 
      id: string; 
      diagnosis: string; 
      medications: string; 
      advice: string; 
      followUp: string;
    }) => {
      const response = await apiRequest("PATCH", `/api/bookings/${id}/prescription`, { 
        diagnosis, 
        medications, 
        advice, 
        followUp 
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/bookings"] });
      setShowPrescriptionDialog(false);
      setPrescriptionBooking(null);
      setPrescriptionDiagnosis("");
      setPrescriptionMedications("");
      setPrescriptionAdvice("");
      setPrescriptionFollowUp("");
      toast({
        title: "Prescription Generated",
        description: "Prescription has been saved and is available for download.",
      });
    },
    onError: () => {
      toast({
        title: "Failed",
        description: "Failed to generate prescription.",
        variant: "destructive",
      });
    },
  });

  const openPrescriptionDialog = (booking: Booking) => {
    setPrescriptionBooking(booking);
    setPrescriptionDiagnosis((booking as any).prescriptionDiagnosis || "");
    setPrescriptionMedications((booking as any).prescriptionMedications || "");
    setPrescriptionAdvice((booking as any).prescriptionAdvice || "");
    setPrescriptionFollowUp((booking as any).prescriptionFollowUp || "");
    setShowPrescriptionDialog(true);
  };

  const handleSavePrescription = () => {
    if (!prescriptionBooking || !prescriptionDiagnosis || !prescriptionMedications) return;
    prescriptionMutation.mutate({
      id: prescriptionBooking.id,
      diagnosis: prescriptionDiagnosis,
      medications: prescriptionMedications,
      advice: prescriptionAdvice,
      followUp: prescriptionFollowUp,
    });
  };

  const getBookingIcon = (type: string) => {
    switch (type) {
      case "consultation": return <Stethoscope className="h-4 w-4" />;
      case "lab": return <FlaskConical className="h-4 w-4" />;
      case "teleradiology": return <ScanLine className="h-4 w-4" />;
      default: return null;
    }
  };

  const pendingBookings = bookings?.filter((b) => ["booked", "pending", "confirmed"].includes(b.status)) || [];
  const activeBookings = bookings?.filter((b) => ["sample_collected", "processing"].includes(b.status)) || [];
  const completedBookings = bookings?.filter((b) => ["report_ready", "completed", "cancelled"].includes(b.status)) || [];

  const BookingRow = ({ booking }: { booking: Booking }) => (
    <div
      className="flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
      data-testid={`booking-row-${booking.id}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
            {getBookingIcon(booking.bookingType)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-medium">{booking.serviceName}</p>
              <Badge variant="outline" className="text-xs capitalize">
                {booking.bookingType}
              </Badge>
              <StatusBadge status={booking.status} />
            </div>
          </div>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Patient: {booking.patientName} ({booking.patientAge} yrs)
        </p>
        {booking.accessionNumber && (
          <p className="text-sm text-muted-foreground">
            Accession #: {booking.accessionNumber}
          </p>
        )}
        {booking.provisionalDiagnosis && (
          <p className="text-sm text-muted-foreground">
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
          <Link href={`/video/${encodeURIComponent(booking.videoRoomId)}?returnTo=/provider/bookings`}>
            <Button size="sm" variant="outline" data-testid={`button-join-video-${booking.id}`}>
              <Video className="mr-2 h-3.5 w-3.5" />
              Join Call
            </Button>
          </Link>
        )}
        {booking.bookingType === "consultation" && (
          <Button
            size="sm"
            variant={(booking as any).prescriptionGeneratedAt ? "secondary" : "default"}
            onClick={() => openPrescriptionDialog(booking)}
            data-testid={`button-prescription-${booking.id}`}
          >
            <FileSignature className="mr-2 h-3.5 w-3.5" />
            {(booking as any).prescriptionGeneratedAt ? "Edit Prescription" : "Generate Prescription"}
          </Button>
        )}
        {(booking.bookingType === "lab" || booking.bookingType === "teleradiology") && !booking.reportUrl && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setSelectedBooking(booking);
              setShowReportDialog(true);
            }}
            data-testid={`button-upload-report-${booking.id}`}
          >
            <Upload className="mr-2 h-3.5 w-3.5" />
            Upload Report
          </Button>
        )}
        {booking.reportUrl && (
          <a href={booking.reportUrl} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="outline" className="text-green-600" data-testid={`button-view-report-${booking.id}`}>
              <Download className="mr-2 h-3.5 w-3.5" />
              View Report
            </Button>
          </a>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setDocsBooking(booking);
            setShowDocsDialog(true);
          }}
          data-testid={`button-view-docs-${booking.id}`}
        >
          <Paperclip className="mr-1 h-3.5 w-3.5" />
          {booking.documentUrls && booking.documentUrls.length > 0 
            ? `${booking.documentUrls.length} doc(s)` 
            : "Documents"}
        </Button>
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

      <Dialog open={showReportDialog} onOpenChange={(open) => !open && resetReportDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Report</DialogTitle>
            <DialogDescription>
              Upload the report for {selectedBooking?.patientName}'s {selectedBooking?.serviceName}
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
              disabled={(uploadMethod === "file" ? !selectedFile : !reportUrl) || isUploading || uploadReportMutation.isPending}
              data-testid="button-submit-report"
            >
              {isUploading || uploadReportMutation.isPending ? (
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

      <Dialog open={showDocsDialog} onOpenChange={setShowDocsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Patient Documents</DialogTitle>
            <DialogDescription>
              Documents uploaded by {docsBooking?.patientName} for this booking
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {docsBooking?.documentUrls?.map((url, i) => (
              <a 
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg border p-3 hover:bg-muted"
              >
                <FileText className="h-5 w-5 text-primary" />
                <div className="flex-1">
                  <p className="font-medium">Document {i + 1}</p>
                  <p className="text-xs text-muted-foreground truncate">{url}</p>
                </div>
                <Download className="h-4 w-4 text-muted-foreground" />
              </a>
            ))}
            {(!docsBooking?.documentUrls || docsBooking.documentUrls.length === 0) && (
              <p className="text-center text-muted-foreground py-4">No documents uploaded</p>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setShowDocsDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showPrescriptionDialog} onOpenChange={setShowPrescriptionDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {(prescriptionBooking as any)?.prescriptionGeneratedAt ? "Edit Prescription" : "Generate Prescription"}
            </DialogTitle>
            <DialogDescription>
              Prescription for {prescriptionBooking?.patientName} - {prescriptionBooking?.serviceName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              <Label>Diagnosis <span className="text-destructive">*</span></Label>
              <Textarea
                placeholder="Enter diagnosis details..."
                value={prescriptionDiagnosis}
                onChange={(e) => setPrescriptionDiagnosis(e.target.value)}
                rows={3}
                data-testid="input-prescription-diagnosis"
              />
            </div>
            <div className="space-y-2">
              <Label>Medications <span className="text-destructive">*</span></Label>
              <Textarea
                placeholder="List medications with dosage and frequency...&#10;e.g., Tab. Paracetamol 500mg - 1 tablet twice daily after meals for 5 days"
                value={prescriptionMedications}
                onChange={(e) => setPrescriptionMedications(e.target.value)}
                rows={5}
                data-testid="input-prescription-medications"
              />
            </div>
            <div className="space-y-2">
              <Label>Advice / Instructions</Label>
              <Textarea
                placeholder="Diet, lifestyle, precautions, etc..."
                value={prescriptionAdvice}
                onChange={(e) => setPrescriptionAdvice(e.target.value)}
                rows={3}
                data-testid="input-prescription-advice"
              />
            </div>
            <div className="space-y-2">
              <Label>Follow-up</Label>
              <Input
                placeholder="e.g., After 1 week, or if symptoms persist"
                value={prescriptionFollowUp}
                onChange={(e) => setPrescriptionFollowUp(e.target.value)}
                data-testid="input-prescription-followup"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPrescriptionDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSavePrescription}
              disabled={!prescriptionDiagnosis || !prescriptionMedications || prescriptionMutation.isPending}
              data-testid="button-save-prescription"
            >
              {prescriptionMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Prescription"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
