import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/status-badge";
import { BookingTimeline } from "@/components/booking-timeline";
import { ClipboardList, FlaskConical, Stethoscope, Calendar, IndianRupee, ChevronRight, Video, Scan, Download, FileText, Upload, Paperclip, X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Booking, BookingType } from "@shared/schema";
import { format } from "date-fns";

const typeIcons: Record<BookingType, typeof FlaskConical> = {
  lab: FlaskConical,
  consultation: Stethoscope,
  teleradiology: Scan,
};

const typeLabels: Record<BookingType, string> = {
  lab: "Lab Test",
  consultation: "Consultation",
  teleradiology: "Teleradiology",
};

async function uploadFile(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/upload/document", { method: "POST", body: formData, credentials: "include" });
  if (!res.ok) throw new Error("Upload failed");
  const data = await res.json();
  return data.url;
}

function validUrls(urls: string[] | null | undefined): string[] {
  return (urls || []).filter((u) => u && u !== "undefined" && u !== "null");
}

export default function OrdersPage() {
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [uploadBooking, setUploadBooking] = useState<Booking | null>(null);
  const [uploadCategory, setUploadCategory] = useState<"reports" | "charts">("reports");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const { toast } = useToast();

  const { data: bookings, isLoading } = useQuery<Booking[]>({
    queryKey: ["/api/bookings"],
  });

  const selectedBooking = bookings?.find(b => b.id === selectedBookingId) || null;

  const handleUploadFiles = async () => {
    if (!uploadBooking || pendingFiles.length === 0) return;
    setUploadingFiles(true);
    try {
      for (const file of pendingFiles) {
        const fileUrl = await uploadFile(file);
        if (uploadCategory === "reports") {
          await apiRequest("PATCH", `/api/bookings/${uploadBooking.id}/documents`, { documentUrl: fileUrl });
        } else {
          await apiRequest("PATCH", `/api/bookings/${uploadBooking.id}/treatment-charts`, { chartUrl: fileUrl });
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      setShowUploadDialog(false);
      setUploadBooking(null);
      setPendingFiles([]);
      toast({ title: "Uploaded", description: `${pendingFiles.length} file(s) uploaded as ${uploadCategory === "reports" ? "reports" : "treatment charts"}.` });
    } catch {
      toast({ title: "Upload Failed", description: "Failed to upload one or more files.", variant: "destructive" });
    } finally {
      setUploadingFiles(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setPendingFiles(prev => [...prev, ...files]);
  };

  const removeFile = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  };

  const labBookings = bookings?.filter((b) => b.bookingType === "lab") || [];
  const consultationBookings = bookings?.filter((b) => b.bookingType === "consultation") || [];
  const teleradiologyBookings = bookings?.filter((b) => b.bookingType === "teleradiology") || [];

  const BookingCard = ({ booking }: { booking: Booking }) => {
    const Icon = typeIcons[booking.bookingType as BookingType];
    
    return (
      <Card
        className={`cursor-pointer overflow-visible transition-all ${
          selectedBooking?.id === booking.id ? "ring-2 ring-primary" : ""
        }`}
        onClick={() => setSelectedBookingId(booking.id)}
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
                      <IndianRupee className="h-3 w-3" />
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
        <CardTitle className="flex items-center gap-2 flex-wrap">
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
          {parseFloat(booking.amount) > 0 && (
            <div className="flex justify-between border-b pb-2">
              <dt className="text-muted-foreground">Amount</dt>
              <dd className="font-semibold">₹{booking.amount}</dd>
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

        {booking.bookingType === "consultation" && booking.videoRoomId && !["completed", "cancelled"].includes(booking.status) && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-center gap-2 text-primary">
              <Video className="h-5 w-5" />
              <span className="font-medium">Video Consultation</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Join the video call at your scheduled appointment time
            </p>
            <Link href={`/video/${encodeURIComponent(booking.videoRoomId)}?returnTo=/user/orders`}>
              <Button className="mt-3" data-testid="button-join-video-call">
                <Video className="mr-2 h-4 w-4" />
                Join Video Call
              </Button>
            </Link>
          </div>
        )}

        {validUrls(booking.documentUrls).length > 0 && (
          <div className="rounded-lg border p-4">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <span className="font-medium">Uploaded Reports</span>
            </div>
            <div className="mt-3 space-y-2">
              {validUrls(booking.documentUrls).map((url, i) => (
                <a 
                  key={i} 
                  href={url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-primary hover:underline"
                  data-testid={`link-document-${i}`}
                >
                  <FileText className="h-4 w-4" />
                  Report {i + 1}
                </a>
              ))}
            </div>
          </div>
        )}

        {validUrls((booking as any).treatmentChartUrls).length > 0 && (
          <div className="rounded-lg border p-4">
            <div className="flex items-center gap-2">
              <Paperclip className="h-5 w-5 text-muted-foreground" />
              <span className="font-medium">Treatment Charts</span>
            </div>
            <div className="mt-3 space-y-2">
              {validUrls((booking as any).treatmentChartUrls).map((url, i) => (
                <a 
                  key={i} 
                  href={url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-primary hover:underline"
                  data-testid={`link-treatment-chart-${i}`}
                >
                  <FileText className="h-4 w-4" />
                  Treatment Chart {i + 1}
                </a>
              ))}
            </div>
          </div>
        )}

        {!["completed", "cancelled"].includes(booking.status) && (
          <div className="rounded-lg border p-4">
            <div className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-muted-foreground" />
              <span className="font-medium">Upload More Documents</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload additional reports or treatment charts
            </p>
            <div className="mt-3 flex gap-2 flex-wrap">
              <Button
                variant="outline"
                onClick={() => {
                  setUploadBooking(booking);
                  setUploadCategory("reports");
                  setPendingFiles([]);
                  setShowUploadDialog(true);
                }}
                data-testid="button-upload-reports"
              >
                <Upload className="mr-2 h-4 w-4" />
                Upload Reports
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setUploadBooking(booking);
                  setUploadCategory("charts");
                  setPendingFiles([]);
                  setShowUploadDialog(true);
                }}
                data-testid="button-upload-charts"
              >
                <Paperclip className="mr-2 h-4 w-4" />
                Upload Treatment Charts
              </Button>
            </div>
          </div>
        )}

        {(booking as any).prescriptionGeneratedAt && booking.bookingType === "consultation" && (
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
            <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
              <FileText className="h-5 w-5" />
              <span className="font-medium">Prescription Available</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Your prescription has been generated by the consultant
            </p>
            <div className="mt-3 space-y-3 rounded-md border bg-background p-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Diagnosis</p>
                <p className="text-sm">{(booking as any).prescriptionDiagnosis}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Medications</p>
                <p className="text-sm whitespace-pre-line">{(booking as any).prescriptionMedications}</p>
              </div>
              {(booking as any).prescriptionAdvice && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Advice</p>
                  <p className="text-sm">{(booking as any).prescriptionAdvice}</p>
                </div>
              )}
              {(booking as any).prescriptionFollowUp && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Follow-up</p>
                  <p className="text-sm">{(booking as any).prescriptionFollowUp}</p>
                </div>
              )}
            </div>
            <Button 
              className="mt-3" 
              variant="default" 
              onClick={() => {
                const prescriptionContent = `
PRESCRIPTION
============================================
Patient: ${booking.patientName}
Date: ${new Date((booking as any).prescriptionGeneratedAt).toLocaleDateString()}
Consultant: ${booking.serviceName}

DIAGNOSIS
---------
${(booking as any).prescriptionDiagnosis}

MEDICATIONS
-----------
${(booking as any).prescriptionMedications}

${(booking as any).prescriptionAdvice ? `ADVICE\n------\n${(booking as any).prescriptionAdvice}\n` : ''}
${(booking as any).prescriptionFollowUp ? `FOLLOW-UP\n---------\n${(booking as any).prescriptionFollowUp}\n` : ''}
============================================
`;
                const blob = new Blob([prescriptionContent], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `prescription_${booking.patientName}_${new Date().toISOString().split('T')[0]}.txt`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              data-testid="button-download-prescription"
            >
              <Download className="mr-2 h-4 w-4" />
              Download Prescription
            </Button>
          </div>
        )}

        {booking.reportUrl && (
          <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4">
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <FileText className="h-5 w-5" />
              <span className="font-medium">Report Available</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Your report is ready for download
            </p>
            {booking.reportNotes && (
              <p className="mt-2 text-sm italic text-muted-foreground">
                Provider notes: {booking.reportNotes}
              </p>
            )}
            <a href={booking.reportUrl} target="_blank" rel="noopener noreferrer">
              <Button className="mt-3" variant="default" data-testid="button-download-report">
                <Download className="mr-2 h-4 w-4" />
                Download Report
              </Button>
            </a>
          </div>
        )}

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
              <TabsTrigger value="teleradiology" data-testid="tab-teleradiology-orders">
                Radiology ({teleradiologyBookings.length})
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

            <TabsContent value="teleradiology" className="space-y-3">
              {teleradiologyBookings.length === 0 ? (
                <EmptyState type="Teleradiology" />
              ) : (
                teleradiologyBookings.map((booking) => (
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

      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload {uploadCategory === "reports" ? "Reports" : "Treatment Charts"}</DialogTitle>
            <DialogDescription>
              {uploadCategory === "reports" 
                ? "Upload patient reports, lab results, or medical records. You can select multiple files."
                : "Upload treatment records, nursing charts, or medication charts. You can select multiple files."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border-2 border-dashed border-muted-foreground/25 p-4">
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Select files to upload</p>
                <Input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  onChange={handleFileSelect}
                  multiple
                  className="max-w-xs"
                  data-testid="input-upload-files"
                />
              </div>
            </div>
            {pendingFiles.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">{pendingFiles.length} file(s) selected</p>
                {pendingFiles.map((file, i) => (
                  <div key={i} className="flex items-center justify-between rounded border p-2 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 shrink-0" />
                      <span className="truncate">{file.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">({(file.size / 1024).toFixed(0)} KB)</span>
                    </div>
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeFile(i)} data-testid={`button-remove-file-${i}`}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUploadDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUploadFiles}
              disabled={pendingFiles.length === 0 || uploadingFiles}
              data-testid="button-submit-upload"
            >
              {uploadingFiles ? "Uploading..." : `Upload ${pendingFiles.length} File(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
