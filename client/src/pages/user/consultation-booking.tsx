import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { StarRating } from "@/components/star-rating";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ArrowLeft, Check, CreditCard, DollarSign, Briefcase } from "lucide-react";
import type { Consultant } from "@shared/schema";

const bookingSchema = z.object({
  appointmentSlot: z.string().min(1, "Please select a slot"),
  patientName: z.string().min(2, "Patient name is required"),
  patientAge: z.coerce.number().min(1, "Age must be at least 1").max(150, "Invalid age"),
  orderingPhysician: z.string().optional(),
});

type BookingFormData = z.infer<typeof bookingSchema>;

export default function ConsultationBookingPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState<"details" | "payment" | "confirmation">("details");
  const [bookingId, setBookingId] = useState<string | null>(null);

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
      orderingPhysician: "",
    },
  });

  const bookingMutation = useMutation({
    mutationFn: async (data: BookingFormData) => {
      if (!consultant) throw new Error("Consultant not found");

      const response = await apiRequest("POST", "/api/bookings", {
        bookingType: "consultation",
        serviceId: consultant.id,
        serviceName: `Consultation with ${consultant.name}`,
        providerName: consultant.name,
        patientName: data.patientName,
        patientAge: data.patientAge,
        orderingPhysician: data.orderingPhysician || null,
        appointmentSlot: data.appointmentSlot,
        amount: consultant.consultationFee,
        status: "booked",
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
              Your consultation has been scheduled successfully.
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
                  <dt className="text-muted-foreground">Amount Paid</dt>
                  <dd className="font-semibold">${consultant.consultationFee}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd className="text-green-600 dark:text-green-400">Confirmed</dd>
                </div>
              </dl>
            </div>

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
                <DollarSign className="h-3.5 w-3.5" />
                ${consultant.consultationFee} per session
              </span>
            </div>
          </CardContent>
        </Card>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {step === "details" && (
              <Card>
                <CardHeader>
                  <CardTitle>Appointment Details</CardTitle>
                  <CardDescription>
                    Select a time slot and enter patient information
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
                    disabled={!form.watch("appointmentSlot")}
                    data-testid="button-proceed-payment"
                  >
                    Proceed to Payment
                  </Button>
                </CardContent>
              </Card>
            )}

            {step === "payment" && (
              <Card>
                <CardHeader>
                  <CardTitle>Payment</CardTitle>
                  <CardDescription>
                    Complete payment to confirm your appointment
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <h3 className="mb-3 font-medium">Appointment Summary</h3>
                    <dl className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Consultant</dt>
                        <dd>{consultant.name}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Time Slot</dt>
                        <dd>{form.getValues("appointmentSlot")}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Patient</dt>
                        <dd>{form.getValues("patientName")}</dd>
                      </div>
                      <div className="flex justify-between border-t pt-2">
                        <dt className="font-medium">Total Amount</dt>
                        <dd className="font-semibold">${consultant.consultationFee}</dd>
                      </div>
                    </dl>
                  </div>

                  <div className="rounded-lg border p-4">
                    <div className="mb-4 flex items-center gap-2">
                      <CreditCard className="h-5 w-5 text-muted-foreground" />
                      <span className="font-medium">Payment Method</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Payment simulation - Click confirm to complete booking
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
                      data-testid="button-confirm-payment"
                    >
                      {bookingMutation.isPending ? "Processing..." : "Confirm Payment"}
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
