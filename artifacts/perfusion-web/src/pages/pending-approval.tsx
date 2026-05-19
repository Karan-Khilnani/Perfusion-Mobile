import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Heart, Clock, LogOut } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export default function PendingApprovalPage() {
  const queryClient = useQueryClient();

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Logout failed");
    },
    onSuccess: () => {
      queryClient.clear();
      window.location.href = "/home";
    },
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="flex justify-center mb-4">
            <div className="flex items-center gap-2">
              <Heart className="h-8 w-8 text-primary" />
              <span className="text-2xl font-bold">Perfusion</span>
            </div>
          </div>
          <div className="mx-auto mb-2 p-4 rounded-full bg-yellow-500/10">
            <Clock className="h-8 w-8 text-yellow-600" />
          </div>
          <CardTitle>Registration Pending Approval</CardTitle>
          <CardDescription>
            Your account has been created and is awaiting admin approval. You will be able to access the platform once your registration is reviewed and approved.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border p-4 text-left space-y-2">
            <p className="text-sm font-medium">What happens next?</p>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Our admin team will review your hospital registration details</li>
              <li>Your uploaded documents will be verified</li>
              <li>You will receive access once approved</li>
            </ul>
          </div>
          <p className="text-xs text-muted-foreground">
            This usually takes 1-2 business days. For urgent requests, please contact support at 9244893295.
          </p>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button 
            variant="outline" 
            className="w-full" 
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            data-testid="button-logout"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Log Out
          </Button>
          <Link href="/" className="text-sm text-muted-foreground hover:underline">
            Back to Home
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
