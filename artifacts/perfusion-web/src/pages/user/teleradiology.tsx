import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { FileImage, Upload, AlertTriangle, Clock, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useRazorpay } from "@/hooks/use-razorpay";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { RadiologyModality } from "@shared/schema";

const teleradiologySchema = z.object({
  patientName: z.string().min(2, "Patient name is required"),
  patientAge: z.coerce.number().min(0, "Age must be positive").max(150, "Invalid age"),
  patientGender: z.enum(["male", "female", "other"], { required_error: "Gender is required" }),
  accessionNumber: z.string().min(1, "Accession Number / Hospital ID is required"),
  modalityId: z.string().min(1, "Please select a modality"),
  priority: z.enum(["routine", "emergency"], { required_error: "Priority is required" }),
  clinicalHistory: z.string().min(10, "Please provide clinical history"),
  provisionalDiagnosis: z.string().optional(),
  contactNumber: z.string().min(10, "Valid contact number required"),
});

type TeleradiologyFormData = z.infer<typeof teleradiologySchema>;

export default function TeleradiologyPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"pay_now" | "pay_later">("pay_later");
  const { toast } = useToast();
  const { openCheckout } = useRazorpay();

  const { data: modalities, isLoading: modalitiesLoading } = useQuery<RadiologyModality[]>({
    queryKey: ["/api/radiology-modalities"],
  });

  const form = useForm<TeleradiologyFormData>({
    resolver: zodResolver(teleradiologySchema),
    defaultValues: {
      patientName: "",
      patientAge: 0,
      patientGender: undefined,
      accessionNumber: "",
      modalityId: "",
      priority: "routine",
      clinicalHistory: "",
      provisionalDiagnosis: "",
      contactNumber: "",
    },
  });

  const createBookingMutation = useMutation({
    mutationFn: async (data: TeleradiologyFormData) => {
      const selectedModality = modalities?.find(m => m.id === data.modalityId);
      if (!selectedModality) throw new Error("Modality not found");
      
      const response = await apiRequest("POST", "/api/bookings", {
        bookingType: "teleradiology",
        serviceId: data.modalityId,
        serviceName: selectedModality.name,
        modalityId: data.modalityId,
        modalityName: selectedModality.name,
        patientName: data.patientName,
        patientAge: data.patientAge,
        patientGender: data.patientGender,
        patientContact: data.contactNumber,
        accessionNumber: data.accessionNumber,
        clinicalSummary: data.clinicalHistory,
        provisionalDiagnosis: data.provisionalDiagnosis,
        urgency: data.priority,
        amount: "0.00",
        status: "pending",
        paymentStatus: "pending",
        paymentMethod: paymentMethod,
      });
      return response.json();
    },
    onSuccess: (data: any) => {
      if (paymentMethod === "pay_now") {
        const fee = parseFloat(data.amount || "0");
        if (fee > 0) {
          openCheckout({
            amount: fee,
            bookingId: data.id,
            description: `Teleradiology: ${data.serviceName}`,
            prefill: { name: form.getValues("patientName"), contact: form.getValues("contactNumber") },
            onSuccess: () => {
              queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
              queryClient.invalidateQueries({ queryKey: ["/api/billing/my-invoices"] });
              form.reset();
              setSelectedFile(null);
              toast({ title: "Payment Successful", description: "Your teleradiology request has been submitted and paid." });
            },
            onError: (msg) => {
              form.reset();
              setSelectedFile(null);
              toast({ title: "Payment Pending", description: msg || "You can pay later from the billing page.", variant: "destructive" });
            },
          });
        } else {
          queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
          form.reset();
          setSelectedFile(null);
          toast({ title: "Request Submitted", description: "Your teleradiology request has been submitted." });
        }
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
        form.reset();
        setSelectedFile(null);
        toast({ title: "Request Submitted", description: "Your teleradiology reporting request has been submitted successfully." });
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to submit request. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: TeleradiologyFormData) => {
    createBookingMutation.mutate(data);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const groupedModalities = modalities?.reduce((acc, mod) => {
    const category = mod.category || "Other";
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(mod);
    return acc;
  }, {} as Record<string, RadiologyModality[]>);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Teleradiology Reporting</h1>
        <p className="text-muted-foreground">
          Upload imaging studies for expert radiologist reporting
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Request Report</CardTitle>
              <CardDescription>
                Fill in patient details and upload imaging files
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <div className="space-y-4">
                    <h3 className="font-medium">Patient Information</h3>
                    <div className="grid gap-4 md:grid-cols-3">
                      <FormField
                        control={form.control}
                        name="patientName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Patient Name</FormLabel>
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
                            <FormLabel>Age</FormLabel>
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
                      <FormField
                        control={form.control}
                        name="patientGender"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Gender</FormLabel>
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
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="contactNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Contact Number</FormLabel>
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
                      <FormField
                        control={form.control}
                        name="accessionNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Accession Number / Hospital ID *</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Enter ID for radiologist reference"
                                {...field}
                                data-testid="input-accession-number"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-medium">Study Details</h3>
                    <FormField
                      control={form.control}
                      name="modalityId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Modality / Study Type</FormLabel>
                          {modalitiesLoading ? (
                            <Skeleton className="h-10 w-full" />
                          ) : (
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-modality">
                                  <SelectValue placeholder="Select modality" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {groupedModalities &&
                                  Object.entries(groupedModalities).map(([category, mods]) => (
                                    <div key={category}>
                                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                                        {category}
                                      </div>
                                      {mods.map((mod) => (
                                        <SelectItem key={mod.id} value={mod.id}>
                                          {mod.name}
                                        </SelectItem>
                                      ))}
                                    </div>
                                  ))}
                              </SelectContent>
                            </Select>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="priority"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Priority</FormLabel>
                          <FormControl>
                            <RadioGroup
                              onValueChange={field.onChange}
                              value={field.value}
                              className="flex gap-4"
                            >
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem
                                  value="routine"
                                  id="routine"
                                  data-testid="radio-routine"
                                />
                                <Label
                                  htmlFor="routine"
                                  className="flex items-center gap-2 cursor-pointer"
                                >
                                  <Clock className="h-4 w-4 text-muted-foreground" />
                                  Routine
                                </Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem
                                  value="emergency"
                                  id="emergency"
                                  data-testid="radio-emergency"
                                />
                                <Label
                                  htmlFor="emergency"
                                  className="flex items-center gap-2 cursor-pointer"
                                >
                                  <AlertTriangle className="h-4 w-4 text-destructive" />
                                  Emergency
                                </Label>
                              </div>
                            </RadioGroup>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-medium">Clinical Information</h3>
                    <FormField
                      control={form.control}
                      name="clinicalHistory"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Clinical History</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Provide relevant clinical history, symptoms, and examination findings..."
                              className="min-h-[100px]"
                              {...field}
                              data-testid="input-clinical-history"
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
                              placeholder="E.g., Rule out pneumonia"
                              {...field}
                              data-testid="input-diagnosis"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-medium">Upload Images</h3>
                    <div className="rounded-lg border-2 border-dashed border-muted-foreground/25 p-6">
                      <div className="flex flex-col items-center gap-4">
                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                          <Upload className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-medium">
                            {selectedFile ? selectedFile.name : "Drop files here or click to upload"}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            DICOM, JPEG, PNG up to 100MB
                          </p>
                        </div>
                        <Input
                          type="file"
                          accept=".dcm,.jpg,.jpeg,.png,.zip"
                          onChange={handleFileChange}
                          className="max-w-xs"
                          data-testid="input-file-upload"
                        />
                        {selectedFile && (
                          <Badge variant="secondary" className="gap-2">
                            <CheckCircle className="h-3 w-3" />
                            File selected: {selectedFile.name}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-medium">Payment Option</h3>
                    <div className="rounded-lg border p-4">
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
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={createBookingMutation.isPending}
                    data-testid="button-submit-request"
                  >
                    {createBookingMutation.isPending ? "Submitting..." : paymentMethod === "pay_now" ? "Submit & Pay" : "Submit Request"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Available Modalities</CardTitle>
            </CardHeader>
            <CardContent>
              {modalitiesLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-4 w-full" />
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {groupedModalities &&
                    Object.entries(groupedModalities)
                      .slice(0, 5)
                      .map(([category, mods]) => (
                        <div key={category}>
                          <p className="text-xs font-medium text-muted-foreground mb-1">
                            {category}
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {mods.slice(0, 3).map((mod) => (
                              <Badge key={mod.id} variant="outline" className="text-xs">
                                {mod.name.split(" ")[0]}
                              </Badge>
                            ))}
                            {mods.length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{mods.length - 3}
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Reporting TAT</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Routine
                </span>
                <span className="font-medium">24-48 hours</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  Emergency
                </span>
                <span className="font-medium">2-4 hours</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileImage className="h-4 w-4" />
                How It Works
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3 text-sm">
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                    1
                  </span>
                  <span>Fill patient details and select modality</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                    2
                  </span>
                  <span>Upload DICOM or image files</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                    3
                  </span>
                  <span>Expert radiologist reviews the study</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                    4
                  </span>
                  <span>Receive detailed report via email</span>
                </li>
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
