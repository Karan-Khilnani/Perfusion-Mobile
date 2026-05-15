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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Search, Stethoscope, ArrowUpDown, Briefcase, Calendar, AlertTriangle, Users, Building2, BookOpen, Clock, User } from "lucide-react";
import type { Consultant } from "@shared/schema";

type SortOption = "cost" | "availability";
type ConsultantWithPrice = Consultant & { computedCustomerPrice?: string };

function ConsultantProfileSheet({
  consultant,
  open,
  onOpenChange,
}: {
  consultant: ConsultantWithPrice | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  if (!consultant) return null;

  const initials = consultant.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto" data-testid="sheet-consultant-profile">
        <SheetHeader className="pb-4">
          <SheetTitle>Consultant Profile</SheetTitle>
        </SheetHeader>

        {/* Photo + identity */}
        <div className="flex items-start gap-4 mb-6">
          {consultant.photoUrl ? (
            <img
              src={consultant.photoUrl}
              alt={consultant.name}
              className="h-24 w-24 rounded-full object-cover border shrink-0"
              data-testid="img-consultant-profile-photo"
            />
          ) : (
            <div className="h-24 w-24 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-2xl font-semibold shrink-0">
              {initials}
            </div>
          )}
          <div className="min-w-0">
            <h2 className="text-xl font-semibold leading-tight" data-testid="text-profile-name">{consultant.name}</h2>
            <p className="text-sm text-muted-foreground mt-0.5" data-testid="text-profile-qualification">{consultant.qualification}</p>
            {consultant.specialization && (
              <Badge variant="secondary" className="mt-2" data-testid="badge-profile-specialization">
                {consultant.specialization}
              </Badge>
            )}
          </div>
        </div>

        <Separator className="mb-5" />

        {/* Key stats */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Briefcase className="h-3.5 w-3.5" />
              Experience
            </div>
            <p className="font-semibold text-sm" data-testid="text-profile-experience">{consultant.yearsExperience} years</p>
          </div>
        </div>


        {/* Bio / Portfolio */}
        {consultant.portfolio && (
          <div className="mb-5">
            <div className="flex items-center gap-1.5 text-sm font-medium mb-1.5">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              About
            </div>
            <p className="text-sm text-muted-foreground pl-5 leading-relaxed whitespace-pre-line" data-testid="text-profile-bio">
              {consultant.portfolio}
            </p>
          </div>
        )}

        {/* Availability range */}
        {(consultant.availabilityFrom || consultant.availabilityTo) && (
          <div className="mb-6">
            <div className="flex items-center gap-1.5 text-sm font-medium mb-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Available Hours
            </div>
            <p className="text-sm text-muted-foreground pl-5" data-testid="text-availability-range">
              {consultant.availabilityFrom} – {consultant.availabilityTo}
            </p>
          </div>
        )}


        <Separator className="mb-5" />

        <Link href={`/user/consultation/${consultant.id}/book`}>
          <Button
            className="w-full"
            data-testid="button-profile-book"
            onClick={() => onOpenChange(false)}
          >
            Book Consultation
          </Button>
        </Link>
      </SheetContent>
    </Sheet>
  );
}

export default function ConsultationPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSpecialization, setSelectedSpecialization] = useState("All Specializations");
  const [sortBy, setSortBy] = useState<SortOption>("cost");
  const [showEmergency, setShowEmergency] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState("All Departments");
  const [profileConsultant, setProfileConsultant] = useState<ConsultantWithPrice | null>(null);

  const { data: consultants, isLoading } = useQuery<ConsultantWithPrice[]>({
    queryKey: ["/api/consultants"],
  });

  const { data: emergencyTeams, isLoading: emergencyLoading } = useQuery<any[]>({
    queryKey: ["/api/emergency-teams"],
    enabled: showEmergency,
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
        case "cost":
          return parseFloat(a.computedCustomerPrice ?? a.consultationFee) - parseFloat(b.computedCustomerPrice ?? b.consultationFee);
        case "availability":
          return (b.availabilityFrom ? 1 : 0) - (a.availabilityFrom ? 1 : 0);
        default:
          return 0;
      }
    });

    return filtered;
  }, [consultants, searchTerm, selectedSpecialization, sortBy]);

  const departments = useMemo(() => {
    if (!emergencyTeams) return ["All Departments"];
    const uniqueDepts = new Set(emergencyTeams.map(t => t.department).filter(Boolean));
    return ["All Departments", ...Array.from(uniqueDepts).sort()];
  }, [emergencyTeams]);

  const filteredEmergencyTeams = useMemo(() => {
    if (!emergencyTeams) return [];
    return emergencyTeams.filter(t =>
      selectedDepartment === "All Departments" || t.department === selectedDepartment
    );
  }, [emergencyTeams, selectedDepartment]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Consultation</h1>
        <p className="text-muted-foreground">
          Connect with specialists for expert opinions and consultations
        </p>
      </div>

      <div className="flex items-center gap-4">
        <Button
          onClick={() => { setShowEmergency(!showEmergency); setSelectedDepartment("All Departments"); }}
          variant={showEmergency ? "default" : "outline"}
          className={showEmergency
            ? "bg-red-600 text-white shadow-lg shadow-red-600/30 border-red-600 no-default-hover-elevate no-default-active-elevate"
            : "border-red-500 text-red-600 shadow-md no-default-hover-elevate no-default-active-elevate"}
          size="lg"
          data-testid="button-emergency-consultation"
        >
          <AlertTriangle className="mr-2 h-5 w-5" />
          {showEmergency ? "Back to Regular Consultation" : "Emergency Consultation"}
        </Button>
      </div>

      {showEmergency ? (
        <div className="space-y-4">
          <Card className="border-red-500/30 bg-red-50 dark:bg-red-950/20">
            <CardContent className="flex items-center gap-3 py-4">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <div>
                <p className="font-medium text-red-800 dark:text-red-200">Emergency Consultation Services</p>
                <p className="text-sm text-red-600 dark:text-red-400">Select a department to find available emergency teams</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="department" className="sr-only">Department</Label>
                  <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                    <SelectTrigger data-testid="select-department">
                      <Users className="mr-2 h-4 w-4 text-muted-foreground" />
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((dept) => (
                        <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {emergencyLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardHeader><Skeleton className="h-6 w-3/4" /></CardHeader>
                  <CardContent className="space-y-3">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-10 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filteredEmergencyTeams.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <AlertTriangle className="mb-4 h-12 w-12 text-muted-foreground/50" />
                <h3 className="mb-2 text-lg font-medium">No emergency teams available</h3>
                <p className="text-sm text-muted-foreground">No emergency teams found for the selected department</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredEmergencyTeams.map((team: any) => (
                <Card key={team.id} className="overflow-visible" data-testid={`card-emergency-team-${team.id}`}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">{team.department} Team</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Users className="h-3.5 w-3.5" />
                        <span>Team Lead: {team.teamLeadName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Stethoscope className="h-3.5 w-3.5" />
                        <span>{team.qualification}</span>
                      </div>
                    </div>
                    <Link href={`/user/consultation/${team.id}/book`}>
                      <Button className="w-full bg-red-600 text-white border-red-600 no-default-hover-elevate no-default-active-elevate" data-testid={`button-book-emergency-${team.id}`}>
                        <AlertTriangle className="mr-2 h-4 w-4" />
                        Book Emergency Consultation
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
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
                  <div className="flex items-center gap-3">
                    {consultant.photoUrl ? (
                      <img src={consultant.photoUrl} alt={consultant.name} className="h-[132px] w-[132px] rounded-full object-cover border shrink-0" />
                    ) : (
                      <div className="h-[132px] w-[132px] rounded-full bg-muted flex items-center justify-center text-muted-foreground text-4xl font-medium shrink-0">
                        {consultant.name.charAt(0)}
                      </div>
                    )}
                    <div>
                      <CardTitle className="text-lg">{consultant.name}</CardTitle>
                      {consultant.specialization && (
                        <p className="text-base font-semibold text-primary mt-0.5">{consultant.specialization}</p>
                      )}
                      <p className="text-sm text-muted-foreground">{consultant.qualification}</p>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">

                <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Briefcase className="h-3.5 w-3.5" />
                    {consultant.yearsExperience} years exp
                  </span>
                </div>

                {(consultant.availabilityFrom || consultant.availabilityTo) && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    {consultant.availabilityFrom} – {consultant.availabilityTo}
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    data-testid={`button-view-profile-${consultant.id}`}
                    onClick={() => setProfileConsultant(consultant)}
                  >
                    View Profile
                  </Button>
                  <Link href={`/user/consultation/${consultant.id}/book`} className="flex-1">
                    <Button className="w-full" data-testid={`button-book-consultant-${consultant.id}`}>
                      Book Consultation
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      </>
      )}

      <ConsultantProfileSheet
        consultant={profileConsultant}
        open={!!profileConsultant}
        onOpenChange={(v) => { if (!v) setProfileConsultant(null); }}
      />
    </div>
  );
}
