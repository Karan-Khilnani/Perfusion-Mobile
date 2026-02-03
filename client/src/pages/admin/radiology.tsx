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
import { Plus, MoreHorizontal, Pause, Play, Trash2, FileImage, Search, Pencil, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { RadiologyModality } from "@shared/schema";

const modalitySchema = z.object({
  name: z.string().min(2, "Modality name is required"),
  category: z.string().min(1, "Category is required"),
  cost: z.string().optional(),
  turnaroundTime: z.string().optional(),
});

type ModalityFormData = z.infer<typeof modalitySchema>;

const modalityCategories = [
  "X-Ray",
  "CT Scan",
  "CT Angiography",
  "MRI",
  "MRI Angiography",
  "Mammography",
  "Special Procedures",
  "Dental Imaging",
  "Other",
];

export default function AdminRadiologyPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("All");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingModality, setEditingModality] = useState<RadiologyModality | null>(null);
  const { toast } = useToast();

  const { data: modalities, isLoading } = useQuery<RadiologyModality[]>({
    queryKey: ["/api/radiology-modalities/all"],
  });

  const form = useForm<ModalityFormData>({
    resolver: zodResolver(modalitySchema),
    defaultValues: {
      name: "",
      category: "",
      cost: "",
      turnaroundTime: "",
    },
  });

  const editForm = useForm<ModalityFormData>({
    resolver: zodResolver(modalitySchema),
    defaultValues: {
      name: "",
      category: "",
      cost: "",
      turnaroundTime: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: ModalityFormData) => {
      return apiRequest("POST", "/api/admin/radiology-modalities", {
        ...data,
        status: "active",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/radiology-modalities/all"] });
      setIsDialogOpen(false);
      form.reset();
      toast({ title: "Success", description: "Modality added successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add modality", variant: "destructive" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiRequest("PATCH", `/api/admin/radiology-modalities/${id}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/radiology-modalities/all"] });
      toast({ title: "Success", description: "Status updated successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update status", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/admin/radiology-modalities/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/radiology-modalities/all"] });
      toast({ title: "Success", description: "Modality deleted successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete modality", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ModalityFormData }) => {
      return apiRequest("PATCH", `/api/admin/radiology-modalities/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/radiology-modalities/all"] });
      setIsEditDialogOpen(false);
      setEditingModality(null);
      editForm.reset();
      toast({ title: "Success", description: "Modality updated successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update modality", variant: "destructive" });
    },
  });

  const onSubmit = (data: ModalityFormData) => {
    createMutation.mutate(data);
  };

  const onEditSubmit = (data: ModalityFormData) => {
    if (editingModality) {
      updateMutation.mutate({ id: editingModality.id, data });
    }
  };

  const openEditDialog = (modality: RadiologyModality) => {
    setEditingModality(modality);
    editForm.reset({
      name: modality.name,
      category: modality.category || "",
      cost: modality.cost?.toString() || "",
      turnaroundTime: modality.turnaroundTime || "",
    });
    setIsEditDialogOpen(true);
  };

  const filteredModalities = modalities?.filter((m) => {
    const matchesSearch =
      m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (m.category && m.category.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = filterCategory === "All" || m.category === filterCategory;
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
          <h1 className="text-2xl font-semibold tracking-tight">Manage Radiology Modalities</h1>
          <p className="text-muted-foreground">
            Add, pause, or remove imaging modalities
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-modality">
              <Plus className="mr-2 h-4 w-4" />
              Add Modality
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Add New Modality</DialogTitle>
              <DialogDescription>
                Enter the modality details below
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Modality Name</FormLabel>
                      <FormControl>
                        <Input placeholder="MRI Brain - Plain" {...field} data-testid="input-modality-name" />
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
                          <SelectTrigger data-testid="select-modality-category">
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {modalityCategories.map((cat) => (
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
                <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-save-modality">
                  {createMutation.isPending ? "Adding..." : "Add Modality"}
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
                placeholder="Search modalities..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
                data-testid="input-search-modalities"
              />
            </div>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-[180px]" data-testid="select-filter-modality-category">
                <SelectValue placeholder="Filter by category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Categories</SelectItem>
                {modalityCategories.map((cat) => (
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
          ) : filteredModalities?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileImage className="mb-4 h-12 w-12 text-muted-foreground/50" />
              <p className="text-muted-foreground">No modalities found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Modality Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>TAT</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[70px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredModalities?.map((modality) => (
                  <TableRow key={modality.id} data-testid={`row-modality-${modality.id}`}>
                    <TableCell className="font-medium">{modality.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{modality.category}</Badge>
                    </TableCell>
                    <TableCell>{modality.cost ? `₹${modality.cost}` : "-"}</TableCell>
                    <TableCell>{modality.turnaroundTime || "-"}</TableCell>
                    <TableCell>{getStatusBadge(modality.status || "active")}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid={`button-actions-${modality.id}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditDialog(modality)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit Cost/TAT
                          </DropdownMenuItem>
                          {modality.status === "active" ? (
                            <DropdownMenuItem
                              onClick={() => updateStatusMutation.mutate({ id: modality.id, status: "paused" })}
                            >
                              <Pause className="mr-2 h-4 w-4" />
                              Pause
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => updateStatusMutation.mutate({ id: modality.id, status: "active" })}
                            >
                              <Play className="mr-2 h-4 w-4" />
                              Activate
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => deleteMutation.mutate(modality.id)}
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

      {/* Edit Modality Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={(open) => {
        setIsEditDialogOpen(open);
        if (!open) {
          setEditingModality(null);
          editForm.reset();
        }
      }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Modality</DialogTitle>
            <DialogDescription>
              Update the cost and turnaround time for {editingModality?.name}
            </DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Modality Name</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-edit-modality-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-edit-modality-category">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {modalityCategories.map((cat) => (
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
                  control={editForm.control}
                  name="cost"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Platform Cost (₹)</FormLabel>
                      <FormControl>
                        <Input placeholder="500.00" {...field} data-testid="input-edit-modality-cost" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="turnaroundTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Turnaround Time</FormLabel>
                      <FormControl>
                        <Input placeholder="24 hours" {...field} data-testid="input-edit-modality-tat" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <Button type="submit" className="w-full" disabled={updateMutation.isPending} data-testid="button-update-modality">
                {updateMutation.isPending ? "Updating..." : "Update Modality"}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
