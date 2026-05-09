import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Search, Clock, FlaskConical, ArrowUpDown, ShoppingCart, Check, IndianRupee } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { LabTest } from "@shared/schema";

const patientFormSchema = z.object({
  patientName: z.string().min(2, "Patient name is required"),
  patientAge: z.coerce.number().min(1, "Age must be at least 1").max(150, "Invalid age"),
  provisionalDiagnosis: z.string().optional(),
  ipdNumber: z.string().optional(),
  bedNumber: z.string().optional(),
  orderingPhysician: z.string().optional(),
});

type PatientFormData = z.infer<typeof patientFormSchema>;

type SortOption = "name" | "cost" | "turnaroundTime";

export default function LabsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All Categories");
  const [sortBy, setSortBy] = useState<SortOption>("name");
  const [cart, setCart] = useState<string[]>([]);
  const [showPatientForm, setShowPatientForm] = useState(false);
  const { toast } = useToast();

  const form = useForm<PatientFormData>({
    resolver: zodResolver(patientFormSchema),
    defaultValues: {
      patientName: "",
      patientAge: "" as unknown as number,
      provisionalDiagnosis: "",
      ipdNumber: "",
      bedNumber: "",
      orderingPhysician: "",
    },
  });

  const { data: tests, isLoading } = useQuery<LabTest[]>({
    queryKey: ["/api/lab-tests"],
  });

  const createBookingMutation = useMutation({
    mutationFn: async ({ testIds, patientData }: { testIds: string[]; patientData: PatientFormData }) => {
      const bookings = await Promise.all(
        testIds.map((testId) => {
          const test = tests?.find((t) => t.id === testId);
          if (!test) throw new Error("Test not found");
          return apiRequest("POST", "/api/bookings", {
            bookingType: "lab",
            serviceId: test.id,
            serviceName: test.testName,
            providerName: "Perfusion Lab Services",
            patientName: patientData.patientName,
            patientAge: patientData.patientAge,
            provisionalDiagnosis: patientData.provisionalDiagnosis || null,
            ipdNumber: patientData.ipdNumber || null,
            bedNumber: patientData.bedNumber || null,
            orderingPhysician: patientData.orderingPhysician || null,
            amount: (test as any).computedCustomerPrice || test.cost,
            status: "booked",
            paymentStatus: "pending",
          });
        })
      );
      return bookings;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      setCart([]);
      setShowPatientForm(false);
      form.reset();
      toast({
        title: "Tests Booked",
        description: "Your lab test booking has been created successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to book tests. Please try again.",
        variant: "destructive",
      });
    },
  });

  const categories = useMemo(() => {
    if (!tests) return ["All Categories"];
    const catSet = new Set(tests.map((t) => t.category).filter((c): c is string => Boolean(c)));
    const cats = Array.from(catSet);
    return ["All Categories", ...cats.sort()];
  }, [tests]);

  const filteredTests = useMemo(() => {
    if (!tests) return [];

    let filtered = tests.filter((test) => {
      const categoryMatch =
        selectedCategory === "All Categories" ||
        test.category === selectedCategory;

      const searchMatch =
        !searchTerm ||
        test.testName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (test.category && test.category.toLowerCase().includes(searchTerm.toLowerCase()));

      return categoryMatch && searchMatch;
    });

    filtered.sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.testName.localeCompare(b.testName);
        case "cost":
          return parseFloat((a as any).computedCustomerPrice || a.cost) - parseFloat((b as any).computedCustomerPrice || b.cost);
        case "turnaroundTime":
          return parseInt(a.turnaroundTime) - parseInt(b.turnaroundTime);
        default:
          return 0;
      }
    });

    return filtered;
  }, [tests, searchTerm, selectedCategory, sortBy]);

  const toggleCart = (testId: string) => {
    setCart((prev) =>
      prev.includes(testId)
        ? prev.filter((id) => id !== testId)
        : [...prev, testId]
    );
  };

  const handleBookTests = () => {
    if (cart.length === 0) {
      toast({
        title: "No tests selected",
        description: "Please select at least one test to book.",
        variant: "destructive",
      });
      return;
    }
    setShowPatientForm(true);
  };

  const onSubmitPatientForm = (data: PatientFormData) => {
    createBookingMutation.mutate({ testIds: cart, patientData: data });
  };

  const cartTotal = useMemo(() => {
    if (!tests) return 0;
    return cart.reduce((sum, id) => {
      const test = tests.find((t) => t.id === id);
      return sum + (test ? parseFloat((test as any).computedCustomerPrice || test.cost) : 0);
    }, 0);
  }, [tests, cart]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Lab Tests</h1>
          <p className="text-muted-foreground">
            Browse and book diagnostic tests
          </p>
        </div>
        {cart.length > 0 && (
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="px-3 py-1">
              <ShoppingCart className="mr-2 h-4 w-4" />
              {cart.length} tests selected
            </Badge>
            <Button
              onClick={handleBookTests}
              disabled={createBookingMutation.isPending}
              data-testid="button-book-selected"
            >
              Book Selected (₹{cartTotal.toFixed(2)})
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label htmlFor="search" className="sr-only">
                Search tests
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Search tests..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                  data-testid="input-lab-search"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="category" className="sr-only">
                Category
              </Label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger data-testid="select-category">
                  <FlaskConical className="mr-2 h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="sort" className="sr-only">
                Sort by
              </Label>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                <SelectTrigger data-testid="select-sort">
                  <ArrowUpDown className="mr-2 h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Sort by Name</SelectItem>
                  <SelectItem value="cost">Sort by Cost</SelectItem>
                  <SelectItem value="turnaroundTime">Sort by TAT</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredTests.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <FlaskConical className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <h3 className="mb-2 text-lg font-medium">No tests found</h3>
            <p className="text-sm text-muted-foreground">
              Try adjusting your search or filter criteria
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredTests.map((test) => {
            const isInCart = cart.includes(test.id);
            return (
              <Card
                key={test.id}
                className={`overflow-visible transition-colors ${
                  isInCart ? "border-primary bg-primary/5" : ""
                }`}
                data-testid={`card-test-${test.id}`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base leading-tight">
                      {test.testName}
                    </CardTitle>
                    {test.category && (
                      <Badge variant="outline" className="shrink-0 text-xs">
                        {test.category}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      {test.turnaroundTime}
                    </span>
                    <span className="flex items-center gap-0.5 text-base font-semibold text-foreground" data-testid={`text-price-${test.id}`}>
                      <IndianRupee className="h-4 w-4" />
                      {parseFloat((test as any).computedCustomerPrice || test.cost).toLocaleString("en-IN")}
                    </span>
                  </div>
                  <Button
                    variant={isInCart ? "default" : "outline"}
                    className="w-full"
                    onClick={() => toggleCart(test.id)}
                    data-testid={`button-add-test-${test.id}`}
                  >
                    {isInCart ? (
                      <>
                        <Check className="mr-2 h-4 w-4" />
                        Added to Cart
                      </>
                    ) : (
                      "Add to Cart"
                    )}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={showPatientForm} onOpenChange={setShowPatientForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Patient Details</DialogTitle>
            <DialogDescription>
              Enter patient information for {cart.length} test(s) - Total: ₹{cartTotal.toFixed(2)}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmitPatientForm)} className="space-y-4">
              <FormField
                control={form.control}
                name="patientName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Patient Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter patient's full name" {...field} data-testid="input-patient-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="patientAge"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Age *</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="Age" {...field} data-testid="input-patient-age" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="orderingPhysician"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Doctor Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Ordering doctor" {...field} data-testid="input-doctor-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="ipdNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>IPD Number</FormLabel>
                      <FormControl>
                        <Input placeholder="IPD No." {...field} data-testid="input-ipd-number" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="bedNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bed Number</FormLabel>
                      <FormControl>
                        <Input placeholder="Bed No." {...field} data-testid="input-bed-number" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="provisionalDiagnosis"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Provisional Diagnosis</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Enter diagnosis (optional)" {...field} data-testid="input-diagnosis" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowPatientForm(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createBookingMutation.isPending} data-testid="button-confirm-booking">
                  {createBookingMutation.isPending ? "Booking..." : `Book Tests (₹${cartTotal.toFixed(2)})`}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
