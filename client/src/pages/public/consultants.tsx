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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { StarRating } from "@/components/star-rating";
import { Search, Stethoscope, ArrowUpDown, Briefcase, AlertTriangle, Users, Building2, BookOpen, Clock, User, LogIn, Zap } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import type { Consultant } from "@shared/schema";
import PublicLayout from "./layout";

type SortOption = "rating" | "availability";
type ConsultantWithPrice = Consultant & { computedCustomerPrice?: string };

function ConsultantProfileSheet({
  consultant,
  open,
  onOpenChange,
  onBook,
}: {
  consultant: ConsultantWithPrice | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onBook: (id: string) => void;
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

        <div className="flex items-start gap-4 mb-6">
          {consultant.photoUrl ? (
            <img src={consultant.photoUrl} alt={consultant.name} className="h-24 w-24 rounded-full object-cover border shrink-0" data-testid="img-consultant-profile-photo" />
          ) : (
            <div className="h-24 w-24 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-2xl font-semibold shrink-0">{initials}</div>
          )}
          <div className="min-w-0">
            <h2 className="text-xl font-semibold leading-tight" data-testid="text-profile-name">{consultant.name}</h2>
            <p className="text-sm text-muted-foreground mt-0.5" data-testid="text-profile-qualification">{consultant.qualification}</p>
            {consultant.specialization && (
              <Badge variant="secondary" className="mt-2" data-testid="badge-profile-specialization">{consultant.specialization}</Badge>
            )}
            {consultant.rating && (
              <div className="mt-2">
                <StarRating rating={parseFloat(consultant.rating)} size="sm" />
              </div>
            )}
          </div>
        </div>

        <Separator className="mb-5" />

        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Briefcase className="h-3.5 w-3.5" />
              Experience
            </div>
            <p className="font-semibold text-sm" data-testid="text-profile-experience">{consultant.yearsExperience} years</p>
          </div>
        </div>

        {consultant.affiliatedInstitution && (
          <div className="mb-5">
            <div className="flex items-center gap-1.5 text-sm font-medium mb-1.5">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              Affiliated Institution
            </div>
            <p className="text-sm text-muted-foreground pl-5" data-testid="text-profile-affiliation">{consultant.affiliatedInstitution}</p>
          </div>
        )}

        {consultant.portfolio && (
          <div className="mb-5">
            <div className="flex items-center gap-1.5 text-sm font-medium mb-1.5">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              About
            </div>
            <p className="text-sm text-muted-foreground pl-5 leading-relaxed whitespace-pre-line" data-testid="text-profile-bio">{consultant.portfolio}</p>
          </div>
        )}

        {((consultant.availableSlots && consultant.availableSlots.length > 0) || consultant.availabilityFrom || consultant.availabilityTo) && (
          <div className="mb-6">
            <div className="flex items-center gap-1.5 text-sm font-medium mb-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Available Slots
            </div>
            {consultant.availableSlots && consultant.availableSlots.length > 0 ? (
              <div className="pl-5 flex flex-wrap gap-1.5">
                {consultant.availableSlots.map((slot, i) => (
                  <Badge key={i} variant="outline" className="text-xs font-normal" data-testid={`badge-slot-${i}`}>{slot}</Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground pl-5" data-testid="text-availability-range">
                {consultant.availabilityFrom} – {consultant.availabilityTo}
              </p>
            )}
          </div>
        )}

        {(consultant.registrationNumber || consultant.registeredOrganization) && (
          <div className="mb-6">
            <div className="flex items-center gap-1.5 text-sm font-medium mb-1.5">
              <User className="h-4 w-4 text-muted-foreground" />
              Registration
            </div>
            <div className="pl-5 space-y-0.5 text-sm text-muted-foreground">
              {consultant.registrationNumber && <p data-testid="text-profile-reg-no">Reg. No: {consultant.registrationNumber}</p>}
              {consultant.registeredOrganization && <p data-testid="text-profile-reg-org">{consultant.registeredOrganization}</p>}
            </div>
          </div>
        )}

        <Separator className="mb-5" />

        <Button
          className="w-full"
          data-testid="button-profile-book"
          onClick={() => { onOpenChange(false); onBook(consultant.id); }}
        >
          Book Consultation
        </Button>
      </SheetContent>
    </Sheet>
  );
}

export default function PublicConsultantsPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSpecialization, setSelectedSpecialization] = useState("All Specializations");
  const [sortBy, setSortBy] = useState<SortOption>("rating");
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

  const handleBook = (consultantId: string) => {
    const dest = `/user/consultation/${consultantId}/book`;
    if (user) {
      setLocation(dest);
    } else {
      setLocation(`/login?redirect=${encodeURIComponent(dest)}`);
    }
  };

  const handleEmergencyBook = (teamId: string) => {
    const dest = `/user/consultation/${teamId}/book`;
    if (user) {
      setLocation(dest);
    } else {
      setLocation(`/login?redirect=${encodeURIComponent(dest)}`);
    }
  };

  const specializations = useMemo(() => {
    if (!consultants) return ["All Specializations"];
    const uniqueSpecs = new Set(consultants.map((c) => c.specialization).filter((s): s is string => !!s && s.trim() !== ""));
    return ["All Specializations", ...Array.from(uniqueSpecs).sort()];
  }, [consultants]);

  const filteredConsultants = useMemo(() => {
    if (!consultants) return [];
    let filtered = consultants.filter((c) => {
      const specMatch = selectedSpecialization === "All Specializations" || c.specialization?.toLowerCase().includes(selectedSpecialization.toLowerCase());
      const searchMatch = !searchTerm || c.name.toLowerCase().includes(searchTerm.toLowerCase()) || c.qualification.toLowerCase().includes(searchTerm.toLowerCase()) || c.specialization?.toLowerCase().includes(searchTerm.toLowerCase());
      return specMatch && searchMatch;
    });
    filtered.sort((a, b) => {
      if (sortBy === "rating") return parseFloat(b.rating || "0") - parseFloat(a.rating || "0");
      return (b.availabilityFrom ? 1 : 0) - (a.availabilityFrom ? 1 : 0);
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
    return emergencyTeams.filter(t => selectedDepartment === "All Departments" || t.department === selectedDepartment);
  }, [emergencyTeams, selectedDepartment]);

  return (
    <PublicLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Specialist Consultations</h1>
            <p className="text-muted-foreground">Connect with experienced specialists for expert opinions and video consultations</p>
          </div>
          {!user && (
            <Button variant="outline" size="sm" onClick={() => setLocation("/login")} data-testid="button-login-cta">
              <LogIn className="mr-2 h-4 w-4" />
              Sign in to book
            </Button>
          )}
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
          <div className="space-y-6">
            {/* Coming Soon hero */}
            <div className="relative overflow-hidden rounded-2xl border border-red-200 dark:border-red-900/60 bg-gradient-to-br from-red-50 via-white to-orange-50 dark:from-red-950/40 dark:via-background dark:to-orange-950/20 px-8 py-14 text-center">
              {/* decorative blobs */}
              <div className="pointer-events-none absolute -top-16 -left-16 h-56 w-56 rounded-full bg-red-400/10 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-16 -right-16 h-56 w-56 rounded-full bg-orange-400/10 blur-3xl" />

              {/* pulsing icon */}
              <div className="relative mx-auto mb-6 flex h-20 w-20 items-center justify-center">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-20" />
                <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-red-600 shadow-lg shadow-red-600/30">
                  <Zap className="h-9 w-9 text-white" />
                </div>
              </div>

              <Badge className="mb-4 bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-800 px-3 py-1 text-xs font-semibold tracking-wide uppercase">
                Coming Soon
              </Badge>

              <h2 className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Emergency Consultation
              </h2>
              <p className="mx-auto mt-3 max-w-md text-base text-muted-foreground leading-relaxed">
                Connect instantly with specialists across{" "}
                <span className="font-semibold text-foreground">30+ specialities</span>{" "}
                Expert emergency opinions delivered within{" "}
                <span className="font-semibold text-red-600 dark:text-red-400">30 minutes</span>.
              </p>

              {/* feature pills */}
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                {[
                  { icon: Zap, label: "Response in 30 min" },
                  { icon: Stethoscope, label: "30+ specialities" },
                  { icon: Users, label: "Dedicated care teams" },
                  { icon: Clock, label: "24 × 7 availability" },
                ].map(({ icon: Icon, label }) => (
                  <div
                    key={label}
                    className="flex items-center gap-1.5 rounded-full border border-red-200 dark:border-red-900/60 bg-white dark:bg-red-950/20 px-4 py-1.5 text-sm text-red-700 dark:text-red-300 shadow-sm"
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </div>
                ))}
              </div>

            </div>
          </div>
        ) : (
          <>
            <Card>
              <CardContent className="pt-6">
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="md:col-span-2">
                    <Label htmlFor="search" className="sr-only">Search consultants</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input id="search" placeholder="Search by name or specialization..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" data-testid="input-consultant-search" />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="specialization" className="sr-only">Specialization</Label>
                    <Select value={selectedSpecialization} onValueChange={setSelectedSpecialization}>
                      <SelectTrigger data-testid="select-specialization">
                        <Stethoscope className="mr-2 h-4 w-4 text-muted-foreground" />
                        <SelectValue placeholder="Select specialization" />
                      </SelectTrigger>
                      <SelectContent>
                        {specializations.map((spec) => (
                          <SelectItem key={spec} value={spec}>{spec}</SelectItem>
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
                        <SelectItem value="rating">Sort by Rating</SelectItem>
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
                    <CardHeader><Skeleton className="h-6 w-3/4" /><Skeleton className="h-4 w-1/2" /></CardHeader>
                    <CardContent className="space-y-3"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-10 w-full" /></CardContent>
                  </Card>
                ))}
              </div>
            ) : filteredConsultants.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <Stethoscope className="mb-4 h-12 w-12 text-muted-foreground/50" />
                  <h3 className="mb-2 text-lg font-medium">No consultants found</h3>
                  <p className="text-sm text-muted-foreground">Try adjusting your search or filter criteria</p>
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
                            <p className="text-sm text-muted-foreground">{consultant.qualification}</p>
                          </div>
                        </div>
                        {consultant.rating && <StarRating rating={parseFloat(consultant.rating)} size="sm" />}
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
                      </div>
                      {(() => {
                        const fixed = consultant.availableSlots || [];
                        const days = (consultant as any).availableDays || [];
                        const from = consultant.availabilityFrom || "";
                        const to = consultant.availabilityTo || "";
                        const generated = days.length > 0 && from
                          ? days.map((d: string) => to ? `${d}, ${from} – ${to}` : `${d}, ${from}`)
                          : [];
                        const slots: string[] = fixed.length > 0 ? fixed : generated;
                        if (slots.length > 0) return (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              Available slots
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {slots.slice(0, 3).map((slot, i) => (
                                <Badge key={i} variant="outline" className="text-[10px] font-normal py-0">{slot}</Badge>
                              ))}
                              {slots.length > 3 && (
                                <Badge variant="outline" className="text-[10px] font-normal py-0">+{slots.length - 3} more</Badge>
                              )}
                            </div>
                          </div>
                        );
                        if (from || to) return (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Clock className="h-3.5 w-3.5" />
                            {from} – {to}
                          </div>
                        );
                        return null;
                      })()}
                      <div className="flex gap-2">
                        <Button variant="outline" className="flex-1" onClick={() => setProfileConsultant(consultant)} data-testid={`button-view-profile-${consultant.id}`}>
                          View Profile
                        </Button>
                        <Button className="flex-1" onClick={() => handleBook(consultant.id)} data-testid={`button-book-consultant-${consultant.id}`}>
                          Book Consultation
                        </Button>
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
          onBook={handleBook}
        />
      </div>
    </PublicLayout>
  );
}
