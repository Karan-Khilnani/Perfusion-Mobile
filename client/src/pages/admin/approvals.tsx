import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  CheckCircle, XCircle, Building, FileText, ExternalLink, 
  Clock, UserCheck, FlaskConical, Stethoscope, ScanLine, Loader2
} from "lucide-react";
import type { User, Lab, Consultant, ProviderLabTest, LabTest, Provider } from "@shared/schema";

type PendingServices = {
  labs: (Lab & { provider?: Provider })[];
  consultants: (Consultant & { provider?: Provider })[];
  labTests: (ProviderLabTest & { provider?: Provider; labTest?: LabTest })[];
  modalities: any[];
};

export default function AdminApprovalsPage() {
  const { toast } = useToast();

  const { data: pendingUsers, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/pending-registrations"],
  });

  const { data: pendingServices, isLoading: servicesLoading } = useQuery<PendingServices>({
    queryKey: ["/api/admin/pending-services"],
  });

  const approveUserMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${id}/approval`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-registrations"] });
      toast({ title: "Updated", description: "User registration status updated." });
    },
    onError: () => {
      toast({ title: "Failed", description: "Failed to update registration.", variant: "destructive" });
    },
  });

  const approveLabMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" }) => {
      const res = await apiRequest("PATCH", `/api/admin/labs/${id}/approval`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-services"] });
      toast({ title: "Updated", description: "Lab registration updated." });
    },
  });

  const approveConsultantMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" }) => {
      const res = await apiRequest("PATCH", `/api/admin/consultants/${id}/approval`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-services"] });
      toast({ title: "Updated", description: "Consultant registration updated." });
    },
  });

  const approveLabTestMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" }) => {
      const res = await apiRequest("PATCH", `/api/admin/provider-lab-tests/${id}/approval`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-services"] });
      toast({ title: "Updated", description: "Lab test registration updated." });
    },
  });

  const approveModalityMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" }) => {
      const res = await apiRequest("PATCH", `/api/admin/provider-modalities/${id}/approval`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-services"] });
      toast({ title: "Updated", description: "Modality registration updated." });
    },
  });

  const totalPendingUsers = pendingUsers?.length || 0;
  const totalPendingServices = (pendingServices?.labs?.length || 0) + 
    (pendingServices?.consultants?.length || 0) + 
    (pendingServices?.labTests?.length || 0) + 
    (pendingServices?.modalities?.length || 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Registration Approvals</h1>
        <p className="text-muted-foreground">Review and approve hospital registrations and service additions</p>
      </div>

      <Tabs defaultValue="registrations" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="registrations" data-testid="tab-registrations">
            <UserCheck className="mr-2 h-4 w-4" />
            Hospital Registrations ({totalPendingUsers})
          </TabsTrigger>
          <TabsTrigger value="services" data-testid="tab-services">
            <Building className="mr-2 h-4 w-4" />
            Service Additions ({totalPendingServices})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="registrations" className="space-y-4">
          {usersLoading ? (
            <Card><CardContent className="py-8"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ) : !pendingUsers || pendingUsers.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle className="mb-4 h-12 w-12 text-muted-foreground/50" />
                <h3 className="mb-2 text-lg font-medium">No pending registrations</h3>
                <p className="text-sm text-muted-foreground">All hospital registrations have been reviewed</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {pendingUsers.map((user) => (
                <Card key={user.id} data-testid={`pending-user-${user.id}`}>
                  <CardContent className="py-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{user.firstName} {user.lastName}</p>
                          <Badge variant="outline">{user.role === "provider" ? "Provider" : "Care Seeker"}</Badge>
                          <Badge variant="outline" className="text-yellow-600 border-yellow-500">
                            <Clock className="mr-1 h-3 w-3" />
                            Pending
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                        
                        {user.hospitalName && (
                          <div className="rounded-lg border p-3 space-y-1 text-sm">
                            <div className="flex items-center gap-2">
                              <Building className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{user.hospitalName}</span>
                            </div>
                            {user.hospitalAddress && (
                              <p className="text-muted-foreground pl-6">{user.hospitalAddress}</p>
                            )}
                            {user.hospitalRegistrationNo && (
                              <p className="text-muted-foreground pl-6">Reg. No: {user.hospitalRegistrationNo}</p>
                            )}
                            {(user as any).hospitalRegisteredOrg && (
                              <p className="text-muted-foreground pl-6">Registered Org: {(user as any).hospitalRegisteredOrg}</p>
                            )}
                            {user.registrationDocumentUrl && (
                              <a 
                                href={user.registrationDocumentUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-primary hover:underline pl-6"
                                data-testid={`link-view-doc-${user.id}`}
                              >
                                <FileText className="h-3.5 w-3.5" />
                                View Registration Document
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        )}

                        {user.createdAt && (
                          <p className="text-xs text-muted-foreground">
                            Registered: {new Date(user.createdAt).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2 sm:flex-col">
                        <Button
                          variant="default"
                          onClick={() => approveUserMutation.mutate({ id: user.id, status: "approved" })}
                          disabled={approveUserMutation.isPending}
                          data-testid={`button-approve-user-${user.id}`}
                        >
                          {approveUserMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                          Approve
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={() => approveUserMutation.mutate({ id: user.id, status: "rejected" })}
                          disabled={approveUserMutation.isPending}
                          data-testid={`button-reject-user-${user.id}`}
                        >
                          <XCircle className="mr-2 h-4 w-4" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="services" className="space-y-6">
          {servicesLoading ? (
            <Card><CardContent className="py-8"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ) : totalPendingServices === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle className="mb-4 h-12 w-12 text-muted-foreground/50" />
                <h3 className="mb-2 text-lg font-medium">No pending service approvals</h3>
                <p className="text-sm text-muted-foreground">All service registrations have been reviewed</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {pendingServices?.labs && pendingServices.labs.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FlaskConical className="h-5 w-5" />
                      Pending Labs ({pendingServices.labs.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {pendingServices.labs.map((lab) => (
                      <div key={lab.id} className="flex items-center justify-between rounded-lg border p-3" data-testid={`pending-lab-${lab.id}`}>
                        <div>
                          <p className="font-medium">{lab.name}</p>
                          <p className="text-sm text-muted-foreground">{lab.location}</p>
                          {lab.provider && <p className="text-xs text-muted-foreground">Provider: {lab.provider.name}</p>}
                          {(lab as any).registrationNo && <p className="text-xs text-muted-foreground">Reg: {(lab as any).registrationNo}</p>}
                          {(lab as any).registeredOrganization && <p className="text-xs text-muted-foreground">Registered Org: {(lab as any).registeredOrganization}</p>}
                          {(lab as any).registrationDocumentUrl && (
                            <a href={(lab as any).registrationDocumentUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                              <FileText className="h-3 w-3" /> View Document <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => approveLabMutation.mutate({ id: lab.id, status: "approved" })} disabled={approveLabMutation.isPending} data-testid={`button-approve-lab-${lab.id}`}>
                            <CheckCircle className="mr-1 h-3.5 w-3.5" /> Approve
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => approveLabMutation.mutate({ id: lab.id, status: "rejected" })} disabled={approveLabMutation.isPending} data-testid={`button-reject-lab-${lab.id}`}>
                            <XCircle className="mr-1 h-3.5 w-3.5" /> Reject
                          </Button>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {pendingServices?.consultants && pendingServices.consultants.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Stethoscope className="h-5 w-5" />
                      Pending Consultants ({pendingServices.consultants.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {pendingServices.consultants.map((c) => (
                      <div key={c.id} className="flex items-center justify-between rounded-lg border p-3" data-testid={`pending-consultant-${c.id}`}>
                        <div>
                          <p className="font-medium">{c.name}</p>
                          <p className="text-sm text-muted-foreground">{c.specialization} - {c.qualification}</p>
                          <p className="text-sm text-muted-foreground">Fee: ₹{c.consultationFee}</p>
                          {c.provider && <p className="text-xs text-muted-foreground">Provider: {c.provider.name}</p>}
                          {(c as any).registrationNo && <p className="text-xs text-muted-foreground">Reg: {(c as any).registrationNo}</p>}
                          {(c as any).registeredOrganization && <p className="text-xs text-muted-foreground">Registered Org: {(c as any).registeredOrganization}</p>}
                          {(c as any).registrationDocumentUrl && (
                            <a href={(c as any).registrationDocumentUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                              <FileText className="h-3 w-3" /> View Document <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => approveConsultantMutation.mutate({ id: c.id, status: "approved" })} disabled={approveConsultantMutation.isPending} data-testid={`button-approve-consultant-${c.id}`}>
                            <CheckCircle className="mr-1 h-3.5 w-3.5" /> Approve
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => approveConsultantMutation.mutate({ id: c.id, status: "rejected" })} disabled={approveConsultantMutation.isPending} data-testid={`button-reject-consultant-${c.id}`}>
                            <XCircle className="mr-1 h-3.5 w-3.5" /> Reject
                          </Button>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {pendingServices?.labTests && pendingServices.labTests.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FlaskConical className="h-5 w-5" />
                      Pending Lab Test Assignments ({pendingServices.labTests.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {pendingServices.labTests.map((pt: any) => (
                      <div key={pt.id} className="flex items-center justify-between rounded-lg border p-3" data-testid={`pending-labtest-${pt.id}`}>
                        <div>
                          <p className="font-medium">{pt.labTest?.testName || "Unknown Test"}</p>
                          <p className="text-sm text-muted-foreground">Price: ₹{pt.price} | TAT: {pt.turnaroundTime || "N/A"}</p>
                          {pt.provider && <p className="text-xs text-muted-foreground">Provider: {pt.provider.name}</p>}
                          {pt.registrationNo && <p className="text-xs text-muted-foreground">Reg: {pt.registrationNo}</p>}
                          {pt.registeredOrganization && <p className="text-xs text-muted-foreground">Registered Org: {pt.registeredOrganization}</p>}
                          {pt.registrationDocumentUrl && (
                            <a href={pt.registrationDocumentUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                              <FileText className="h-3 w-3" /> View Document <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => approveLabTestMutation.mutate({ id: pt.id, status: "approved" })} disabled={approveLabTestMutation.isPending} data-testid={`button-approve-labtest-${pt.id}`}>
                            <CheckCircle className="mr-1 h-3.5 w-3.5" /> Approve
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => approveLabTestMutation.mutate({ id: pt.id, status: "rejected" })} disabled={approveLabTestMutation.isPending} data-testid={`button-reject-labtest-${pt.id}`}>
                            <XCircle className="mr-1 h-3.5 w-3.5" /> Reject
                          </Button>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {pendingServices?.modalities && pendingServices.modalities.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <ScanLine className="h-5 w-5" />
                      Pending Modality Assignments ({pendingServices.modalities.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {pendingServices.modalities.map((pm: any) => (
                      <div key={pm.id} className="flex items-center justify-between rounded-lg border p-3" data-testid={`pending-modality-${pm.id}`}>
                        <div>
                          <p className="font-medium">{pm.modality?.name || "Unknown Modality"}</p>
                          {pm.provider && <p className="text-xs text-muted-foreground">Provider: {pm.provider.name}</p>}
                          {pm.registrationNo && <p className="text-xs text-muted-foreground">Reg: {pm.registrationNo}</p>}
                          {pm.registeredOrganization && <p className="text-xs text-muted-foreground">Registered Org: {pm.registeredOrganization}</p>}
                          {pm.registrationDocumentUrl && (
                            <a href={pm.registrationDocumentUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                              <FileText className="h-3 w-3" /> View Document <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => approveModalityMutation.mutate({ id: pm.id, status: "approved" })} disabled={approveModalityMutation.isPending} data-testid={`button-approve-modality-${pm.id}`}>
                            <CheckCircle className="mr-1 h-3.5 w-3.5" /> Approve
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => approveModalityMutation.mutate({ id: pm.id, status: "rejected" })} disabled={approveModalityMutation.isPending} data-testid={`button-reject-modality-${pm.id}`}>
                            <XCircle className="mr-1 h-3.5 w-3.5" /> Reject
                          </Button>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
