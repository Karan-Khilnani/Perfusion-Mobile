import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Heart, User, Building, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export default function SelectRolePage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const roleMutation = useMutation({
    mutationFn: async (role: string) => {
      const res = await apiRequest("PATCH", "/api/auth/user/role", { role });
      return res.json();
    },
    onSuccess: (user) => {
      queryClient.setQueryData(["/api/auth/user"], user);
      toast({ title: "Welcome to Perfusion!", description: "Your account is ready." });
      if (user.role === "provider") {
        setLocation("/provider/onboarding");
      } else {
        setLocation("/user");
      }
    },
    onError: (error: Error) => {
      toast({ title: "Failed to set role", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="flex items-center gap-2">
              <Heart className="h-8 w-8 text-primary" />
              <span className="text-2xl font-bold">Perfusion</span>
            </div>
          </div>
          <CardTitle>Choose Your Role</CardTitle>
          <CardDescription>How will you use Perfusion?</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            variant="outline"
            className="w-full h-auto p-6 flex flex-col items-center gap-2"
            onClick={() => roleMutation.mutate("care_seeker")}
            disabled={roleMutation.isPending}
            data-testid="button-role-seeker"
          >
            {roleMutation.isPending ? (
              <Loader2 className="h-8 w-8 animate-spin" />
            ) : (
              <>
                <User className="h-8 w-8" />
                <span className="text-base font-medium">Care Seeker</span>
                <span className="text-xs text-muted-foreground">Patient or Hospital</span>
              </>
            )}
          </Button>
          <Button
            variant="outline"
            className="w-full h-auto p-6 flex flex-col items-center gap-2"
            onClick={() => roleMutation.mutate("provider")}
            disabled={roleMutation.isPending}
            data-testid="button-role-provider"
          >
            {roleMutation.isPending ? (
              <Loader2 className="h-8 w-8 animate-spin" />
            ) : (
              <>
                <Building className="h-8 w-8" />
                <span className="text-base font-medium">Care Provider</span>
                <span className="text-xs text-muted-foreground">Lab, Consultant, Hospital</span>
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
