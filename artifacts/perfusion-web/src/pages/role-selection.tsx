import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, Heart, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function RoleSelectionPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedRole, setSelectedRole] = useState<string | null>(null);

  const updateRoleMutation = useMutation({
    mutationFn: async (role: string) => {
      return apiRequest("PATCH", "/api/users/me/role", { role });
    },
    onSuccess: (_, role) => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      if (role === "provider") {
        setLocation("/provider/onboarding");
      } else {
        setLocation("/user");
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update your role. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleRoleSelect = (role: string) => {
    setSelectedRole(role);
    updateRoleMutation.mutate(role);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-3xl w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Welcome to Perfusion</h1>
          <p className="text-muted-foreground">Choose how you want to use the platform</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card 
            className={`cursor-pointer transition-all hover-elevate ${
              selectedRole === "care_seeker" ? "ring-2 ring-primary" : ""
            }`}
            onClick={() => !updateRoleMutation.isPending && handleRoleSelect("care_seeker")}
            data-testid="card-role-care-seeker"
          >
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 p-4 rounded-full bg-primary/10">
                <Heart className="h-8 w-8 text-primary" />
              </div>
              <CardTitle>Care Seeker</CardTitle>
              <CardDescription>
                Access diagnostic labs, specialist consultations, emergency care, and hospital referrals
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Button 
                variant="default" 
                disabled={updateRoleMutation.isPending}
                data-testid="button-select-care-seeker"
              >
                {updateRoleMutation.isPending && selectedRole === "care_seeker" ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                I need healthcare services
              </Button>
            </CardContent>
          </Card>

          <Card 
            className={`cursor-pointer transition-all hover-elevate ${
              selectedRole === "provider" ? "ring-2 ring-primary" : ""
            }`}
            onClick={() => !updateRoleMutation.isPending && handleRoleSelect("provider")}
            data-testid="card-role-provider"
          >
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 p-4 rounded-full bg-primary/10">
                <Building2 className="h-8 w-8 text-primary" />
              </div>
              <CardTitle>Care Provider</CardTitle>
              <CardDescription>
                Register your lab, hospital, or consultation practice to offer services
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Button 
                variant="default" 
                disabled={updateRoleMutation.isPending}
                data-testid="button-select-provider"
              >
                {updateRoleMutation.isPending && selectedRole === "provider" ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                I provide healthcare services
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
