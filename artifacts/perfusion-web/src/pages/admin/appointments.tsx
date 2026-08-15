import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, startOfToday } from "date-fns";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Search, Plus, Calendar as CalendarIcon, Stethoscope, IndianRupee,
  Loader2, Video, Phone, Eye, CheckCircle2, CircleDot,
  CreditCard, ClockIcon,
} from "lucide-react";
import type { Booking, BookingStatus, Consultant } from "@shared/schema";

// ── Types ─────────────────────────────────────────────────────────────────────

type AdminUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  hospitalName?: string;
};

// ── Time helpers ──────────────────────────────────────────────────────────────

// Form fields hold 24-hour "HH:MM" values (from <input type="time">).
function timeToMinutes(t: string): number {
  const match = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return 0;
  return parseInt(match[1]) * 60 + parseInt(match[2]);
}

// Convert 24-hour "HH:MM" → "h:MM AM/PM" for the stored slot string.
function to12Hour(t: string): string {
  const match = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return t;
  let hours = parseInt(match[1]);
  const minutes = match[2];
  const period = hours < 12 ? "AM" : "PM";
  hours = hours % 12 === 0 ? 12 : hours % 12;
  return `${hours}:${minutes} ${period}`;
}

// ── Validation schema ─────────────────────────────────────────────────────────

const createSchema = z.object({
  userId: z.string().min(1, "Please select a Care Seeker"),
  serviceId: z.string().min(1, "Please select a Consultant"),
  appointmentDate: z.date({ required_error: "Appointment date is required" }),
  appointmentStartTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Enter a valid start time"),
  appointmentEndTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Enter a valid end time"),
  patientName: z.string().min(2, "Patient name is required"),
  patientAge: z.coerce.number().min(1, "Age must be at least 1").max(150, "Age looks invalid"),
  patientGender: z.enum(["male", "female", "other"], { required_error: "Gender is required" }),
  patientContact: z.string().optional(),
  callbackPhone: z.string().min(5, "Callback phone number is required"),
  clinicalSummary: z.string().min(10, "Clinical summary must be at least 10 characters"),
  provisionalDiagnosis: z.string().optional(),
  paymentMethod: z.enum(["pay_now", "pay_later"]),
}).refine(
  (data) => {
    if (!data.appointmentStartTime || !data.appointmentEndTime) return true;
    return timeToMinutes(data.appointmentEndTime) > timeToMinutes(data.appointmentStartTime);
  },
  {
    message: "End time must be after start time",
    path: ["appointmentEndTime"],
  }
);

type CreateFormData = z.infer<typeof createSchema>;

// ── Helper: payment status badge ──────────────────────────────────────────────

function PaymentBadge({ status, method }: { status?: string | null; method?: string | null }) {
  if (status === "paid") {
    return (
      <Badge variant="outline" className="border-green-500 text-green-700 dark:text-green-400">
        <CheckCircle2 className="mr-1 h-3 w-3" /> Paid
      </Badge>
    );
  }
  if (method === "pay_later" || status === "pending") {
    return (
      <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-400">
        <ClockIcon className="mr-1 h-3 w-3" /> Pay Later
      </Badge>
    );
  }
  if (status === "overdue") {
    return <Badge variant="destructive">Overdue</Badge>;
  }
  return <Badge variant="secondary">{status ?? "—"}</Badge>;
}

// ── Create Appointment Dialog ─────────────────────────────────────────────────
// Defined at module level (outside AdminAppointmentsPage) so React treats it as
// a stable component identity — preventing unmount/remount on every parent render.

interface CreateAppointmentDialogProps {
  form: ReturnType<typeof useForm<CreateFormData>>;
  showCreate: boolean;
  setShowCreate: (open: boolean) => void;
  seekers: AdminUser[];
  consultants: Consultant[];
  consultantMap: Record<string, Consultant>;
  createMutation: any;
}

function CreateAppointmentDialog({
  form,
  showCreate,
  setShowCreate,
  seekers,
  consultants,
  consultantMap,
  createMutation,
}: CreateAppointmentDialogProps) {
  const selectedConsultantId = form.watch("serviceId");
  const selectedConsultant = consultantMap[selectedConsultantId];

  return (
    <Dialog open={showCreate} onOpenChange={(open) => { setShowCreate(open); if (!open) form.reset(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Appointment</DialogTitle>
          <DialogDescription>
            Schedule a consultation between a Care Seeker and a Consultant. The appointment will appear in both their dashboards immediately.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((d) => createMutation.mutate(d))}
            className="space-y-5"
          >
            {/* ── Care Seeker ── */}
            <div className="rounded-lg border p-4 space-y-4">
              <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Care Seeker</p>
              <FormField
                control={form.control}
                name="userId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Care Seeker *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-care-seeker">
                          <SelectValue placeholder="Select a Care Seeker" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {seekers.length === 0 && (
                          <SelectItem value="__none__" disabled>No seekers found</SelectItem>
                        )}
                        {seekers.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {`${u.firstName} ${u.lastName}`.trim() || u.email}
                            {u.hospitalName ? ` — ${u.hospitalName}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* ── Consultant ── */}
            <div className="rounded-lg border p-4 space-y-4">
              <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Consultant</p>
              <FormField
                control={form.control}
                name="serviceId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Consultant *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-consultant">
                          <SelectValue placeholder="Select a Consultant" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {consultants.length === 0 && (
                          <SelectItem value="__none__" disabled>No consultants found</SelectItem>
                        )}
                        {consultants.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name} — ₹{c.consultationFee}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {selectedConsultant && (
                <div className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground flex items-center gap-2">
                  <IndianRupee className="h-3.5 w-3.5" />
                  Consultation fee: <span className="font-semibold text-foreground">₹{selectedConsultant.consultationFee}</span>
                  {selectedConsultant.customerPrice && (
                    <span>(customer price: ₹{selectedConsultant.customerPrice})</span>
                  )}
                </div>
              )}
            </div>

            {/* ── Appointment Slot ── */}
            <div className="rounded-lg border p-4 space-y-4">
              <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Appointment</p>

              {/* Date picker with calendar popover */}
              <FormField
                control={form.control}
                name="appointmentDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Date *</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            type="button"
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                            data-testid="button-appointment-date"
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {field.value ? format(field.value, "dd MMM yyyy") : "Pick a date"}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) => date < startOfToday()}
                          initialFocus
                        />
                        <div className="border-t flex items-center justify-between px-3 py-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => field.onChange(new Date())}
                          >
                            Today
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => field.onChange(undefined)}
                          >
                            Clear
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Free-form start + end time inputs (any clock time; field value is 24h, e.g. "15:35") */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="appointmentStartTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start Time *</FormLabel>
                      <FormControl>
                        <Input type="time" data-testid="input-start-time" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="appointmentEndTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>End Time *</FormLabel>
                      <FormControl>
                        <Input type="time" data-testid="input-end-time" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* ── Patient Details ── */}
            <div className="rounded-lg border p-4 space-y-4">
              <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Patient Details</p>
              <FormField
                control={form.control}
                name="patientName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Patient Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="Full name" {...field} data-testid="input-patient-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="patientAge"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Age *</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="Age" {...field} data-testid="input-patient-age" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="patientGender"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gender *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select" />
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
                  name="patientContact"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Patient Contact</FormLabel>
                      <FormControl>
                        <Input placeholder="Phone" {...field} data-testid="input-patient-contact" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="callbackPhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ward / Callback Phone *</FormLabel>
                    <FormControl>
                      <Input placeholder="+91XXXXXXXXXX — nurse / ward contact" {...field} data-testid="input-callback-phone" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* ── Clinical Information ── */}
            <div className="rounded-lg border p-4 space-y-4">
              <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Clinical Information</p>
              <FormField
                control={form.control}
                name="clinicalSummary"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Clinical Summary *</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Brief history, presenting complaint, reason for referral…"
                        className="min-h-[80px]"
                        {...field}
                        data-testid="input-clinical-summary"
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
                    <FormLabel>Provisional Diagnosis</FormLabel>
                    <FormControl>
                      <Input placeholder="Optional" {...field} data-testid="input-provisional-diagnosis" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* ── Payment ── */}
            <div className="rounded-lg border p-4 space-y-4">
              <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Payment</p>
              <FormField
                control={form.control}
                name="paymentMethod"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment Option *</FormLabel>
                    <div className="grid grid-cols-2 gap-3">
                      {(["pay_now", "pay_later"] as const).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => field.onChange(opt)}
                          className={`flex flex-col items-start rounded-lg border p-3 text-left transition-colors ${
                            field.value === opt
                              ? "border-primary bg-primary/5"
                              : "border-border hover:bg-muted/50"
                          }`}
                        >
                          {opt === "pay_now" ? (
                            <>
                              <div className="flex items-center gap-2">
                                <CreditCard className="h-4 w-4" />
                                <span className="font-medium text-sm">Pay Now</span>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Mark as paid immediately
                              </p>
                            </>
                          ) : (
                            <>
                              <div className="flex items-center gap-2">
                                <ClockIcon className="h-4 w-4" />
                                <span className="font-medium text-sm">Pay Later</span>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Invoice stays open — seeker pays later
                              </p>
                            </>
                          )}
                        </button>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => { setShowCreate(false); form.reset(); }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending} data-testid="button-create-appointment-submit">
                {createMutation.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating…</>
                ) : (
                  <><Plus className="mr-2 h-4 w-4" />Create Appointment</>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function AdminAppointmentsPage() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "booked" | "completed">("all");
  const [paymentFilter, setPaymentFilter] = useState<"all" | "pending" | "paid" | "overdue">("all");
  const [dateFilter, setDateFilter] = useState("");
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: allBookings = [], isLoading } = useQuery<Booking[]>({
    queryKey: ["/api/admin/bookings"],
  });

  const { data: allUsers = [] } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
  });

  const { data: consultants = [] } = useQuery<Consultant[]>({
    queryKey: ["/api/consultants"],
  });

  // ── Derived data ───────────────────────────────────────────────────────────

  const appointments = useMemo(
    () => allBookings.filter((b) => b.bookingType === "consultation"),
    [allBookings],
  );

  const seekers = useMemo(
    () => allUsers.filter((u) => u.role === "care_seeker"),
    [allUsers],
  );

  const userMap = useMemo(
    () => Object.fromEntries(allUsers.map((u) => [u.id, u])),
    [allUsers],
  );

  const consultantMap = useMemo(
    () => Object.fromEntries(consultants.map((c) => [c.id, c])),
    [consultants],
  );

  // ── Filtered + sorted list ─────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return appointments
      .filter((b) => {
        if (statusFilter !== "all" && b.status !== statusFilter) return false;
        if (paymentFilter !== "all" && b.paymentStatus !== paymentFilter) return false;
        if (dateFilter) {
          const slot = (b as any).appointmentSlot || "";
          if (!slot.toLowerCase().includes(dateFilter.toLowerCase())) return false;
        }
        if (term) {
          const ref = ((b as any).bookingNumber || b.id).toLowerCase();
          const seeker = userMap[b.userId];
          const seekerName = seeker
            ? `${seeker.firstName} ${seeker.lastName} ${seeker.email}`.toLowerCase()
            : "";
          const seekerHospital = (seeker?.hospitalName || "").toLowerCase();
          const consultant = b.serviceName?.toLowerCase() || "";
          const provider = ((b as any).providerName || "").toLowerCase();
          if (
            !ref.includes(term) &&
            !seekerName.includes(term) &&
            !seekerHospital.includes(term) &&
            !consultant.includes(term) &&
            !provider.includes(term) &&
            !b.patientName.toLowerCase().includes(term)
          ) {
            return false;
          }
        }
        return true;
      })
      .sort(
        (a, b) =>
          new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
      );
  }, [appointments, statusFilter, paymentFilter, dateFilter, searchTerm, userMap]);

  // ── Stats ──────────────────────────────────────────────────────────────────

  const stats = useMemo(() => ({
    total: appointments.length,
    scheduled: appointments.filter((b) => b.status === "booked").length,
    completed: appointments.filter((b) => b.status === "completed").length,
    paid: appointments.filter((b) => b.paymentStatus === "paid").length,
    pending: appointments.filter((b) => b.paymentStatus === "pending").length,
  }), [appointments]);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const form = useForm<CreateFormData>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      userId: "",
      serviceId: "",
      appointmentDate: undefined as any,
      appointmentStartTime: "",
      appointmentEndTime: "",
      patientName: "",
      patientAge: undefined as any,
      patientGender: undefined as any,
      patientContact: "",
      callbackPhone: "",
      clinicalSummary: "",
      provisionalDiagnosis: "",
      paymentMethod: "pay_later",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: CreateFormData) => {
      // Format: "15 Aug 2026, 3:35 PM – 4:55 PM"
      const dateStr = format(data.appointmentDate, "dd MMM yyyy");
      const appointmentSlot = `${dateStr}, ${to12Hour(data.appointmentStartTime)} – ${to12Hour(data.appointmentEndTime)}`;

      const payload = {
        bookingType: "consultation",
        userId: data.userId,
        serviceId: data.serviceId,
        appointmentSlot,
        patientName: data.patientName,
        patientAge: data.patientAge,
        patientGender: data.patientGender,
        patientContact: data.patientContact || null,
        callbackPhone: data.callbackPhone,
        clinicalSummary: data.clinicalSummary,
        provisionalDiagnosis: data.provisionalDiagnosis || null,
        paymentMethod: data.paymentMethod,
        amount: "0",
        serviceName: "",
        status: "booked",
        paymentStatus: "pending",
      };

      const res = await apiRequest("POST", "/api/admin/bookings", payload);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to create appointment");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bookings"] });
      setShowCreate(false);
      form.reset();
      toast({ title: "Appointment created", description: "The appointment has been scheduled successfully." });
    },
    onError: (err: any) => {
      toast({
        title: "Could not create appointment",
        description: err?.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: BookingStatus }) =>
      apiRequest("PATCH", `/api/admin/bookings/${id}`, { status }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bookings"] });
      setSelectedBooking((prev) =>
        prev ? { ...prev, status: "completed" as BookingStatus } : null,
      );
      toast({ title: "Status updated", description: "Appointment marked as completed." });
    },
    onError: () => {
      toast({ title: "Update failed", description: "Could not update status.", variant: "destructive" });
    },
  });

  // ── Render helpers ─────────────────────────────────────────────────────────

  function seekerLabel(userId: string) {
    const u = userMap[userId];
    if (!u) return "Unknown Seeker";
    const name = `${u.firstName} ${u.lastName}`.trim() || u.email;
    return u.hospitalName ? `${name} — ${u.hospitalName}` : name;
  }

  function AppointmentRow({ booking }: { booking: Booking }) {
    const seeker = userMap[booking.userId];
    const ref = (booking as any).bookingNumber || booking.id.substring(0, 12).toUpperCase();
    const slot = (booking as any).appointmentSlot || "—";

    return (
      <div
        className="flex flex-col gap-3 rounded-lg border p-4 hover:bg-muted/30 transition-colors cursor-pointer sm:flex-row sm:items-center sm:justify-between"
        onClick={() => setSelectedBooking(booking)}
        data-testid={`appointment-row-${booking.id}`}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
            <Stethoscope className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{booking.serviceName}</p>
              {(booking as any).providerName && (
                <span className="text-xs text-muted-foreground">
                  @ {(booking as any).providerName}
                </span>
              )}
            </div>
            {seeker && (
              <p className="text-sm text-muted-foreground">
                {`${seeker.firstName} ${seeker.lastName}`.trim() || seeker.email}
                {seeker.hospitalName ? ` — ${seeker.hospitalName}` : ""}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              Patient: {booking.patientName} ({booking.patientAge} yrs)
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="font-mono">{ref}</span>
              {slot !== "—" && (
                <span className="flex items-center gap-1">
                  <CalendarIcon className="h-3 w-3" />
                  {slot}
                </span>
              )}
              <span>{booking.createdAt ? format(new Date(booking.createdAt), "PPp") : "—"}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          <StatusBadge status={booking.status} />
          <PaymentBadge status={booking.paymentStatus} method={(booking as any).paymentMethod} />
          <span className="font-semibold text-sm">₹{parseFloat(booking.amount).toFixed(0)}</span>
          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setSelectedBooking(booking); }}>
            <Eye className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  // ── Detail dialog ──────────────────────────────────────────────────────────

  function DetailDialog() {
    if (!selectedBooking) return null;
    const b = selectedBooking as any;
    const seeker = userMap[b.userId];
    const ref = b.bookingNumber || b.id.substring(0, 12).toUpperCase();
    const slot = b.appointmentSlot || "—";

    return (
      <Dialog open={!!selectedBooking} onOpenChange={(open) => { if (!open) setSelectedBooking(null); }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-blue-600" />
              Appointment Details
            </DialogTitle>
            <DialogDescription className="font-mono text-xs">{ref}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Status row */}
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={b.status} />
              <PaymentBadge status={b.paymentStatus} method={b.paymentMethod} />
              {b.status === "booked" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={updateStatusMutation.isPending}
                  onClick={() => updateStatusMutation.mutate({ id: b.id, status: "completed" })}
                  data-testid="button-mark-completed"
                >
                  {updateStatusMutation.isPending ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Mark Completed
                </Button>
              )}
            </div>

            <Separator />

            {/* Appointment info */}
            <Section title="Appointment">
              <Row label="Consultant" value={b.serviceName || "—"} />
              {b.providerName && <Row label="Provider" value={b.providerName} />}
              <Row
                label="Slot"
                value={
                  slot !== "—" ? (
                    <span className="flex items-center gap-1">
                      <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      {slot}
                    </span>
                  ) : "—"
                }
              />
              {b.videoRoomId && (
                <Row
                  label="Video Room"
                  value={
                    <a
                      href={b.videoRoomId}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-primary underline text-sm"
                    >
                      <Video className="h-3.5 w-3.5" /> Join Call
                    </a>
                  }
                />
              )}
              <Row
                label="Created"
                value={b.createdAt ? format(new Date(b.createdAt), "PPp") : "—"}
              />
            </Section>

            <Separator />

            {/* Care Seeker */}
            <Section title="Care Seeker">
              {seeker ? (
                <>
                  <Row label="Name" value={`${seeker.firstName} ${seeker.lastName}`.trim() || "—"} />
                  <Row label="Email" value={seeker.email} />
                  {seeker.hospitalName && <Row label="Hospital" value={seeker.hospitalName} />}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">User ID: {b.userId}</p>
              )}
            </Section>

            <Separator />

            {/* Patient */}
            <Section title="Patient">
              <Row label="Name" value={b.patientName} />
              <Row label="Age" value={`${b.patientAge} yrs`} />
              {b.patientGender && <Row label="Gender" value={<span className="capitalize">{b.patientGender}</span>} />}
              {b.patientContact && (
                <Row label="Contact" value={<span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{b.patientContact}</span>} />
              )}
              {b.callbackPhone && (
                <Row label="Callback / Ward" value={<span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5 text-amber-500" />{b.callbackPhone}{b.callbackWardName ? ` (${b.callbackWardName})` : ""}</span>} />
              )}
            </Section>

            {(b.clinicalSummary || b.provisionalDiagnosis) && (
              <>
                <Separator />
                <Section title="Clinical Information">
                  {b.clinicalSummary && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Clinical Summary</p>
                      <p className="text-sm whitespace-pre-wrap">{b.clinicalSummary}</p>
                    </div>
                  )}
                  {b.provisionalDiagnosis && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Provisional Diagnosis</p>
                      <p className="text-sm">{b.provisionalDiagnosis}</p>
                    </div>
                  )}
                </Section>
              </>
            )}

            <Separator />

            {/* Payment */}
            <Section title="Payment">
              <Row label="Amount" value={<span className="font-semibold">₹{parseFloat(b.amount || "0").toFixed(2)}</span>} />
              {b.basePrice && <Row label="Provider Base Cost" value={`₹${parseFloat(b.basePrice).toFixed(2)}`} />}
              <Row
                label="Method"
                value={
                  b.paymentMethod === "pay_now" ? "Pay Now" :
                  b.paymentMethod === "pay_later" ? "Pay Later" : b.paymentMethod || "—"
                }
              />
              <Row label="Payment Status" value={<PaymentBadge status={b.paymentStatus} method={b.paymentMethod} />} />
              {b.amountPaid && parseFloat(b.amountPaid) > 0 && (
                <Row label="Amount Paid" value={`₹${parseFloat(b.amountPaid).toFixed(2)}`} />
              )}
              {b.paidAt && (
                <Row label="Paid At" value={format(new Date(b.paidAt), "PPp")} />
              )}
              {b.dueDate && b.paymentStatus !== "paid" && (
                <Row label="Due Date" value={format(new Date(b.dueDate), "PP")} />
              )}
            </Section>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Page ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6" data-testid="page-admin-appointments">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Appointments</h1>
          <p className="text-muted-foreground">
            Manage consultation appointments across all Care Seekers and Providers
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} data-testid="button-create-appointment">
          <Plus className="mr-2 h-4 w-4" />
          Create Appointment
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-5">
        {[
          { label: "Total", value: stats.total, color: "" },
          { label: "Scheduled", value: stats.scheduled, color: "text-blue-600" },
          { label: "Completed", value: stats.completed, color: "text-green-600" },
          { label: "Paid", value: stats.paid, color: "text-emerald-600" },
          { label: "Pay Later", value: stats.pending, color: "text-amber-600" },
        ].map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{s.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* List */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>All Consultation Appointments</CardTitle>
              <CardDescription>
                {filtered.length} of {appointments.length} appointment{appointments.length !== 1 ? "s" : ""}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search seeker, consultant, ref…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-64 pl-9"
                  data-testid="input-search-appointments"
                />
              </div>
              {/* Status filter */}
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                <SelectTrigger className="w-36">
                  <CircleDot className="mr-2 h-4 w-4" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="booked">Scheduled</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
              {/* Payment filter */}
              <Select value={paymentFilter} onValueChange={(v) => setPaymentFilter(v as any)}>
                <SelectTrigger className="w-36">
                  <IndianRupee className="mr-2 h-4 w-4" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Payments</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Stethoscope className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="font-medium text-muted-foreground">
                {appointments.length === 0
                  ? "No appointments yet"
                  : "No appointments match your filters"}
              </p>
              {appointments.length === 0 && (
                <Button
                  className="mt-4"
                  onClick={() => setShowCreate(true)}
                  data-testid="button-create-first-appointment"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create First Appointment
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((b) => (
                <AppointmentRow key={b.id} booking={b} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <CreateAppointmentDialog
        form={form}
        showCreate={showCreate}
        setShowCreate={setShowCreate}
        seekers={seekers}
        consultants={consultants}
        consultantMap={consultantMap}
        createMutation={createMutation}
      />
      <DetailDialog />
    </div>
  );
}

// ── Small layout helpers ───────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
