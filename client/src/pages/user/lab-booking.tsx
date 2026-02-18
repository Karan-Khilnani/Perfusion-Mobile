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
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useRazorpay } from "@/hooks/use-razorpay";
import { StarRating } from "@/components/star-rating";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ArrowLeft, Check, CreditCard, MapPin, Clock, DollarSign } from "lucide-react";
import type { Lab, LabTest } from "@shared/schema";

interface LabWithTests extends Lab {
  tests: LabTest[];
}

const bookingSchema = z.object({
  testId: z.string().min(1, "Please select a test"),
  patientName: z.string().min(2, "Patient name is required"),
  patientAge: z.coerce.number().min(1, "Age must be at least 1").max(150, "Invalid age"),
  provisionalDiagnosis: z.string().optional(),
  ipdNumber: z.string().optional(),
  bedNumber: z.string().optional(),
  orderingPhysician: z.string().optional(),
});

type BookingFormData = z.infer<typeof bookingSchema>;

export default function LabBookingPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState<"details" | "payment" | "confirmation">("details");
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [selectedTest, setSelectedTest] = useState<LabTest | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"pay_now" | "pay_later">("pay_later");
  const { openCheckout } = useRazorpay();

  const { data: lab, isLoading } = useQuery<LabWithTests>({
    queryKey: ["/api/labs", id],
    enabled: !!id,
  });

  const form = useForm<BookingFormData>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      testId: "",
      patientName: "",
      patientAge: "" as unknown as number,
      provisionalDiagnosis: "",
      ipdNumber: "",
      bedNumber: "",
      orderingPhysician: "",
    },
  });

  const bookingMutation = useMutation({
    mutationFn: async (data: BookingFormData) => {
      const test = lab?.tests.find((t) => t.id === data.testId);
      if (!test || !lab) throw new Error("Test not found");

      const response = await apiRequest("POST", "/api/bookings", {
        bookingType: "lab",
        serviceId: test.id,
        serviceName: test.testName,
        providerName: lab.name,
        patientName: data.patientName,
        patientAge: data.patientAge,
        provisionalDiagnosis: data.provisionalDiagnosis || null,
        ipdNumber: data.ipdNumber || null,
        bedNumber: data.bedNumber || null,
        orderingPhysician: data.orderingPhysician || null,
        amount: test.cost,
        status: "booked",
        paymentStatus: "pending",
        paymentMethod: paymentMethod,
      });
      return response.json();
    },
    onSuccess: (data) => {
      setBookingId(data.id);

      if (paymentMethod === "pay_now") {
        const fee = parseFloat(data.amount || "0");
        openCheckout({
          amount: fee,
          bookingId: data.id,
          description: `Lab Test: ${data.serviceName}`,
          prefill: { name: form.getValues("patientName") },
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
            queryClient.invalidateQueries({ queryKey: ["/api/billing/my-invoices"] });
            setStep("confirmation");
            toast({ title: "Payment Successful", description: "Your lab test has been booked and paid." });
          },
          onError: (msg) => {
            setStep("confirmation");
            toast({ title: "Payment Pending", description: msg || "You can pay later from the billing page.", variant: "destructive" });
          },
        });
      } else {
        setStep("confirmation");
        queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
        toast({ title: "Booking Confirmed", description: "Your lab test has been booked successfully." });
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

  const handleTestSelect = (testId: string) => {
    form.setValue("testId", testId);
    const test = lab?.tests.find((t) => t.id === testId);
    setSelectedTest(test || null);
  };

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

  if (!lab) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">Lab not found</p>
          <Link href="/user/labs">
            <Button variant="outline" className="mt-4">
              Back to Labs
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
            <h2 className="mb-2 text-2xl font-semibold">Booking Confirmed!</h2>
            <p className="mb-6 text-muted-foreground">
              Your lab test has been booked successfully.
            </p>

            <div className="mb-8 rounded-lg border bg-muted/30 p-6 text-left">
              <h3 className="mb-4 font-semibold">Booking Details</h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Booking ID</dt>
                  <dd className="font-mono">{bookingId}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Lab</dt>
                  <dd>{lab.name}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Test</dt>
                  <dd>{selectedTest?.testName}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Patient</dt>
                  <dd>{form.getValues("patientName")}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Amount Paid</dt>
                  <dd className="font-semibold">₹{selectedTest?.cost}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd className="text-green-600 dark:text-green-400">Confirmed</dd>
                </div>
              </dl>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Link href="/user/orders">
                <Button data-testid="button-view-order">View Order Status</Button>
              </Link>
              <Link href="/user/labs">
                <Button variant="outline">Book Another Test</Button>
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
        <Link href="/user/labs">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Book Lab Test</h1>
          <p className="text-muted-foreground">{lab.name}</p>
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
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {step === "details" && (
              <Card>
                <CardHeader>
                  <CardTitle>Patient Details</CardTitle>
                  <CardDescription>
                    Enter the patient information for this lab test
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="testId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Select Test *</FormLabel>
                        <Select value={field.value} onValueChange={handleTestSelect}>
                          <FormControl>
                            <SelectTrigger data-testid="select-test">
                              <SelectValue placeholder="Choose a test" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {lab.tests.map((test) => (
                              <SelectItem key={test.id} value={test.id}>
                                <div className="flex items-center gap-2">
                                  <span>{test.testName}</span>
                                  <span className="text-muted-foreground">
                                    - ₹{test.cost}
                                  </span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {selectedTest && (
                    <div className="rounded-lg border bg-muted/30 p-4">
                      <div className="flex flex-wrap items-center gap-4 text-sm">
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-4 w-4 text-muted-foreground" />
                          ₹{selectedTest.cost}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          {selectedTest.turnaroundTime}
                        </span>
                        <StarRating
                          rating={4.5}
                          size="sm"
                        />
                      </div>
                    </div>
                  )}

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
                        <FormLabel>Provisional Diagnosis</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Enter provisional diagnosis (optional)"
                            {...field}
                            data-testid="input-diagnosis"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="ipdNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>IPD Number</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="IPD No."
                              {...field}
                              data-testid="input-ipd-number"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="bedNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Bed Number</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Bed No."
                              {...field}
                              data-testid="input-bed-number"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="orderingPhysician"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ordering Physician</FormLabel>
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
                    disabled={!selectedTest}
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
                    Complete payment to confirm your booking
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <h3 className="mb-3 font-medium">Order Summary</h3>
                    <dl className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Test</dt>
                        <dd>{selectedTest?.testName}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Lab</dt>
                        <dd>{lab.name}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Patient</dt>
                        <dd>{form.getValues("patientName")}</dd>
                      </div>
                      <div className="flex justify-between border-t pt-2">
                        <dt className="font-medium">Total Amount</dt>
                        <dd className="font-semibold">₹{selectedTest?.cost}</dd>
                      </div>
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
                          <div className="text-sm text-muted-foreground">Mark as paid immediately (offline payment).</div>
                        </div>
                      </label>
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
                      type="submit"
                      className="flex-1"
                      disabled={bookingMutation.isPending}
                      data-testid="button-confirm-payment"
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
