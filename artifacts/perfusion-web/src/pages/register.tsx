import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Heart, Loader2, User, Building, Upload, FileText, X } from "lucide-react";
import { SiGoogle } from "react-icons/si";

const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string().min(6, "Password must be at least 6 characters"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  role: z.enum(["care_seeker", "provider"]),
  hospitalName: z.string().min(2, "Hospital name is required"),
  hospitalAddress: z.string().min(5, "Hospital address is required"),
  hospitalRegistrationNo: z.string().min(1, "Registration number is required"),
  hospitalRegisteredOrg: z.string().min(2, "Registered organization is required"),
  phone: z.string().optional(),
  providerType: z.enum(["lab", "consultant", "hospital", "transport"]).optional(),
  description: z.string().optional(),
  location: z.string().optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
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

type RegisterFormData = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const form = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
      firstName: "",
      lastName: "",
      role: "care_seeker",
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

  const registerMutation = useMutation({
    mutationFn: async (data: RegisterFormData) => {
      const { confirmPassword, ...registerData } = data;
      
      let registrationDocumentUrl: string | undefined;
      if (documentFile) {
        setIsUploading(true);
        const formData = new FormData();
        formData.append("file", documentFile);
        const uploadRes = await fetch("/api/upload/document", {
          method: "POST",
          body: formData,
        });
        if (uploadRes.ok) {
          const uploadResult = await uploadRes.json();
          registrationDocumentUrl = uploadResult.url;
        }
        setIsUploading(false);
      }

      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...registerData, registrationDocumentUrl }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Registration failed");
      }
      
      return response.json();
    },
    onSuccess: (user) => {
      queryClient.setQueryData(["/api/auth/user"], user);
      
      if (user.needsVerification) {
        toast({ title: "Account created!", description: "Please verify your email to continue." });
        setLocation("/verify-email");
        return;
      }
      
      toast({ title: "Account created!", description: "Your registration is pending approval." });
      setLocation("/pending-approval");
    },
    onError: (error: Error) => {
      toast({ title: "Registration failed", description: error.message, variant: "destructive" });
    },
  });

  const onSubmit = (data: RegisterFormData) => {
    registerMutation.mutate(data);
  };

  const selectedRole = form.watch("role");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast({ title: "File too large", description: "Maximum file size is 10MB", variant: "destructive" });
        return;
      }
      setDocumentFile(file);
    }
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
          <CardTitle>Create an Account</CardTitle>
          <CardDescription>Register your hospital on Perfusion Healthcare Platform</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => { window.location.href = "/api/auth/google?role=care_seeker"; }}
              data-testid="button-google-seeker"
            >
              <SiGoogle className="mr-2 h-4 w-4" />
              Care Seeker
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => { window.location.href = "/api/auth/google?role=provider"; }}
              data-testid="button-google-provider"
            >
              <SiGoogle className="mr-2 h-4 w-4" />
              Provider
            </Button>
          </div>
          <p className="text-xs text-center text-muted-foreground">Sign up with Google as your role</p>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <Separator className="w-full" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">Or register with email</span>
            </div>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                          <RadioGroupItem value="care_seeker" id="care_seeker" className="peer sr-only" />
                          <Label
                            htmlFor="care_seeker"
                            className={`flex flex-col items-center justify-between rounded-md border-2 p-4 cursor-pointer ${
                              selectedRole === "care_seeker" ? "border-primary bg-primary/5" : "border-muted"
                            }`}
                            data-testid="radio-care_seeker"
                          >
                            <User className="mb-2 h-6 w-6" />
                            <span className="text-sm font-medium">Care Seeker</span>
                            <span className="text-xs text-muted-foreground">Hospital seeking services</span>
                          </Label>
                        </div>
                        <div>
                          <RadioGroupItem value="provider" id="provider" className="peer sr-only" />
                          <Label
                            htmlFor="provider"
                            className={`flex flex-col items-center justify-between rounded-md border-2 p-4 cursor-pointer ${
                              selectedRole === "provider" ? "border-primary bg-primary/5" : "border-muted"
                            }`}
                            data-testid="radio-provider"
                          >
                            <Building className="mb-2 h-6 w-6" />
                            <span className="text-sm font-medium">Care Provider</span>
                            <span className="text-xs text-muted-foreground">Lab, Consultant, Radiology</span>
                          </Label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name</FormLabel>
                      <FormControl>
                        <Input placeholder="John" data-testid="input-firstName" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Doe" data-testid="input-lastName" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="you@example.com" data-testid="input-email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Create a password" data-testid="input-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Confirm password" data-testid="input-confirmPassword" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Separator />
              <p className="text-sm font-medium">
                {selectedRole === "provider" ? "Organization Details" : "Hospital Details"}
              </p>

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
                        placeholder={selectedRole === "provider" ? "e.g., CityPath Diagnostics" : "e.g., City General Hospital"}
                        data-testid="input-hospitalName"
                        {...field}
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

              <FormField
                control={form.control}
                name="hospitalAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {selectedRole === "provider" ? "Business Address" : "Hospital Address"}
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Full address including city, state, pin code"
                        data-testid="input-hospitalAddress"
                        {...field}
                      />
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
                        <Input placeholder="e.g., REG-2024-XXXXX" data-testid="input-hospitalRegistrationNo" {...field} />
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
                        <Input placeholder="e.g., MCI, NABL, NMC" data-testid="input-registered-org" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-2">
                <Label>Registration Document</Label>
                {documentFile ? (
                  <div className="flex items-center gap-2 rounded-md border p-3">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <span className="flex-1 text-sm truncate">{documentFile.name}</span>
                    <span className="text-xs text-muted-foreground">{(documentFile.size / 1024).toFixed(0)} KB</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setDocumentFile(null)}
                      data-testid="button-remove-document"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <label
                    className="flex items-center gap-3 rounded-md border border-dashed p-4 cursor-pointer hover-elevate"
                    data-testid="label-upload-document"
                  >
                    <Upload className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Upload registration certificate</p>
                      <p className="text-xs text-muted-foreground">PDF, JPEG, or PNG (max 10MB)</p>
                    </div>
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={handleFileChange}
                      data-testid="input-document-file"
                    />
                  </label>
                )}
              </div>
              
              <Button
                type="submit"
                className="w-full"
                disabled={registerMutation.isPending || isUploading}
                data-testid="button-register"
              >
                {registerMutation.isPending || isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {isUploading ? "Uploading document..." : "Creating account..."}
                  </>
                ) : (
                  "Create Account"
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground text-center">
            Already have an account?{" "}
            <Link href="/login" className="text-primary hover:underline" data-testid="link-login">
              Sign in
            </Link>
          </p>
          <Link href="/" className="text-sm text-muted-foreground hover:underline">
            Back to Home
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
