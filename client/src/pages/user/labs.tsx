import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Search, Clock, FlaskConical, ArrowUpDown, ShoppingCart, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { LabTest } from "@shared/schema";

type SortOption = "name" | "cost" | "turnaroundTime";

export default function LabsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All Categories");
  const [sortBy, setSortBy] = useState<SortOption>("name");
  const [cart, setCart] = useState<string[]>([]);
  const { toast } = useToast();

  const { data: tests, isLoading } = useQuery<LabTest[]>({
    queryKey: ["/api/lab-tests"],
  });

  const createBookingMutation = useMutation({
    mutationFn: async (testIds: string[]) => {
      const bookings = await Promise.all(
        testIds.map((testId) =>
          apiRequest("POST", "/api/bookings", {
            serviceType: "lab",
            labTestId: testId,
            status: "pending",
          })
        )
      );
      return bookings;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      setCart([]);
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
    const catSet = new Set(tests.map((t) => t.category).filter(Boolean));
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
          return parseFloat(a.cost) - parseFloat(b.cost);
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
    createBookingMutation.mutate(cart);
  };

  const cartTotal = useMemo(() => {
    if (!tests) return 0;
    return cart.reduce((sum, id) => {
      const test = tests.find((t) => t.id === id);
      return sum + (test ? parseFloat(test.cost) : 0);
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
                  <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">
                      ₹{parseFloat(test.cost).toFixed(2)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {test.turnaroundTime}
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
    </div>
  );
}
