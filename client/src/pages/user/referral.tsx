import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Building2, 
  MapPin, 
  Star, 
  Phone, 
  ArrowRight, 
  ArrowLeft, 
  Truck, 
  Plane,
  Activity,
  Wind,
  Droplets,
  Heart,
  User,
  Cloud,
  Check
} from "lucide-react";
import type { ReferralHospital, TransportService, PatientCondition, AmbulanceType, TransportMode } from "@shared/schema";

type Step = "hospital" | "transport" | "booking";

interface HospitalFilters {
  location: string;
  department: string;
  diagnosis: string;
  supportMechanicalVentilation: boolean;
  supportEcmo: boolean;
  supportCrrt: boolean;
}

export default function ReferralPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("hospital");
  const [selectedHospital, setSelectedHospital] = useState<ReferralHospital | null>(null);
  const [selectedTransport, setSelectedTransport] = useState<TransportService | null>(null);
  const [filters, setFilters] = useState<HospitalFilters>({
    location: "",
    department: "",
    diagnosis: "",
    supportMechanicalVentilation: false,
    supportEcmo: false,
    supportCrrt: false,
  });
  const [patientDetails, setPatientDetails] = useState({
    patientName: "",
    patientAge: "",
    patientCondition: "stable" as PatientCondition,
    provisionalDiagnosis: "",
    orderingPhysician: "",
    cloudPhysicianSupport: false,
  });

  const { data: hospitals, isLoading: hospitalsLoading } = useQuery<ReferralHospital[]>({
    queryKey: ["/api/referral/hospitals"],
  });

  const { data: transportServices, isLoading: transportLoading } = useQuery<TransportService[]>({
    queryKey: ["/api/transport/services"],
  });

  const bookingMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/bookings", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      toast({
        title: "Referral Booked",
        description: "Your referral and transport have been booked successfully.",
      });
      navigate("/user/orders");
    },
    onError: () => {
      toast({
        title: "Booking Failed",
        description: "Failed to book referral. Please try again.",
        variant: "destructive",
      });
    },
  });

  const filteredHospitals = hospitals?.filter((hospital) => {
    if (filters.location && !hospital.location.toLowerCase().includes(filters.location.toLowerCase())) {
      return false;
    }
    if (filters.department && !hospital.departments?.some(d => d.toLowerCase().includes(filters.department.toLowerCase()))) {
      return false;
    }
    if (filters.diagnosis && !hospital.diagnoses?.some(d => d.toLowerCase().includes(filters.diagnosis.toLowerCase()))) {
      return false;
    }
    if (filters.supportMechanicalVentilation && !hospital.supportMechanicalVentilation) {
      return false;
    }
    if (filters.supportEcmo && !hospital.supportEcmo) {
      return false;
    }
    if (filters.supportCrrt && !hospital.supportCrrt) {
      return false;
    }
    return true;
  });

  const uniqueLocations = [...new Set(hospitals?.map((h) => h.location))];
  const uniqueDepartments = [...new Set(hospitals?.flatMap((h) => h.departments || []))];

  const handleSelectHospital = (hospital: ReferralHospital) => {
    setSelectedHospital(hospital);
    setStep("transport");
  };

  const handleSelectTransport = (transport: TransportService) => {
    setSelectedTransport(transport);
    setStep("booking");
  };

  const handleBooking = () => {
    if (!selectedHospital || !selectedTransport) return;
    
    const transportCost = parseFloat(selectedTransport.baseCost || "0");
    
    bookingMutation.mutate({
      bookingType: "referral",
      serviceId: selectedTransport.id,
      serviceName: `Referral to ${selectedHospital.name}`,
      providerName: selectedTransport.name,
      patientName: patientDetails.patientName,
      patientAge: parseInt(patientDetails.patientAge),
      provisionalDiagnosis: patientDetails.provisionalDiagnosis,
      orderingPhysician: patientDetails.orderingPhysician,
      amount: transportCost.toFixed(2),
      referralHospitalId: selectedHospital.id,
      referralHospitalName: selectedHospital.name,
      transportServiceId: selectedTransport.id,
      patientCondition: patientDetails.patientCondition,
      ambulanceType: selectedTransport.serviceType as AmbulanceType,
      transportMode: selectedTransport.transportMode as TransportMode,
      cloudPhysicianSupport: patientDetails.cloudPhysicianSupport,
    });
  };

  if (step === "hospital") {
    return (
      <div className="flex h-full flex-col p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Hospital Referral</h1>
          <p className="text-muted-foreground">Select a hospital for patient referral</p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Filter Hospitals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Location</Label>
                <Select 
                  value={filters.location || "all"} 
                  onValueChange={(v) => setFilters({ ...filters, location: v === "all" ? "" : v })}
                >
                  <SelectTrigger data-testid="select-location">
                    <SelectValue placeholder="All locations" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All locations</SelectItem>
                    {uniqueLocations.map((loc) => (
                      <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Department</Label>
                <Select 
                  value={filters.department || "all"} 
                  onValueChange={(v) => setFilters({ ...filters, department: v === "all" ? "" : v })}
                >
                  <SelectTrigger data-testid="select-department">
                    <SelectValue placeholder="All departments" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All departments</SelectItem>
                    {uniqueDepartments.map((dept) => (
                      <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Diagnosis</Label>
                <Input
                  placeholder="Search by diagnosis..."
                  value={filters.diagnosis}
                  onChange={(e) => setFilters({ ...filters, diagnosis: e.target.value })}
                  data-testid="input-diagnosis"
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-6">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="ventilation"
                  checked={filters.supportMechanicalVentilation}
                  onCheckedChange={(c) => setFilters({ ...filters, supportMechanicalVentilation: !!c })}
                  data-testid="checkbox-ventilation"
                />
                <Label htmlFor="ventilation" className="flex items-center gap-1 text-sm">
                  <Wind className="h-4 w-4" /> Mechanical Ventilation
                </Label>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="ecmo"
                  checked={filters.supportEcmo}
                  onCheckedChange={(c) => setFilters({ ...filters, supportEcmo: !!c })}
                  data-testid="checkbox-ecmo"
                />
                <Label htmlFor="ecmo" className="flex items-center gap-1 text-sm">
                  <Heart className="h-4 w-4" /> ECMO
                </Label>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="crrt"
                  checked={filters.supportCrrt}
                  onCheckedChange={(c) => setFilters({ ...filters, supportCrrt: !!c })}
                  data-testid="checkbox-crrt"
                />
                <Label htmlFor="crrt" className="flex items-center gap-1 text-sm">
                  <Droplets className="h-4 w-4" /> CRRT
                </Label>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex-1 overflow-auto">
          {hospitalsLoading ? (
            <div className="grid gap-4 md:grid-cols-2">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-48" />
              ))}
            </div>
          ) : filteredHospitals?.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-muted-foreground">
              No hospitals match your criteria
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {filteredHospitals?.map((hospital) => (
                <Card 
                  key={hospital.id} 
                  className="hover-elevate cursor-pointer"
                  onClick={() => handleSelectHospital(hospital)}
                  data-testid={`card-hospital-${hospital.id}`}
                >
                  <CardContent className="p-4">
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-5 w-5 text-primary" />
                        <h3 className="font-semibold">{hospital.name}</h3>
                      </div>
                      <div className="flex items-center gap-1 text-sm">
                        <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                        {hospital.rating}
                      </div>
                    </div>

                    <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="h-4 w-4" />
                      {hospital.location}
                      {hospital.contactPhone && (
                        <>
                          <Phone className="ml-2 h-4 w-4" />
                          {hospital.contactPhone}
                        </>
                      )}
                    </div>

                    <div className="mb-3 flex flex-wrap gap-1">
                      {hospital.departments?.slice(0, 4).map((dept) => (
                        <Badge key={dept} variant="secondary" size="sm">
                          {dept}
                        </Badge>
                      ))}
                      {(hospital.departments?.length || 0) > 4 && (
                        <Badge variant="outline" size="sm">
                          +{(hospital.departments?.length || 0) - 4} more
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-xs">
                      {hospital.supportMechanicalVentilation && (
                        <span className="flex items-center gap-1 text-green-600">
                          <Wind className="h-3 w-3" /> Ventilation
                        </span>
                      )}
                      {hospital.supportEcmo && (
                        <span className="flex items-center gap-1 text-green-600">
                          <Heart className="h-3 w-3" /> ECMO
                        </span>
                      )}
                      {hospital.supportCrrt && (
                        <span className="flex items-center gap-1 text-green-600">
                          <Droplets className="h-3 w-3" /> CRRT
                        </span>
                      )}
                    </div>

                    <Button className="mt-4 w-full" data-testid={`button-select-hospital-${hospital.id}`}>
                      Select Hospital <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (step === "transport") {
    return (
      <div className="flex h-full flex-col p-6">
        <div className="mb-6">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setStep("hospital")}
            className="mb-2"
            data-testid="button-back-hospital"
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to hospitals
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">Select Transport</h1>
          <p className="text-muted-foreground">
            Choose transport service to {selectedHospital?.name}
          </p>
        </div>

        <Card className="mb-6 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-primary" />
              <div>
                <div className="font-medium">{selectedHospital?.name}</div>
                <div className="text-sm text-muted-foreground">{selectedHospital?.location}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex-1 overflow-auto">
          {transportLoading ? (
            <div className="grid gap-4 md:grid-cols-2">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-40" />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {transportServices?.map((service) => (
                <Card 
                  key={service.id} 
                  className="hover-elevate cursor-pointer"
                  onClick={() => handleSelectTransport(service)}
                  data-testid={`card-transport-${service.id}`}
                >
                  <CardContent className="p-4">
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {service.transportMode === "air" ? (
                          <Plane className="h-5 w-5 text-primary" />
                        ) : (
                          <Truck className="h-5 w-5 text-primary" />
                        )}
                        <div>
                          <h3 className="font-semibold">{service.name}</h3>
                          <div className="text-sm text-muted-foreground">{service.location}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-sm">
                        <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                        {service.rating}
                      </div>
                    </div>

                    <div className="mb-3 flex flex-wrap gap-2">
                      <Badge variant={service.serviceType === "ALS" ? "default" : "secondary"}>
                        {service.serviceType}
                      </Badge>
                      <Badge variant="outline">
                        {service.transportMode === "air" ? "Air Ambulance" : "Road Ambulance"}
                      </Badge>
                      {service.hasCloudPhysician && (
                        <Badge variant="outline" className="text-green-600">
                          <Cloud className="mr-1 h-3 w-3" /> Cloud Physician
                        </Badge>
                      )}
                    </div>

                    <div className="mb-3 text-lg font-semibold text-primary">
                      INR {parseFloat(service.baseCost || "0").toLocaleString()}
                    </div>

                    <Button className="w-full" data-testid={`button-select-transport-${service.id}`}>
                      Select Transport <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-6">
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => setStep("transport")}
          className="mb-2"
          data-testid="button-back-transport"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to transport
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Complete Booking</h1>
        <p className="text-muted-foreground">Enter patient details to complete the referral</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card className="bg-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Booking Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <Building2 className="h-5 w-5 text-primary" />
                <div>
                  <div className="text-sm text-muted-foreground">Destination Hospital</div>
                  <div className="font-medium">{selectedHospital?.name}</div>
                  <div className="text-sm text-muted-foreground">{selectedHospital?.location}</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                {selectedTransport?.transportMode === "air" ? (
                  <Plane className="h-5 w-5 text-primary" />
                ) : (
                  <Truck className="h-5 w-5 text-primary" />
                )}
                <div>
                  <div className="text-sm text-muted-foreground">Transport Service</div>
                  <div className="font-medium">{selectedTransport?.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {selectedTransport?.serviceType} - {selectedTransport?.transportMode === "air" ? "Air" : "Road"}
                  </div>
                </div>
              </div>
              <div className="border-t pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Transport Cost</span>
                  <span className="text-xl font-semibold text-primary">
                    INR {parseFloat(selectedTransport?.baseCost || "0").toLocaleString()}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Patient Details</CardTitle>
            <CardDescription>Enter patient information for the referral</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="patientName">Patient Name</Label>
                <Input
                  id="patientName"
                  value={patientDetails.patientName}
                  onChange={(e) => setPatientDetails({ ...patientDetails, patientName: e.target.value })}
                  data-testid="input-patient-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="patientAge">Age</Label>
                <Input
                  id="patientAge"
                  type="number"
                  value={patientDetails.patientAge}
                  onChange={(e) => setPatientDetails({ ...patientDetails, patientAge: e.target.value })}
                  data-testid="input-patient-age"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="condition">Patient Condition</Label>
              <Select
                value={patientDetails.patientCondition}
                onValueChange={(v) => setPatientDetails({ ...patientDetails, patientCondition: v as PatientCondition })}
              >
                <SelectTrigger data-testid="select-condition">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stable">Stable</SelectItem>
                  <SelectItem value="borderline">Borderline</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="diagnosis">Provisional Diagnosis</Label>
              <Input
                id="diagnosis"
                value={patientDetails.provisionalDiagnosis}
                onChange={(e) => setPatientDetails({ ...patientDetails, provisionalDiagnosis: e.target.value })}
                data-testid="input-diagnosis-booking"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="physician">Ordering Physician</Label>
              <Input
                id="physician"
                value={patientDetails.orderingPhysician}
                onChange={(e) => setPatientDetails({ ...patientDetails, orderingPhysician: e.target.value })}
                data-testid="input-physician"
              />
            </div>

            {selectedTransport?.hasCloudPhysician && (
              <div className="flex items-center gap-2 rounded-md bg-secondary/50 p-3">
                <Checkbox
                  id="cloudPhysician"
                  checked={patientDetails.cloudPhysicianSupport}
                  onCheckedChange={(c) => setPatientDetails({ ...patientDetails, cloudPhysicianSupport: !!c })}
                  data-testid="checkbox-cloud-physician"
                />
                <Label htmlFor="cloudPhysician" className="flex items-center gap-2">
                  <Cloud className="h-4 w-4 text-primary" />
                  Enable Cloud Physician Support
                </Label>
              </div>
            )}

            <Button 
              className="w-full"
              onClick={handleBooking}
              disabled={
                bookingMutation.isPending || 
                !patientDetails.patientName || 
                !patientDetails.patientAge ||
                !patientDetails.provisionalDiagnosis
              }
              data-testid="button-confirm-booking"
            >
              {bookingMutation.isPending ? (
                "Booking..."
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" /> Confirm Referral Booking
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
