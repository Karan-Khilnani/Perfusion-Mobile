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
import { useToast } from "@/hooks/use-toast";
import { StarRating } from "@/components/star-rating";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Edit2, FlaskConical, DollarSign, Clock } from "lucide-react";
import type { Lab, LabTest } from "@shared/schema";

interface LabWithTests extends Lab {
  tests: LabTest[];
}

const testSchema = z.object({
  testName: z.string().min(2, "Test name is required"),
  cost: z.string().min(1, "Cost is required"),
  turnaroundTime: z.string().min(1, "Turnaround time is required"),
});

type TestFormData = z.infer<typeof testSchema>;

export default function ProviderServicesPage() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTest, setEditingTest] = useState<LabTest | null>(null);

  const { data: labs, isLoading } = useQuery<LabWithTests[]>({
    queryKey: ["/api/provider/labs"],
  });

  const form = useForm<TestFormData>({
    resolver: zodResolver(testSchema),
    defaultValues: {
      testName: "",
      cost: "",
      turnaroundTime: "",
    },
  });

  const addTestMutation = useMutation({
    mutationFn: async (data: TestFormData & { labId: string }) => {
      const response = await apiRequest("POST", "/api/lab-tests", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/labs"] });
      setIsDialogOpen(false);
      form.reset();
      toast({
        title: "Test Added",
        description: "Lab test has been added successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Failed",
        description: "Failed to add lab test.",
        variant: "destructive",
      });
    },
  });

  const myLab = labs?.[0];

  const handleAddTest = (data: TestFormData) => {
    if (!myLab) return;
    addTestMutation.mutate({ ...data, labId: myLab.id });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Service Management</h1>
          <p className="text-muted-foreground">
            Manage your service listings and pricing
          </p>
        </div>
      </div>

      {isLoading ? (
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      ) : !myLab ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <FlaskConical className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <h3 className="mb-2 text-lg font-medium">No services found</h3>
            <p className="text-sm text-muted-foreground">
              Your service listings will appear here
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle>{myLab.name}</CardTitle>
                  <CardDescription>{myLab.location}</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <StarRating rating={parseFloat(myLab.rating || "4.0")} />
                  <Badge variant={myLab.isActive ? "default" : "secondary"}>
                    {myLab.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {myLab.description && (
                <p className="text-sm text-muted-foreground">{myLab.description}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle>Lab Tests</CardTitle>
                <CardDescription>Tests offered by your lab</CardDescription>
              </div>
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-add-test">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Test
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Lab Test</DialogTitle>
                    <DialogDescription>
                      Add a new test to your service offerings
                    </DialogDescription>
                  </DialogHeader>
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleAddTest)} className="space-y-4">
                      <FormField
                        control={form.control}
                        name="testName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Test Name</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="e.g., Complete Blood Count"
                                {...field}
                                data-testid="input-test-name"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="cost"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Cost ($)</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="e.g., 50.00"
                                {...field}
                                data-testid="input-test-cost"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="turnaroundTime"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Turnaround Time</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="e.g., 24 hours"
                                {...field}
                                data-testid="input-test-tat"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button
                        type="submit"
                        className="w-full"
                        disabled={addTestMutation.isPending}
                        data-testid="button-save-test"
                      >
                        {addTestMutation.isPending ? "Adding..." : "Add Test"}
                      </Button>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {myLab.tests.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <FlaskConical className="mb-4 h-12 w-12 text-muted-foreground/50" />
                  <p className="text-muted-foreground">No tests added yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {myLab.tests.map((test) => (
                    <div
                      key={test.id}
                      className="flex items-center justify-between rounded-lg border p-4"
                      data-testid={`test-row-${test.id}`}
                    >
                      <div>
                        <p className="font-medium">{test.testName}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <DollarSign className="h-3.5 w-3.5" />
                            ${test.cost}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {test.turnaroundTime}
                          </span>
                          <StarRating
                            rating={parseFloat(test.accuracyRating || "4.5")}
                            size="sm"
                          />
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" disabled>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
