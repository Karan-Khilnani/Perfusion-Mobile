import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { StarRating } from "@/components/star-rating";
import { Search, Stethoscope, ArrowUpDown, Briefcase, Calendar } from "lucide-react";
import type { Consultant } from "@shared/schema";

type SortOption = "rating" | "cost" | "availability";

export default function ConsultationPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSpecialization, setSelectedSpecialization] = useState("All Specializations");
  const [sortBy, setSortBy] = useState<SortOption>("rating");

  const { data: consultants, isLoading } = useQuery<Consultant[]>({
    queryKey: ["/api/consultants"],
  });

  // Build dynamic specializations list from actual consultant data
  const specializations = useMemo(() => {
    if (!consultants) return ["All Specializations"];
    const uniqueSpecs = new Set(
      consultants
        .map((c) => c.specialization)
        .filter((s): s is string => !!s && s.trim() !== "")
    );
    return ["All Specializations", ...Array.from(uniqueSpecs).sort()];
  }, [consultants]);

  const filteredConsultants = useMemo(() => {
    if (!consultants) return [];

    let filtered = consultants.filter((consultant) => {
      const specMatch =
        selectedSpecialization === "All Specializations" ||
        consultant.specialization?.toLowerCase().includes(selectedSpecialization.toLowerCase());

      const searchMatch =
        !searchTerm ||
        consultant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        consultant.qualification.toLowerCase().includes(searchTerm.toLowerCase()) ||
        consultant.specialization?.toLowerCase().includes(searchTerm.toLowerCase());

      return specMatch && searchMatch;
    });

    filtered.sort((a, b) => {
      switch (sortBy) {
        case "rating":
          return parseFloat(b.rating || "0") - parseFloat(a.rating || "0");
        case "cost":
          return parseFloat(a.consultationFee) - parseFloat(b.consultationFee);
        case "availability":
          return (b.availableSlots?.length || 0) - (a.availableSlots?.length || 0);
        default:
          return 0;
      }
    });

    return filtered;
  }, [consultants, searchTerm, selectedSpecialization, sortBy]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Consultation</h1>
        <p className="text-muted-foreground">
          Connect with specialists for expert opinions and consultations
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="md:col-span-2">
              <Label htmlFor="search" className="sr-only">
                Search consultants
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Search by name or specialization..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                  data-testid="input-consultant-search"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="specialization" className="sr-only">
                Specialization
              </Label>
              <Select value={selectedSpecialization} onValueChange={setSelectedSpecialization}>
                <SelectTrigger data-testid="select-specialization">
                  <Stethoscope className="mr-2 h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Select specialization" />
                </SelectTrigger>
                <SelectContent>
                  {specializations.map((spec) => (
                    <SelectItem key={spec} value={spec}>
                      {spec}
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
                  <SelectItem value="rating">Sort by Rating</SelectItem>
                  <SelectItem value="cost">Sort by Cost</SelectItem>
                  <SelectItem value="availability">Sort by Availability</SelectItem>
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
      ) : filteredConsultants.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Stethoscope className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <h3 className="mb-2 text-lg font-medium">No consultants found</h3>
            <p className="text-sm text-muted-foreground">
              Try adjusting your search or filter criteria
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredConsultants.map((consultant) => (
            <Card key={consultant.id} className="overflow-visible" data-testid={`card-consultant-${consultant.id}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-lg">{consultant.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">{consultant.qualification}</p>
                  </div>
                  <StarRating rating={parseFloat(consultant.rating || "4.0")} size="sm" />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {consultant.specialization && (
                  <Badge variant="secondary">{consultant.specialization}</Badge>
                )}

                <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Briefcase className="h-3.5 w-3.5" />
                    {consultant.yearsExperience} years exp
                  </span>
                  <span className="flex items-center gap-1">
                    ₹{consultant.consultationFee}
                  </span>
                </div>

                {consultant.availableSlots && consultant.availableSlots.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1 text-sm font-medium">
                      <Calendar className="h-3.5 w-3.5" />
                      Available Slots
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {consultant.availableSlots.slice(0, 3).map((slot, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {slot}
                        </Badge>
                      ))}
                      {consultant.availableSlots.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{consultant.availableSlots.length - 3} more
                        </Badge>
                      )}
                    </div>
                  </div>
                )}

                <Link href={`/user/consultation/${consultant.id}/book`}>
                  <Button className="w-full" data-testid={`button-book-consultant-${consultant.id}`}>
                    Book Consultation
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
