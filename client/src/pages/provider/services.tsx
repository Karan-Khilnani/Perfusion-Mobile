import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { StarRating } from "@/components/star-rating";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Edit2, FlaskConical, IndianRupee, Clock, Building2, Stethoscope, Loader2, AlertCircle } from "lucide-react";
import type { Lab, LabTest, Consultant, Provider } from "@shared/schema";

interface LabWithTests extends Lab {
  tests: LabTest[];
}

const labSchema = z.object({
  name: z.string().min(2, "Lab name is required"),
  location: z.string().min(2, "Location is required"),
  description: z.string().optional(),
});

const testSchema = z.object({
  testName: z.string().min(2, "Test name is required"),
  cost: z.string().min(1, "Cost is required"),
  turnaroundTime: z.string().min(1, "Turnaround time is required"),
});

const consultantSchema = z.object({
  name: z.string().min(2, "Name is required"),
  qualification: z.string().min(2, "Qualification is required"),
  specialization: z.string().min(2, "Specialization is required"),
  yearsExperience: z.coerce.number().min(0, "Experience is required"),
  consultationFee: z.string().min(1, "Fee is required"),
});

type LabFormData = z.infer<typeof labSchema>;
type TestFormData = z.infer<typeof testSchema>;
type ConsultantFormData = z.infer<typeof consultantSchema>;

export default function ProviderServicesPage() {
  const { toast } = useToast();
  const [isLabDialogOpen, setIsLabDialogOpen] = useState(false);
  const [isTestDialogOpen, setIsTestDialogOpen] = useState(false);
  const [isConsultantDialogOpen, setIsConsultantDialogOpen] = useState(false);
  const [selectedLabId, setSelectedLabId] = useState<string | null>(null);

  const { data: provider, isLoading: providerLoading } = useQuery<Provider>({
    queryKey: ["/api/providers/me"],
    retry: false,
  });

  const { data: labs, isLoading: labsLoading } = useQuery<LabWithTests[]>({
    queryKey: ["/api/provider/my-labs"],
    enabled: !!provider,
  });

  const { data: consultants, isLoading: consultantsLoading } = useQuery<Consultant[]>({
    queryKey: ["/api/provider/my-consultants"],
    enabled: !!provider,
  });

  const labForm = useForm<LabFormData>({
    resolver: zodResolver(labSchema),
    defaultValues: { name: "", location: "", description: "" },
  });

  const testForm = useForm<TestFormData>({
    resolver: zodResolver(testSchema),
    defaultValues: { testName: "", cost: "", turnaroundTime: "" },
  });

  const consultantForm = useForm<ConsultantFormData>({
    resolver: zodResolver(consultantSchema),
    defaultValues: { name: "", qualification: "", specialization: "", yearsExperience: 0, consultationFee: "" },
  });

  const createLabMutation = useMutation({
    mutationFn: async (data: LabFormData) => {
      const response = await apiRequest("POST", "/api/provider/labs", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/my-labs"] });
      setIsLabDialogOpen(false);
      labForm.reset();
      toast({ title: "Lab Created", description: "Your lab has been created successfully." });
    },
    onError: () => {
      toast({ title: "Failed", description: "Failed to create lab.", variant: "destructive" });
    },
  });

  const addTestMutation = useMutation({
    mutationFn: async (data: TestFormData & { labId: string }) => {
      const response = await apiRequest("POST", "/api/lab-tests", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/my-labs"] });
      setIsTestDialogOpen(false);
      testForm.reset();
      toast({ title: "Test Added", description: "Lab test has been added successfully." });
    },
    onError: () => {
      toast({ title: "Failed", description: "Failed to add lab test.", variant: "destructive" });
    },
  });

  const createConsultantMutation = useMutation({
    mutationFn: async (data: ConsultantFormData) => {
      const response = await apiRequest("POST", "/api/provider/consultants", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/my-consultants"] });
      setIsConsultantDialogOpen(false);
      consultantForm.reset();
      toast({ title: "Consultant Added", description: "Consultant profile has been created." });
    },
    onError: () => {
      toast({ title: "Failed", description: "Failed to create consultant.", variant: "destructive" });
    },
  });

  const handleAddTest = (data: TestFormData) => {
    if (!selectedLabId) return;
    addTestMutation.mutate({ ...data, labId: selectedLabId });
  };

  const isLoading = providerLoading || labsLoading;

  if (providerLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Card>
          <CardContent className="py-12">
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!provider) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Service Management</h1>
          <p className="text-muted-foreground">Manage your service listings and pricing</p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <AlertCircle className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <h3 className="mb-2 text-lg font-medium">Provider Profile Required</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Complete your provider registration to start adding services
            </p>
            <Button asChild data-testid="button-complete-registration">
              <a href="/provider/onboarding">Complete Registration</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const verificationBanner = provider.verificationStatus === "pending" && (
    <Card className="border-yellow-500/50 bg-yellow-500/10">
      <CardContent className="flex items-center gap-3 py-4">
        <AlertCircle className="h-5 w-5 text-yellow-600" />
        <p className="text-sm text-yellow-800 dark:text-yellow-200">
          Your provider profile is pending verification. You can add services, but they won't be visible to seekers until approved.
        </p>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Service Management</h1>
        <p className="text-muted-foreground">Manage your service listings and pricing</p>
      </div>

      {verificationBanner}

      <Tabs defaultValue="labs" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="labs" data-testid="tab-labs">
            <FlaskConical className="mr-2 h-4 w-4" />
            Labs
          </TabsTrigger>
          <TabsTrigger value="consultants" data-testid="tab-consultants">
            <Stethoscope className="mr-2 h-4 w-4" />
            Consultants
          </TabsTrigger>
        </TabsList>

        <TabsContent value="labs" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={isLabDialogOpen} onOpenChange={setIsLabDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-lab">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Lab
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New Lab</DialogTitle>
                  <DialogDescription>Create a new diagnostic lab</DialogDescription>
                </DialogHeader>
                <Form {...labForm}>
                  <form onSubmit={labForm.handleSubmit((data) => createLabMutation.mutate(data))} className="space-y-4">
                    <FormField
                      control={labForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Lab Name</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., Premier Diagnostics" {...field} data-testid="input-lab-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={labForm.control}
                      name="location"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Location</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., Mumbai" {...field} data-testid="input-lab-location" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={labForm.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description</FormLabel>
                          <FormControl>
                            <Textarea placeholder="Brief description of your lab" {...field} data-testid="input-lab-description" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="submit" className="w-full" disabled={createLabMutation.isPending} data-testid="button-save-lab">
                      {createLabMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Create Lab
                    </Button>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>

          {labsLoading ? (
            <Card><CardContent className="py-8"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ) : !labs || labs.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <FlaskConical className="mb-4 h-12 w-12 text-muted-foreground/50" />
                <h3 className="mb-2 text-lg font-medium">No labs yet</h3>
                <p className="text-sm text-muted-foreground">Click "Add Lab" to create your first lab</p>
              </CardContent>
            </Card>
          ) : (
            labs.map((lab) => (
              <Card key={lab.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle>{lab.name}</CardTitle>
                      <CardDescription>{lab.location}</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <StarRating rating={parseFloat(lab.rating || "4.0")} />
                      <Badge variant={lab.isActive ? "default" : "secondary"}>
                        {lab.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {lab.description && <p className="text-sm text-muted-foreground">{lab.description}</p>}
                  
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Tests ({lab.tests.length})</h4>
                    <Dialog open={isTestDialogOpen && selectedLabId === lab.id} onOpenChange={(open) => {
                      setIsTestDialogOpen(open);
                      if (open) setSelectedLabId(lab.id);
                    }}>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline" data-testid={`button-add-test-${lab.id}`}>
                          <Plus className="mr-2 h-4 w-4" />
                          Add Test
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Add Lab Test</DialogTitle>
                          <DialogDescription>Add a new test to {lab.name}</DialogDescription>
                        </DialogHeader>
                        <Form {...testForm}>
                          <form onSubmit={testForm.handleSubmit(handleAddTest)} className="space-y-4">
                            <FormField
                              control={testForm.control}
                              name="testName"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Test Name</FormLabel>
                                  <FormControl>
                                    <Input placeholder="e.g., Complete Blood Count" {...field} data-testid="input-test-name" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={testForm.control}
                              name="cost"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Cost ($)</FormLabel>
                                  <FormControl>
                                    <Input placeholder="e.g., 50.00" {...field} data-testid="input-test-cost" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={testForm.control}
                              name="turnaroundTime"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Turnaround Time</FormLabel>
                                  <FormControl>
                                    <Input placeholder="e.g., 24 hours" {...field} data-testid="input-test-tat" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <Button type="submit" className="w-full" disabled={addTestMutation.isPending} data-testid="button-save-test">
                              {addTestMutation.isPending ? "Adding..." : "Add Test"}
                            </Button>
                          </form>
                        </Form>
                      </DialogContent>
                    </Dialog>
                  </div>

                  {lab.tests.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No tests added yet</p>
                  ) : (
                    <div className="space-y-2">
                      {lab.tests.map((test) => (
                        <div key={test.id} className="flex items-center justify-between rounded-lg border p-3" data-testid={`test-row-${test.id}`}>
                          <div>
                            <p className="font-medium">{test.testName}</p>
                            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <IndianRupee className="h-3.5 w-3.5" />₹{test.cost}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5" />{test.turnaroundTime}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="consultants" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={isConsultantDialogOpen} onOpenChange={setIsConsultantDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-consultant">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Consultant
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Consultant</DialogTitle>
                  <DialogDescription>Add a new consultant to your practice</DialogDescription>
                </DialogHeader>
                <Form {...consultantForm}>
                  <form onSubmit={consultantForm.handleSubmit((data) => createConsultantMutation.mutate(data))} className="space-y-4">
                    <FormField
                      control={consultantForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Dr. Name" {...field} data-testid="input-consultant-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={consultantForm.control}
                      name="qualification"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Qualification</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., MD, DM (Cardiology)" {...field} data-testid="input-consultant-qualification" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={consultantForm.control}
                      name="specialization"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Specialization</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., Cardiology" {...field} data-testid="input-consultant-specialization" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={consultantForm.control}
                        name="yearsExperience"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Years Experience</FormLabel>
                            <FormControl>
                              <Input type="number" {...field} data-testid="input-consultant-experience" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={consultantForm.control}
                        name="consultationFee"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Consultation Fee ($)</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g., 100.00" {...field} data-testid="input-consultant-fee" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={createConsultantMutation.isPending} data-testid="button-save-consultant">
                      {createConsultantMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Add Consultant
                    </Button>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>

          {consultantsLoading ? (
            <Card><CardContent className="py-8"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ) : !consultants || consultants.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Stethoscope className="mb-4 h-12 w-12 text-muted-foreground/50" />
                <h3 className="mb-2 text-lg font-medium">No consultants yet</h3>
                <p className="text-sm text-muted-foreground">Click "Add Consultant" to add your first consultant</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {consultants.map((consultant) => (
                <Card key={consultant.id}>
                  <CardContent className="flex items-center justify-between py-4">
                    <div>
                      <p className="font-medium">{consultant.name}</p>
                      <p className="text-sm text-muted-foreground">{consultant.qualification}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                        <span>{consultant.specialization}</span>
                        <span>{consultant.yearsExperience} years exp.</span>
                        <span>₹{consultant.consultationFee}</span>
                      </div>
                    </div>
                    <StarRating rating={parseFloat(consultant.rating || "4.0")} />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
