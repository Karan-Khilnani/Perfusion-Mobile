import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { StarRating } from "@/components/star-rating";
import { Search, MapPin, HeartPulse, ArrowUpDown, Briefcase, Clock, Users, Building2 } from "lucide-react";
import type { Hospital, CriticalCareDoctor } from "@shared/schema";

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

type DoctorSortOption = "rating" | "responseTime" | "experience";
type HospitalSortOption = "rating" | "responseTime" | "teamStrength";

export default function CriticalCarePage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("All Locations");
  const [doctorSortBy, setDoctorSortBy] = useState<DoctorSortOption>("rating");
  const [hospitalSortBy, setHospitalSortBy] = useState<HospitalSortOption>("rating");

  const { data: doctors, isLoading: doctorsLoading } = useQuery<CriticalCareDoctor[]>({
    queryKey: ["/api/critical-care/doctors"],
  });

  const { data: hospitals, isLoading: hospitalsLoading } = useQuery<Hospital[]>({
    queryKey: ["/api/hospitals"],
  });

  const filteredDoctors = useMemo(() => {
    if (!doctors) return [];

    let filtered = doctors.filter((doctor) => {
      const searchMatch =
        !searchTerm ||
        doctor.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        doctor.qualification.toLowerCase().includes(searchTerm.toLowerCase());

      return searchMatch;
    });

    filtered.sort((a, b) => {
      switch (doctorSortBy) {
        case "rating":
          return parseFloat(b.rating || "0") - parseFloat(a.rating || "0");
        case "responseTime":
          return parseInt(a.responseTime) - parseInt(b.responseTime);
        case "experience":
          return b.yearsExperience - a.yearsExperience;
        default:
          return 0;
      }
    });

    return filtered;
  }, [doctors, searchTerm, doctorSortBy]);

  const filteredHospitals = useMemo(() => {
    if (!hospitals) return [];

    let filtered = hospitals.filter((hospital) => {
      const locationMatch =
        selectedLocation === "All Locations" ||
        hospital.location.toLowerCase().includes(selectedLocation.toLowerCase());

      const searchMatch =
        !searchTerm ||
        hospital.name.toLowerCase().includes(searchTerm.toLowerCase());

      return locationMatch && searchMatch;
    });

    filtered.sort((a, b) => {
      switch (hospitalSortBy) {
        case "rating":
          return parseFloat(b.rating || "0") - parseFloat(a.rating || "0");
        case "responseTime":
          return parseInt(a.emergencyResponseTime) - parseInt(b.emergencyResponseTime);
        case "teamStrength":
          return b.teamStrength - a.teamStrength;
        default:
          return 0;
      }
    });

    return filtered;
  }, [hospitals, searchTerm, selectedLocation, hospitalSortBy]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Critical Care</h1>
        <p className="text-muted-foreground">
          Emergency decision support and escalation to specialized care
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-2">
              <Label htmlFor="search" className="sr-only">
                Search
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Search doctors or hospitals..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                  data-testid="input-critical-search"
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
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="doctors" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="doctors" data-testid="tab-doctors">
            <HeartPulse className="mr-2 h-4 w-4" />
            Critical Care Doctors
          </TabsTrigger>
          <TabsTrigger value="hospitals" data-testid="tab-hospitals">
            <Building2 className="mr-2 h-4 w-4" />
            Hospitals
          </TabsTrigger>
        </TabsList>

        <TabsContent value="doctors" className="space-y-4">
          <div className="flex justify-end">
            <Select value={doctorSortBy} onValueChange={(v) => setDoctorSortBy(v as DoctorSortOption)}>
              <SelectTrigger className="w-48" data-testid="select-doctor-sort">
                <ArrowUpDown className="mr-2 h-4 w-4 text-muted-foreground" />
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rating">Sort by Rating</SelectItem>
                <SelectItem value="responseTime">Sort by Response Time</SelectItem>
                <SelectItem value="experience">Sort by Experience</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {doctorsLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-6 w-3/4" />
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filteredDoctors.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <HeartPulse className="mb-4 h-12 w-12 text-muted-foreground/50" />
                <h3 className="mb-2 text-lg font-medium">No doctors found</h3>
                <p className="text-sm text-muted-foreground">
                  Try adjusting your search criteria
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredDoctors.map((doctor) => (
                <Card key={doctor.id} className="overflow-visible" data-testid={`card-doctor-${doctor.id}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-lg">{doctor.name}</CardTitle>
                        <p className="text-sm text-muted-foreground">{doctor.qualification}</p>
                      </div>
                      <StarRating rating={parseFloat(doctor.rating || "4.0")} size="sm" />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Briefcase className="h-3.5 w-3.5" />
                        {doctor.yearsExperience} years exp
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {doctor.responseTime} response
                      </span>
                    </div>

                    <Link href={`/user/critical-care/doctor/${doctor.id}/book`}>
                      <Button className="w-full" data-testid={`button-book-doctor-${doctor.id}`}>
                        Request Consultation
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="hospitals" className="space-y-4">
          <div className="flex justify-end">
            <Select value={hospitalSortBy} onValueChange={(v) => setHospitalSortBy(v as HospitalSortOption)}>
              <SelectTrigger className="w-48" data-testid="select-hospital-sort">
                <ArrowUpDown className="mr-2 h-4 w-4 text-muted-foreground" />
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rating">Sort by Rating</SelectItem>
                <SelectItem value="responseTime">Sort by Response Time</SelectItem>
                <SelectItem value="teamStrength">Sort by Team Strength</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {hospitalsLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-6 w-3/4" />
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filteredHospitals.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Building2 className="mb-4 h-12 w-12 text-muted-foreground/50" />
                <h3 className="mb-2 text-lg font-medium">No hospitals found</h3>
                <p className="text-sm text-muted-foreground">
                  Try adjusting your search or filter criteria
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredHospitals.map((hospital) => (
                <Card key={hospital.id} className="overflow-visible" data-testid={`card-hospital-${hospital.id}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-lg">{hospital.name}</CardTitle>
                      <StarRating rating={parseFloat(hospital.rating || "4.0")} size="sm" />
                    </div>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" />
                      {hospital.location}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      {hospital.icuCapability && (
                        <Badge variant="secondary">ICU Available</Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        Team of {hospital.teamStrength}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {hospital.emergencyResponseTime}
                      </span>
                    </div>

                    <Link href={`/user/critical-care/hospital/${hospital.id}/book`}>
                      <Button className="w-full" data-testid={`button-book-hospital-${hospital.id}`}>
                        Request Support
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
