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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ArrowLeft, Check, CreditCard, Briefcase, Clock, Users, MapPin } from "lucide-react";
import type { Hospital, CriticalCareDoctor } from "@shared/schema";

const bookingSchema = z.object({
  patientName: z.string().min(2, "Patient name is required"),
  patientAge: z.coerce.number().min(1, "Age must be at least 1").max(150, "Invalid age"),
  provisionalDiagnosis: z.string().min(5, "Please describe the emergency situation"),
  orderingPhysician: z.string().optional(),
});

type BookingFormData = z.infer<typeof bookingSchema>;

export default function CriticalCareBookingPage() {
  const { type, id } = useParams<{ type: string; id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState<"details" | "payment" | "confirmation">("details");
  const [bookingId, setBookingId] = useState<string | null>(null);

  const isDoctor = type === "doctor";

  const { data: doctor, isLoading: doctorLoading } = useQuery<CriticalCareDoctor>({
    queryKey: ["/api/critical-care/doctors", id],
    enabled: isDoctor && !!id,
  });

  const { data: hospital, isLoading: hospitalLoading } = useQuery<Hospital>({
    queryKey: ["/api/hospitals", id],
    enabled: !isDoctor && !!id,
  });

  const isLoading = isDoctor ? doctorLoading : hospitalLoading;
  const entity = isDoctor ? doctor : hospital;

  const form = useForm<BookingFormData>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      patientName: "",
      patientAge: "" as unknown as number,
      provisionalDiagnosis: "",
      orderingPhysician: "",
    },
  });

  const bookingMutation = useMutation({
    mutationFn: async (data: BookingFormData) => {
      if (!entity) throw new Error("Service not found");

      const response = await apiRequest("POST", "/api/bookings", {
        bookingType: "critical_care",
        serviceId: entity.id,
        serviceName: isDoctor 
          ? `Critical Care Consultation with ${(entity as CriticalCareDoctor).name}`
          : `Emergency Support from ${(entity as Hospital).name}`,
        providerName: entity.name,
        patientName: data.patientName,
        patientAge: data.patientAge,
        provisionalDiagnosis: data.provisionalDiagnosis,
        orderingPhysician: data.orderingPhysician || null,
        amount: "0.00",
        status: "booked",
        paymentStatus: "paid",
      });
      return response.json();
    },
    onSuccess: (data) => {
      setBookingId(data.bookingNumber || data.id);
      setStep("confirmation");
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      toast({
        title: "Request Submitted",
        description: "Your critical care request has been submitted successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Request Failed",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: BookingFormData) => {
    if (step === "details") {
      setStep("payment");
    } else if (step === "payment") {
      bookingMutation.mutate(data);
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

  if (!entity) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">Service not found</p>
          <Link href="/user/critical-care">
            <Button variant="outline" className="mt-4">
              Back to Critical Care
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
            <h2 className="mb-2 text-2xl font-semibold">Request Submitted!</h2>
            <p className="mb-6 text-muted-foreground">
              Your critical care request has been submitted. The team will respond shortly.
            </p>

            <div className="mb-8 rounded-lg border bg-muted/30 p-6 text-left">
              <h3 className="mb-4 font-semibold">Request Details</h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Request ID</dt>
                  <dd className="font-mono">{bookingId}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">
                    {isDoctor ? "Doctor" : "Hospital"}
                  </dt>
                  <dd>{entity.name}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Patient</dt>
                  <dd>{form.getValues("patientName")}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd className="text-green-600 dark:text-green-400">Submitted</dd>
                </div>
              </dl>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Link href="/user/orders">
                <Button data-testid="button-view-request">Track Request</Button>
              </Link>
              <Link href="/user/critical-care">
                <Button variant="outline">Back to Critical Care</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/user/critical-care">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {isDoctor ? "Request Consultation" : "Request Support"}
          </h1>
          <p className="text-muted-foreground">{entity.name}</p>
        </div>
      </div>

      <div className="mb-8 flex items-center justify-center gap-2">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
            step === "details"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
          }`}
        >
          1
        </div>
        <div className="h-0.5 w-16 bg-muted" />
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
            step === "payment"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
          }`}
        >
          2
        </div>
        <div className="h-0.5 w-16 bg-muted" />
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground">
          3
        </div>
      </div>

      <div className="mx-auto max-w-2xl">
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold">{entity.name}</h3>
                {isDoctor && (
                  <p className="text-sm text-muted-foreground">
                    {(entity as CriticalCareDoctor).qualification}
                  </p>
                )}
                {!isDoctor && (
                  <div className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    {(entity as Hospital).location}
                  </div>
                )}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              {isDoctor ? (
                <>
                  <span className="flex items-center gap-1">
                    <Briefcase className="h-3.5 w-3.5" />
                    {(entity as CriticalCareDoctor).yearsExperience} years experience
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {(entity as CriticalCareDoctor).responseTime} response
                  </span>
                </>
              ) : (
                <>
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    Team of {(entity as Hospital).teamStrength}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {(entity as Hospital).emergencyResponseTime}
                  </span>
                  {(entity as Hospital).icuCapability && (
                    <Badge variant="secondary">ICU Available</Badge>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {step === "details" && (
              <Card>
                <CardHeader>
                  <CardTitle>Emergency Details</CardTitle>
                  <CardDescription>
                    Provide information about the emergency situation
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="patientName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Patient Name *</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Enter patient's full name"
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
                        <FormLabel>Patient Age *</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="Enter age"
                            {...field}
                            data-testid="input-patient-age"
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
                        <FormLabel>Emergency Description *</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Describe the emergency situation and immediate needs..."
                            className="min-h-[120px]"
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
                        <FormLabel>Referring Physician</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Enter physician name (optional)"
                            {...field}
                            data-testid="input-physician"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button
                    type="submit"
                    className="w-full"
                    data-testid="button-proceed"
                  >
                    Review & Submit
                  </Button>
                </CardContent>
              </Card>
            )}

            {step === "payment" && (
              <Card>
                <CardHeader>
                  <CardTitle>Review & Submit</CardTitle>
                  <CardDescription>
                    Review the details and submit your request
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <h3 className="mb-3 font-medium">Request Summary</h3>
                    <dl className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">
                          {isDoctor ? "Doctor" : "Hospital"}
                        </dt>
                        <dd>{entity.name}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Patient</dt>
                        <dd>{form.getValues("patientName")}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Age</dt>
                        <dd>{form.getValues("patientAge")}</dd>
                      </div>
                      <div className="border-t pt-2">
                        <dt className="mb-1 text-muted-foreground">Emergency Description</dt>
                        <dd className="text-sm">{form.getValues("provisionalDiagnosis")}</dd>
                      </div>
                    </dl>
                  </div>

                  <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-900/30 dark:bg-yellow-900/20">
                    <p className="text-sm text-yellow-800 dark:text-yellow-200">
                      This is an emergency service request. The team will contact you as soon as possible.
                    </p>
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
                      type="submit"
                      className="flex-1"
                      disabled={bookingMutation.isPending}
                      data-testid="button-submit-request"
                    >
                      {bookingMutation.isPending ? "Submitting..." : "Submit Request"}
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
