import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StarRating } from "@/components/star-rating";
import { Search, Clock, DollarSign, MapPin, FlaskConical, ArrowUpDown } from "lucide-react";
import type { Lab, LabTest } from "@shared/schema";

interface LabWithTests extends Lab {
  tests: LabTest[];
}

const locations = [
  "All Locations",
  "Mumbai",
  "Delhi",
  "Bangalore",
  "Chennai",
  "Hyderabad",
  "Kolkata",
  "Pune",
  "Ahmedabad",
];

type SortOption = "cost" | "turnaroundTime" | "accuracyRating";

export default function LabsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("All Locations");
  const [sortBy, setSortBy] = useState<SortOption>("cost");

  const { data: labs, isLoading } = useQuery<LabWithTests[]>({
    queryKey: ["/api/labs"],
  });

  const filteredLabs = useMemo(() => {
    if (!labs) return [];

    let filtered = labs.filter((lab) => {
      const locationMatch =
        selectedLocation === "All Locations" ||
        lab.location.toLowerCase().includes(selectedLocation.toLowerCase());

      const searchMatch =
        !searchTerm ||
        lab.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        lab.tests.some((test) =>
          test.testName.toLowerCase().includes(searchTerm.toLowerCase())
        );

      return locationMatch && searchMatch;
    });

    // Sort labs
    filtered.sort((a, b) => {
      const aTest = a.tests[0];
      const bTest = b.tests[0];
      if (!aTest || !bTest) return 0;

      switch (sortBy) {
        case "cost":
          return parseFloat(aTest.cost) - parseFloat(bTest.cost);
        case "turnaroundTime":
          return parseInt(aTest.turnaroundTime) - parseInt(bTest.turnaroundTime);
        case "accuracyRating":
          return parseFloat(bTest.accuracyRating || "0") - parseFloat(aTest.accuracyRating || "0");
        default:
          return 0;
      }
    });

    return filtered;
  }, [labs, searchTerm, selectedLocation, sortBy]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Lab Services</h1>
        <p className="text-muted-foreground">
          Search for diagnostic tests and book sample collections
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="md:col-span-2">
              <Label htmlFor="search" className="sr-only">
                Search tests
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Search lab or test name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                  data-testid="input-lab-search"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="location" className="sr-only">
                Location
              </Label>
              <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                <SelectTrigger data-testid="select-location">
                  <MapPin className="mr-2 h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (
                    <SelectItem key={loc} value={loc}>
                      {loc}
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
                  <SelectItem value="cost">Sort by Cost</SelectItem>
                  <SelectItem value="turnaroundTime">Sort by TAT</SelectItem>
                  <SelectItem value="accuracyRating">Sort by Accuracy</SelectItem>
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
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredLabs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <FlaskConical className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <h3 className="mb-2 text-lg font-medium">No labs found</h3>
            <p className="text-sm text-muted-foreground">
              Try adjusting your search or filter criteria
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredLabs.map((lab) => (
            <Card key={lab.id} className="overflow-visible" data-testid={`card-lab-${lab.id}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-lg">{lab.name}</CardTitle>
                  <StarRating rating={parseFloat(lab.rating || "4.0")} size="sm" />
                </div>
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  {lab.location}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {lab.tests.slice(0, 2).map((test) => (
                  <div
                    key={test.id}
                    className="rounded-md border bg-muted/30 p-3"
                  >
                    <p className="mb-2 font-medium">{test.testName}</p>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <DollarSign className="h-3.5 w-3.5" />
                        {test.cost}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {test.turnaroundTime}
                      </span>
                      <StarRating
                        rating={parseFloat(test.accuracyRating || "4.5")}
                        size="sm"
                        showValue={false}
                      />
                    </div>
                  </div>
                ))}
                {lab.tests.length > 2 && (
                  <p className="text-sm text-muted-foreground">
                    +{lab.tests.length - 2} more tests available
                  </p>
                )}
                <Link href={`/user/labs/${lab.id}/book`}>
                  <Button className="w-full" data-testid={`button-book-lab-${lab.id}`}>
                    Book Test
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
