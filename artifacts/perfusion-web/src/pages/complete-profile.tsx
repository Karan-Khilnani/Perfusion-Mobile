import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Heart, Loader2, User, Building, Upload } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

const profileSchema = z.object({
  role: z.enum(["care_seeker", "provider"]),
  hospitalName: z.string().min(2, "Hospital name is required"),
  hospitalAddress: z.string().min(5, "Hospital address is required"),
  hospitalRegistrationNo: z.string().min(1, "Registration number is required"),
  hospitalRegisteredOrg: z.string().min(2, "Registered organization is required"),
  phone: z.string().optional(),
  providerType: z.enum(["lab", "consultant", "hospital", "transport", "teleradiology"]).optional(),
  description: z.string().optional(),
  location: z.string().optional(),
}).refine((data) => {
  if (data.role === "provider") return !!data.providerType;
  return true;
}, { message: "Please select your provider type", path: ["providerType"] })
  .refine((data) => {
    if (data.role === "provider") return !!data.phone && data.phone.length >= 10;
    return true;
  }, { message: "Valid phone number is required for providers", path: ["phone"] })
  .refine((data) => {
    if (data.role === "provider") return !!data.location && data.location.length >= 2;
    return true;
  }, { message: "City/location is required for providers", path: ["location"] });

type ProfileFormData = z.infer<typeof profileSchema>;

export default function CompleteProfilePage() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const params = new URLSearchParams(searchString);
  const presetRole = params.get("role");

  const { data: currentUser } = useQuery<any>({
    queryKey: ["/api/auth/user"],
  });

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      role: (presetRole === "provider" ? "provider" : "care_seeker") as "care_seeker" | "provider",
      hospitalName: "",
      hospitalAddress: "",
      hospitalRegistrationNo: "",
      hospitalRegisteredOrg: "",
      phone: "",
      providerType: undefined,
      description: "",
      location: "",
    },
  });

  const profileMutation = useMutation({
    mutationFn: async (data: ProfileFormData) => {
      const res = await apiRequest("POST", "/api/auth/complete-profile", {
        ...data,
        registrationDocumentUrl: documentUrl,
      });
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.setQueryData(["/api/auth/user"], result);
      toast({
        title: "Profile submitted",
        description: "Your registration is pending admin approval. You'll be notified once approved.",
      });
      setLocation("/pending-approval");
    },
    onError: (error: Error) => {
      toast({ title: "Failed to complete profile", description: error.message, variant: "destructive" });
    },
  });

  const handleDocumentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("document", file);
      const res = await fetch("/api/upload/document", { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      setDocumentUrl(data.url);
      toast({ title: "Document uploaded" });
    } catch {
      toast({ title: "Upload failed", description: "Please try again", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const selectedRole = form.watch("role");

  const onSubmit = (data: ProfileFormData) => {
    profileMutation.mutate(data);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="flex items-center gap-2">
              <Heart className="h-8 w-8 text-primary" />
              <span className="text-2xl font-bold">Perfusion</span>
            </div>
          </div>
          <CardTitle>Complete Your Profile</CardTitle>
          <CardDescription>
            {currentUser?.email ? (
              <>Signed in as <span className="font-medium">{currentUser.email}</span>. Please provide your details to continue.</>
            ) : (
              "Please provide your details to continue."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>I am a</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        className="grid grid-cols-2 gap-4"
                      >
                        <div>
                          <RadioGroupItem value="care_seeker" id="cp_care_seeker" className="peer sr-only" />
                          <Label
                            htmlFor="cp_care_seeker"
                            className={`flex flex-col items-center justify-between rounded-md border-2 p-4 cursor-pointer ${
                              selectedRole === "care_seeker" ? "border-primary bg-primary/5" : "border-muted"
                            }`}
                            data-testid="radio-cp-care-seeker"
                          >
                            <User className="mb-2 h-6 w-6" />
                            <span className="text-sm font-medium">Care Seeker</span>
                            <span className="text-xs text-muted-foreground mt-1">Hospital seeking services</span>
                          </Label>
                        </div>
                        <div>
                          <RadioGroupItem value="provider" id="cp_provider" className="peer sr-only" />
                          <Label
                            htmlFor="cp_provider"
                            className={`flex flex-col items-center justify-between rounded-md border-2 p-4 cursor-pointer ${
                              selectedRole === "provider" ? "border-primary bg-primary/5" : "border-muted"
                            }`}
                            data-testid="radio-cp-provider"
                          >
                            <Building className="mb-2 h-6 w-6" />
                            <span className="text-sm font-medium">Care Provider</span>
                            <span className="text-xs text-muted-foreground mt-1">Lab, Consultant, Hospital</span>
                          </Label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="hospitalName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {selectedRole === "provider" ? "Business / Organization Name" : "Hospital / Organization Name"}
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={selectedRole === "provider" ? "e.g. CityPath Diagnostics" : "e.g. City General Hospital"}
                        {...field}
                        data-testid="input-hospital-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {selectedRole === "provider" && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="providerType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Provider Type</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-provider-type">
                                <SelectValue placeholder="Select type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="lab">Diagnostic Lab</SelectItem>
                              <SelectItem value="consultant">Specialist / Consultant</SelectItem>
                              <SelectItem value="hospital">Hospital / Critical Care</SelectItem>
                              <SelectItem value="teleradiology">Teleradiology Centre</SelectItem>
                              <SelectItem value="transport">Transport / Ambulance</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="location"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>City / Location</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., Raipur" data-testid="input-location" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone Number</FormLabel>
                        <FormControl>
                          <PhoneInput data-testid="input-phone" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Brief description of your services"
                            data-testid="input-description"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}

              <Separator />

              <FormField
                control={form.control}
                name="hospitalAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {selectedRole === "provider" ? "Business Address" : "Hospital Address"}
                    </FormLabel>
                    <FormControl>
                      <Textarea placeholder="Full address including city, state, and PIN code" {...field} data-testid="input-hospital-address" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="hospitalRegistrationNo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Registration Number</FormLabel>
                      <FormControl>
                        <Input placeholder="Registration number" {...field} data-testid="input-registration-no" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="hospitalRegisteredOrg"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Registered With</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., MCI, NABL, NMC" {...field} data-testid="input-registered-org" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-2">
                <Label>Registration Certificate (optional)</Label>
                <div className="border-2 border-dashed rounded-md p-4 text-center">
                  {documentUrl ? (
                    <div className="text-sm text-muted-foreground">
                      Document uploaded successfully
                      <Button
                        type="button"
                        variant="ghost"
                        className="ml-2"
                        onClick={() => setDocumentUrl(null)}
                        data-testid="button-remove-doc"
                      >
                        Remove
                      </Button>
                    </div>
                  ) : (
                    <label className="cursor-pointer flex flex-col items-center gap-2">
                      <Upload className="h-6 w-6 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        {uploading ? "Uploading..." : "Upload registration certificate (PDF, JPEG, PNG)"}
                      </span>
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        className="hidden"
                        onChange={handleDocumentUpload}
                        disabled={uploading}
                        data-testid="input-document-upload"
                      />
                    </label>
                  )}
                </div>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={profileMutation.isPending}
                data-testid="button-complete-profile"
              >
                {profileMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit for Approval"
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
