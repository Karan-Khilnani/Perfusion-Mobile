import { useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Loader2, Building2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const providerSchema = z.object({
  type: z.enum(["lab", "consultant", "hospital", "transport"], { required_error: "Provider type is required" }),
  phone: z.string().min(10, "Valid phone number is required"),
  location: z.string().min(2, "City/location is required"),
  description: z.string().optional(),
});

type ProviderFormData = z.infer<typeof providerSchema>;

export default function ProviderOnboardingPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: provider, isLoading: providerLoading } = useQuery<any>({
    queryKey: ["/api/providers/me"],
    retry: false,
  });

  const { data: currentUser, isLoading: userLoading } = useQuery<any>({
    queryKey: ["/api/auth/user"],
  });

  useEffect(() => {
    if (!providerLoading && provider) {
      setLocation("/provider");
    }
  }, [provider, providerLoading, setLocation]);

  const form = useForm<ProviderFormData>({
    resolver: zodResolver(providerSchema),
    defaultValues: {
      type: undefined,
      phone: currentUser?.phone || "",
      location: "",
      description: "",
    },
  });

  useEffect(() => {
    if (currentUser?.phone) {
      form.setValue("phone", currentUser.phone);
    }
  }, [currentUser, form]);

  const createProviderMutation = useMutation({
    mutationFn: async (data: ProviderFormData) => {
      const payload = {
        name: currentUser?.hospitalName || `${currentUser?.firstName || ""} ${currentUser?.lastName || ""}`.trim() || "",
        type: data.type,
        description: data.description || "",
        location: data.location,
        address: currentUser?.hospitalAddress || "",
        phone: data.phone,
        email: currentUser?.email || "",
        licenseNumber: currentUser?.hospitalRegistrationNo || "",
        registeredOrganization: currentUser?.hospitalRegisteredOrg || "",
      };
      const providerRes = await apiRequest("POST", "/api/providers", payload);
      const provider = await providerRes.json();

      if (data.type === "consultant") {
        const consultantName = (
          currentUser?.hospitalName ||
          `${currentUser?.firstName || ""} ${currentUser?.lastName || ""}`.trim()
        );
        await apiRequest("POST", "/api/provider/consultants", {
          name: consultantName,
          qualification: "",
          specialization: "",
          yearsExperience: 0,
          consultationFee: "0",
          registrationNumber: currentUser?.hospitalRegistrationNo || "",
          registeredOrganization: currentUser?.hospitalRegisteredOrg || "",
          affiliatedInstitution: "",
          status: "active",
        });
      }

      return provider;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/providers/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/my-consultants"] });
      toast({
        title: "Registration Complete",
        description: "Your provider profile is ready. You can now add services.",
      });
      setLocation("/provider");
    },
    onError: (error: any) => {
      toast({
        title: "Registration Failed",
        description: error.message || "Failed to create provider profile. Please try again.",
        variant: "destructive",
      });
    },
  });

  if (providerLoading || userLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center gap-4 py-10">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading your profile...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (provider) return null;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-lg w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 p-4 rounded-full bg-primary/10">
            <Building2 className="h-8 w-8 text-primary" />
          </div>
          <CardTitle>A Few More Details</CardTitle>
          <CardDescription>
            Just a couple more things and you're all set. Your organization details from sign-up have already been saved.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((d) => createProviderMutation.mutate(d))} className="space-y-4">
              {currentUser?.hospitalName && (
                <div className="rounded-md bg-muted/50 p-3 text-sm">
                  <p className="font-medium">{currentUser.hospitalName}</p>
                  <p className="text-muted-foreground text-xs mt-0.5">{currentUser.hospitalAddress}</p>
                </div>
              )}

              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Provider Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-provider-type">
                          <SelectValue placeholder="Select your service type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="lab">Diagnostic Lab</SelectItem>
                        <SelectItem value="consultant">Specialist / Consultant</SelectItem>
                        <SelectItem value="hospital">Hospital / Critical Care</SelectItem>
                        <SelectItem value="transport">Transport / Ambulance Service</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number</FormLabel>
                      <FormControl>
                        <PhoneInput {...field} data-testid="input-provider-phone" />
                      </FormControl>
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
                        <Input placeholder="e.g., Raipur" {...field} data-testid="input-provider-location" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description <span className="text-xs text-muted-foreground">(optional)</span></FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Brief description of your services"
                        {...field}
                        data-testid="input-provider-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full"
                disabled={createProviderMutation.isPending}
                data-testid="button-submit-provider"
              >
                {createProviderMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving...</>
                ) : (
                  "Complete Setup"
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
