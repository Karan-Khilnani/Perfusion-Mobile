import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useRazorpay } from "@/hooks/use-razorpay";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Check, CreditCard, Briefcase, Video, Upload, FileText, X, ChevronLeft, ChevronRight, CalendarDays, Clock, Phone } from "lucide-react";
import { useCreateCaseFileAttachment } from "@workspace/api-client-react";
import {
  getListCallbackDeviceRemindersQueryKey,
  getListConsultationDevicesQueryKey,
  useCreateConsultationDevice,
  useListConsultationDevices,
} from "@workspace/api-client-react";
import { getCallbackInstallationId } from "@/lib/callback-device";
import { useAuth } from "@/hooks/use-auth";
import type { Consultant, ConsultantSlotOverride, SlotSeries } from "@shared/schema";

const bookingSchema = z.object({
  appointmentSlot: z.string().optional(),
  patientName: z.string().min(2, "Patient name is required"),
  patientAge: z.coerce.number().min(1, "Age must be at least 1").max(150, "Invalid age"),
  patientGender: z.enum(["male", "female", "other"], { required_error: "Gender is required" }),
  contactNumber: z.string().regex(/^\+91\d{10}$/, "Enter a valid 10-digit mobile number"),
  callbackDeviceId: z.string().optional(),
  patientWeight: z.string().optional(),
  allergyNotSpecified: z.boolean().default(true),
  patientAllergies: z.string().optional(),
  comorbidities: z.string().optional(),
  uhidIpNumber: z.string().optional(),
  presentingComplaint: z.string().min(10, "Please describe the presenting complaint"),
  presentIllness: z.string().optional(),
  provisionalDiagnosis: z.string().optional(),
  orderingPhysician: z.string().optional(),
  examination: z.string().optional(),
  investigations: z.string().optional(),
});

const followUpBookingSchema = z.object({
  appointmentSlot: z.string().optional(),
  patientName: z.string().optional(),
  patientAge: z.coerce.number().optional(),
  patientGender: z.enum(["male", "female", "other"]).optional(),
  contactNumber: z.string().refine(
    (val) => !val || val === "+91" || /^\+91\d{10}$/.test(val),
    "Enter a valid 10-digit mobile number"
  ).optional(),
  callbackDeviceId: z.string().optional(),
  patientWeight: z.string().optional(),
  allergyNotSpecified: z.boolean().default(true),
  patientAllergies: z.string().optional(),
  comorbidities: z.string().optional(),
  uhidIpNumber: z.string().optional(),
  presentingComplaint: z.string().optional(),
  presentIllness: z.string().min(10, "Please describe the patient's current illness or follow-up status"),
  provisionalDiagnosis: z.string().optional(),
  orderingPhysician: z.string().optional(),
  examination: z.string().optional(),
  investigations: z.string().optional(),
});

type BookingFormData = z.infer<typeof bookingSchema>;

// ── Slot helpers ──────────────────────────────────────────────────────────────
const SLOT_DAY_ORDER: Record<string, number> = {
  Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
};
const IST_TIME_ZONE = "Asia/Kolkata";
const IST_DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getIstClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: IST_TIME_ZONE,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const year = Number(value("year"));
  const month = Number(value("month"));
  const day = Number(value("day"));
  return {
    year,
    month,
    day,
    weekday: value("weekday"),
    minutes: Number(value("hour")) * 60 + Number(value("minute")),
    date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}

function getIstWeekday(dateString: string): string {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return IST_DAYS_SHORT[date.getUTCDay()];
}

function parseTimeToMinutes(timeStr: string): number {
  const m = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return 0;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const ampm = m[3].toUpperCase();
  if (ampm === "PM" && h !== 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return h * 60 + min;
}

/** Sort "Mon 9:00 AM", "Tue 2:00 PM" … by weekday order then time. */
function sortLegacySlots(slots: string[]): string[] {
  return [...slots].sort((a, b) => {
    const [dayA, ...tA] = a.split(" ");
    const [dayB, ...tB] = b.split(" ");
    const dd = (SLOT_DAY_ORDER[dayA] ?? 99) - (SLOT_DAY_ORDER[dayB] ?? 99);
    if (dd !== 0) return dd;
    return parseTimeToMinutes(tA.join(" ")) - parseTimeToMinutes(tB.join(" "));
  });
}

/** Remove slots whose weekday matches today AND that have fewer than 15 minutes
 *  remaining. For range slots (e.g. "Mon 9:00 AM–1:00 PM") the end time is used;
 *  for start-time-only slots the start time is used (legacy fallback). */
function filterPastLegacySlots(slots: string[]): string[] {
  const now = getIstClock();
  const todayName = now.weekday;
  const nowMin = now.minutes;
  return slots.filter((slot) => {
    const [dayName, ...timeParts] = slot.split(" ");
    if (dayName !== todayName) return true;
    const timeStr = timeParts.join(" ");
    // Range format: "9:00 AM–1:00 PM" or "9:00 AM - 1:00 PM"
    const rangeParts = timeStr.split(/\s*[–\-]\s*/);
    if (rangeParts.length >= 2) {
      const endMins = parseTimeToMinutes(rangeParts[rangeParts.length - 1].trim());
      if (endMins > 0) return endMins - 15 > nowMin;
    }
    // Start-time-only: keep if start hasn't passed yet
    return parseTimeToMinutes(timeStr) > nowMin;
  });
}

/** When today is selected, remove time windows that have fewer than 15 minutes
 *  remaining before they end (i.e. bookable until 15 min before slot end).
 *  Always returns windows sorted earliest-first by `from` time. */
function filterPastTimeWindows(
  windows: { from: string; to: string }[],
  dateStr: string,
): { from: string; to: string }[] {
  const now = getIstClock();
  const filtered = dateStr === now.date
    ? windows.filter((w) => parseTimeToMinutes(w.to) - 15 > now.minutes)
    : windows;
  return [...filtered].sort((a, b) => parseTimeToMinutes(a.from) - parseTimeToMinutes(b.from));
}

export default function ConsultationBookingPage() {
  const { id } = useParams<{ id: string }>();
  const [location, navigate] = useLocation();
  const parentBookingId = new URLSearchParams(window.location.search).get("parentBookingId");
  const isFollowUpMode = !!parentBookingId;
  const { toast } = useToast();
  const { user } = useAuth();
  const [step, setStep] = useState<"details" | "clinical" | "payment" | "confirmation">("details");
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [videoRoomId, setVideoRoomId] = useState<string | null>(null);
  const [reportFiles, setReportFiles] = useState<File[]>([]);
  const [chartFiles, setChartFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [pendingBooking, setPendingBooking] = useState<any | null>(null);
  const [attachmentUploadError, setAttachmentUploadError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"pay_now" | "pay_later">("pay_later");
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = getIstClock();
    return new Date(now.year, now.month - 1, 1);
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const { openCheckout } = useRazorpay();
  const caseFileAttachmentMutation = useCreateCaseFileAttachment();
  const queryClient = useQueryClient();
  const [showCallbackDeviceForm, setShowCallbackDeviceForm] = useState(false);
  const [newCallbackDeviceName, setNewCallbackDeviceName] = useState("");
  const [newCallbackDeviceStaffName, setNewCallbackDeviceStaffName] = useState("");
  const [newCallbackDevicePhone, setNewCallbackDevicePhone] = useState("");
  const { data: callbackDevices, isLoading: callbackDevicesLoading, isError: callbackDevicesError, error: callbackDevicesErrorDetails } = useListConsultationDevices({
    query: {
      queryKey: [...getListConsultationDevicesQueryKey(), user?.id],
      refetchOnWindowFocus: true,
      refetchInterval: 60000,
      staleTime: 0,
    },
  });
  const createCallbackDevice = useCreateConsultationDevice();
  const eligibleCallbackDevices = useMemo(
    () => (callbackDevices ?? []).filter((device) => !!device.installationId?.trim() && !!device.staffName?.trim()),
    [callbackDevices],
  );

  const { data: consultant, isLoading } = useQuery<Consultant>({
    queryKey: ["/api/consultants", id],
    enabled: !!id,
  });

  const { data: emergencyTeam } = useQuery<any>({
    queryKey: ["/api/emergency-teams", id],
    enabled: !!id && !consultant && !isLoading,
  });

  // Derived slot mode helpers — all fields come directly from the Consultant type
  const consultantAvailableSlots: string[] = consultant?.availableSlots ?? [];
  const consultantSlotSeries: SlotSeries[] = (consultant?.slotSeries as SlotSeries[] | null | undefined) ?? [];
  const consultantAvailableDays: string[] = consultant?.availableDays ?? [];
  const consultantFrom: string = consultant?.availabilityFrom ?? "";
  const consultantTo: string = consultant?.availabilityTo ?? "";
  // Calendar mode: either new slotSeries array or legacy availableDays+from/to
  const isCalendarMode = !isLoading && !!consultant && consultantAvailableSlots.length === 0 &&
    (consultantSlotSeries.length > 0 || (consultantAvailableDays.length > 0 && !!consultantFrom));

  const { data: slotOverrides = [], isLoading: slotOverridesLoading } = useQuery<ConsultantSlotOverride[]>({
    queryKey: ["/api/consultants", id, "public-slot-overrides"],
    queryFn: async () => {
      const res = await fetch(`/api/consultants/${id}/public-slot-overrides`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!id && isCalendarMode,
  });

  const { data: allUserBookings = [] } = useQuery<any[]>({
    queryKey: ["/api/bookings"],
    enabled: isFollowUpMode,
  });
  const parentBooking = isFollowUpMode
    ? allUserBookings.find((b: any) => String(b.id) === String(parentBookingId))
    : null;

  // If overrides finish loading and the already-selected date turns out to be paused, clear it
  useEffect(() => {
    if (slotOverridesLoading || !selectedDate) return;
    const isPaused = slotOverrides.some(o => o.date === selectedDate && o.isPaused);
    if (isPaused) {
      setSelectedDate(null);
      form.setValue("appointmentSlot", "");
    }
  }, [slotOverrides, slotOverridesLoading]);

  const service = consultant || (emergencyTeam ? {
    ...emergencyTeam,
    name: `${emergencyTeam.department} Team`,
    specialization: emergencyTeam.department,
    yearsExperience: 0,
    availabilityFrom: null as string | null,
    availabilityTo: null as string | null,
  } : null);

  const isEmergencyTeam = !consultant && !!emergencyTeam;

  const form = useForm<BookingFormData>({
    resolver: zodResolver(isFollowUpMode ? followUpBookingSchema : bookingSchema),
    defaultValues: {
      appointmentSlot: "",
      patientName: "",
      patientAge: "" as unknown as number,
      patientGender: undefined,
      contactNumber: "+91",
      callbackDeviceId: "",
      patientWeight: "",
      allergyNotSpecified: true,
      patientAllergies: "",
      comorbidities: "",
      uhidIpNumber: "",
      presentingComplaint: "",
      presentIllness: "",
      provisionalDiagnosis: "",
      orderingPhysician: "",
      examination: "",
      investigations: "",
    },
  });

  useEffect(() => {
    if (callbackDevicesLoading) return;
    const selectedId = form.getValues("callbackDeviceId");
    if (selectedId && !eligibleCallbackDevices.some((device) => device.id === selectedId)) {
      form.setValue("callbackDeviceId", "", { shouldValidate: true });
    } else if (selectedId) {
      return;
    }
    const installationId = getCallbackInstallationId();
    const linked = eligibleCallbackDevices.filter((device) => device.installationId === installationId);
    form.setValue("callbackDeviceId", linked.length === 1 ? linked[0].id : "", { shouldValidate: true });
  }, [callbackDevicesLoading, eligibleCallbackDevices, form]);

  const addCallbackDevice = () => {
    if (!newCallbackDeviceStaffName.trim() || !newCallbackDeviceName.trim() || !newCallbackDevicePhone.trim()) {
      toast({ title: "Staff name, device name, and personal number are required", variant: "destructive" });
      return;
    }
    createCallbackDevice.mutate({
      data: {
        staffName: newCallbackDeviceStaffName.trim(),
        deviceName: newCallbackDeviceName.trim(),
        phoneNumber: newCallbackDevicePhone.trim(),
        installationId: getCallbackInstallationId(),
      },
    }, {
      onSuccess: (device) => {
        queryClient.invalidateQueries({ queryKey: getListConsultationDevicesQueryKey() });
        form.setValue("callbackDeviceId", device.id, { shouldValidate: true });
        setNewCallbackDeviceStaffName("");
        setNewCallbackDeviceName("");
        setNewCallbackDevicePhone("");
        setShowCallbackDeviceForm(false);
        toast({ title: "Callback device added" });
      },
      onError: (error) => toast({ title: "Could not add callback device", description: error.message, variant: "destructive" }),
    });
  };

  const callbackDevicePicker = (
    <FormField
      control={form.control}
      name="callbackDeviceId"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Consultation call-back device</FormLabel>
          <Select value={field.value || ""} onValueChange={field.onChange} disabled={callbackDevicesLoading}>
            <FormControl>
              <SelectTrigger data-testid="select-callback-device">
                <SelectValue placeholder={callbackDevicesLoading ? "Loading staff and devices…" : callbackDevicesError ? "Unable to load devices" : eligibleCallbackDevices.length ? "Select staff and device" : "No eligible staff devices"} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {eligibleCallbackDevices.map((device) => (
                <SelectItem key={device.id} value={device.id} data-testid={`option-callback-device-${device.id}`}>
                  {device.staffName!.trim()} · {device.deviceName}
                  {device.installationId === getCallbackInstallationId() ? " (this browser)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
          {callbackDevicesError && <p role="alert" className="text-sm text-destructive">Could not load callback devices. {callbackDevicesErrorDetails?.message}</p>}
          <p className="text-xs text-muted-foreground">Assign the staff member and registered installation responsible for this consultation. The contact number is separate from Ward Contacts.</p>
          {eligibleCallbackDevices.length === 0 && !showCallbackDeviceForm && (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowCallbackDeviceForm(true)} data-testid="button-add-booking-callback-device">Add a device here</Button>
              <Link href="/user/profile" className="text-sm text-primary underline">Manage devices in Profile</Link>
            </div>
          )}
          {showCallbackDeviceForm && (
            <div className="space-y-3 rounded-md border p-3">
              <p className="text-sm font-medium">Register staff callback device</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label htmlFor="booking-callback-device-staff-name">Staff name</Label><Input id="booking-callback-device-staff-name" value={newCallbackDeviceStaffName} onChange={(event) => setNewCallbackDeviceStaffName(event.target.value)} data-testid="input-booking-callback-device-staff-name" /></div>
                <div className="space-y-1"><Label htmlFor="booking-callback-device-name">Device name</Label><Input id="booking-callback-device-name" value={newCallbackDeviceName} onChange={(event) => setNewCallbackDeviceName(event.target.value)} data-testid="input-booking-callback-device-name" /></div>
                <div className="space-y-1"><Label htmlFor="booking-callback-device-phone">Personal number</Label><Input id="booking-callback-device-phone" type="tel" value={newCallbackDevicePhone} onChange={(event) => setNewCallbackDevicePhone(event.target.value)} data-testid="input-booking-callback-device-phone" /></div>
              </div>
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={addCallbackDevice} disabled={createCallbackDevice.isPending} data-testid="button-save-booking-callback-device">{createCallbackDevice.isPending ? "Adding…" : "Add and select"}</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setShowCallbackDeviceForm(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </FormItem>
      )}
    />
  );

  const handleReportFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setReportFiles(prev => [
      ...prev,
      ...files.filter((file) => !prev.some((existing) =>
        existing.name === file.name && existing.size === file.size && existing.lastModified === file.lastModified
      )),
    ]);
    e.target.value = "";
  };
  const removeReportFile = (index: number) => {
    setReportFiles(prev => prev.filter((_, i) => i !== index));
  };
  const handleChartFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setChartFiles(prev => [
      ...prev,
      ...files.filter((file) => !prev.some((existing) =>
        existing.name === file.name && existing.size === file.size && existing.lastModified === file.lastModified
      )),
    ]);
    e.target.value = "";
  };
  const removeChartFile = (index: number) => {
    setChartFiles(prev => prev.filter((_, i) => i !== index));
  };

  const finishBooking = (data: any) => {
    setBookingId(data.bookingNumber || data.id);
    queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
    queryClient.invalidateQueries({ queryKey: getListCallbackDeviceRemindersQueryKey() });
    if (data.videoRoomId) {
      setVideoRoomId(data.videoRoomId);
    }

    if (paymentMethod === "pay_now") {
      const fee = parseFloat(data.amount || (service as any)?.computedCustomerPrice || service?.consultationFee || "0");
      openCheckout({
        amount: fee,
        bookingId: data.id,
        description: `Consultation: ${data.serviceName}`,
        prefill: { name: form.getValues("patientName"), contact: form.getValues("contactNumber") },
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
          queryClient.invalidateQueries({ queryKey: ["/api/user/dashboard"] });
          queryClient.invalidateQueries({ queryKey: ["/api/billing/my-invoices"] });
          setStep("confirmation");
          toast({ title: "Payment Successful", description: "Your consultation has been booked and paid." });
        },
        onError: (msg) => {
          setStep("confirmation");
          toast({ title: "Payment Pending", description: msg || "You can pay later from the billing page.", variant: "destructive" });
        },
      });
    } else {
      setStep("confirmation");
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/dashboard"] });
      toast({ title: "Appointment Confirmed", description: "Your consultation has been booked successfully." });
    }
  };

  const attachBookingDocuments = async (booking: any) => {
    if (!booking?.id) {
      setAttachmentUploadError("The booking was created, but its Case File could not be identified. Contact support before retrying.");
      return;
    }
    setUploading(true);
    setAttachmentUploadError(null);
    try {
      for (const file of reportFiles) {
        await caseFileAttachmentMutation.mutateAsync({
          bookingId: booking.id,
          data: { file, source: "document", category: "general" },
        });
      }
      for (const file of chartFiles) {
        await caseFileAttachmentMutation.mutateAsync({
          bookingId: booking.id,
          data: { file, source: "document", category: "treatment_chart" },
        });
      }
      setPendingBooking(null);
      setAttachmentUploadError(null);
      finishBooking(booking);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Please try uploading the selected files again.";
      setAttachmentUploadError(reason);
      toast({
        title: "Booking created, but document upload needs a retry",
        description: reason,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const bookingMutation = useMutation({
    mutationFn: async (data: BookingFormData) => {
      if (!service) throw new Error("Service not found");
      const response = await apiRequest("POST", "/api/bookings", {
        bookingType: "consultation",
        serviceId: service.id,
        serviceName: isEmergencyTeam ? `${emergencyTeam.department} Team` : service.name,
        providerName: isEmergencyTeam ? emergencyTeam.qualification : service.qualification,
        ...(isFollowUpMode && parentBookingId ? { isFollowUp: true, parentBookingId } : {}),
        // Patient fields only sent for new (non-follow-up) bookings; server copies them from parent for follow-ups
        ...(!isFollowUpMode ? {
          patientName: data.patientName,
          patientAge: data.patientAge,
          patientGender: data.patientGender,
          patientContact: data.contactNumber,
          patientWeight: data.patientWeight || null,
          patientAllergies: data.allergyNotSpecified ? null : (data.patientAllergies || null),
          patientAllergyNotSpecified: data.allergyNotSpecified,
          uhidIpNumber: data.uhidIpNumber || null,
        } : {}),
        comorbidities: data.comorbidities || null,
        presentingComplaint: data.presentingComplaint || null,
        presentIllness: data.presentIllness || null,
        provisionalDiagnosis: data.provisionalDiagnosis || null,
        referringPhysician: data.orderingPhysician || null,
        examination: data.examination || null,
        investigations: data.investigations || null,
        appointmentSlot: isEmergencyTeam ? "Emergency - Immediate" : data.appointmentSlot,
        amount: (service as any).computedCustomerPrice || service.consultationFee,
        urgency: isEmergencyTeam ? "emergency" : "routine",
        status: "booked",
        paymentStatus: "pending",
        paymentMethod: paymentMethod,
        callbackDeviceId: data.callbackDeviceId,
      });
      return response.json();
    },
    onSuccess: (data) => {
      setPendingBooking(data);
      if (reportFiles.length || chartFiles.length) void attachBookingDocuments(data);
      else {
        setPendingBooking(null);
        finishBooking(data);
      }
    },
    onError: (error: any) => {
      const message = error?.message || "Something went wrong. Please try again.";
      toast({
        title: "Booking Failed",
        description: message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: BookingFormData) => {
    if (step === "details") {
      setStep("clinical");
    } else if (step === "clinical") {
      setStep("payment");
    } else if (step === "payment") {
      if (pendingBooking) void attachBookingDocuments(pendingBooking);
      else bookingMutation.mutate(data);
    }
  };

  const validateCurrentStep = async () => {
    if (step === "details") {
      const fields: (keyof BookingFormData)[] = ["patientName", "patientAge", "patientGender", "contactNumber", "callbackDeviceId"];
      const formValid = await form.trigger(fields);
      const selectedDeviceId = form.getValues("callbackDeviceId");
      if (!selectedDeviceId || !eligibleCallbackDevices.some((device) => device.id === selectedDeviceId)) {
        form.setError("callbackDeviceId", { message: "Choose an eligible staff and call-back device pair" });
        return false;
      }

      // appointmentSlot is z.string().optional() in the schema so trigger() alone
      // never rejects it — enforce manually when the consultant has slots to pick from.
      if (!isEmergencyTeam) {
        const slotRequired = consultantAvailableSlots.length > 0 || isCalendarMode;
        const slot = form.getValues("appointmentSlot");
        if (slotRequired && (!slot || slot.trim() === "")) {
          form.setError("appointmentSlot", { message: "Please select an appointment slot" });
          return false;
        }
      }

      return formValid;
    } else if (step === "clinical") {
      return form.trigger(["presentingComplaint"]);
    }
    return Promise.resolve(true);
  };

  const handleNext = async () => {
    const isValid = await validateCurrentStep();
    if (isValid) {
      if (step === "details") {
        setStep("clinical");
      } else if (step === "clinical") {
        setStep("payment");
      }
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-3/4" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!service) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">Service not found</p>
          <Link href="/user/consultation">
            <Button variant="outline" className="mt-4">
              Back to Consultations
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (consultant && consultant.status !== "active") {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <h2 className="text-xl font-semibold">Consultant unavailable</h2>
          <p className="mt-2 text-muted-foreground">
            This consultant is not accepting new consultations right now.
          </p>
          <Link href="/user/consultation">
            <Button variant="outline" className="mt-4">
              Back to Consultants
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (step === "confirmation") {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Card>
          <CardContent className="py-12 text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <Check className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="mb-2 text-2xl font-semibold">Appointment Confirmed!</h2>
            <p className="mb-6 text-muted-foreground">
              Your video consultation has been scheduled successfully.
            </p>

            <div className="mb-8 rounded-lg border bg-muted/30 p-6 text-left">
              <h3 className="mb-4 font-semibold">Appointment Details</h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Booking ID</dt>
                  <dd className="font-mono">{bookingId}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{isEmergencyTeam ? "Emergency Team" : "Consultant"}</dt>
                  <dd>{service.name}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{isEmergencyTeam ? "Department" : "Specialization"}</dt>
                  <dd>{service.specialization}</dd>
                </div>
                {!isEmergencyTeam && form.getValues("appointmentSlot") && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Time Slot</dt>
                  <dd>{form.getValues("appointmentSlot")}</dd>
                </div>
                )}
                {isEmergencyTeam && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Type</dt>
                  <dd className="text-red-600 font-medium">Emergency</dd>
                </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Patient</dt>
                  <dd>{form.getValues("patientName")}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd className="text-green-600 dark:text-green-400">Confirmed</dd>
                </div>
              </dl>
            </div>

            {videoRoomId && (
              <div className="mb-6 rounded-lg border border-primary/20 bg-primary/5 p-4">
                <div className="flex items-center justify-center gap-2 text-primary">
                  <Video className="h-5 w-5" />
                  <span className="font-medium">Video Consultation Ready</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Join the video call at your scheduled appointment time
                </p>
                <Link href={`/video/${encodeURIComponent(videoRoomId)}?returnTo=/user/orders`}>
                  <Button
                    className="mt-3"
                    data-testid="button-join-video"
                  >
                    <Video className="mr-2 h-4 w-4" />
                    Join Video Call
                  </Button>
                </Link>
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Link href="/user/orders">
                <Button data-testid="button-view-appointment">View Appointment</Button>
              </Link>
              <Link href="/user/consultation">
                <Button variant="outline">Book Another Consultation</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Follow-Up Mode: single-page simplified form ──────────────────────────
  if (isFollowUpMode) {
    const hasSlots = !isEmergencyTeam && (consultantAvailableSlots.length > 0 || isCalendarMode);

    const handleFollowUpSubmit = async () => {
      const isValid = await form.trigger(["presentIllness", ...(hasSlots ? ["appointmentSlot" as const] : [])]);
      if (!isValid) return;
      const selectedDeviceId = form.getValues("callbackDeviceId");
      if (!selectedDeviceId || !eligibleCallbackDevices.some((device) => device.id === selectedDeviceId)) {
        form.setError("callbackDeviceId", { message: "Choose an eligible staff and call-back device pair" });
        return;
      }
      if (pendingBooking) void attachBookingDocuments(pendingBooking);
      else bookingMutation.mutate(form.getValues());
    };

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/user/orders")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Book Follow-Up</h1>
            <p className="text-muted-foreground">{service.name}</p>
          </div>
        </div>

        {/* Consultant info */}
        <div className="mx-auto max-w-2xl space-y-4">
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold">{service.name}</h3>
                  <p className="text-sm text-muted-foreground">{service.qualification}</p>
                  {service.specialization && (
                    <Badge variant="secondary" className="mt-2">{service.specialization}</Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Patient summary (read-only from parent booking) */}
          {parentBooking && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Patient</CardTitle>
                <CardDescription>Details carried from original booking</CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Name</dt>
                    <dd className="font-medium">{parentBooking.patientName}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Age / Gender</dt>
                    <dd className="font-medium">{parentBooking.patientAge}y / {parentBooking.patientGender}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Contact</dt>
                    <dd className="font-medium">{parentBooking.patientContact}</dd>
                  </div>
                  {parentBooking.uhidIpNumber && (
                    <div>
                      <dt className="text-muted-foreground">UHID / IP</dt>
                      <dd className="font-medium">{parentBooking.uhidIpNumber}</dd>
                    </div>
                  )}
                </dl>
              </CardContent>
            </Card>
          )}

          <Form {...form}>
            <form className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Follow-Up Details</CardTitle>
                  <CardDescription>Provide the patient's current status and any updated documents</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {callbackDevicePicker}

                  {/* Slot picker — reuse existing FormField logic */}
                  {hasSlots && (
                    <FormField
                      control={form.control}
                      name="appointmentSlot"
                      render={({ field }) => {
                        if (consultantAvailableSlots.length > 0) {
                          const visibleSlots = filterPastLegacySlots(sortLegacySlots(consultantAvailableSlots));
                          return (
                            <FormItem>
                              <FormLabel>Appointment Slot</FormLabel>
                              <Select value={field.value || ""} onValueChange={field.onChange}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-appointment-slot">
                                    <SelectValue placeholder={visibleSlots.length === 0 ? "No slots available" : "Select a slot"} />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {visibleSlots.map((slot, i) => (
                                    <SelectItem key={i} value={slot} data-testid={`option-slot-${i}`}>
                                      {slot}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          );
                        }
                        if (!isCalendarMode) return <FormItem />;

                        const calYear = calendarMonth.getFullYear();
                        const calMonthNum = calendarMonth.getMonth();
                        const firstDow = new Date(calYear, calMonthNum, 1).getDay();
                        const daysInMonth = new Date(calYear, calMonthNum + 1, 0).getDate();
                        const cells: (number | null)[] = Array(firstDow).fill(null);
                        for (let d = 1; d <= daysInMonth; d++) cells.push(d);
                        const istTodayDate = getIstClock().date;
                        const toDateStr = (day: number) => {
                          const m = String(calMonthNum + 1).padStart(2, "0");
                          return `${calYear}-${m}-${String(day).padStart(2, "0")}`;
                        };
                        const getOverride = (dateStr: string): ConsultantSlotOverride | undefined =>
                          slotOverrides.find(o => o.date === dateStr);
                        const isDaySelectable = (day: number) => {
                          if (slotOverridesLoading) return false;
                          const dateString = toDateStr(day);
                          if (dateString < istTodayDate) return false;
                          const dayName = getIstWeekday(dateString);
                          const coveredBySchedule = consultantSlotSeries.length > 0
                            ? consultantSlotSeries.some(s => s.days.includes(dayName))
                            : consultantAvailableDays.includes(dayName);
                          if (!coveredBySchedule) return false;
                          const override = getOverride(toDateStr(day));
                          if (override?.isPaused) return false;
                          return true;
                        };
                        const formatDateLabel = (dateStr: string) => {
                          const d = new Date(dateStr + "T12:00:00Z");
                          return new Intl.DateTimeFormat("en-IN", {
                            timeZone: IST_TIME_ZONE,
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          }).format(d);
                        };
                        const getTimeWindowsForDate = (dateStr: string): { from: string; to: string }[] => {
                          const ov = getOverride(dateStr);
                          if (ov && !ov.isPaused) return [{ from: ov.customFrom || consultantFrom, to: ov.customTo || consultantTo }];
                          if (consultantSlotSeries.length > 0) {
                            const dayName = getIstWeekday(dateStr);
                            return consultantSlotSeries.filter(s => s.days.includes(dayName)).map(s => ({ from: s.from, to: s.to }));
                          }
                          return [{ from: consultantFrom, to: consultantTo }];
                        };
                        return (
                          <FormItem>
                            <FormLabel className="flex items-center gap-2">
                              <CalendarDays className="h-4 w-4" />
                              Select Appointment Date
                            </FormLabel>
                            <div className="rounded-lg border bg-background p-3 space-y-2 mt-1">
                              <div className="flex items-center justify-between">
                                <button type="button" data-testid="btn-cal-prev-month" onClick={() => setCalendarMonth(prev => { const d = new Date(prev); d.setMonth(d.getMonth() - 1); return d; })} className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                                  <ChevronLeft className="h-4 w-4" />
                                </button>
                                <span className="text-sm font-medium">{calendarMonth.toLocaleString("default", { month: "long", year: "numeric" })}</span>
                                <button type="button" data-testid="btn-cal-next-month" onClick={() => setCalendarMonth(prev => { const d = new Date(prev); d.setMonth(d.getMonth() + 1); return d; })} className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                                  <ChevronRight className="h-4 w-4" />
                                </button>
                              </div>
                              <div className="grid grid-cols-7 gap-1 text-center">
                                {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(h => (
                                  <div key={h} className="text-xs font-medium text-muted-foreground py-1">{h}</div>
                                ))}
                                {cells.map((day, idx) => {
                                  if (!day) return <div key={`e-${idx}`} />;
                                  const dateStr = toDateStr(day);
                                  const selectable = isDaySelectable(day);
                                  const isSelected = selectedDate === dateStr;
                          const isToday = toDateStr(day) === istTodayDate;
                                  return (
                                    <button key={dateStr} type="button" data-testid={`cal-date-${dateStr}`} disabled={!selectable}
                                      onClick={() => { setSelectedDate(dateStr); field.onChange(""); }}
                                      className={["h-9 w-full rounded-md text-sm font-medium transition-colors select-none",
                                        !selectable ? "text-muted-foreground/40 cursor-not-allowed" : isSelected ? "bg-primary text-primary-foreground" : "hover:bg-primary/10 hover:text-primary cursor-pointer",
                                        isToday && !isSelected ? "border-2 border-primary" : "border border-transparent",
                                      ].join(" ")}
                                    >{day}</button>
                                  );
                                })}
                              </div>
                              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground pt-1 border-t">
                                <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-primary" />Selected</span>
                                <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded border-2 border-primary" />Today</span>
                                <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-muted" />Unavailable</span>
                              </div>
                            </div>
                            {selectedDate && !getOverride(selectedDate)?.isPaused && (
                              <div className="space-y-2 pt-1">
                                <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                                  <Clock className="h-3.5 w-3.5" />
                                  Available slots on <span className="font-medium text-foreground">{formatDateLabel(selectedDate)}</span>
                                </p>
                                {(() => {
                                  const windows = filterPastTimeWindows(getTimeWindowsForDate(selectedDate), selectedDate);
                                  if (windows.length === 0) {
                                    return <p className="text-sm text-muted-foreground">No slots available for today — all windows have passed.</p>;
                                  }
                                  return (
                                    <Select
                                      value={field.value || ""}
                                      onValueChange={field.onChange}
                                    >
                                      <SelectTrigger data-testid="select-time-slot">
                                        <SelectValue placeholder="Select a time slot" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {windows.map(({ from, to }, idx) => {
                                          const slotLabel = `${formatDateLabel(selectedDate)}, ${from}${to ? ` – ${to}` : ""}`;
                                          return (
                                            <SelectItem key={idx} value={slotLabel} data-testid={`option-time-slot-${idx}`}>
                                              {from}{to ? ` – ${to}` : ""}
                                            </SelectItem>
                                          );
                                        })}
                                      </SelectContent>
                                    </Select>
                                  );
                                })()}
                                {field.value && (
                                  <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                                    <Check className="h-3 w-3" />
                                    Slot selected: {field.value}
                                  </p>
                                )}
                              </div>
                            )}
                            <FormMessage />
                          </FormItem>
                        );
                      }}
                    />
                  )}

                  {/* Current status — required */}
                  <FormField
                    control={form.control}
                    name="comorbidities"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Comorbidities / Past Illness (Optional)</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Enter one condition per line"
                            className="min-h-[88px]"
                            {...field}
                            data-testid="input-comorbidities"
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">Duplicate entries are saved once, ignoring case.</p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="presentingComplaint"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Presenting Complaint (Optional)</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Main complaint or reason for this follow-up"
                            className="min-h-[88px]"
                            {...field}
                            data-testid="input-presenting-complaint"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="presentIllness"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Present Illness / Current Status *</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Describe the current episode, symptoms, response to treatment, or changes since the last consultation"
                            className="min-h-[120px]"
                            {...field}
                            data-testid="input-present-illness"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <h3 className="pt-1 text-sm font-semibold">Clinical Details</h3>
                  <FormField
                    control={form.control}
                    name="examination"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Examination (Optional)</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Physical examination findings, vitals, systemic examination..."
                            className="min-h-[80px]"
                            {...field}
                            data-testid="input-examination"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="investigations"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Investigations (Optional)</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Lab results, imaging findings, ECG findings..."
                            className="min-h-[80px]"
                            {...field}
                            data-testid="input-investigations"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="provisionalDiagnosis"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Provisional Diagnosis (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="E.g., Suspected CAD, R/O TB" {...field} data-testid="input-diagnosis" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Upload Reports */}
                  <div className="space-y-2">
                    <FormLabel>Upload Reports (Optional)</FormLabel>
                    <p className="text-xs text-muted-foreground">Upload patient reports, lab results, images</p>
                    <div className="rounded-lg border-2 border-dashed border-muted-foreground/25 p-4">
                      <div className="flex flex-col items-center gap-2">
                        <Upload className="h-6 w-6 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">Select one or more files</p>
                        <Input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={handleReportFiles} multiple className="max-w-xs" data-testid="input-report-upload" />
                      </div>
                      {reportFiles.length > 0 && (
                        <div className="mt-3 space-y-1">
                          {reportFiles.map((file, i) => (
                            <div key={i} className="flex items-center justify-between rounded border p-2 text-sm">
                              <div className="flex items-center gap-2">
                                <FileText className="h-3 w-3" />
                                <span className="truncate max-w-[200px]">{file.name}</span>
                              </div>
                              <Button type="button" variant="ghost" size="icon" onClick={() => removeReportFile(i)} data-testid={`button-remove-report-${i}`}>
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Upload Treatment Charts */}
                  <div className="space-y-2">
                    <FormLabel>Upload Treatment Charts (Optional)</FormLabel>
                    <p className="text-xs text-muted-foreground">Upload treatment records, nursing charts, medication charts</p>
                    <div className="rounded-lg border-2 border-dashed border-muted-foreground/25 p-4">
                      <div className="flex flex-col items-center gap-2">
                        <Upload className="h-6 w-6 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">Select one or more files</p>
                        <Input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={handleChartFiles} multiple className="max-w-xs" data-testid="input-chart-upload" />
                      </div>
                      {chartFiles.length > 0 && (
                        <div className="mt-3 space-y-1">
                          {chartFiles.map((file, i) => (
                            <div key={i} className="flex items-center justify-between rounded border p-2 text-sm">
                              <div className="flex items-center gap-2">
                                <FileText className="h-3 w-3" />
                                <span className="truncate max-w-[200px]">{file.name}</span>
                              </div>
                              <Button type="button" variant="ghost" size="icon" onClick={() => removeChartFile(i)} data-testid={`button-remove-chart-${i}`}>
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Payment option */}
                  <div className="rounded-lg border p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <CreditCard className="h-5 w-5 text-muted-foreground" />
                      <span className="font-medium">Payment Option</span>
                    </div>
                    <div className="space-y-3">
                      <label className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50" data-testid="radio-pay-later">
                        <input type="radio" name="paymentMethod" value="pay_later" checked={paymentMethod === "pay_later"} onChange={() => setPaymentMethod("pay_later")} className="h-4 w-4" />
                        <div>
                          <div className="font-medium">Pay Later</div>
                          <div className="text-sm text-muted-foreground">Pay within 30 days. Invoice will be generated.</div>
                        </div>
                      </label>
                      <label className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50" data-testid="radio-pay-now">
                        <input type="radio" name="paymentMethod" value="pay_now" checked={paymentMethod === "pay_now"} onChange={() => setPaymentMethod("pay_now")} className="h-4 w-4" />
                        <div>
                          <div className="font-medium">Pay Now</div>
                          <div className="text-sm text-muted-foreground">Mark as paid immediately.</div>
                        </div>
                      </label>
                    </div>
                  </div>

                  {attachmentUploadError && pendingBooking && (
                    <p role="alert" className="text-sm text-destructive">
                      Your booking is saved, but some files did not upload. Retry to add them to this Case File. {attachmentUploadError}
                    </p>
                  )}
                  <Button
                    type="button"
                    className="w-full"
                    disabled={bookingMutation.isPending || uploading}
                    onClick={handleFollowUpSubmit}
                    data-testid="button-confirm-followup"
                  >
                    {uploading ? "Uploading patient documents..." : pendingBooking && attachmentUploadError ? "Retry file uploads" : bookingMutation.isPending ? "Processing..." : paymentMethod === "pay_now" ? "Confirm & Pay" : "Confirm Follow-Up"}
                  </Button>
                </CardContent>
              </Card>
            </form>
          </Form>
        </div>
      </div>
    );
  }
  // ── End Follow-Up Mode ────────────────────────────────────────────────────

  const stepLabels = ["Patient Details", "Clinical Info", "Confirm"];
  const currentStepIndex = step === "details" ? 0 : step === "clinical" ? 1 : 2;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/user/consultation">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Book Consultation</h1>
          <p className="text-muted-foreground">{service.name}</p>
        </div>
      </div>

      <div className="mb-8 flex items-center justify-center gap-2">
        {stepLabels.map((label, i) => (
          <div key={i} className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                i === currentStepIndex
                  ? "bg-primary text-primary-foreground"
                  : i < currentStepIndex
                  ? "bg-green-500 text-white"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {i < currentStepIndex ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            {i < stepLabels.length - 1 && <div className="h-0.5 w-8 bg-muted" />}
          </div>
        ))}
      </div>

      <div className="mx-auto max-w-2xl">
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold">{service.name}</h3>
                <p className="text-sm text-muted-foreground">{service.qualification}</p>
                {service.specialization && (
                  <Badge variant="secondary" className="mt-2">
                    {service.specialization}
                  </Badge>
                )}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Briefcase className="h-3.5 w-3.5" />
                {service.yearsExperience} years experience
              </span>
              <span className="flex items-center gap-1">
                <Video className="h-3.5 w-3.5" />
                Video Consultation
              </span>
            </div>
          </CardContent>
        </Card>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {step === "details" && (
              <Card>
                <CardHeader>
                  <CardTitle>Patient Details</CardTitle>
                  <CardDescription>
                    Enter patient information for the consultation
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* ── Slot selection (non-emergency only) ── */}
                  {!isEmergencyTeam && (
                    <FormField
                      control={form.control}
                      name="appointmentSlot"
                      render={({ field }) => {
                        // ── Legacy mode: pre-seeded slot strings ──
                        if (consultantAvailableSlots.length > 0) {
                          const visibleSlots = filterPastLegacySlots(sortLegacySlots(consultantAvailableSlots));
                          return (
                            <FormItem>
                              <FormLabel>Appointment Slot</FormLabel>
                              <Select value={field.value || ""} onValueChange={field.onChange}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-appointment-slot">
                                    <SelectValue placeholder={visibleSlots.length === 0 ? "No slots available" : "Select a slot"} />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {visibleSlots.map((slot, i) => (
                                    <SelectItem key={i} value={slot} data-testid={`option-slot-${i}`}>
                                      {slot}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          );
                        }

                        // ── Calendar mode: pick a date, then a time window ──
                        if (!isCalendarMode) return <FormItem />;

                        const calYear = calendarMonth.getFullYear();
                        const calMonthNum = calendarMonth.getMonth();
                        const firstDow = new Date(calYear, calMonthNum, 1).getDay();
                        const daysInMonth = new Date(calYear, calMonthNum + 1, 0).getDate();
                        const cells: (number | null)[] = Array(firstDow).fill(null);
                        for (let d = 1; d <= daysInMonth; d++) cells.push(d);

                        const istTodayDate = getIstClock().date;

                        const toDateStr = (day: number) => {
                          const m = String(calMonthNum + 1).padStart(2, "0");
                          return `${calYear}-${m}-${String(day).padStart(2, "0")}`;
                        };

                        const getOverride = (dateStr: string): ConsultantSlotOverride | undefined =>
                          slotOverrides.find(o => o.date === dateStr);

                        const isDaySelectable = (day: number) => {
                          if (slotOverridesLoading) return false; // block all until overrides are confirmed
                          const dateString = toDateStr(day);
                          if (dateString < istTodayDate) return false;
                          const dayName = getIstWeekday(dateString);
                          // Check against slotSeries first, then legacy availableDays
                          const coveredBySchedule = consultantSlotSeries.length > 0
                            ? consultantSlotSeries.some(s => s.days.includes(dayName))
                            : consultantAvailableDays.includes(dayName);
                          if (!coveredBySchedule) return false;
                          const override = getOverride(toDateStr(day));
                          if (override?.isPaused) return false;
                          return true;
                        };

                        const formatDateLabel = (dateStr: string) => {
                          const d = new Date(dateStr + "T12:00:00Z");
                          return new Intl.DateTimeFormat("en-IN", {
                            timeZone: IST_TIME_ZONE,
                            weekday: "short", day: "numeric", month: "short", year: "numeric",
                          }).format(d);
                        };

                        // Returns all available time windows for a given date
                        const getTimeWindowsForDate = (dateStr: string): { from: string; to: string }[] => {
                          const ov = getOverride(dateStr);
                          // A custom override for this specific date → one fixed window
                          if (ov && !ov.isPaused) {
                            return [{ from: ov.customFrom || consultantFrom, to: ov.customTo || consultantTo }];
                          }
                          // slotSeries → return all series that cover this weekday
                          if (consultantSlotSeries.length > 0) {
                            const dayName = getIstWeekday(dateStr);
                            return consultantSlotSeries
                              .filter(s => s.days.includes(dayName))
                              .map(s => ({ from: s.from, to: s.to }));
                          }
                          // Legacy fallback
                          return [{ from: consultantFrom, to: consultantTo }];
                        };

                        return (
                          <FormItem>
                            <FormLabel className="flex items-center gap-2">
                              <CalendarDays className="h-4 w-4" />
                              Select Appointment Date
                            </FormLabel>

                            <div className="rounded-lg border bg-background p-3 space-y-2 mt-1">
                              {/* Month navigation */}
                              <div className="flex items-center justify-between">
                                <button
                                  type="button"
                                  data-testid="btn-cal-prev-month"
                                  onClick={() => setCalendarMonth(prev => {
                                    const d = new Date(prev); d.setMonth(d.getMonth() - 1); return d;
                                  })}
                                  className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                                >
                                  <ChevronLeft className="h-4 w-4" />
                                </button>
                                <span className="text-sm font-medium">
                                  {calendarMonth.toLocaleString("default", { month: "long", year: "numeric" })}
                                </span>
                                <button
                                  type="button"
                                  data-testid="btn-cal-next-month"
                                  onClick={() => setCalendarMonth(prev => {
                                    const d = new Date(prev); d.setMonth(d.getMonth() + 1); return d;
                                  })}
                                  className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                                >
                                  <ChevronRight className="h-4 w-4" />
                                </button>
                              </div>

                              {/* Day headers + grid */}
                              <div className="grid grid-cols-7 gap-1 text-center">
                                {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(h => (
                                  <div key={h} className="text-xs font-medium text-muted-foreground py-1">{h}</div>
                                ))}
                                {cells.map((day, idx) => {
                                  if (!day) return <div key={`e-${idx}`} />;
                                  const dateStr = toDateStr(day);
                                  const selectable = isDaySelectable(day);
                                  const isSelected = selectedDate === dateStr;
                                  const isToday = toDateStr(day) === istTodayDate;
                                  return (
                                    <button
                                      key={dateStr}
                                      type="button"
                                      data-testid={`cal-date-${dateStr}`}
                                      disabled={!selectable}
                                      onClick={() => {
                                        setSelectedDate(dateStr);
                                        field.onChange("");
                                      }}
                                      className={[
                                        "h-9 w-full rounded-md text-sm font-medium transition-colors select-none",
                                        !selectable
                                          ? "text-muted-foreground/40 cursor-not-allowed"
                                          : isSelected
                                          ? "bg-primary text-primary-foreground"
                                          : "hover:bg-primary/10 hover:text-primary cursor-pointer",
                                        isToday && !isSelected
                                          ? "border-2 border-primary"
                                          : "border border-transparent",
                                      ].join(" ")}
                                    >
                                      {day}
                                    </button>
                                  );
                                })}
                              </div>

                              {/* Legend */}
                              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground pt-1 border-t">
                                <span className="flex items-center gap-1">
                                  <span className="inline-block h-3 w-3 rounded bg-primary" />
                                  Selected
                                </span>
                                <span className="flex items-center gap-1">
                                  <span className="inline-block h-3 w-3 rounded border-2 border-primary" />
                                  Today
                                </span>
                                <span className="flex items-center gap-1">
                                  <span className="inline-block h-3 w-3 rounded bg-muted" />
                                  Unavailable
                                </span>
                              </div>
                            </div>

                            {/* Time slot — shown after date is picked, only if not paused */}
                            {selectedDate && !getOverride(selectedDate)?.isPaused && (
                              <div className="space-y-2 pt-1">
                                <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                                  <Clock className="h-3.5 w-3.5" />
                                  Available slots on <span className="font-medium text-foreground">{formatDateLabel(selectedDate)}</span>
                                </p>
                                {(() => {
                                  const windows = filterPastTimeWindows(getTimeWindowsForDate(selectedDate), selectedDate);
                                  if (windows.length === 0) {
                                    return <p className="text-sm text-muted-foreground">No slots available for today — all windows have passed.</p>;
                                  }
                                  return (
                                    <Select
                                      value={field.value || ""}
                                      onValueChange={field.onChange}
                                    >
                                      <SelectTrigger data-testid="select-time-slot">
                                        <SelectValue placeholder="Select a time slot" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {windows.map(({ from, to }, idx) => {
                                          const slotLabel = `${formatDateLabel(selectedDate)}, ${from}${to ? ` – ${to}` : ""}`;
                                          return (
                                            <SelectItem key={idx} value={slotLabel} data-testid={`option-time-slot-${idx}`}>
                                              {from}{to ? ` – ${to}` : ""}
                                            </SelectItem>
                                          );
                                        })}
                                      </SelectContent>
                                    </Select>
                                  );
                                })()}
                                {field.value && (
                                  <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                                    <Check className="h-3 w-3" />
                                    Slot selected: {field.value}
                                  </p>
                                )}
                              </div>
                            )}

                            <FormMessage />
                          </FormItem>
                        );
                      }}
                    />
                  )}

                  {isEmergencyTeam && (
                    <div className="rounded-lg border border-red-500/30 bg-red-50 dark:bg-red-950/20 p-3">
                      <p className="text-sm font-medium text-red-800 dark:text-red-200">Emergency Consultation - Immediate Response</p>
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">No slot selection needed. The team will be contacted immediately upon booking.</p>
                    </div>
                  )}

                  <div className="grid gap-4 md:grid-cols-3">
                    <FormField
                      control={form.control}
                      name="patientName"
                      render={({ field }) => (
                        <FormItem className="md:col-span-2">
                          <FormLabel>Patient Name *</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Full name"
                              {...field}
                              data-testid="input-patient-name"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="patientAge"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Age *</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              placeholder="Age"
                              {...field}
                              data-testid="input-patient-age"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="patientGender"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Gender *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-gender">
                                <SelectValue placeholder="Select gender" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="male">Male</SelectItem>
                              <SelectItem value="female">Female</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="contactNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contact Number *</FormLabel>
                          <FormControl>
                            <PhoneInput
                              {...field}
                              data-testid="input-contact"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {callbackDevicePicker}

                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="patientWeight"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Weight (kg)</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g., 72"
                              {...field}
                              data-testid="input-patient-weight"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="uhidIpNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>UHID / IP Number</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Hospital IP/UHID number"
                              {...field}
                              data-testid="input-uhid"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="space-y-3">
                    <FormField
                      control={form.control}
                      name="allergyNotSpecified"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-2">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="checkbox-no-allergy"
                            />
                          </FormControl>
                          <FormLabel className="!mt-0 text-sm">No known allergies / Not specified</FormLabel>
                        </FormItem>
                      )}
                    />
                    {!form.watch("allergyNotSpecified") && (
                      <FormField
                        control={form.control}
                        name="patientAllergies"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Allergies</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="e.g., Penicillin, Sulfa drugs"
                                {...field}
                                data-testid="input-allergies"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </div>

                  <Button
                    type="button"
                    className="w-full"
                    onClick={handleNext}
                    data-testid="button-next-clinical"
                  >
                    Next: Clinical Information
                  </Button>
                </CardContent>
              </Card>
            )}

            {step === "clinical" && (
              <Card>
                <CardHeader>
                  <CardTitle>{isFollowUpMode ? "Current Status" : "Clinical Information"}</CardTitle>
                  <CardDescription>
                    {isFollowUpMode
                      ? "Describe the patient's current condition and any updates since the original consultation"
                      : "Provide clinical details for the specialist to review"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="comorbidities"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Comorbidities / Past Illness (Optional)</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Enter one condition per line"
                            className="min-h-[88px]"
                            {...field}
                            data-testid="input-comorbidities"
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">Duplicate entries are saved once, ignoring case.</p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="presentingComplaint"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Presenting Complaint *</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="The patient's main complaint or reason for seeking medical attention"
                            className="min-h-[88px]"
                            {...field}
                            data-testid="input-presenting-complaint"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="presentIllness"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Present Illness (Optional)</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="History and details of the current illness or episode"
                            className="min-h-[120px]"
                            {...field}
                            data-testid="input-present-illness"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <h3 className="pt-1 text-sm font-semibold">Clinical Details</h3>
                  <FormField
                    control={form.control}
                    name="examination"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Examination (Optional)</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Physical examination findings, vitals, systemic examination..."
                            className="min-h-[80px]"
                            {...field}
                            data-testid="input-examination"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="investigations"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Investigations (Optional)</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Lab results, imaging findings, ECG findings..."
                            className="min-h-[80px]"
                            {...field}
                            data-testid="input-investigations"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="provisionalDiagnosis"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Provisional Diagnosis (Optional)</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="E.g., Suspected CAD, R/O TB"
                            {...field}
                            data-testid="input-diagnosis"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="orderingPhysician"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Referring Physician (Optional)</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Dr. Name, Qualification"
                            {...field}
                            data-testid="input-physician"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="space-y-2">
                    <FormLabel>Upload Reports (Optional)</FormLabel>
                    <p className="text-xs text-muted-foreground">Upload patient reports, lab results, images</p>
                    <div className="rounded-lg border-2 border-dashed border-muted-foreground/25 p-4">
                      <div className="flex flex-col items-center gap-2">
                        <Upload className="h-6 w-6 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">Select one or more files</p>
                        <Input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={handleReportFiles} multiple className="max-w-xs" data-testid="input-report-upload" />
                      </div>
                      {reportFiles.length > 0 && (
                        <div className="mt-3 space-y-1">
                          {reportFiles.map((file, i) => (
                            <div key={i} className="flex items-center justify-between rounded border p-2 text-sm">
                              <div className="flex items-center gap-2">
                                <FileText className="h-3 w-3" />
                                <span className="truncate max-w-[200px]">{file.name}</span>
                              </div>
                              <Button type="button" variant="ghost" size="icon" onClick={() => removeReportFile(i)} data-testid={`button-remove-report-${i}`}>
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <FormLabel>Upload Treatment Charts (Optional)</FormLabel>
                    <p className="text-xs text-muted-foreground">Upload treatment records, nursing charts, medication charts</p>
                    <div className="rounded-lg border-2 border-dashed border-muted-foreground/25 p-4">
                      <div className="flex flex-col items-center gap-2">
                        <Upload className="h-6 w-6 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">Select one or more files</p>
                        <Input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={handleChartFiles} multiple className="max-w-xs" data-testid="input-chart-upload" />
                      </div>
                      {chartFiles.length > 0 && (
                        <div className="mt-3 space-y-1">
                          {chartFiles.map((file, i) => (
                            <div key={i} className="flex items-center justify-between rounded border p-2 text-sm">
                              <div className="flex items-center gap-2">
                                <FileText className="h-3 w-3" />
                                <span className="truncate max-w-[200px]">{file.name}</span>
                              </div>
                              <Button type="button" variant="ghost" size="icon" onClick={() => removeChartFile(i)} data-testid={`button-remove-chart-${i}`}>
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {attachmentUploadError && pendingBooking && (
                    <p role="alert" className="text-sm text-destructive">
                      Your booking is saved, but some files did not upload. Retry to add them to this Case File. {attachmentUploadError}
                    </p>
                  )}
                  <div className="flex gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setStep("details")}
                      className="flex-1"
                    >
                      Back
                    </Button>
                    <Button
                      type="button"
                      className="flex-1"
                      onClick={handleNext}
                      data-testid="button-proceed-payment"
                    >
                      Proceed to Confirm
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {step === "payment" && (
              <Card>
                <CardHeader>
                  <CardTitle>Confirm Booking</CardTitle>
                  <CardDescription>
                    Review and confirm your consultation booking
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <h3 className="mb-3 font-medium">Booking Summary</h3>
                    <dl className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">{isEmergencyTeam ? "Emergency Team" : "Consultant"}</dt>
                        <dd>{service.name}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">{isEmergencyTeam ? "Department" : "Specialization"}</dt>
                        <dd>{service.specialization}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Time Slot</dt>
                        <dd>{form.getValues("appointmentSlot")}</dd>
                      </div>
                    </dl>
                  </div>

                  <div className="rounded-lg border bg-muted/30 p-4">
                    <h3 className="mb-3 font-medium">Patient Information</h3>
                    <dl className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Name</dt>
                        <dd>{form.getValues("patientName")}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Age / Gender</dt>
                        <dd>{form.getValues("patientAge")} years / {form.getValues("patientGender")}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Contact</dt>
                        <dd>{form.getValues("contactNumber")}</dd>
                      </div>
                      {form.getValues("provisionalDiagnosis") && (
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">Diagnosis</dt>
                          <dd>{form.getValues("provisionalDiagnosis")}</dd>
                        </div>
                      )}
                    </dl>
                  </div>

                  <div className="rounded-lg border p-4">
                    <div className="mb-4 flex items-center gap-2">
                      <CreditCard className="h-5 w-5 text-muted-foreground" />
                      <span className="font-medium">Payment Option</span>
                    </div>
                    <div className="space-y-3">
                      <label className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50" data-testid="radio-pay-later">
                        <input type="radio" name="paymentMethod" value="pay_later" checked={paymentMethod === "pay_later"} onChange={() => setPaymentMethod("pay_later")} className="h-4 w-4" />
                        <div>
                          <div className="font-medium">Pay Later</div>
                          <div className="text-sm text-muted-foreground">Pay within 30 days. Invoice will be generated.</div>
                        </div>
                      </label>
                      <label className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50" data-testid="radio-pay-now">
                        <input type="radio" name="paymentMethod" value="pay_now" checked={paymentMethod === "pay_now"} onChange={() => setPaymentMethod("pay_now")} className="h-4 w-4" />
                        <div>
                          <div className="font-medium">Pay Now</div>
                          <div className="text-sm text-muted-foreground">Mark as paid immediately.</div>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setStep("clinical")}
                      className="flex-1"
                      disabled={bookingMutation.isPending || uploading || !!pendingBooking}
                    >
                      Back
                    </Button>
                    <Button
                      type="submit"
                      className="flex-1"
                      disabled={bookingMutation.isPending || uploading}
                      data-testid="button-confirm-booking"
                    >
                      {uploading ? "Uploading patient documents..." : pendingBooking && attachmentUploadError ? "Retry file uploads" : bookingMutation.isPending ? "Processing..." : paymentMethod === "pay_now" ? "Confirm & Pay" : "Confirm Booking"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </form>
        </Form>
      </div>
    </div>
  );
}
