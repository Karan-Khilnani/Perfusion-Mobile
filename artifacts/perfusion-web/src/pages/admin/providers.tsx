import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Building, CheckCircle, XCircle, Clock, Loader2, Edit } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";

export default function AdminProvidersPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedProvider, setSelectedProvider] = useState<any>(null);
  const [actionType, setActionType] = useState<"approve" | "reject" | null>(null);
  const [notes, setNotes] = useState("");
  const [editProvider, setEditProvider] = useState<any>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", phone: "", location: "", description: "" });

  const { data: providers = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/providers"],
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: string; notes?: string }) => {
      const response = await fetch(`/api/admin/providers/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status, notes }),
      });
      if (!response.ok) throw new Error("Failed to update status");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/providers"] });
      toast({ title: "Provider status updated successfully" });
      setSelectedProvider(null);
      setActionType(null);
      setNotes("");
    },
    onError: (error: any) => {
      toast({ title: "Failed to update status", description: error.message, variant: "destructive" });
    },
  });

  const editProviderMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await apiRequest("PATCH", `/api/admin/providers/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/providers"] });
      toast({ title: "Provider updated successfully" });
      setEditProvider(null);
    },
    onError: () => {
      toast({ title: "Failed to update provider", variant: "destructive" });
    },
  });

  const openEditDialog = (provider: any) => {
    setEditProvider(provider);
    setEditForm({
      name: provider.name || "",
      email: provider.email || "",
      phone: provider.phone || "",
      location: provider.location || "",
      description: provider.description || "",
    });
  };

  const handleEditSubmit = () => {
    if (!editProvider) return;
    editProviderMutation.mutate({ id: editProvider.id, data: editForm });
  };

  const handleAction = (provider: any, action: "approve" | "reject") => {
    setSelectedProvider(provider);
    setActionType(action);
    setNotes("");
  };

  const confirmAction = () => {
    if (!selectedProvider || !actionType) return;
    
    updateStatusMutation.mutate({
      id: selectedProvider.id,
      status: actionType === "approve" ? "verified" : "rejected",
      notes,
    });
  };

  const pendingProviders = providers.filter((p) => p.verificationStatus === "pending");
  const verifiedProviders = providers.filter((p) => p.verificationStatus === "verified");
  const rejectedProviders = providers.filter((p) => p.verificationStatus === "rejected");

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary"><Clock className="mr-1 h-3 w-3" />Pending</Badge>;
      case "verified":
        return <Badge className="bg-green-500"><CheckCircle className="mr-1 h-3 w-3" />Verified</Badge>;
      case "rejected":
        return <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" />Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const ProviderCard = ({ provider }: { provider: any }) => (
    <Card className="mb-4" data-testid={`provider-card-${provider.id}`}>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Building className="h-5 w-5" />
            <CardTitle className="text-lg">{provider.name}</CardTitle>
          </div>
          {getStatusBadge(provider.verificationStatus)}
        </div>
        <CardDescription>{provider.type} - {provider.location}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm">
          <p><span className="font-medium">Email:</span> {provider.email}</p>
          <p><span className="font-medium">Phone:</span> {provider.phone}</p>
          <p><span className="font-medium">License:</span> {provider.licenseNumber || "Not provided"}</p>
          {provider.description && (
            <p><span className="font-medium">Description:</span> {provider.description}</p>
          )}
          {provider.verificationNotes && (
            <p><span className="font-medium">Notes:</span> {provider.verificationNotes}</p>
          )}
        </div>
        <div className="flex gap-2 mt-4">
          <Button 
            variant="outline"
            onClick={() => openEditDialog(provider)}
            data-testid={`button-edit-${provider.id}`}
          >
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </Button>
          {provider.verificationStatus === "pending" && (
            <>
              <Button 
                onClick={() => handleAction(provider, "approve")}
                className="bg-green-600 hover:bg-green-700"
                data-testid={`button-approve-${provider.id}`}
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                Approve
              </Button>
              <Button 
                variant="destructive"
                onClick={() => handleAction(provider, "reject")}
                data-testid={`button-reject-${provider.id}`}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Reject
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="page-admin-providers">
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-providers-title">Provider Management</h1>
        <p className="text-muted-foreground" data-testid="text-providers-subtitle">Review and manage provider registrations</p>
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending" data-testid="tab-pending">
            Pending ({pendingProviders.length})
          </TabsTrigger>
          <TabsTrigger value="verified" data-testid="tab-verified">
            Verified ({verifiedProviders.length})
          </TabsTrigger>
          <TabsTrigger value="rejected" data-testid="tab-rejected">
            Rejected ({rejectedProviders.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          {pendingProviders.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8">
                <Clock className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No pending approvals</p>
              </CardContent>
            </Card>
          ) : (
            pendingProviders.map((provider) => (
              <ProviderCard key={provider.id} provider={provider} />
            ))
          )}
        </TabsContent>

        <TabsContent value="verified" className="mt-4">
          {verifiedProviders.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8">
                <CheckCircle className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No verified providers</p>
              </CardContent>
            </Card>
          ) : (
            verifiedProviders.map((provider) => (
              <ProviderCard key={provider.id} provider={provider} />
            ))
          )}
        </TabsContent>

        <TabsContent value="rejected" className="mt-4">
          {rejectedProviders.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8">
                <XCircle className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No rejected providers</p>
              </CardContent>
            </Card>
          ) : (
            rejectedProviders.map((provider) => (
              <ProviderCard key={provider.id} provider={provider} />
            ))
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!selectedProvider && !!actionType} onOpenChange={() => { setSelectedProvider(null); setActionType(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === "approve" ? "Approve Provider" : "Reject Provider"}
            </DialogTitle>
            <DialogDescription>
              {actionType === "approve" 
                ? `Are you sure you want to approve ${selectedProvider?.name}?`
                : `Are you sure you want to reject ${selectedProvider?.name}?`
              }
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium">Notes (optional)</label>
            <Textarea
              placeholder="Add any notes about this decision..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-2"
              data-testid="input-notes"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSelectedProvider(null); setActionType(null); }}>
              Cancel
            </Button>
            <Button 
              onClick={confirmAction}
              disabled={updateStatusMutation.isPending}
              className={actionType === "approve" ? "bg-green-600 hover:bg-green-700" : ""}
              variant={actionType === "reject" ? "destructive" : "default"}
              data-testid="button-confirm-action"
            >
              {updateStatusMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {actionType === "approve" ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editProvider} onOpenChange={() => setEditProvider(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Provider</DialogTitle>
            <DialogDescription>Update provider details</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                data-testid="input-edit-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                data-testid="input-edit-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-phone">Phone</Label>
              <Input
                id="edit-phone"
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                data-testid="input-edit-phone"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-location">Location</Label>
              <Input
                id="edit-location"
                value={editForm.location}
                onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                data-testid="input-edit-location"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                data-testid="input-edit-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditProvider(null)}>Cancel</Button>
            <Button
              onClick={handleEditSubmit}
              disabled={editProviderMutation.isPending}
              data-testid="button-save-edit"
            >
              {editProviderMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
