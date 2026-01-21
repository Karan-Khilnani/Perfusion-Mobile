import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building, Users, Clock, CheckCircle } from "lucide-react";
import { Loader2 } from "lucide-react";

export default function AdminDashboard() {
  const { data: providers = [], isLoading: loadingProviders } = useQuery<any[]>({
    queryKey: ["/api/admin/providers"],
  });

  const { data: users = [], isLoading: loadingUsers } = useQuery<any[]>({
    queryKey: ["/api/admin/users"],
  });

  const pendingProviders = providers.filter((p) => p.verificationStatus === "pending");
  const verifiedProviders = providers.filter((p) => p.verificationStatus === "verified");

  if (loadingProviders || loadingUsers) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="page-admin-dashboard">
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-admin-title">Admin Dashboard</h1>
        <p className="text-muted-foreground" data-testid="text-admin-subtitle">Manage providers and platform users</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Providers</CardTitle>
            <Building className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-providers">{providers.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Approvals</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600" data-testid="text-pending-providers">
              {pendingProviders.length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Verified Providers</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600" data-testid="text-verified-providers">
              {verifiedProviders.length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-users">{users.length}</div>
          </CardContent>
        </Card>
      </div>

      {pendingProviders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending Provider Approvals</CardTitle>
            <CardDescription>Review and approve provider registrations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {pendingProviders.slice(0, 5).map((provider: any) => (
                <div 
                  key={provider.id} 
                  className="flex items-center justify-between p-4 border rounded-lg"
                  data-testid={`provider-pending-${provider.id}`}
                >
                  <div>
                    <p className="font-medium">{provider.name}</p>
                    <p className="text-sm text-muted-foreground">{provider.type} - {provider.location}</p>
                  </div>
                  <a 
                    href="/admin/providers" 
                    className="text-primary hover:underline text-sm"
                  >
                    Review
                  </a>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
