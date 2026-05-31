import { useState, useRef } from "react";
import { users } from "@shared/schema";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Users, Shield, Building, User, Loader2, Edit2, Camera, Upload, FileText } from "lucide-react";
import { ImageCropDialog } from "@/components/ui/image-crop-dialog";
import { apiRequest } from "@/lib/queryClient";

const editProfileSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phone: z.string().optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  hospitalName: z.string().optional(),
  hospitalAddress: z.string().optional(),
  hospitalRegistrationNo: z.string().optional(),
  hospitalRegisteredOrg: z.string().optional(),
});

type EditProfileFormData = z.infer<typeof editProfileSchema>;

export default function AdminUsersPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [editingUser, setEditingUser] = useState<typeof users.$inferSelect | null>(null);
  const [photoCropOpen, setPhotoCropOpen] = useState(false);
  const [photoCropRaw, setPhotoCropRaw] = useState<File | null>(null);
  const [pendingPhotoUrl, setPendingPhotoUrl] = useState<string | null>(null);
  const [regDocUploading, setRegDocUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const { data: users = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/users"],
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const response = await fetch(`/api/admin/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ role }),
      });
      if (!response.ok) throw new Error("Failed to update role");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User role updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update role", description: error.message, variant: "destructive" });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      const response = await fetch(`/api/admin/users/${userId}/active`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ isActive }),
      });
      if (!response.ok) throw new Error("Failed to update status");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User status updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update status", description: error.message, variant: "destructive" });
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async ({ userId, data }: { userId: string; data: EditProfileFormData & { profileImageUrl?: string } }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${userId}/profile`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Profile updated" });
      setEditingUser(null);
      setPendingPhotoUrl(null);
    },
    onError: () => {
      toast({ title: "Failed to update profile", variant: "destructive" });
    },
  });

  const form = useForm<EditProfileFormData>({
    resolver: zodResolver(editProfileSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      phone: "",
      email: "",
      hospitalName: "",
      hospitalAddress: "",
      hospitalRegistrationNo: "",
      hospitalRegisteredOrg: "",
    },
  });

  const openEditDialog = (user: any) => {
    setEditingUser(user);
    setPendingPhotoUrl(null);
    form.reset({
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      phone: user.phone || "",
      email: user.email || "",
      hospitalName: user.hospitalName || "",
      hospitalAddress: user.hospitalAddress || "",
      hospitalRegistrationNo: user.hospitalRegistrationNo || "",
      hospitalRegisteredOrg: user.hospitalRegisteredOrg || "",
    });
  };

  const handleAdminRegDocUpload = async (file: File) => {
    if (!editingUser) return;
    setRegDocUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload/document", { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) throw new Error("Upload failed");
      const { url } = await res.json();
      await apiRequest("PATCH", `/api/admin/users/${editingUser.id}/profile`, { registrationDocumentUrl: url });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setEditingUser({ ...editingUser, registrationDocumentUrl: url });
      toast({ title: "Document uploaded" });
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setRegDocUploading(false);
    }
  };

  const onSubmit = (data: EditProfileFormData) => {
    if (!editingUser) return;
    updateProfileMutation.mutate({
      userId: editingUser.id,
      data: {
        ...data,
        profileImageUrl: pendingPhotoUrl || editingUser.profileImageUrl || undefined,
      },
    });
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "admin":
        return <Shield className="h-4 w-4" />;
      case "provider":
        return <Building className="h-4 w-4" />;
      default:
        return <User className="h-4 w-4" />;
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "admin":
        return <Badge className="bg-purple-500">{getRoleIcon(role)} Admin</Badge>;
      case "provider":
        return <Badge className="bg-blue-500">{getRoleIcon(role)} Provider</Badge>;
      default:
        return <Badge variant="secondary">{getRoleIcon(role)} Care Seeker</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const displayPhotoUrl = pendingPhotoUrl || editingUser?.profileImageUrl;
  const editingInitials = editingUser?.firstName && editingUser?.lastName
    ? `${editingUser.firstName[0]}${editingUser.lastName[0]}`
    : editingUser?.email?.[0]?.toUpperCase() || "U";

  return (
    <div className="space-y-6" data-testid="page-admin-users">
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-users-title">User Management</h1>
        <p className="text-muted-foreground" data-testid="text-users-subtitle">Manage platform users and their roles</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            <CardTitle>All Users</CardTitle>
          </div>
          <CardDescription>Total: {users.length} users</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user: any) => (
                <TableRow key={user.id} data-testid={`user-row-${user.id}`}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7">
                        <AvatarImage src={user.profileImageUrl || undefined} />
                        <AvatarFallback className="text-xs">
                          {user.firstName?.[0]}{user.lastName?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      {user.firstName} {user.lastName}
                    </div>
                  </TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{getRoleBadge(user.role)}</TableCell>
                  <TableCell>
                    <Badge variant={user.isActive ? "default" : "destructive"}>
                      {user.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Select
                        value={user.role}
                        onValueChange={(role) => updateRoleMutation.mutate({ userId: user.id, role })}
                        disabled={updateRoleMutation.isPending}
                      >
                        <SelectTrigger className="w-32" data-testid={`select-role-${user.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="care_seeker">Care Seeker</SelectItem>
                          <SelectItem value="provider">Provider</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditDialog(user)}
                        data-testid={`button-edit-profile-${user.id}`}
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant={user.isActive ? "destructive" : "default"}
                        size="sm"
                        onClick={() => toggleActiveMutation.mutate({ userId: user.id, isActive: !user.isActive })}
                        disabled={toggleActiveMutation.isPending}
                        data-testid={`button-toggle-active-${user.id}`}
                      >
                        {user.isActive ? "Deactivate" : "Activate"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Profile Dialog */}
      <Dialog open={!!editingUser} onOpenChange={(open) => { if (!open) { setEditingUser(null); setPendingPhotoUrl(null); } }}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>Edit User Profile</DialogTitle>
            <DialogDescription>
              Update details for {editingUser?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto pr-1">
            {/* Photo section */}
            <div className="flex items-center gap-4 pb-4 border-b mb-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src={displayPhotoUrl || undefined} />
                <AvatarFallback className="text-xl">{editingInitials}</AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm text-muted-foreground mb-2">Profile photo</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => photoInputRef.current?.click()}
                  data-testid="button-admin-upload-user-photo"
                >
                  <Camera className="h-4 w-4 mr-2" />
                  {displayPhotoUrl ? "Change Photo" : "Upload Photo"}
                </Button>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setPhotoCropRaw(f);
                    setPhotoCropOpen(true);
                    e.target.value = "";
                  }}
                  data-testid="input-admin-user-photo"
                />
              </div>
            </div>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" id="admin-edit-profile-form">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-admin-first-name" />
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
                          <Input {...field} data-testid="input-admin-last-name" />
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
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <PhoneInput {...field} data-testid="input-admin-phone" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input placeholder="user@example.com" type="email" {...field} data-testid="input-admin-email" />
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
                      <FormLabel>Organization Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Hospital / Org name" {...field} data-testid="input-admin-hospital-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="hospitalAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Address</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Full address" {...field} data-testid="input-admin-hospital-address" />
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
                        <FormLabel>Registration No.</FormLabel>
                        <FormControl>
                          <Input placeholder="Reg. number" {...field} data-testid="input-admin-reg-no" />
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
                          <Input placeholder="e.g. MCI, NABL" {...field} data-testid="input-admin-reg-org" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Registration Document</p>
                  {editingUser?.registrationDocumentUrl ? (
                    <div className="flex items-center gap-2 rounded-md border p-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <a href={editingUser.registrationDocumentUrl} target="_blank" rel="noopener noreferrer" className="flex-1 text-sm truncate text-primary underline">View Document</a>
                      <label className="cursor-pointer">
                        <Button type="button" variant="ghost" size="sm" asChild disabled={regDocUploading}>
                          <span>{regDocUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Replace"}</span>
                        </Button>
                        <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAdminRegDocUpload(f); if (e.target) e.target.value = ""; }} />
                      </label>
                    </div>
                  ) : (
                    <label className="flex items-center gap-2 rounded-md border border-dashed p-3 cursor-pointer hover:bg-muted/50 transition-colors" data-testid="label-admin-upload-reg-doc">
                      <Upload className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{regDocUploading ? "Uploading..." : "Upload registration certificate"}</span>
                      <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAdminRegDocUpload(f); if (e.target) e.target.value = ""; }} />
                    </label>
                  )}
                </div>
              </form>
            </Form>
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t shrink-0">
            <Button variant="outline" onClick={() => { setEditingUser(null); setPendingPhotoUrl(null); }}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="admin-edit-profile-form"
              disabled={updateProfileMutation.isPending}
              data-testid="button-admin-save-profile"
            >
              {updateProfileMutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving...</>
              ) : "Save Profile"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Photo crop dialog */}
      <ImageCropDialog
        open={photoCropOpen}
        onOpenChange={setPhotoCropOpen}
        imageFile={photoCropRaw}
        aspect={1}
        title="Crop Profile Photo"
        onCropComplete={async (blob, filename) => {
          const formData = new FormData();
          formData.append("file", blob, filename);
          const res = await fetch("/api/upload/document", { method: "POST", body: formData, credentials: "include" });
          if (!res.ok) {
            toast({ title: "Failed to upload photo", variant: "destructive" });
            throw new Error("Upload failed");
          }
          const { url } = await res.json();
          setPendingPhotoUrl(url);
          toast({ title: "Photo ready", description: "Save the profile to apply the new photo." });
        }}
      />
    </div>
  );
}
