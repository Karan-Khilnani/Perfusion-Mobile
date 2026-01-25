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
import { StarRating } from "@/components/star-rating";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ArrowLeft, Check, CreditCard, Briefcase, Video, Upload, FileText } from "lucide-react";
import type { Consultant } from "@shared/schema";

const bookingSchema = z.object({
  appointmentSlot: z.string().min(1, "Please select a slot"),
  patientName: z.string().min(2, "Patient name is required"),
  patientAge: z.coerce.number().min(1, "Age must be at least 1").max(150, "Invalid age"),
  patientGender: z.enum(["male", "female", "other"], { required_error: "Gender is required" }),
  contactNumber: z.string().min(10, "Valid contact number required"),
  clinicalSummary: z.string().min(10, "Please provide clinical summary"),
  provisionalDiagnosis: z.string().optional(),
  orderingPhysician: z.string().optional(),
});

type BookingFormData = z.infer<typeof bookingSchema>;

function generateVideoRoomId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "perfusion-";
  for (let i = 0; i < 12; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export default function ConsultationBookingPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState<"details" | "clinical" | "payment" | "confirmation">("details");
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [videoRoomId, setVideoRoomId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const { data: consultant, isLoading } = useQuery<Consultant>({
    queryKey: ["/api/consultants", id],
    enabled: !!id,
  });

  const form = useForm<BookingFormData>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      appointmentSlot: "",
      patientName: "",
      patientAge: "" as unknown as number,
      patientGender: undefined,
      contactNumber: "",
      clinicalSummary: "",
      provisionalDiagnosis: "",
      orderingPhysician: "",
    },
  });

  const bookingMutation = useMutation({
    mutationFn: async (data: BookingFormData) => {
      if (!consultant) throw new Error("Consultant not found");

      const roomId = generateVideoRoomId();
      setVideoRoomId(roomId);

      const response = await apiRequest("POST", "/api/bookings", {
        bookingType: "consultation",
        serviceId: consultant.id,
        serviceName: consultant.name,
        providerName: consultant.qualification,
        patientName: data.patientName,
        patientAge: data.patientAge,
        patientGender: data.patientGender,
        patientContact: data.contactNumber,
        clinicalSummary: data.clinicalSummary,
        provisionalDiagnosis: data.provisionalDiagnosis || null,
        appointmentSlot: data.appointmentSlot,
        videoRoomId: roomId,
        amount: consultant.consultationFee,
        status: "confirmed",
        paymentStatus: "paid",
      });
      return response.json();
    },
    onSuccess: (data) => {
      setBookingId(data.id);
      setStep("confirmation");
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      toast({
        title: "Appointment Confirmed",
        description: "Your consultation has been booked successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Booking Failed",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

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
      return form.trigger(["appointmentSlot", "patientName", "patientAge", "patientGender", "contactNumber"]);
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

  if (!consultant) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">Consultant not found</p>
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
                  <dt className="text-muted-foreground">Consultant</dt>
                  <dd>{consultant.name}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Specialization</dt>
                  <dd>{consultant.specialization}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Time Slot</dt>
                  <dd>{form.getValues("appointmentSlot")}</dd>
                </div>
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
                <Link href={`/video/${videoRoomId}?returnTo=/user/orders`}>
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
          <p className="text-muted-foreground">{consultant.name}</p>
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
                <h3 className="font-semibold">{consultant.name}</h3>
                <p className="text-sm text-muted-foreground">{consultant.qualification}</p>
                {consultant.specialization && (
                  <Badge variant="secondary" className="mt-2">
                    {consultant.specialization}
                  </Badge>
                )}
              </div>
              <StarRating rating={parseFloat(consultant.rating || "4.0")} />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Briefcase className="h-3.5 w-3.5" />
                {consultant.yearsExperience} years experience
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
                            {consultant.availableSlots?.map((slot, i) => (
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

                  <div className="space-y-2">
                    <FormLabel>Upload Documents (Optional)</FormLabel>
                    <div className="rounded-lg border-2 border-dashed border-muted-foreground/25 p-4">
                      <div className="flex flex-col items-center gap-2">
                        <Upload className="h-8 w-8 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          {selectedFile ? selectedFile.name : "Upload reports, images, or documents"}
                        </p>
                        <Input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                          onChange={handleFileChange}
                          className="max-w-xs"
                          data-testid="input-file-upload"
                        />
                        {selectedFile && (
                          <Badge variant="secondary" className="gap-2">
                            <FileText className="h-3 w-3" />
                            {selectedFile.name}
                          </Badge>
                        )}
                      </div>
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
                        <dt className="text-muted-foreground">Consultant</dt>
                        <dd>{consultant.name}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Specialization</dt>
                        <dd>{consultant.specialization}</dd>
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
                      <span className="font-medium">Payment</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Consultation fee: ₹{consultant.consultationFee}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Payment will be processed after confirmation
                    </p>
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
                      {bookingMutation.isPending ? "Processing..." : "Confirm Booking"}
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
