import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { ImageCropDialog } from "@/components/ui/image-crop-dialog";
import { apiRequest } from "@/lib/queryClient";
import { Camera, Loader2, Save, Building, User, Upload, FileText, X, Clock, PenLine, AlertCircle, CheckCircle2, Info, Phone, Plus, Pencil, Trash2, KeyRound } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ConsultantSlotEditor } from "@/components/consultant-slot-editor";

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

const MIN_BYTES = 10 * 1024; // 10 KB

function validateUpload(
  file: File | Blob,
  opts: { maxBytes: number; allowedTypes?: string[] }
): string | null {
  if (file.size < MIN_BYTES) {
    const kb = Math.round(file.size / 1024);
    return `File is too small (${kb} KB). Minimum size is 10 KB.`;
  }
  if (file.size > opts.maxBytes) {
    const maxMb = opts.maxBytes / (1024 * 1024);
    const fileMb = (file.size / (1024 * 1024)).toFixed(1);
    return `File is too large (${fileMb} MB). Maximum allowed size is ${maxMb} MB.`;
  }
  if (opts.allowedTypes && file instanceof File) {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const mime = file.type.toLowerCase();
    const allowed = opts.allowedTypes;
    const ok = allowed.some((t) => mime.includes(t) || ext === t);
    if (!ok) {
      return `Invalid file type. Accepted formats: ${allowed.join(", ").toUpperCase()}.`;
    }
  }
  return null;
}

async function uploadImage(blob: Blob, filename: string): Promise<string> {
  // Convert to base64 and send as JSON — same path as all other working API calls,
  // avoiding FormData/multipart/CORS-preflight issues entirely.
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data-URL prefix (e.g. "data:image/jpeg;base64,")
      resolve(result.split(",")[1] ?? result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  const ext = filename.split(".").pop()?.toLowerCase() ?? "bin";
  const mimeType = blob.type || `application/${ext}`;

  const res = await fetch("/api/upload/document", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ base64, filename, mimeType }),
  });

  if (!res.ok) {
    let reason = "Upload failed";
    try { const body = await res.json(); reason = body.message || reason; } catch {}
    throw new Error(reason);
  }
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

type WardContact = {
  id: string;
  userId: string;
  wardName: string;
  phoneNumber: string;
  createdAt: string;
};

function WardContactsCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [wardName, setWardName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("+91");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: contacts = [], isLoading } = useQuery<WardContact[]>({
    queryKey: ["/api/profile/ward-contacts"],
  });

  const resetForm = () => {
    setWardName("");
    setPhoneNumber("+91");
    setEditingId(null);
    setShowForm(false);
  };

  const handleSave = async () => {
    if (!wardName.trim()) { toast({ title: "Ward name is required", variant: "destructive" }); return; }
    if (!/^\+91\d{10}$/.test(phoneNumber)) { toast({ title: "Enter a valid 10-digit mobile number", variant: "destructive" }); return; }
    setSaving(true);
    try {
      if (editingId) {
        await apiRequest("PATCH", `/api/profile/ward-contacts/${editingId}`, { wardName: wardName.trim(), phoneNumber: phoneNumber.trim() });
        toast({ title: "Ward contact updated" });
      } else {
        await apiRequest("POST", "/api/profile/ward-contacts", { wardName: wardName.trim(), phoneNumber: phoneNumber.trim() });
        toast({ title: "Ward contact added" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/profile/ward-contacts"] });
      resetForm();
    } catch {
      toast({ title: "Failed to save ward contact", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (c: WardContact) => {
    setEditingId(c.id);
    setWardName(c.wardName);
    setPhoneNumber(c.phoneNumber || "+91");
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await apiRequest("DELETE", `/api/profile/ward-contacts/${id}`);
      queryClient.invalidateQueries({ queryKey: ["/api/profile/ward-contacts"] });
      toast({ title: "Ward contact deleted" });
    } catch {
      toast({ title: "Failed to delete ward contact", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Phone className="h-4 w-4" />
          Ward Contacts
        </CardTitle>
        <CardDescription>
          Phone numbers for your ICU / ward nurses. These appear as options when booking a consultation so the specialist can call back the correct number.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>
        ) : contacts.length === 0 && !showForm ? (
          <p className="text-sm text-muted-foreground">No ward contacts added yet.</p>
        ) : (
          <div className="space-y-2">
            {contacts.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{c.wardName}</p>
                  <p className="text-xs text-muted-foreground">{c.phoneNumber}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(c)} data-testid={`btn-edit-ward-${c.id}`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(c.id)} disabled={deletingId === c.id} data-testid={`btn-delete-ward-${c.id}`}>
                    {deletingId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {showForm ? (
          <div className="rounded-md border p-3 space-y-3">
            <p className="text-sm font-medium">{editingId ? "Edit ward contact" : "Add ward contact"}</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="wc-ward-name" className="text-xs">Ward / Location</Label>
                <Input id="wc-ward-name" placeholder="e.g. MICU, CICU, CCU" value={wardName} onChange={(e) => setWardName(e.target.value)} data-testid="input-ward-name" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="wc-phone" className="text-xs">Phone Number</Label>
                <PhoneInput id="wc-phone" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} data-testid="input-ward-phone" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={handleSave} disabled={saving} data-testid="btn-save-ward-contact">
                {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />Saving…</> : <><Save className="h-3.5 w-3.5 mr-1" />Save</>}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={resetForm}>Cancel</Button>
            </div>
          </div>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(true)} data-testid="btn-add-ward-contact">
            <Plus className="h-3.5 w-3.5 mr-1" />Add Ward Contact
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
  confirmPassword: z.string().min(1, "Please confirm your new password"),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});
type ChangePasswordData = z.infer<typeof changePasswordSchema>;

function ChangePasswordCard() {
  const { toast } = useToast();
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const form = useForm<ChangePasswordData>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const mutation = useMutation({
    mutationFn: async (data: ChangePasswordData) => {
      const res = await apiRequest("POST", "/api/profile/change-password", {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to change password");
      }
    },
    onSuccess: () => {
      toast({ title: "Password changed", description: "Your password has been updated successfully." });
      form.reset();
    },
    onError: (err: Error) => {
      toast({ title: "Could not change password", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <KeyRound className="h-4 w-4" />
          Change Password
        </CardTitle>
        <CardDescription>Update your login password. You'll need your current password to continue.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-4 max-w-sm">
            <FormField control={form.control} name="currentPassword" render={({ field }) => (
              <FormItem>
                <FormLabel>Current Password</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input type={showCurrent ? "text" : "password"} placeholder="Current password" {...field} data-testid="input-current-password" />
                    <button type="button" onClick={() => setShowCurrent((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs">
                      {showCurrent ? "Hide" : "Show"}
                    </button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="newPassword" render={({ field }) => (
              <FormItem>
                <FormLabel>New Password</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input type={showNew ? "text" : "password"} placeholder="At least 8 characters" {...field} data-testid="input-new-password" />
                    <button type="button" onClick={() => setShowNew((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs">
                      {showNew ? "Hide" : "Show"}
                    </button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="confirmPassword" render={({ field }) => (
              <FormItem>
                <FormLabel>Confirm New Password</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input type={showConfirm ? "text" : "password"} placeholder="Repeat new password" {...field} data-testid="input-confirm-password" />
                    <button type="button" onClick={() => setShowConfirm((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs">
                      {showConfirm ? "Hide" : "Show"}
                    </button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <Button type="submit" disabled={mutation.isPending} data-testid="button-change-password">
              {mutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Updating…</> : <><KeyRound className="h-4 w-4 mr-2" />Update Password</>}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
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
  // Holds an uploaded doc/signature URL before the consultant record is created.
  // These are passed into the form submit so nothing is lost.
  const [pendingConsultantDocUrl, setPendingConsultantDocUrl] = useState<string | null>(null);
  const [pendingSignatureDataUrl, setPendingSignatureDataUrl] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

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
      : {
          name: user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() : "",
          qualification: "",
          specialization: "",
          yearsExperience: 0,
          consultationFee: "",
          registrationNumber: user?.hospitalRegistrationNo || "",
          registeredOrganization: user?.hospitalRegisteredOrg || "",
          affiliatedInstitution: "",
          portfolio: "",
        },
  });

  const saveConsultantDetailsMutation = useMutation({
    mutationFn: async (data: ConsultantDetailsFormData & { registrationDocumentUrl?: string }) => {
      const payload = { ...data, consultationFee: String(data.consultationFee) };
      if (consultant?.id) {
        const res = await apiRequest("PATCH", `/api/provider/consultants/${consultant.id}`, payload);
        return res.json();
      } else {
        const res = await apiRequest("POST", "/api/provider/consultants", { ...payload, status: "active" });
        return res.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/my-consultants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/provider/dashboard"] });
      toast({ title: consultant?.id ? "Professional details saved" : "Profile created — pending admin approval" });
    },
    onError: () => {
      toast({ title: "Save failed", description: "Could not save professional details.", variant: "destructive" });
    },
  });

  const handleConsultantRegDocUpload = async (file: File) => {
    const err = validateUpload(file, { maxBytes: 5 * 1024 * 1024, allowedTypes: ["pdf", "jpeg", "jpg", "png"] });
    if (err) { toast({ title: "Cannot upload this file", description: err, variant: "destructive" }); return; }
    setConsultantRegDocUploading(true);
    try {
      const url = await uploadImage(file, file.name);
      if (consultant?.id) {
        // Consultant record exists — save immediately
        const res = await apiRequest("PATCH", `/api/provider/consultants/${consultant.id}`, { registrationDocumentUrl: url });
        await res.json();
        queryClient.invalidateQueries({ queryKey: ["/api/provider/my-consultants"] });
        toast({ title: "Registration document saved" });
      } else {
        // No record yet — hold the URL; it will be submitted with the profile form
        setPendingConsultantDocUrl(url);
        toast({ title: "Document uploaded", description: "It will be saved when you click 'Create Profile' below." });
      }
    } catch (uploadErr: any) {
      toast({ title: "Upload failed", description: uploadErr?.message || "Something went wrong. Please try again.", variant: "destructive" });
    } finally {
      setConsultantRegDocUploading(false);
    }
  };

  const handlePhotoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validateUpload(file, { maxBytes: 5 * 1024 * 1024, allowedTypes: ["jpeg", "jpg", "png"] });
    if (err) { toast({ title: "Cannot upload this file", description: err, variant: "destructive" }); e.target.value = ""; return; }
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
    } catch (cropErr: any) {
      toast({ title: "Upload failed", description: cropErr?.message || "Could not upload photo. Please try again.", variant: "destructive" });
    } finally {
      setPhotoUploading(false);
    }
  };

  const handleRegDocUpload = async (file: File) => {
    const err = validateUpload(file, { maxBytes: 5 * 1024 * 1024, allowedTypes: ["pdf", "jpeg", "jpg", "png"] });
    if (err) { toast({ title: "Cannot upload this file", description: err, variant: "destructive" }); return; }
    setRegDocUploading(true);
    try {
      const url = await uploadImage(file, file.name);
      await updateProfileMutation.mutateAsync({ registrationDocumentUrl: url });
    } catch (docErr: any) {
      toast({ title: "Upload failed", description: docErr?.message || "Could not upload document. Please try again.", variant: "destructive" });
    } finally {
      setRegDocUploading(false);
      setRegDocFile(null);
    }
  };

  const handleSignatureUpload = async (file: File) => {
    const err = validateUpload(file, { maxBytes: 2 * 1024 * 1024, allowedTypes: ["jpeg", "jpg", "png"] });
    if (err) { toast({ title: "Cannot upload this file", description: err, variant: "destructive" }); return; }
    setSignatureUploading(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      if (consultant?.id) {
        await updateConsultantMutation.mutateAsync({ digitalSignatureUrl: dataUrl });
      } else {
        setPendingSignatureDataUrl(dataUrl);
        toast({ title: "Signature uploaded", description: "It will be saved when you click 'Create Profile' below." });
      }
    } catch (sigErr: any) {
      toast({ title: "Upload failed", description: sigErr?.message || "Could not save signature. Please try again.", variant: "destructive" });
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
            <p className="text-xs text-muted-foreground">JPG or PNG · min 10 KB · max 5 MB</p>
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
    const approvalStatus = consultant?.approvalStatus;

    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My Profile</h1>
          <p className="text-muted-foreground">Manage your personal and professional details</p>
        </div>

        {/* Approval status banner */}
        {!consultant && (
          <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900">
            <Info className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-800 dark:text-amber-400">Complete your professional profile</AlertTitle>
            <AlertDescription className="text-amber-700 dark:text-amber-500">
              Your account is set up, but your professional details haven't been filled in yet. Please complete the Professional Details section below so seekers can find and book you.
            </AlertDescription>
          </Alert>
        )}
        {consultant && approvalStatus === "pending" && (
          <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-800 dark:text-amber-400">Pending admin approval</AlertTitle>
            <AlertDescription className="text-amber-700 dark:text-amber-500">
              Your profile has been submitted and is awaiting review. You won't appear in the seeker catalog until an admin approves your profile. No action needed — we'll notify you once it's done.
            </AlertDescription>
          </Alert>
        )}
        {consultant && approvalStatus === "rejected" && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Profile not approved</AlertTitle>
            <AlertDescription>
              Your profile was not approved. Please update your details and contact support for assistance.
            </AlertDescription>
          </Alert>
        )}
        {consultant && approvalStatus === "approved" && (
          <Alert className="border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-900">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertTitle className="text-green-800 dark:text-green-400">Profile approved — visible to seekers</AlertTitle>
            <AlertDescription className="text-green-700 dark:text-green-500">
              Your profile is active and visible in the seeker catalog.
            </AlertDescription>
          </Alert>
        )}

        {photoCard}

        <ChangePasswordCard />

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
                            <PhoneInput {...field} data-testid="input-provider-phone" />
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
                onSubmit={consultantDetailsForm.handleSubmit((d) => saveConsultantDetailsMutation.mutate({ ...d, registrationDocumentUrl: pendingConsultantDocUrl ?? undefined, digitalSignatureUrl: pendingSignatureDataUrl ?? undefined }))}
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
                        <FormControl><Input type="number" min={1} placeholder="e.g. 10" {...field} data-testid="input-consultant-experience" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <FormField control={consultantDetailsForm.control} name="consultationFee" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Consultation Fee (₹)</FormLabel>
                      <FormControl><Input type="number" min={1} step="0.01" placeholder="e.g. 500" {...field} data-testid="input-consultant-fee" /></FormControl>
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

                  {/* Registration document — available immediately, even before consultant record is created */}
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Registration Document</p>
                    {(consultant?.registrationDocumentUrl || pendingConsultantDocUrl) ? (
                      <div className="flex items-center gap-2 rounded-md border p-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <a href={consultant?.registrationDocumentUrl || pendingConsultantDocUrl!} target="_blank" rel="noopener noreferrer" className="flex-1 text-sm truncate text-primary underline">
                          {pendingConsultantDocUrl && !consultant?.registrationDocumentUrl ? "Document ready (will save with profile)" : "View Document"}
                        </a>
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
                        <div>
                          <span className="text-sm text-muted-foreground">{consultantRegDocUploading ? "Uploading..." : "Upload registration certificate (PDF or image)"}</span>
                          <p className="text-xs text-muted-foreground mt-0.5">PDF, JPG or PNG · min 10 KB · max 5 MB</p>
                        </div>
                        <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleConsultantRegDocUpload(f); if (e.target) e.target.value = ""; }} />
                      </label>
                    )}
                  </div>

                  <Button type="submit" disabled={saveConsultantDetailsMutation.isPending} data-testid="button-save-consultant-details">
                    {saveConsultantDetailsMutation.isPending
                      ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving...</>
                      : <><Save className="h-4 w-4 mr-2" />{consultant ? "Save Professional Details" : "Create Profile"}</>}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

        {/* Account Details — availability + signature */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building className="h-4 w-4" />
              Account Details
            </CardTitle>
            <CardDescription>Your availability window and digital signature for clinical advisories.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Availability */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">Availability</p>
              </div>
              {consultant && (
                <ConsultantSlotEditor
                  consultantId={consultant.id}
                  initialFrom={consultant.availabilityFrom}
                  initialTo={consultant.availabilityTo}
                  initialDays={consultant.availableDays ?? undefined}
                  initialSlotSeries={(consultant as any).slotSeries ?? undefined}
                  invalidateKeys={[["/api/provider/my-consultants"], ["/api/provider/dashboard"]]}
                />
              )}
            </div>

            <Separator />

            {/* Signature */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <PenLine className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">Digital Signature</p>
              </div>
              {(consultant?.digitalSignatureUrl || pendingSignatureDataUrl) ? (
                <div className="space-y-2">
                  <div className="rounded-lg border p-3 bg-muted/20">
                    <img
                      src={consultant?.digitalSignatureUrl || pendingSignatureDataUrl!}
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
                  <div>
                    <span className="text-sm text-muted-foreground">{signatureUploading ? "Uploading..." : "Upload your digital signature (image)"}</span>
                    <p className="text-xs text-muted-foreground mt-0.5">JPG or PNG · min 10 KB · max 2 MB · white/transparent background preferred</p>
                  </div>
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
                  <FormItem><FormLabel>Phone Number</FormLabel><FormControl><PhoneInput {...field} data-testid="input-phone" /></FormControl><FormMessage /></FormItem>
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
                      <div>
                        <span className="text-sm">{regDocUploading ? "Uploading..." : "Upload registration certificate"}</span>
                        <p className="text-xs text-muted-foreground mt-0.5">PDF, JPG or PNG · min 10 KB · max 5 MB</p>
                      </div>
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
                      <FormItem><FormLabel>Contact Phone</FormLabel><FormControl><PhoneInput {...field} data-testid="input-provider-phone" /></FormControl><FormMessage /></FormItem>
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

        <ChangePasswordCard />

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
                  <FormItem><FormLabel>Phone Number</FormLabel><FormControl><PhoneInput {...field} data-testid="input-phone" /></FormControl><FormMessage /></FormItem>
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
                      <FormItem><FormLabel>Contact Phone</FormLabel><FormControl><PhoneInput {...field} data-testid="input-provider-phone" /></FormControl><FormMessage /></FormItem>
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

        <ChangePasswordCard />

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
                <FormItem><FormLabel>Phone Number</FormLabel><FormControl><PhoneInput {...field} data-testid="input-phone" /></FormControl><FormMessage /></FormItem>
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
                    <div>
                      <span className="text-sm">{regDocUploading ? "Uploading..." : "Upload registration certificate"}</span>
                      <p className="text-xs text-muted-foreground mt-0.5">PDF, JPG or PNG · min 10 KB · max 5 MB</p>
                    </div>
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

      {user?.role === "care_seeker" && <WardContactsCard />}

      <ChangePasswordCard />

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
                    <FormItem><FormLabel>Contact Phone</FormLabel><FormControl><PhoneInput {...field} data-testid="input-provider-phone" /></FormControl><FormMessage /></FormItem>
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
