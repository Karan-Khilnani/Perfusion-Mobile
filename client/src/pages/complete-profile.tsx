import { useLocation, useSearch } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Heart, Loader2, User, Building } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

const profileSchema = z.object({
  role: z.enum(["care_seeker", "provider"]),
});

type ProfileFormData = z.infer<typeof profileSchema>;

export default function CompleteProfilePage() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const params = new URLSearchParams(searchString);
  const presetRole = params.get("role");

  const { data: currentUser } = useQuery<any>({
    queryKey: ["/api/auth/user"],
  });

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      role: (presetRole === "provider" ? "provider" : "care_seeker") as "care_seeker" | "provider",
    },
  });

  const roleMutation = useMutation({
    mutationFn: async (data: ProfileFormData) => {
      const res = await apiRequest("PATCH", "/api/auth/user/role", { role: data.role });
      return res.json();
    },
    onSuccess: (user) => {
      queryClient.setQueryData(["/api/auth/user"], user);
      toast({ title: "Welcome to Perfusion!", description: "Your profile is set up." });
      if (user.role === "provider") {
        setLocation("/provider/onboarding");
      } else {
        setLocation("/user");
      }
    },
    onError: (error: Error) => {
      toast({ title: "Failed to complete profile", description: error.message, variant: "destructive" });
    },
  });

  const selectedRole = form.watch("role");

  const onSubmit = (data: ProfileFormData) => {
    roleMutation.mutate(data);
  };

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
          <CardTitle>Complete Your Profile</CardTitle>
          <CardDescription>
            {currentUser?.email ? (
              <>Signed in as <span className="font-medium">{currentUser.email}</span>. Choose how you'll use Perfusion.</>
            ) : (
              "One more step to get started."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>I am a</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        className="grid grid-cols-2 gap-4"
                      >
                        <div>
                          <RadioGroupItem
                            value="care_seeker"
                            id="cp_care_seeker"
                            className="peer sr-only"
                          />
                          <Label
                            htmlFor="cp_care_seeker"
                            className={`flex flex-col items-center justify-between rounded-md border-2 p-6 cursor-pointer ${
                              selectedRole === "care_seeker"
                                ? "border-primary bg-primary/5"
                                : "border-muted"
                            }`}
                            data-testid="radio-cp-care-seeker"
                          >
                            <User className="mb-3 h-8 w-8" />
                            <span className="text-sm font-medium">Care Seeker</span>
                            <span className="text-xs text-muted-foreground mt-1">Patient or Hospital</span>
                          </Label>
                        </div>
                        <div>
                          <RadioGroupItem
                            value="provider"
                            id="cp_provider"
                            className="peer sr-only"
                          />
                          <Label
                            htmlFor="cp_provider"
                            className={`flex flex-col items-center justify-between rounded-md border-2 p-6 cursor-pointer ${
                              selectedRole === "provider"
                                ? "border-primary bg-primary/5"
                                : "border-muted"
                            }`}
                            data-testid="radio-cp-provider"
                          >
                            <Building className="mb-3 h-8 w-8" />
                            <span className="text-sm font-medium">Care Provider</span>
                            <span className="text-xs text-muted-foreground mt-1">Lab, Consultant, Hospital</span>
                          </Label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full"
                disabled={roleMutation.isPending}
                data-testid="button-complete-profile"
              >
                {roleMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Setting up...
                  </>
                ) : (
                  "Continue"
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
