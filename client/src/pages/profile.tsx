import { useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { ImageCropDialog } from "@/components/ui/image-crop-dialog";
import { apiRequest } from "@/lib/queryClient";
import { Camera, Loader2, Save, Building, User, Upload, FileText, X, Clock, PenLine } from "lucide-react";

const personalSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phone: z.string().optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
});

const fullAccountSchema = personalSchema.extend({
  hospitalName: z.string().optional(),
  hospitalAddress: z.string().optional(),
  hospitalRegistrationNo: z.string().optional(),
  hospitalRegisteredOrg: z.string().optional(),
});

const providerSchema = z.object({
  name: z.string().min(2, "Display name is required"),
  location: z.string().optional(),
  description: z.string().optional(),
  phone: z.string().optional(),
});

const consultantDetailsSchema = z.object({
  name: z.string().min(2, "Full name is required"),
  qualification: z.string().min(2, "Qualification is required"),
  specialization: z.string().min(2, "Specialization is required"),
  yearsExperience: z.coerce.number().min(1, "Years of experience must be at least 1"),
  consultationFee: z.coerce.number().positive("Consultation fee must be greater than 0"),
  registrationNumber: z.string().optional(),
  registeredOrganization: z.string().optional(),
  affiliatedInstitution: z.string().optional(),
  portfolio: z.string().optional(),
});

type PersonalFormData = z.infer<typeof personalSchema>;
type FullAccountFormData = z.infer<typeof fullAccountSchema>;
type ProviderFormData = z.infer<typeof providerSchema>;
type ConsultantDetailsFormData = z.infer<typeof consultantDetailsSchema>;

async function uploadImage(blob: Blob, filename: string): Promise<string> {
  const formData = new FormData();
  formData.append("file", blob, filename);
  const res = await fetch("/api/upload/document", { method: "POST", body: formData, credentials: "include" });
  if (!res.ok) throw new Error("Image upload failed");
  const data = await res.json();
  return data.url as string;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ProfilePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: user, isLoading: userLoading } = useQuery<any>({ queryKey: ["/api/auth/user"] });
  const { data: provider, isLoading: providerLoading } = useQuery<any>({
    queryKey: ["/api/providers/me"],
    retry: false,
    enabled: user?.role === "provider",
  });
  const { data: consultants } = useQuery<any[]>({
    queryKey: ["/api/provider/my-consultants"],
    retry: false,
    enabled: user?.role === "provider" && provider?.type === "consultant",
  });
  const consultant = consultants?.[0] || null;

  const [photoCropFile, setPhotoCropFile] = useState<File | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [currentPhotoUrl, setCurrentPhotoUrl] = useState<string | null>(null);
  const [regDocFile, setRegDocFile] = useState<File | null>(null);
  const [regDocUploading, setRegDocUploading] = useState(false);
  const [signatureUploading, setSignatureUploading] = useState(false);
  const [consultantRegDocUploading, setConsultantRegDocUploading] = useState(false);
  const [availabilityFrom, setAvailabilityFrom] = useState("09:00 AM");
  const [availabilityTo, setAvailabilityTo] = useState("05:00 PM");
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (consultant) {
      setAvailabilityFrom(consultant.availabilityFrom || "09:00 AM");
      setAvailabilityTo(consultant.availabilityTo || "05:00 PM");
    }
  }, [consultant?.id]);

  const personalForm = useForm<PersonalFormData>({
    resolver: zodResolver(personalSchema),
    values: user
      ? {
          firstName: user.firstName || "",
          lastName: user.lastName || "",
          phone: user.phone || "",
          email: user.email || "",
        }
      : undefined,
  });

  const fullAccountForm = useForm<FullAccountFormData>({
    resolver: zodResolver(fullAccountSchema),
    values: user
      ? {
          firstName: user.firstName || "",
          lastName: user.lastName || "",
          phone: user.phone || "",
          email: user.email || "",
          hospitalName: user.hospitalName || "",
          hospitalAddress: user.hospitalAddress || "",
          hospitalRegistrationNo: user.hospitalRegistrationNo || "",
          hospitalRegisteredOrg: user.hospitalRegisteredOrg || "",
        }
      : undefined,
  });

  const providerForm = useForm<ProviderFormData>({
    resolver: zodResolver(providerSchema),
    values: provider
      ? {
          name: provider.name || "",
          location: provider.location || "",
          description: provider.description || "",
          phone: provider.phone || "",
        }
      : undefined,
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: Partial<FullAccountFormData> & { profileImageUrl?: string; registrationDocumentUrl?: string }) => {
      const res = await apiRequest("PATCH", "/api/profile", data);
      return res.json();
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["/api/auth/user"], updated);
      toast({ title: "Profile updated", description: "Your profile details have been saved." });
    },
    onError: () => {
      toast({ title: "Update failed", description: "Could not save profile.", variant: "destructive" });
    },
  });

  const updateProviderMutation = useMutation({
    mutationFn: async (data: ProviderFormData) => {
      const res = await apiRequest("PATCH", "/api/providers/me", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/providers/me"] });
      toast({ title: "Provider profile updated" });
    },
    onError: () => {
      toast({ title: "Update failed", description: "Could not save provider profile.", variant: "destructive" });
    },
  });

  const updateSlotsMutation = useMutation({
    mutationFn: async ({ from, to }: { from: string; to: string }) => {
      if (!consultant?.id) throw new Error("No consultant record");
      const res = await apiRequest("PATCH", `/api/consultants/${consultant.id}/slots`, { availabilityFrom: from, availabilityTo: to });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/my-consultants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/dashboard"] });
      toast({ title: "Availability updated" });
    },
    onError: () => {
      toast({ title: "Update failed", description: "Could not save availability.", variant: "destructive" });
    },
  });

  const updateConsultantMutation = useMutation({
    mutationFn: async (data: { digitalSignatureUrl?: string }) => {
      if (!consultant?.id) throw new Error("No consultant record");
      const res = await apiRequest("PATCH", `/api/provider/consultants/${consultant.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/my-consultants"] });
      toast({ title: "Signature saved" });
    },
    onError: () => {
      toast({ title: "Update failed", description: "Could not save signature.", variant: "destructive" });
    },
  });

  const consultantDetailsForm = useForm<ConsultantDetailsFormData>({
    resolver: zodResolver(consultantDetailsSchema),
    values: consultant
      ? {
          name: consultant.name || "",
          qualification: consultant.qualification || "",
          specialization: consultant.specialization || "",
          yearsExperience: consultant.yearsExperience || 0,
          consultationFee: consultant.consultationFee || "",
          registrationNumber: consultant.registrationNumber || "",
          registeredOrganization: consultant.registeredOrganization || "",
          affiliatedInstitution: consultant.affiliatedInstitution || "",
          portfolio: consultant.portfolio || "",
        }
      : undefined,
  });

  const updateConsultantDetailsMutation = useMutation({
    mutationFn: async (data: ConsultantDetailsFormData & { registrationDocumentUrl?: string }) => {
      if (!consultant?.id) throw new Error("No consultant record");
      const payload = { ...data, consultationFee: String(data.consultationFee) };
      const res = await apiRequest("PATCH", `/api/provider/consultants/${consultant.id}`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/my-consultants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/dashboard"] });
      toast({ title: "Professional details saved" });
    },
    onError: () => {
      toast({ title: "Update failed", description: "Could not save professional details.", variant: "destructive" });
    },
  });

  const handleConsultantRegDocUpload = async (file: File) => {
    setConsultantRegDocUploading(true);
    try {
      const url = await uploadImage(file, file.name);
      await updateConsultantDetailsMutation.mutateAsync({
        ...consultantDetailsForm.getValues(),
        registrationDocumentUrl: url,
      });
    } catch {
      toast({ title: "Upload failed", description: "Could not upload document.", variant: "destructive" });
    } finally {
      setConsultantRegDocUploading(false);
    }
  };

  const handlePhotoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please select an image file.", variant: "destructive" });
      return;
    }
    setPhotoCropFile(file);
    setCropOpen(true);
    e.target.value = "";
  };

  const handleCropComplete = async (blob: Blob, filename: string) => {
    setPhotoUploading(true);
    try {
      const url = await uploadImage(blob, filename);
      setCurrentPhotoUrl(url);
      await updateProfileMutation.mutateAsync({ profileImageUrl: url });
    } catch {
      toast({ title: "Upload failed", description: "Could not upload photo.", variant: "destructive" });
    } finally {
      setPhotoUploading(false);
    }
  };

  const handleRegDocUpload = async (file: File) => {
    setRegDocUploading(true);
    try {
      const url = await uploadImage(file, file.name);
      await updateProfileMutation.mutateAsync({ registrationDocumentUrl: url });
    } catch {
      toast({ title: "Upload failed", description: "Could not upload document.", variant: "destructive" });
    } finally {
      setRegDocUploading(false);
      setRegDocFile(null);
    }
  };

  const handleSignatureUpload = async (file: File) => {
    setSignatureUploading(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      await updateConsultantMutation.mutateAsync({ digitalSignatureUrl: dataUrl });
    } catch {
      toast({ title: "Upload failed", description: "Could not save signature.", variant: "destructive" });
    } finally {
      setSignatureUploading(false);
    }
  };

  const isLoading = userLoading || (user?.role === "provider" && providerLoading);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const displayPhotoUrl = currentPhotoUrl || user?.profileImageUrl;
  const userInitials = user?.firstName && user?.lastName
    ? `${user.firstName[0]}${user.lastName[0]}`
    : user?.email?.[0]?.toUpperCase() || "U";

  const providerType = provider?.type;

  const timeOptions = [
    "12:00 AM","01:00 AM","02:00 AM","03:00 AM","04:00 AM","05:00 AM","06:00 AM","07:00 AM","08:00 AM","09:00 AM","10:00 AM","11:00 AM",
    "12:00 PM","01:00 PM","02:00 PM","03:00 PM","04:00 PM","05:00 PM","06:00 PM","07:00 PM","08:00 PM","09:00 PM","10:00 PM","11:00 PM",
  ];

  const photoCard = (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <User className="h-4 w-4" />
          Profile Photo
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-6">
          <div className="relative">
            <Avatar className="h-20 w-20">
              <AvatarImage src={displayPhotoUrl || undefined} />
              <AvatarFallback className="text-xl">{userInitials}</AvatarFallback>
            </Avatar>
            {photoUploading && (
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
                <Loader2 className="h-5 w-5 animate-spin text-white" />
              </div>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Upload a professional photo. It will be cropped and adjusted before saving.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => photoInputRef.current?.click()}
              disabled={photoUploading}
              data-testid="button-upload-photo"
            >
              <Camera className="h-4 w-4 mr-2" />
              {displayPhotoUrl ? "Change Photo" : "Upload Photo"}
            </Button>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoFileChange}
              data-testid="input-photo-file"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  // ── Consultant profile ─────────────────────────────────────────────────────
  if (providerType === "consultant") {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My Profile</h1>
          <p className="text-muted-foreground">Manage your personal and professional details</p>
        </div>

        {photoCard}

        {/* Display Details — shown to seekers */}
        {provider && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4" />
                Display Details
              </CardTitle>
              <CardDescription>These details are shown to care seekers when they browse your profile.</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...providerForm}>
                <form onSubmit={providerForm.handleSubmit((d) => updateProviderMutation.mutate(d))} className="space-y-4">
                  <FormField
                    control={providerForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Display Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Name shown to seekers" {...field} data-testid="input-provider-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={providerForm.control}
                      name="location"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>City / Location</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. Raipur" {...field} data-testid="input-provider-location" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={providerForm.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contact Phone</FormLabel>
                          <FormControl>
                            <Input placeholder="+91 XXXXX XXXXX" {...field} data-testid="input-provider-phone" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={providerForm.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Brief description of your services" {...field} data-testid="input-provider-description" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" disabled={updateProviderMutation.isPending} data-testid="button-save-provider">
                    {updateProviderMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving...</> : <><Save className="h-4 w-4 mr-2" />Save Display Details</>}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}

        {/* Professional Details — consultant record fields */}
        {consultant && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Professional Details
              </CardTitle>
              <CardDescription>Your qualifications, experience, and fee — used for bookings and seeker listings.</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...consultantDetailsForm}>
                <form
                  onSubmit={consultantDetailsForm.handleSubmit((d) => updateConsultantDetailsMutation.mutate(d))}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={consultantDetailsForm.control} name="name" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name</FormLabel>
                        <FormControl><Input placeholder="Dr. Full Name" {...field} data-testid="input-consultant-name" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={consultantDetailsForm.control} name="qualification" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Qualification</FormLabel>
                        <FormControl><Input placeholder="e.g. MD, DM (Cardiology)" {...field} data-testid="input-consultant-qualification" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={consultantDetailsForm.control} name="specialization" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Specialization</FormLabel>
                        <FormControl><Input placeholder="e.g. Cardiology" {...field} data-testid="input-consultant-specialization" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={consultantDetailsForm.control} name="yearsExperience" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Years of Experience</FormLabel>
                        <FormControl><Input type="number" min={0} placeholder="e.g. 10" {...field} data-testid="input-consultant-experience" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <FormField control={consultantDetailsForm.control} name="consultationFee" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Consultation Fee (₹)</FormLabel>
                      <FormControl><Input type="number" min={0} placeholder="e.g. 500" {...field} data-testid="input-consultant-fee" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <Separator />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={consultantDetailsForm.control} name="registrationNumber" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Registration Number</FormLabel>
                        <FormControl><Input placeholder="MCI/State reg. no." {...field} data-testid="input-consultant-reg-no" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={consultantDetailsForm.control} name="registeredOrganization" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Registered With</FormLabel>
                        <FormControl><Input placeholder="e.g. MCI, NMC" {...field} data-testid="input-consultant-reg-org" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <FormField control={consultantDetailsForm.control} name="affiliatedInstitution" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Affiliated Institution</FormLabel>
                      <FormControl><Input placeholder="e.g. AIIMS Raipur" {...field} data-testid="input-consultant-affiliation" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={consultantDetailsForm.control} name="portfolio" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Portfolio / Bio</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Brief bio, areas of expertise, notable achievements..." {...field} data-testid="input-consultant-portfolio" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  {/* Registration document */}
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Registration Document</p>
                    {consultant.registrationDocumentUrl ? (
                      <div className="flex items-center gap-2 rounded-md border p-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <a href={consultant.registrationDocumentUrl} target="_blank" rel="noopener noreferrer" className="flex-1 text-sm truncate text-primary underline">View Document</a>
                        <label className="cursor-pointer">
                          <Button type="button" variant="ghost" size="sm" asChild disabled={consultantRegDocUploading}>
                            <span>{consultantRegDocUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Replace"}</span>
                          </Button>
                          <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleConsultantRegDocUpload(f); if (e.target) e.target.value = ""; }} data-testid="input-replace-consultant-reg-doc" />
                        </label>
                      </div>
                    ) : (
                      <label className="flex items-center gap-2 rounded-md border border-dashed p-3 cursor-pointer hover:bg-muted/50 transition-colors" data-testid="label-upload-consultant-reg-doc">
                        <Upload className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">{consultantRegDocUploading ? "Uploading..." : "Upload registration certificate (PDF or image)"}</span>
                        <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleConsultantRegDocUpload(f); if (e.target) e.target.value = ""; }} />
                      </label>
                    )}
                  </div>

                  <Button type="submit" disabled={updateConsultantDetailsMutation.isPending} data-testid="button-save-consultant-details">
                    {updateConsultantDetailsMutation.isPending
                      ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving...</>
                      : <><Save className="h-4 w-4 mr-2" />Save Professional Details</>}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}

        {/* Account Details — availability + signature */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building className="h-4 w-4" />
              Account Details
            </CardTitle>
            <CardDescription>Your availability window and digital signature for prescriptions.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Availability */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">Availability</p>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">From</Label>
                  <select
                    value={availabilityFrom}
                    onChange={(e) => setAvailabilityFrom(e.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                    data-testid="select-availability-from"
                  >
                    {timeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <span className="text-muted-foreground mt-4">–</span>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">To</Label>
                  <select
                    value={availabilityTo}
                    onChange={(e) => setAvailabilityTo(e.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                    data-testid="select-availability-to"
                  >
                    {timeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <Button
                  size="sm"
                  className="mt-4"
                  onClick={() => updateSlotsMutation.mutate({ from: availabilityFrom, to: availabilityTo })}
                  disabled={updateSlotsMutation.isPending || !consultant}
                  data-testid="button-save-availability"
                >
                  {updateSlotsMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                </Button>
              </div>
            </div>

            <Separator />

            {/* Signature */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <PenLine className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">Digital Signature</p>
              </div>
              {consultant?.digitalSignatureUrl ? (
                <div className="space-y-2">
                  <div className="rounded-lg border p-3 bg-muted/20">
                    <img
                      src={consultant.digitalSignatureUrl}
                      alt="Digital Signature"
                      className="max-h-16 object-contain"
                    />
                  </div>
                  <label className="cursor-pointer inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted/50 transition-colors">
                    <Upload className="h-3.5 w-3.5" />
                    {signatureUploading ? "Uploading..." : "Replace Signature"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleSignatureUpload(f); e.target.value = ""; }}
                      data-testid="input-replace-signature"
                    />
                  </label>
                </div>
              ) : (
                <label className="flex items-center gap-2 rounded-md border border-dashed p-3 cursor-pointer hover:bg-muted/50 transition-colors" data-testid="label-upload-signature">
                  <Upload className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{signatureUploading ? "Uploading..." : "Upload your digital signature (image)"}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleSignatureUpload(f); e.target.value = ""; }}
                  />
                </label>
              )}
            </div>
          </CardContent>
        </Card>

        <ImageCropDialog
          open={cropOpen}
          onOpenChange={setCropOpen}
          imageFile={photoCropFile}
          onCropComplete={handleCropComplete}
          aspect={1}
          title="Crop Profile Photo"
        />
      </div>
    );
  }

  // ── Lab profile ────────────────────────────────────────────────────────────
  if (providerType === "lab") {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My Profile</h1>
          <p className="text-muted-foreground">Manage your lab's profile and registration details</p>
        </div>

        {photoCard}

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building className="h-4 w-4" />
              Account Details
            </CardTitle>
            <CardDescription>Your registration and contact information.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...fullAccountForm}>
              <form onSubmit={fullAccountForm.handleSubmit((d) => updateProfileMutation.mutate({ ...d, profileImageUrl: currentPhotoUrl || user?.profileImageUrl }))} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={fullAccountForm.control} name="firstName" render={({ field }) => (
                    <FormItem><FormLabel>First Name</FormLabel><FormControl><Input placeholder="First name" {...field} data-testid="input-first-name" /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={fullAccountForm.control} name="lastName" render={({ field }) => (
                    <FormItem><FormLabel>Last Name</FormLabel><FormControl><Input placeholder="Last name" {...field} data-testid="input-last-name" /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <FormField control={fullAccountForm.control} name="phone" render={({ field }) => (
                  <FormItem><FormLabel>Phone Number</FormLabel><FormControl><Input placeholder="+91 XXXXX XXXXX" {...field} data-testid="input-phone" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={fullAccountForm.control} name="email" render={({ field }) => (
                  <FormItem><FormLabel>Email</FormLabel><FormControl><Input placeholder="you@example.com" type="email" {...field} data-testid="input-email" /></FormControl><FormMessage /></FormItem>
                )} />
                <Separator />
                <FormField control={fullAccountForm.control} name="hospitalName" render={({ field }) => (
                  <FormItem><FormLabel>Lab / Organization Name</FormLabel><FormControl><Input placeholder="Lab name" {...field} data-testid="input-hospital-name" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={fullAccountForm.control} name="hospitalAddress" render={({ field }) => (
                  <FormItem><FormLabel>Address</FormLabel><FormControl><Textarea placeholder="Full address including city, state, and PIN code" {...field} data-testid="input-hospital-address" /></FormControl><FormMessage /></FormItem>
                )} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={fullAccountForm.control} name="hospitalRegistrationNo" render={({ field }) => (
                    <FormItem><FormLabel>Registration Number</FormLabel><FormControl><Input placeholder="Reg. number" {...field} data-testid="input-reg-no" /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={fullAccountForm.control} name="hospitalRegisteredOrg" render={({ field }) => (
                    <FormItem><FormLabel>Registered With</FormLabel><FormControl><Input placeholder="e.g. NABL, ICMR" {...field} data-testid="input-registered-org" /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Registration Document</p>
                  {user?.registrationDocumentUrl ? (
                    <div className="flex items-center gap-2 rounded-md border p-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <a href={user.registrationDocumentUrl} target="_blank" rel="noopener noreferrer" className="flex-1 text-sm truncate text-primary underline">View Document</a>
                      <label className="cursor-pointer">
                        <Button type="button" variant="ghost" size="sm" asChild disabled={regDocUploading}>
                          <span>{regDocUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Replace"}</span>
                        </Button>
                        <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleRegDocUpload(f); if (e.target) e.target.value = ""; }} data-testid="input-replace-reg-doc" />
                      </label>
                    </div>
                  ) : (
                    <label className="flex items-center gap-2 rounded-md border border-dashed p-3 cursor-pointer hover:bg-muted/50 transition-colors" data-testid="label-upload-reg-doc">
                      <Upload className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{regDocUploading ? "Uploading..." : "Upload registration certificate"}</span>
                      <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleRegDocUpload(f); if (e.target) e.target.value = ""; }} />
                    </label>
                  )}
                </div>
                <Button type="submit" disabled={updateProfileMutation.isPending} data-testid="button-save-profile">
                  {updateProfileMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving...</> : <><Save className="h-4 w-4 mr-2" />Save Profile</>}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        {provider && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Building className="h-4 w-4" />
                Provider Display Details
              </CardTitle>
              <CardDescription>These details are shown to care seekers when they browse your lab.</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...providerForm}>
                <form onSubmit={providerForm.handleSubmit((d) => updateProviderMutation.mutate(d))} className="space-y-4">
                  <FormField control={providerForm.control} name="name" render={({ field }) => (
                    <FormItem><FormLabel>Display Name</FormLabel><FormControl><Input placeholder="Name shown to seekers" {...field} data-testid="input-provider-name" /></FormControl><FormMessage /></FormItem>
                  )} />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={providerForm.control} name="location" render={({ field }) => (
                      <FormItem><FormLabel>City / Location</FormLabel><FormControl><Input placeholder="e.g. Raipur" {...field} data-testid="input-provider-location" /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={providerForm.control} name="phone" render={({ field }) => (
                      <FormItem><FormLabel>Contact Phone</FormLabel><FormControl><Input placeholder="+91 XXXXX XXXXX" {...field} data-testid="input-provider-phone" /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                  <FormField control={providerForm.control} name="description" render={({ field }) => (
                    <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea placeholder="Brief description of your lab services" {...field} data-testid="input-provider-description" /></FormControl><FormMessage /></FormItem>
                  )} />
                  <Button type="submit" disabled={updateProviderMutation.isPending} data-testid="button-save-provider">
                    {updateProviderMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving...</> : <><Save className="h-4 w-4 mr-2" />Save Provider Details</>}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}

        <ImageCropDialog open={cropOpen} onOpenChange={setCropOpen} imageFile={photoCropFile} onCropComplete={handleCropComplete} aspect={1} title="Crop Profile Photo" />
      </div>
    );
  }

  // ── Teleradiology profile ──────────────────────────────────────────────────
  if (providerType === "teleradiology") {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My Profile</h1>
          <p className="text-muted-foreground">Manage your teleradiology centre profile</p>
        </div>

        {photoCard}

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building className="h-4 w-4" />
              Account Details
            </CardTitle>
            <CardDescription>Your contact and registration information.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...personalForm}>
              <form onSubmit={personalForm.handleSubmit((d) => updateProfileMutation.mutate({ ...d, profileImageUrl: currentPhotoUrl || user?.profileImageUrl }))} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={personalForm.control} name="firstName" render={({ field }) => (
                    <FormItem><FormLabel>First Name</FormLabel><FormControl><Input placeholder="First name" {...field} data-testid="input-first-name" /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={personalForm.control} name="lastName" render={({ field }) => (
                    <FormItem><FormLabel>Last Name</FormLabel><FormControl><Input placeholder="Last name" {...field} data-testid="input-last-name" /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <FormField control={personalForm.control} name="phone" render={({ field }) => (
                  <FormItem><FormLabel>Phone Number</FormLabel><FormControl><Input placeholder="+91 XXXXX XXXXX" {...field} data-testid="input-phone" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={personalForm.control} name="email" render={({ field }) => (
                  <FormItem><FormLabel>Email</FormLabel><FormControl><Input placeholder="you@example.com" type="email" {...field} data-testid="input-email" /></FormControl><FormMessage /></FormItem>
                )} />
                <Button type="submit" disabled={updateProfileMutation.isPending} data-testid="button-save-profile">
                  {updateProfileMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving...</> : <><Save className="h-4 w-4 mr-2" />Save Profile</>}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        {provider && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Building className="h-4 w-4" />
                Provider Display Details
              </CardTitle>
              <CardDescription>These details are shown to care seekers when they browse your services.</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...providerForm}>
                <form onSubmit={providerForm.handleSubmit((d) => updateProviderMutation.mutate(d))} className="space-y-4">
                  <FormField control={providerForm.control} name="name" render={({ field }) => (
                    <FormItem><FormLabel>Display Name</FormLabel><FormControl><Input placeholder="Name shown to seekers" {...field} data-testid="input-provider-name" /></FormControl><FormMessage /></FormItem>
                  )} />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={providerForm.control} name="location" render={({ field }) => (
                      <FormItem><FormLabel>City / Location</FormLabel><FormControl><Input placeholder="e.g. Raipur" {...field} data-testid="input-provider-location" /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={providerForm.control} name="phone" render={({ field }) => (
                      <FormItem><FormLabel>Contact Phone</FormLabel><FormControl><Input placeholder="+91 XXXXX XXXXX" {...field} data-testid="input-provider-phone" /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                  <FormField control={providerForm.control} name="description" render={({ field }) => (
                    <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea placeholder="Brief description of your imaging services" {...field} data-testid="input-provider-description" /></FormControl><FormMessage /></FormItem>
                  )} />
                  <Button type="submit" disabled={updateProviderMutation.isPending} data-testid="button-save-provider">
                    {updateProviderMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving...</> : <><Save className="h-4 w-4 mr-2" />Save Provider Details</>}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}

        <ImageCropDialog open={cropOpen} onOpenChange={setCropOpen} imageFile={photoCropFile} onCropComplete={handleCropComplete} aspect={1} title="Crop Profile Photo" />
      </div>
    );
  }

  // ── Hospital / default profile (unchanged) ─────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My Profile</h1>
        <p className="text-muted-foreground">Manage your personal and organization details</p>
      </div>

      {photoCard}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building className="h-4 w-4" />
            {user?.role === "care_seeker" ? "Hospital / Organization Details" : "Account Details"}
          </CardTitle>
          <CardDescription>These details are used for billing, reports, and communications.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...fullAccountForm}>
            <form onSubmit={fullAccountForm.handleSubmit((d) => updateProfileMutation.mutate({ ...d, profileImageUrl: currentPhotoUrl || user?.profileImageUrl }))} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={fullAccountForm.control} name="firstName" render={({ field }) => (
                  <FormItem><FormLabel>First Name</FormLabel><FormControl><Input placeholder="First name" {...field} data-testid="input-first-name" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={fullAccountForm.control} name="lastName" render={({ field }) => (
                  <FormItem><FormLabel>Last Name</FormLabel><FormControl><Input placeholder="Last name" {...field} data-testid="input-last-name" /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <FormField control={fullAccountForm.control} name="phone" render={({ field }) => (
                <FormItem><FormLabel>Phone Number</FormLabel><FormControl><Input placeholder="+91 XXXXX XXXXX" {...field} data-testid="input-phone" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={fullAccountForm.control} name="email" render={({ field }) => (
                <FormItem><FormLabel>Email</FormLabel><FormControl><Input placeholder="you@example.com" type="email" {...field} data-testid="input-email" /></FormControl><FormMessage /></FormItem>
              )} />
              <Separator />
              <FormField control={fullAccountForm.control} name="hospitalName" render={({ field }) => (
                <FormItem>
                  <FormLabel>{user?.role === "care_seeker" ? "Hospital / Organization Name" : "Business Name"}</FormLabel>
                  <FormControl><Input placeholder="Organization name" {...field} data-testid="input-hospital-name" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={fullAccountForm.control} name="hospitalAddress" render={({ field }) => (
                <FormItem><FormLabel>Address</FormLabel><FormControl><Textarea placeholder="Full address including city, state, and PIN code" {...field} data-testid="input-hospital-address" /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={fullAccountForm.control} name="hospitalRegistrationNo" render={({ field }) => (
                  <FormItem><FormLabel>Registration Number</FormLabel><FormControl><Input placeholder="Reg. number" {...field} data-testid="input-reg-no" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={fullAccountForm.control} name="hospitalRegisteredOrg" render={({ field }) => (
                  <FormItem><FormLabel>Registered With</FormLabel><FormControl><Input placeholder="e.g. MCI, NABL" {...field} data-testid="input-registered-org" /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Registration Document</p>
                {user?.registrationDocumentUrl ? (
                  <div className="flex items-center gap-2 rounded-md border p-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <a href={user.registrationDocumentUrl} target="_blank" rel="noopener noreferrer" className="flex-1 text-sm truncate text-primary underline">View Document</a>
                    <label className="cursor-pointer">
                      <Button type="button" variant="ghost" size="sm" asChild disabled={regDocUploading}>
                        <span>{regDocUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Replace"}</span>
                      </Button>
                      <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleRegDocUpload(f); if (e.target) e.target.value = ""; }} data-testid="input-replace-reg-doc" />
                    </label>
                  </div>
                ) : (
                  <label className="flex items-center gap-2 rounded-md border border-dashed p-3 cursor-pointer hover:bg-muted/50 transition-colors" data-testid="label-upload-reg-doc">
                    <Upload className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{regDocUploading ? "Uploading..." : "Upload registration certificate"}</span>
                    <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleRegDocUpload(f); if (e.target) e.target.value = ""; }} />
                  </label>
                )}
              </div>
              <Button type="submit" disabled={updateProfileMutation.isPending} data-testid="button-save-profile">
                {updateProfileMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving...</> : <><Save className="h-4 w-4 mr-2" />Save Profile</>}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {user?.role === "provider" && provider && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building className="h-4 w-4" />
              Provider Display Details
            </CardTitle>
            <CardDescription>These details are shown to care seekers when they browse your services.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...providerForm}>
              <form onSubmit={providerForm.handleSubmit((d) => updateProviderMutation.mutate(d))} className="space-y-4">
                <FormField control={providerForm.control} name="name" render={({ field }) => (
                  <FormItem><FormLabel>Display Name</FormLabel><FormControl><Input placeholder="Name shown to seekers" {...field} data-testid="input-provider-name" /></FormControl><FormMessage /></FormItem>
                )} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={providerForm.control} name="location" render={({ field }) => (
                    <FormItem><FormLabel>City / Location</FormLabel><FormControl><Input placeholder="e.g. Raipur" {...field} data-testid="input-provider-location" /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={providerForm.control} name="phone" render={({ field }) => (
                    <FormItem><FormLabel>Contact Phone</FormLabel><FormControl><Input placeholder="+91 XXXXX XXXXX" {...field} data-testid="input-provider-phone" /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <FormField control={providerForm.control} name="description" render={({ field }) => (
                  <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea placeholder="Brief description of your services" {...field} data-testid="input-provider-description" /></FormControl><FormMessage /></FormItem>
                )} />
                <Button type="submit" disabled={updateProviderMutation.isPending} data-testid="button-save-provider">
                  {updateProviderMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving...</> : <><Save className="h-4 w-4 mr-2" />Save Provider Details</>}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      <ImageCropDialog open={cropOpen} onOpenChange={setCropOpen} imageFile={photoCropFile} onCropComplete={handleCropComplete} aspect={1} title="Crop Profile Photo" />
    </div>
  );
}
