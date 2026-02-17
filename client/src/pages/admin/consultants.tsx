import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, MoreHorizontal, Pause, Play, Trash2, Stethoscope, Search, Calendar, Edit, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Consultant } from "@shared/schema";

const consultantSchema = z.object({
  name: z.string().min(2, "Name is required"),
  qualification: z.string().min(2, "Qualification is required"),
  specialization: z.string().min(2, "Specialization is required"),
  yearsExperience: z.coerce.number().min(0, "Experience must be positive"),
  consultationFee: z.string().min(1, "Fee is required"),
  rating: z.string().optional(),
  availableSlots: z.string().optional(),
});

type ConsultantFormData = z.infer<typeof consultantSchema>;

export default function AdminConsultantsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSlotsFor, setEditingSlotsFor] = useState<Consultant | null>(null);
  const [slotsList, setSlotsList] = useState<string[]>([]);
  const [selectedDay, setSelectedDay] = useState("Mon");
  const [selectedTime, setSelectedTime] = useState("09:00 AM");
  const { toast } = useToast();

  const { data: consultants, isLoading } = useQuery<Consultant[]>({
    queryKey: ["/api/admin/consultants"],
  });

  const form = useForm<ConsultantFormData>({
    resolver: zodResolver(consultantSchema),
    defaultValues: {
      name: "",
      qualification: "",
      specialization: "",
      yearsExperience: 0,
      consultationFee: "",
      rating: "4.5",
      availableSlots: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: ConsultantFormData) => {
      const slots = data.availableSlots
        ? data.availableSlots.split(",").map((s) => s.trim())
        : [];
      return apiRequest("POST", "/api/admin/consultants", {
        ...data,
        availableSlots: slots,
        status: "active",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/consultants"] });
      setIsDialogOpen(false);
      form.reset();
      toast({ title: "Success", description: "Consultant added successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add consultant", variant: "destructive" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiRequest("PATCH", `/api/admin/consultants/${id}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/consultants"] });
      toast({ title: "Success", description: "Status updated successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update status", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/admin/consultants/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/consultants"] });
      toast({ title: "Success", description: "Consultant deleted successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete consultant", variant: "destructive" });
    },
  });

  const updateSlotsMutation = useMutation({
    mutationFn: async ({ id, slots }: { id: string; slots: string[] }) => {
      return apiRequest("PATCH", `/api/consultants/${id}/slots`, { slots });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/consultants"] });
      setEditingSlotsFor(null);
      setSlotsList([]);
      toast({ title: "Success", description: "Slots updated successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update slots", variant: "destructive" });
    },
  });

  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const TIMES = [
    "06:00 AM", "06:30 AM", "07:00 AM", "07:30 AM",
    "08:00 AM", "08:30 AM", "09:00 AM", "09:30 AM",
    "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM",
    "12:00 PM", "12:30 PM", "01:00 PM", "01:30 PM",
    "02:00 PM", "02:30 PM", "03:00 PM", "03:30 PM",
    "04:00 PM", "04:30 PM", "05:00 PM", "05:30 PM",
    "06:00 PM", "06:30 PM", "07:00 PM", "07:30 PM",
    "08:00 PM", "08:30 PM", "09:00 PM", "09:30 PM",
    "10:00 PM",
  ];

  const handleOpenSlotsEditor = (consultant: Consultant) => {
    setEditingSlotsFor(consultant);
    setSlotsList(consultant.availableSlots ? [...consultant.availableSlots] : []);
    setSelectedDay("Mon");
    setSelectedTime("09:00 AM");
  };

  const handleAddSlot = () => {
    const slot = `${selectedDay} ${selectedTime}`;
    if (!slotsList.includes(slot)) {
      setSlotsList([...slotsList, slot]);
    }
  };

  const handleRemoveSlot = (index: number) => {
    setSlotsList(slotsList.filter((_, i) => i !== index));
  };

  const handleSaveSlots = () => {
    if (!editingSlotsFor) return;
    updateSlotsMutation.mutate({ id: editingSlotsFor.id, slots: slotsList });
  };

  const onSubmit = (data: ConsultantFormData) => {
    createMutation.mutate(data);
  };

  const filteredConsultants = consultants?.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.specialization && c.specialization.toLowerCase().includes(searchTerm.toLowerCase()))
  );

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
          <h1 className="text-2xl font-semibold tracking-tight">Manage Consultants</h1>
          <p className="text-muted-foreground">
            Add, pause, or remove specialist consultants
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-consultant">
              <Plus className="mr-2 h-4 w-4" />
              Add Consultant
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Add New Consultant</DialogTitle>
              <DialogDescription>
                Enter the consultant's details below
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Dr. John Smith" {...field} data-testid="input-consultant-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="qualification"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Qualification</FormLabel>
                      <FormControl>
                        <Input placeholder="MD, DM (Cardiology)" {...field} data-testid="input-qualification" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="specialization"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Specialization</FormLabel>
                      <FormControl>
                        <Input placeholder="Cardiology" {...field} data-testid="input-specialization" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid gap-4 grid-cols-2">
                  <FormField
                    control={form.control}
                    name="yearsExperience"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Experience (years)</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} data-testid="input-experience" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="consultationFee"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Consultation Fee</FormLabel>
                        <FormControl>
                          <Input placeholder="1500.00" {...field} data-testid="input-fee" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="availableSlots"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Available Slots (comma separated)</FormLabel>
                      <FormControl>
                        <Input placeholder="Mon 10:00 AM, Wed 2:00 PM" {...field} data-testid="input-slots" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-save-consultant">
                  {createMutation.isPending ? "Adding..." : "Add Consultant"}
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
                placeholder="Search consultants..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
                data-testid="input-search-consultants"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredConsultants?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Stethoscope className="mb-4 h-12 w-12 text-muted-foreground/50" />
              <p className="text-muted-foreground">No consultants found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Specialization</TableHead>
                  <TableHead>Experience</TableHead>
                  <TableHead>Fee</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[70px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredConsultants?.map((consultant) => (
                  <TableRow key={consultant.id} data-testid={`row-consultant-${consultant.id}`}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{consultant.name}</p>
                        <p className="text-sm text-muted-foreground">{consultant.qualification}</p>
                      </div>
                    </TableCell>
                    <TableCell>{consultant.specialization}</TableCell>
                    <TableCell>{consultant.yearsExperience} years</TableCell>
                    <TableCell>₹{consultant.consultationFee}</TableCell>
                    <TableCell>{getStatusBadge(consultant.status || "active")}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid={`button-actions-${consultant.id}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {consultant.status === "active" ? (
                            <DropdownMenuItem
                              onClick={() => updateStatusMutation.mutate({ id: consultant.id, status: "paused" })}
                            >
                              <Pause className="mr-2 h-4 w-4" />
                              Pause
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => updateStatusMutation.mutate({ id: consultant.id, status: "active" })}
                            >
                              <Play className="mr-2 h-4 w-4" />
                              Activate
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() => handleOpenSlotsEditor(consultant)}
                          >
                            <Calendar className="mr-2 h-4 w-4" />
                            Edit Slots
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => deleteMutation.mutate(consultant.id)}
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

      <Dialog open={!!editingSlotsFor} onOpenChange={() => setEditingSlotsFor(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Available Slots</DialogTitle>
            <DialogDescription>
              Manage appointment slots for {editingSlotsFor?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Add a Slot</label>
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground mb-1 block">Day</label>
                  <Select value={selectedDay} onValueChange={setSelectedDay}>
                    <SelectTrigger data-testid="select-slot-day">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAYS.map((d) => (
                        <SelectItem key={d} value={d}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground mb-1 block">Time</label>
                  <Select value={selectedTime} onValueChange={setSelectedTime}>
                    <SelectTrigger data-testid="select-slot-time">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMES.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="button" size="sm" onClick={handleAddSlot} data-testid="button-add-slot">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {slotsList.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Slots ({slotsList.length}):</p>
                <div className="flex flex-wrap gap-2">
                  {slotsList.map((slot, i) => (
                    <Badge key={i} variant="secondary" className="flex items-center gap-1 pr-1">
                      {slot}
                      <button
                        type="button"
                        onClick={() => handleRemoveSlot(i)}
                        className="ml-1 rounded-full hover:bg-muted p-0.5"
                        data-testid={`button-remove-slot-${i}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setEditingSlotsFor(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveSlots}
              disabled={updateSlotsMutation.isPending}
              data-testid="button-save-slots"
            >
              {updateSlotsMutation.isPending ? "Saving..." : "Save Slots"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
