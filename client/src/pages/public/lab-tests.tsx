import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Search, Clock, FlaskConical, ArrowUpDown, LogIn, IndianRupee } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import type { LabTest } from "@shared/schema";
import PublicLayout from "./layout";

type SortOption = "name" | "cost" | "turnaroundTime";

export default function PublicLabTestsPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All Categories");
  const [sortBy, setSortBy] = useState<SortOption>("name");

  const { data: tests, isLoading } = useQuery<LabTest[]>({
    queryKey: ["/api/lab-tests"],
  });

  const handleBookNow = () => {
    if (user) {
      setLocation("/user/labs");
    } else {
      setLocation("/login?redirect=/user/labs");
    }
  };

  const categories = useMemo(() => {
    if (!tests) return ["All Categories"];
    const catSet = new Set(tests.map((t) => t.category).filter((c): c is string => Boolean(c)));
    return ["All Categories", ...Array.from(catSet).sort()];
  }, [tests]);

  const filteredTests = useMemo(() => {
    if (!tests) return [];
    let filtered = tests.filter((test) => {
      const categoryMatch = selectedCategory === "All Categories" || test.category === selectedCategory;
      const searchMatch = !searchTerm || test.testName.toLowerCase().includes(searchTerm.toLowerCase()) || (test.category && test.category.toLowerCase().includes(searchTerm.toLowerCase()));
      return categoryMatch && searchMatch;
    });
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "name": return a.testName.localeCompare(b.testName);
        case "cost": return parseFloat((a as any).computedCustomerPrice || a.cost) - parseFloat((b as any).computedCustomerPrice || b.cost);
        case "turnaroundTime": return parseInt(a.turnaroundTime) - parseInt(b.turnaroundTime);
        default: return 0;
      }
    });
    return filtered;
  }, [tests, searchTerm, selectedCategory, sortBy]);

  return (
    <PublicLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Diagnostic Lab Tests</h1>
            <p className="text-muted-foreground">Browse our comprehensive catalog of diagnostic tests</p>
          </div>
          <Button onClick={handleBookNow} data-testid="button-book-tests-cta">
            {user ? (
              <>
                <FlaskConical className="mr-2 h-4 w-4" />
                Book Tests
              </>
            ) : (
              <>
                <LogIn className="mr-2 h-4 w-4" />
                Sign in to Book
              </>
            )}
          </Button>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <Label htmlFor="search" className="sr-only">Search tests</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="search" placeholder="Search tests..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" data-testid="input-lab-search" />
                </div>
              </div>
              <div>
                <Label htmlFor="category" className="sr-only">Category</Label>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger data-testid="select-category">
                    <FlaskConical className="mr-2 h-4 w-4 text-muted-foreground" />
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="sort" className="sr-only">Sort by</Label>
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

        {!user && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 flex items-center justify-between gap-4 flex-wrap" data-testid="banner-login-prompt">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Browsing as guest.</span> Sign in or create a free account to book tests.
            </p>
            <div className="flex gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={() => setLocation("/login?redirect=/user/labs")} data-testid="button-banner-login">Log in</Button>
              <Button size="sm" onClick={() => setLocation("/register")} data-testid="button-banner-signup">Sign Up Free</Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i}>
                <CardHeader><Skeleton className="h-6 w-3/4" /><Skeleton className="h-4 w-1/2" /></CardHeader>
                <CardContent className="space-y-3"><Skeleton className="h-4 w-full" /><Skeleton className="h-10 w-full" /></CardContent>
              </Card>
            ))}
          </div>
        ) : filteredTests.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <FlaskConical className="mb-4 h-12 w-12 text-muted-foreground/50" />
              <h3 className="mb-2 text-lg font-medium">No tests found</h3>
              <p className="text-sm text-muted-foreground">Try adjusting your search or filter criteria</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredTests.map((test) => (
              <Card key={test.id} className="overflow-visible" data-testid={`card-test-${test.id}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base leading-tight">{test.testName}</CardTitle>
                    {test.category && (
                      <Badge variant="outline" className="shrink-0 text-xs">{test.category}</Badge>
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
                  <Button variant="outline" className="w-full" onClick={handleBookNow} data-testid={`button-book-test-${test.id}`}>
                    {user ? "Book This Test" : "Login to Book"}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </PublicLayout>
  );
}
