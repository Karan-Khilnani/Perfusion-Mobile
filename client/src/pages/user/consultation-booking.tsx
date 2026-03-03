import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useRazorpay } from "@/hooks/use-razorpay";
import { StarRating } from "@/components/star-rating";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Check, CreditCard, Briefcase, Video, Upload, FileText, X } from "lucide-react";
import type { Consultant } from "@shared/schema";

const bookingSchema = z.object({
  appointmentSlot: z.string().optional(),
  patientName: z.string().min(2, "Patient name is required"),
  patientAge: z.coerce.number().min(1, "Age must be at least 1").max(150, "Invalid age"),
  patientGender: z.enum(["male", "female", "other"], { required_error: "Gender is required" }),
  contactNumber: z.string().min(10, "Valid contact number required"),
  patientWeight: z.string().optional(),
  allergyNotSpecified: z.boolean().default(true),
  patientAllergies: z.string().optional(),
  uhidIpNumber: z.string().optional(),
  clinicalSummary: z.string().min(10, "Please provide clinical summary"),
  provisionalDiagnosis: z.string().optional(),
  orderingPhysician: z.string().optional(),
  examination: z.string().optional(),
  investigations: z.string().optional(),
});

type BookingFormData = z.infer<typeof bookingSchema>;

export default function ConsultationBookingPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState<"details" | "clinical" | "payment" | "confirmation">("details");
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [videoRoomId, setVideoRoomId] = useState<string | null>(null);
  const [reportFiles, setReportFiles] = useState<File[]>([]);
  const [reportUrls, setReportUrls] = useState<string[]>([]);
  const [chartFiles, setChartFiles] = useState<File[]>([]);
  const [chartUrls, setChartUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"pay_now" | "pay_later">("pay_later");
  const { openCheckout } = useRazorpay();

  const { data: consultant, isLoading } = useQuery<Consultant>({
    queryKey: ["/api/consultants", id],
    enabled: !!id,
  });

  const { data: emergencyTeam } = useQuery<any>({
    queryKey: ["/api/emergency-teams", id],
    enabled: !!id && !consultant && !isLoading,
  });

  const service = consultant || (emergencyTeam ? {
    ...emergencyTeam,
    name: `${emergencyTeam.department} Team`,
    specialization: emergencyTeam.department,
    yearsExperience: 0,
    availableSlots: [],
  } : null);

  const isEmergencyTeam = !consultant && !!emergencyTeam;

  const form = useForm<BookingFormData>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      appointmentSlot: "",
      patientName: "",
      patientAge: "" as unknown as number,
      patientGender: undefined,
      contactNumber: "",
      patientWeight: "",
      allergyNotSpecified: true,
      patientAllergies: "",
      uhidIpNumber: "",
      clinicalSummary: "",
      provisionalDiagnosis: "",
      orderingPhysician: "",
      examination: "",
      investigations: "",
    },
  });

  const uploadFile = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/upload/document", { method: "POST", body: formData, credentials: "include" });
    if (!res.ok) throw new Error("Upload failed");
    const data = await res.json();
    return data.url;
  };

  const handleReportFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setReportFiles(prev => [...prev, ...files]);
  };
  const removeReportFile = (index: number) => {
    setReportFiles(prev => prev.filter((_, i) => i !== index));
  };
  const handleChartFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setChartFiles(prev => [...prev, ...files]);
  };
  const removeChartFile = (index: number) => {
    setChartFiles(prev => prev.filter((_, i) => i !== index));
  };

  const bookingMutation = useMutation({
    mutationFn: async (data: BookingFormData) => {
      if (!service) throw new Error("Service not found");

      const uploadedReportUrls: string[] = [];
      const uploadedChartUrls: string[] = [];

      for (const file of reportFiles) {
        const url = await uploadFile(file);
        uploadedReportUrls.push(url);
      }
      for (const file of chartFiles) {
        const url = await uploadFile(file);
        uploadedChartUrls.push(url);
      }

      const response = await apiRequest("POST", "/api/bookings", {
        bookingType: "consultation",
        serviceId: service.id,
        serviceName: isEmergencyTeam ? `${emergencyTeam.department} Team` : service.name,
        providerName: isEmergencyTeam ? emergencyTeam.qualification : service.qualification,
        patientName: data.patientName,
        patientAge: data.patientAge,
        patientGender: data.patientGender,
        patientContact: data.contactNumber,
        patientWeight: data.patientWeight || null,
        patientAllergies: data.allergyNotSpecified ? null : (data.patientAllergies || null),
        patientAllergyNotSpecified: data.allergyNotSpecified,
        uhidIpNumber: data.uhidIpNumber || null,
        clinicalSummary: data.clinicalSummary,
        provisionalDiagnosis: data.provisionalDiagnosis || null,
        examination: data.examination || null,
        investigations: data.investigations || null,
        documentUrls: uploadedReportUrls.length > 0 ? uploadedReportUrls : null,
        treatmentChartUrls: uploadedChartUrls.length > 0 ? uploadedChartUrls : null,
        appointmentSlot: isEmergencyTeam ? "Emergency - Immediate" : data.appointmentSlot,
        amount: service.consultationFee,
        urgency: isEmergencyTeam ? "emergency" : "routine",
        status: "booked",
        paymentStatus: "pending",
        paymentMethod: paymentMethod,
      });
      return response.json();
    },
    onSuccess: (data) => {
      setBookingId(data.bookingNumber || data.id);
      if (data.videoRoomId) {
        setVideoRoomId(data.videoRoomId);
      }

      if (paymentMethod === "pay_now") {
        const fee = parseFloat(data.amount || service?.consultationFee || "0");
        openCheckout({
          amount: fee,
          bookingId: data.id,
          description: `Consultation: ${data.serviceName}`,
          prefill: { name: form.getValues("patientName"), contact: form.getValues("contactNumber") },
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
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
        toast({ title: "Appointment Confirmed", description: "Your consultation has been booked successfully." });
      }
    },
    onError: () => {
      toast({
        title: "Booking Failed",
        description: "Something went wrong. Please try again.",
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
      bookingMutation.mutate(data);
    }
  };

  const validateCurrentStep = () => {
    if (step === "details") {
      const fields: (keyof BookingFormData)[] = ["patientName", "patientAge", "patientGender", "contactNumber"];
      if (!isEmergencyTeam) fields.unshift("appointmentSlot");
      return form.trigger(fields);
    } else if (step === "clinical") {
      return form.trigger(["clinicalSummary"]);
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
              <StarRating rating={parseFloat(service.rating || "4.0")} />
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
                  {!isEmergencyTeam && (
                    <FormField
                      control={form.control}
                      name="appointmentSlot"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Select Time Slot *</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger data-testid="select-slot">
                                <SelectValue placeholder="Choose a slot" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {service.availableSlots?.map((slot, i) => (
                                <SelectItem key={i} value={slot}>
                                  {slot}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
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
                            <Input
                              placeholder="+91 XXXXX XXXXX"
                              {...field}
                              data-testid="input-contact"
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
                  <CardTitle>Clinical Information</CardTitle>
                  <CardDescription>
                    Provide clinical details for the specialist to review
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="clinicalSummary"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Clinical Summary *</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Describe chief complaints, history of present illness, relevant past history, examination findings..."
                            className="min-h-[120px]"
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
                    <p className="text-sm text-muted-foreground mb-3">
                      Consultation fee: ₹{service.consultationFee}
                    </p>
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
                    >
                      Back
                    </Button>
                    <Button
                      type="submit"
                      className="flex-1"
                      disabled={bookingMutation.isPending}
                      data-testid="button-confirm-booking"
                    >
                      {bookingMutation.isPending ? "Processing..." : paymentMethod === "pay_now" ? "Confirm & Pay" : "Confirm Booking"}
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
