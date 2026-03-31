import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { ImageCropDialog } from "@/components/ui/image-crop-dialog";
import { apiRequest } from "@/lib/queryClient";
import { Camera, Loader2, Save, Building, User } from "lucide-react";

const userProfileSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phone: z.string().optional(),
  hospitalName: z.string().min(2, "Organization name is required"),
  hospitalAddress: z.string().min(5, "Address is required"),
  hospitalRegistrationNo: z.string().min(1, "Registration number is required"),
  hospitalRegisteredOrg: z.string().min(1, "Registered organization is required"),
});

const providerSchema = z.object({
  name: z.string().min(2, "Display name is required"),
  location: z.string().optional(),
  description: z.string().optional(),
  phone: z.string().optional(),
});

type UserProfileFormData = z.infer<typeof userProfileSchema>;
type ProviderFormData = z.infer<typeof providerSchema>;

async function uploadImage(blob: Blob, filename: string): Promise<string> {
  const formData = new FormData();
  formData.append("file", blob, filename);
  const res = await fetch("/api/upload/document", { method: "POST", body: formData, credentials: "include" });
  if (!res.ok) throw new Error("Image upload failed");
  const data = await res.json();
  return data.url as string;
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

  const [photoCropFile, setPhotoCropFile] = useState<File | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [currentPhotoUrl, setCurrentPhotoUrl] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const userForm = useForm<UserProfileFormData>({
    resolver: zodResolver(userProfileSchema),
    values: user
      ? {
          firstName: user.firstName || "",
          lastName: user.lastName || "",
          phone: user.phone || "",
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
    mutationFn: async (data: UserProfileFormData & { profileImageUrl?: string }) => {
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
      await updateProfileMutation.mutateAsync({ ...userForm.getValues(), profileImageUrl: url });
    } catch {
      toast({ title: "Upload failed", description: "Could not upload photo.", variant: "destructive" });
    } finally {
      setPhotoUploading(false);
    }
  };

  const onUserSubmit = (data: UserProfileFormData) => {
    updateProfileMutation.mutate({ ...data, profileImageUrl: currentPhotoUrl || user?.profileImageUrl });
  };

  const onProviderSubmit = (data: ProviderFormData) => {
    updateProviderMutation.mutate(data);
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

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My Profile</h1>
        <p className="text-muted-foreground">Manage your personal and organization details</p>
      </div>

      {/* Photo Section */}
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

      {/* Personal & Organization Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building className="h-4 w-4" />
            {user?.role === "care_seeker" ? "Hospital / Organization Details" : "Account Details"}
          </CardTitle>
          <CardDescription>
            These details are used for billing, reports, and communications.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...userForm}>
            <form onSubmit={userForm.handleSubmit(onUserSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={userForm.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name</FormLabel>
                      <FormControl>
                        <Input placeholder="First name" {...field} data-testid="input-first-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={userForm.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Last name" {...field} data-testid="input-last-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={userForm.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl>
                      <Input placeholder="+91 XXXXX XXXXX" {...field} data-testid="input-phone" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Separator />

              <FormField
                control={userForm.control}
                name="hospitalName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {user?.role === "care_seeker" ? "Hospital / Organization Name" : "Business Name"}
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="Organization name" {...field} data-testid="input-hospital-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={userForm.control}
                name="hospitalAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Full address including city, state, and PIN code"
                        {...field}
                        data-testid="input-hospital-address"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={userForm.control}
                  name="hospitalRegistrationNo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Registration Number</FormLabel>
                      <FormControl>
                        <Input placeholder="Reg. number" {...field} data-testid="input-reg-no" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={userForm.control}
                  name="hospitalRegisteredOrg"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Registered With</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. MCI, NABL" {...field} data-testid="input-registered-org" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Button
                type="submit"
                disabled={updateProfileMutation.isPending}
                data-testid="button-save-profile"
              >
                {updateProfileMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving...</>
                ) : (
                  <><Save className="h-4 w-4 mr-2" />Save Profile</>
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Provider entity details — only for providers */}
      {user?.role === "provider" && provider && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building className="h-4 w-4" />
              Provider Display Details
            </CardTitle>
            <CardDescription>
              These details are shown to care seekers when they browse your services.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...providerForm}>
              <form onSubmit={providerForm.handleSubmit(onProviderSubmit)} className="space-y-4">
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
                  disabled={updateProviderMutation.isPending}
                  data-testid="button-save-provider"
                >
                  {updateProviderMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving...</>
                  ) : (
                    <><Save className="h-4 w-4 mr-2" />Save Provider Details</>
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      {/* Crop Dialog */}
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
