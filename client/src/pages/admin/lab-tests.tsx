import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, MoreHorizontal, Pause, Play, Trash2, FlaskConical, Search, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { LabTest, Provider, ProviderLabTest } from "@shared/schema";

const labTestSchema = z.object({
  testName: z.string().min(2, "Test name is required"),
  category: z.string().min(1, "Category is required"),
  cost: z.string().min(1, "Cost is required"),
  turnaroundTime: z.string().min(1, "Turnaround time is required"),
});

type LabTestFormData = z.infer<typeof labTestSchema>;

const providerAssignSchema = z.object({
  providerId: z.string().min(1, "Select a provider"),
  price: z.string().min(1, "Price is required"),
  turnaroundTime: z.string().optional(),
});

type ProviderAssignFormData = z.infer<typeof providerAssignSchema>;

type ProviderLabTestWithDetails = ProviderLabTest & {
  provider?: Provider;
};

const categories = [
  "Hematology",
  "Biochemistry",
  "Thyroid",
  "Cardiac Markers",
  "Vitamins & Minerals",
  "Urine",
  "Serology",
  "Hormones",
  "Tumor Markers",
  "Other",
];

export default function AdminLabTestsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("All");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isProviderDialogOpen, setIsProviderDialogOpen] = useState(false);
  const [selectedTest, setSelectedTest] = useState<LabTest | null>(null);
  const { toast } = useToast();

  const { data: tests, isLoading } = useQuery<LabTest[]>({
    queryKey: ["/api/lab-tests/all"],
  });

  const { data: providers } = useQuery<Provider[]>({
    queryKey: ["/api/admin/providers"],
  });

  const { data: testProviders, refetch: refetchTestProviders } = useQuery<ProviderLabTestWithDetails[]>({
    queryKey: ["/api/admin/lab-tests", selectedTest?.id, "providers"],
    enabled: !!selectedTest,
    queryFn: async () => {
      if (!selectedTest) return [];
      const res = await fetch(`/api/admin/lab-tests/${selectedTest.id}/providers`, { credentials: "include" });
      return res.json();
    },
  });

  const form = useForm<LabTestFormData>({
    resolver: zodResolver(labTestSchema),
    defaultValues: {
      testName: "",
      category: "",
      cost: "",
      turnaroundTime: "",
    },
  });

  const providerForm = useForm<ProviderAssignFormData>({
    resolver: zodResolver(providerAssignSchema),
    defaultValues: {
      providerId: "",
      price: "",
      turnaroundTime: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: LabTestFormData) => {
      return apiRequest("POST", "/api/admin/lab-tests", {
        ...data,
        status: "active",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lab-tests/all"] });
      setIsDialogOpen(false);
      form.reset();
      toast({ title: "Success", description: "Lab test added successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add lab test", variant: "destructive" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiRequest("PATCH", `/api/admin/lab-tests/${id}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lab-tests/all"] });
      toast({ title: "Success", description: "Status updated successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update status", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/admin/lab-tests/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lab-tests/all"] });
      toast({ title: "Success", description: "Lab test deleted successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete lab test", variant: "destructive" });
    },
  });

  const assignProviderMutation = useMutation({
    mutationFn: async (data: ProviderAssignFormData) => {
      return apiRequest("POST", "/api/admin/provider-lab-tests", {
        providerId: data.providerId,
        labTestId: selectedTest?.id,
        price: data.price,
        turnaroundTime: data.turnaroundTime,
        isActive: true,
      });
    },
    onSuccess: () => {
      refetchTestProviders();
      providerForm.reset();
      toast({ title: "Success", description: "Provider assigned to test" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to assign provider", variant: "destructive" });
    },
  });

  const removeProviderMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      return apiRequest("DELETE", `/api/admin/provider-lab-tests/${assignmentId}`);
    },
    onSuccess: () => {
      refetchTestProviders();
      toast({ title: "Success", description: "Provider removed from test" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove provider", variant: "destructive" });
    },
  });

  const onSubmit = (data: LabTestFormData) => {
    createMutation.mutate(data);
  };

  const onAssignProvider = (data: ProviderAssignFormData) => {
    assignProviderMutation.mutate(data);
  };

  const openProviderDialog = (test: LabTest) => {
    setSelectedTest(test);
    setIsProviderDialogOpen(true);
  };

  const assignedProviderIds = testProviders?.map(tp => tp.providerId) || [];
  const availableProviders = providers?.filter(p => !assignedProviderIds.includes(p.id)) || [];

  const filteredTests = tests?.filter((t) => {
    const matchesSearch =
      t.testName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.category && t.category.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = filterCategory === "All" || t.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-500">Active</Badge>;
      case "paused":
        return <Badge variant="secondary">Paused</Badge>;
      case "deleted":
        return <Badge variant="destructive">Deleted</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Manage Lab Tests</h1>
          <p className="text-muted-foreground">
            Add, pause, or remove diagnostic tests
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-test">
              <Plus className="mr-2 h-4 w-4" />
              Add Lab Test
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Add New Lab Test</DialogTitle>
              <DialogDescription>
                Enter the test details below
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="testName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Test Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Complete Blood Count (CBC)" {...field} data-testid="input-test-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-category">
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {categories.map((cat) => (
                            <SelectItem key={cat} value={cat}>
                              {cat}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid gap-4 grid-cols-2">
                  <FormField
                    control={form.control}
                    name="cost"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cost (₹)</FormLabel>
                        <FormControl>
                          <Input placeholder="250.00" {...field} data-testid="input-cost" />
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
                          <Input placeholder="4 hours" {...field} data-testid="input-tat" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-save-test">
                  {createMutation.isPending ? "Adding..." : "Add Lab Test"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search tests..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
                data-testid="input-search-tests"
              />
            </div>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-[180px]" data-testid="select-filter-category">
                <SelectValue placeholder="Filter by category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Categories</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredTests?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FlaskConical className="mb-4 h-12 w-12 text-muted-foreground/50" />
              <p className="text-muted-foreground">No lab tests found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Test Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>TAT</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[70px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTests?.map((test) => (
                  <TableRow key={test.id} data-testid={`row-test-${test.id}`}>
                    <TableCell className="font-medium">{test.testName}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{test.category}</Badge>
                    </TableCell>
                    <TableCell>₹{test.cost}</TableCell>
                    <TableCell>{test.turnaroundTime}</TableCell>
                    <TableCell>{getStatusBadge(test.status || "active")}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid={`button-actions-${test.id}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openProviderDialog(test)}>
                            <Users className="mr-2 h-4 w-4" />
                            Manage Providers
                          </DropdownMenuItem>
                          {test.status === "active" ? (
                            <DropdownMenuItem
                              onClick={() => updateStatusMutation.mutate({ id: test.id, status: "paused" })}
                            >
                              <Pause className="mr-2 h-4 w-4" />
                              Pause
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => updateStatusMutation.mutate({ id: test.id, status: "active" })}
                            >
                              <Play className="mr-2 h-4 w-4" />
                              Activate
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => deleteMutation.mutate(test.id)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Provider Assignment Dialog */}
      <Dialog open={isProviderDialogOpen} onOpenChange={setIsProviderDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Manage Providers for {selectedTest?.testName}</DialogTitle>
            <DialogDescription>
              Assign which provider will handle bookings for this test
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Current Assigned Providers */}
            <div>
              <h4 className="font-medium mb-2">Assigned Providers</h4>
              {testProviders?.length === 0 ? (
                <p className="text-sm text-muted-foreground">No providers assigned yet</p>
              ) : (
                <div className="space-y-2">
                  {testProviders?.map((tp) => (
                    <div key={tp.id} className="flex items-center justify-between p-3 border rounded-md">
                      <div>
                        <p className="font-medium">{tp.provider?.name || "Unknown Provider"}</p>
                        <p className="text-sm text-muted-foreground">
                          Price: ₹{tp.price} • TAT: {tp.turnaroundTime || "N/A"}
                        </p>
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => removeProviderMutation.mutate(tp.id)}
                        disabled={removeProviderMutation.isPending}
                        data-testid={`button-remove-provider-${tp.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add New Provider */}
            {availableProviders.length > 0 && (
              <div className="border-t pt-4">
                <h4 className="font-medium mb-2">Add Provider</h4>
                <Form {...providerForm}>
                  <form onSubmit={providerForm.handleSubmit(onAssignProvider)} className="space-y-3">
                    <FormField
                      control={providerForm.control}
                      name="providerId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Select Provider</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-provider">
                                <SelectValue placeholder="Choose a provider" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {availableProviders.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name} ({p.location || "No location"})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid gap-3 grid-cols-2">
                      <FormField
                        control={providerForm.control}
                        name="price"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Price (₹)</FormLabel>
                            <FormControl>
                              <Input placeholder="250" {...field} data-testid="input-provider-price" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={providerForm.control}
                        name="turnaroundTime"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Turnaround Time</FormLabel>
                            <FormControl>
                              <Input placeholder="4 hours" {...field} data-testid="input-provider-tat" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <Button 
                      type="submit" 
                      className="w-full" 
                      disabled={assignProviderMutation.isPending}
                      data-testid="button-assign-provider"
                    >
                      {assignProviderMutation.isPending ? "Assigning..." : "Assign Provider"}
                    </Button>
                  </form>
                </Form>
              </div>
            )}

            {availableProviders.length === 0 && testProviders && testProviders.length > 0 && (
              <p className="text-sm text-muted-foreground text-center py-2">
                All available providers have been assigned
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
