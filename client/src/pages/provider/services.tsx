import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { StarRating } from "@/components/star-rating";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Edit2, FlaskConical, IndianRupee, Clock, Building2, Stethoscope, Loader2, AlertCircle, ScanLine, CheckCircle2, ArrowRight, Calendar, Upload, FileText, X, Camera, PenLine } from "lucide-react";
import { Label } from "@/components/ui/label";
import type { Lab, LabTest, Consultant, Provider, RadiologyModality, ProviderLabTest } from "@shared/schema";
import { Link } from "wouter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ImageCropDialog } from "@/components/ui/image-crop-dialog";

type ProviderLabTestWithDetails = ProviderLabTest & {
  labTest?: LabTest;
};

interface LabWithTests extends Lab {
  tests: LabTest[];
}

const labSchema = z.object({
  name: z.string().min(2, "Lab name is required"),
  location: z.string().min(2, "Location is required"),
  description: z.string().optional(),
});

const consultantSchema = z.object({
  name: z.string().min(2, "Name is required"),
  qualification: z.string().min(2, "Qualification is required"),
  specialization: z.string().min(2, "Specialization is required"),
  yearsExperience: z.coerce.number().min(0, "Experience is required"),
  consultationFee: z.string().min(1, "Fee is required"),
  portfolio: z.string().optional(),
});

const emergencyTeamSchema = z.object({
  teamLeadName: z.string().min(2, "Team lead name is required"),
  qualification: z.string().min(2, "Qualification is required"),
  department: z.string().min(2, "Department is required"),
  consultationFee: z.string().min(1, "Fee is required"),
});

type LabFormData = z.infer<typeof labSchema>;
type ConsultantFormData = z.infer<typeof consultantSchema>;
type EmergencyTeamFormData = z.infer<typeof emergencyTeamSchema>;

export default function ProviderServicesPage() {
  const { toast } = useToast();
  const [isLabDialogOpen, setIsLabDialogOpen] = useState(false);
  const [isConsultantDialogOpen, setIsConsultantDialogOpen] = useState(false);
  const [editingSlotsFor, setEditingSlotsFor] = useState<Consultant | null>(null);
  const [slotsList, setSlotsList] = useState<string[]>([]);
  const [selectedDay, setSelectedDay] = useState("Mon");
  const [selectedTime, setSelectedTime] = useState("09:00 AM");
  const [isAddTestDialogOpen, setIsAddTestDialogOpen] = useState(false);
  const [isSuggestTestDialogOpen, setIsSuggestTestDialogOpen] = useState(false);
  const [selectedPredefinedTest, setSelectedPredefinedTest] = useState<string>("");
  const [testPrice, setTestPrice] = useState("");
  const [testTAT, setTestTAT] = useState("");
  const [suggestTestName, setSuggestTestName] = useState("");
  const [suggestTestDesc, setSuggestTestDesc] = useState("");
  const [suggestTestPrice, setSuggestTestPrice] = useState("");
  const [testRegNo, setTestRegNo] = useState("");
  const [testRegOrg, setTestRegOrg] = useState("");
  const [testDocFile, setTestDocFile] = useState<File | null>(null);
  const [consultantRegNo, setConsultantRegNo] = useState("");
  const [consultantRegOrg, setConsultantRegOrg] = useState("");
  const [consultantDocFile, setConsultantDocFile] = useState<File | null>(null);
  const [consultantSignatureFile, setConsultantSignatureFile] = useState<File | null>(null);
  const [consultantAffiliation, setConsultantAffiliation] = useState("");
  const [consultantPhotoFile, setConsultantPhotoFile] = useState<File | null>(null);
  const [photoCropOpen, setPhotoCropOpen] = useState(false);
  const [photoCropRaw, setPhotoCropRaw] = useState<File | null>(null);
  const [sigCropOpen, setSigCropOpen] = useState(false);
  const [sigCropRaw, setSigCropRaw] = useState<File | null>(null);
  const [listPhotoCropOpen, setListPhotoCropOpen] = useState(false);
  const [listPhotoCropRaw, setListPhotoCropRaw] = useState<File | null>(null);
  const [listSigCropOpen, setListSigCropOpen] = useState(false);
  const [listSigCropRaw, setListSigCropRaw] = useState<File | null>(null);
  const [cropTargetConsultantId, setCropTargetConsultantId] = useState<string | null>(null);
  const [isEmergencyDialogOpen, setIsEmergencyDialogOpen] = useState(false);
  const [emergencyRegNo, setEmergencyRegNo] = useState("");
  const [emergencyRegOrg, setEmergencyRegOrg] = useState("");
  const [emergencyDocFile, setEmergencyDocFile] = useState<File | null>(null);

  const { data: provider, isLoading: providerLoading } = useQuery<Provider>({
    queryKey: ["/api/providers/me"],
    retry: false,
  });

  const { data: currentUser } = useQuery<any>({ queryKey: ["/api/auth/user"] });
  const [selectedProviderType, setSelectedProviderType] = useState<string>("lab");

  const autoCreateMutation = useMutation({
    mutationFn: async (type: string) => {
      const res = await apiRequest("POST", "/api/providers/auto-create", { type });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/providers/me"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to set up provider profile.", variant: "destructive" });
    },
  });

  const { data: labs, isLoading: labsLoading } = useQuery<LabWithTests[]>({
    queryKey: ["/api/provider/my-labs"],
    enabled: !!provider,
  });

  const { data: consultants, isLoading: consultantsLoading } = useQuery<Consultant[]>({
    queryKey: ["/api/provider/my-consultants"],
    enabled: !!provider,
  });

  const { data: modalities, isLoading: modalitiesLoading } = useQuery<RadiologyModality[]>({
    queryKey: ["/api/radiology-modalities"],
    enabled: !!provider,
  });

  // Predefined lab tests from admin
  const { data: predefinedLabTests } = useQuery<LabTest[]>({
    queryKey: ["/api/lab-tests"],
    enabled: !!provider,
  });

  // Provider's assigned lab tests
  const { data: myLabTests, isLoading: myLabTestsLoading } = useQuery<ProviderLabTestWithDetails[]>({
    queryKey: ["/api/provider/my-lab-tests"],
    enabled: !!provider,
  });

  const { data: emergencyTeams, isLoading: emergencyLoading } = useQuery<any[]>({
    queryKey: ["/api/provider/my-emergency-teams"],
    enabled: !!provider,
  });

  // Filter out already assigned tests
  const availablePredefinedTests = predefinedLabTests?.filter(
    t => !myLabTests?.some(mt => mt.labTestId === t.id)
  ) || [];

  const labForm = useForm<LabFormData>({
    resolver: zodResolver(labSchema),
    defaultValues: { name: "", location: "", description: "" },
  });

  const consultantForm = useForm<ConsultantFormData>({
    resolver: zodResolver(consultantSchema),
    defaultValues: { name: "", qualification: "", specialization: "", yearsExperience: 0, consultationFee: "", portfolio: "" },
  });

  const emergencyForm = useForm<EmergencyTeamFormData>({
    resolver: zodResolver(emergencyTeamSchema),
    defaultValues: { teamLeadName: "", qualification: "", department: "", consultationFee: "" },
  });

  const createLabMutation = useMutation({
    mutationFn: async (data: LabFormData) => {
      const response = await apiRequest("POST", "/api/provider/labs", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/my-labs"] });
      setIsLabDialogOpen(false);
      labForm.reset();
      toast({ title: "Lab Created", description: "Your lab has been created successfully." });
    },
    onError: () => {
      toast({ title: "Failed", description: "Failed to create lab.", variant: "destructive" });
    },
  });

  const createConsultantMutation = useMutation({
    mutationFn: async (data: ConsultantFormData) => {
      let registrationDocumentUrl: string | undefined;
      let digitalSignatureUrl: string | undefined;
      let photoUrl: string | undefined;
      if (consultantDocFile) {
        registrationDocumentUrl = await uploadDocument(consultantDocFile);
      }
      if (consultantSignatureFile) {
        digitalSignatureUrl = await uploadDocument(consultantSignatureFile);
      }
      if (consultantPhotoFile) {
        photoUrl = await uploadDocument(consultantPhotoFile);
      }
      const response = await apiRequest("POST", "/api/provider/consultants", {
        ...data,
        registrationNo: consultantRegNo || undefined,
        registeredOrganization: consultantRegOrg || undefined,
        registrationDocumentUrl,
        digitalSignatureUrl,
        photoUrl,
        affiliatedInstitution: consultantAffiliation || undefined,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/my-consultants"] });
      setIsConsultantDialogOpen(false);
      consultantForm.reset();
      setConsultantRegNo("");
      setConsultantRegOrg("");
      setConsultantDocFile(null);
      setConsultantSignatureFile(null);
      setConsultantAffiliation("");
      setConsultantPhotoFile(null);
      toast({ title: "Consultant Added", description: "Consultant profile submitted (pending approval)." });
    },
    onError: () => {
      toast({ title: "Failed", description: "Failed to create consultant.", variant: "destructive" });
    },
  });

  const createEmergencyMutation = useMutation({
    mutationFn: async (data: EmergencyTeamFormData) => {
      let registrationDocumentUrl: string | undefined;
      if (emergencyDocFile) {
        registrationDocumentUrl = await uploadDocument(emergencyDocFile);
      }
      const response = await apiRequest("POST", "/api/provider/emergency-teams", {
        ...data,
        registrationNumber: emergencyRegNo || undefined,
        registeredOrganization: emergencyRegOrg || undefined,
        registrationDocumentUrl,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/my-emergency-teams"] });
      setIsEmergencyDialogOpen(false);
      emergencyForm.reset();
      setEmergencyRegNo("");
      setEmergencyRegOrg("");
      setEmergencyDocFile(null);
      toast({ title: "Emergency Team Added", description: "Emergency team submitted (pending approval)." });
    },
    onError: () => {
      toast({ title: "Failed", description: "Failed to add emergency team.", variant: "destructive" });
    },
  });

  const updateSlotsMutation = useMutation({
    mutationFn: async ({ id, slots }: { id: string; slots: string[] }) => {
      const response = await apiRequest("PATCH", `/api/consultants/${id}/slots`, { slots });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/my-consultants"] });
      setEditingSlotsFor(null);
      setSlotsList([]);
      toast({ title: "Slots Updated", description: "Booking slots have been saved." });
    },
    onError: () => {
      toast({ title: "Failed", description: "Failed to update slots.", variant: "destructive" });
    },
  });

  const uploadDocument = async (file: File): Promise<string | undefined> => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/upload/document", { method: "POST", body: formData });
    if (res.ok) {
      const result = await res.json();
      return result.url;
    }
    return undefined;
  };

  const addPredefinedTestMutation = useMutation({
    mutationFn: async () => {
      let registrationDocumentUrl: string | undefined;
      if (testDocFile) {
        registrationDocumentUrl = await uploadDocument(testDocFile);
      }
      return apiRequest("POST", "/api/provider/lab-tests", {
        labTestId: selectedPredefinedTest,
        price: testPrice,
        turnaroundTime: testTAT,
        registrationNo: testRegNo || undefined,
        registeredOrganization: testRegOrg || undefined,
        registrationDocumentUrl,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/my-lab-tests"] });
      setIsAddTestDialogOpen(false);
      setSelectedPredefinedTest("");
      setTestPrice("");
      setTestTAT("");
      setTestRegNo("");
      setTestRegOrg("");
      setTestDocFile(null);
      toast({ title: "Test Added", description: "Lab test added to your catalog (pending approval)." });
    },
    onError: () => {
      toast({ title: "Failed", description: "Failed to add test.", variant: "destructive" });
    },
  });

  // Suggest new test for admin approval
  const suggestTestMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/provider/suggest-lab-test", {
        testName: suggestTestName,
        description: suggestTestDesc,
        suggestedPrice: suggestTestPrice,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/my-suggestions"] });
      setIsSuggestTestDialogOpen(false);
      setSuggestTestName("");
      setSuggestTestDesc("");
      setSuggestTestPrice("");
      toast({ title: "Suggestion Sent", description: "Your test suggestion has been sent to admin for approval." });
    },
    onError: () => {
      toast({ title: "Failed", description: "Failed to submit suggestion.", variant: "destructive" });
    },
  });

  // Remove test from provider's catalog
  const removeTestMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/provider/lab-tests/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/my-lab-tests"] });
      toast({ title: "Test Removed", description: "Test removed from your catalog." });
    },
    onError: () => {
      toast({ title: "Failed", description: "Failed to remove test.", variant: "destructive" });
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

  const isLoading = providerLoading || labsLoading;

  if (providerLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Card>
          <CardContent className="py-12">
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!provider) {
    const providerTypeOptions = [
      { value: "lab", label: "Diagnostic Lab" },
      { value: "consultant", label: "Specialist / Consultant" },
      { value: "hospital", label: "Hospital / Critical Care" },
      { value: "transport", label: "Transport / Ambulance" },
    ];
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Service Management</h1>
          <p className="text-muted-foreground">Manage your service listings and pricing</p>
        </div>
        <Card className="max-w-md mx-auto">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 p-3 rounded-full bg-primary/10 w-fit">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-lg">One last step</CardTitle>
            <CardDescription>
              {currentUser?.hospitalName && (
                <span className="font-medium text-foreground">{currentUser.hospitalName} — </span>
              )}
              What type of services will you offer?
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {providerTypeOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSelectedProviderType(opt.value)}
                  className={`rounded-md border-2 p-3 text-sm font-medium text-left transition-colors ${
                    selectedProviderType === opt.value
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-muted hover:border-muted-foreground/30"
                  }`}
                  data-testid={`option-type-${opt.value}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <Button
              className="w-full"
              disabled={autoCreateMutation.isPending}
              onClick={() => autoCreateMutation.mutate(selectedProviderType)}
              data-testid="button-get-started"
            >
              {autoCreateMutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />Setting up...</>
              ) : (
                <>Get Started <ArrowRight className="h-4 w-4 ml-2" /></>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const verificationBanner = provider.verificationStatus === "pending" && (
    <Card className="border-yellow-500/50 bg-yellow-500/10">
      <CardContent className="flex items-center gap-3 py-4">
        <AlertCircle className="h-5 w-5 text-yellow-600" />
        <p className="text-sm text-yellow-800 dark:text-yellow-200">
          Your provider profile is pending verification. You can add services, but they won't be visible to seekers until approved.
        </p>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Service Management</h1>
        <p className="text-muted-foreground">Manage your service listings and pricing</p>
      </div>

      {verificationBanner}

      <Tabs defaultValue="labs" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="labs" data-testid="tab-labs">
            <FlaskConical className="mr-2 h-4 w-4" />
            Labs
          </TabsTrigger>
          <TabsTrigger value="consultants" data-testid="tab-consultants">
            <Stethoscope className="mr-2 h-4 w-4" />
            Consultants
          </TabsTrigger>
          <TabsTrigger value="emergency" data-testid="tab-emergency">
            <AlertCircle className="mr-2 h-4 w-4" />
            Emergency
          </TabsTrigger>
          <TabsTrigger value="teleradiology" data-testid="tab-teleradiology">
            <ScanLine className="mr-2 h-4 w-4" />
            Teleradiology
          </TabsTrigger>
        </TabsList>

        <TabsContent value="labs" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">Select tests from the platform catalog or suggest new ones</p>
            <div className="flex gap-2">
              <Dialog open={isAddTestDialogOpen} onOpenChange={setIsAddTestDialogOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-add-catalog-test">
                    <Plus className="mr-2 h-4 w-4" />
                    Add from Catalog
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Test from Catalog</DialogTitle>
                    <DialogDescription>Select a predefined test and set your price</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Select Test</label>
                      <Select value={selectedPredefinedTest} onValueChange={setSelectedPredefinedTest}>
                        <SelectTrigger data-testid="select-predefined-test">
                          <SelectValue placeholder="Choose a test..." />
                        </SelectTrigger>
                        <SelectContent>
                          {availablePredefinedTests.map((test) => (
                            <SelectItem key={test.id} value={test.id}>
                              {test.testName} ({test.category})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-4 grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Your Price (₹)</label>
                        <Input 
                          value={testPrice} 
                          onChange={(e) => setTestPrice(e.target.value)} 
                          placeholder="250"
                          data-testid="input-catalog-price"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Turnaround Time</label>
                        <Input 
                          value={testTAT} 
                          onChange={(e) => setTestTAT(e.target.value)} 
                          placeholder="4 hours"
                          data-testid="input-catalog-tat"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Lab Registration No.</label>
                      <Input
                        value={testRegNo}
                        onChange={(e) => setTestRegNo(e.target.value)}
                        placeholder="Lab registration number"
                        data-testid="input-test-reg-no"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Registered Organization</label>
                      <Input
                        value={testRegOrg}
                        onChange={(e) => setTestRegOrg(e.target.value)}
                        placeholder="e.g., State Medical Council, MCI, NABL, etc."
                        data-testid="input-test-registered-org"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Registration Document</Label>
                      {testDocFile ? (
                        <div className="flex items-center gap-2 rounded-md border p-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="flex-1 text-sm truncate">{testDocFile.name}</span>
                          <Button type="button" variant="ghost" size="icon" onClick={() => setTestDocFile(null)} data-testid="button-remove-test-doc">
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <label className="flex items-center gap-2 rounded-md border border-dashed p-3 cursor-pointer hover-elevate" data-testid="label-upload-test-doc">
                          <Upload className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">Upload registration certificate</span>
                          <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => { const f = e.target.files?.[0]; if (f) setTestDocFile(f); }} />
                        </label>
                      )}
                    </div>
                    <Button 
                      className="w-full" 
                      onClick={() => addPredefinedTestMutation.mutate()}
                      disabled={!selectedPredefinedTest || !testPrice || addPredefinedTestMutation.isPending}
                      data-testid="button-add-predefined-test"
                    >
                      {addPredefinedTestMutation.isPending ? "Adding..." : "Add Test (Pending Approval)"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
              <Dialog open={isSuggestTestDialogOpen} onOpenChange={setIsSuggestTestDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" data-testid="button-suggest-test">
                    <AlertCircle className="mr-2 h-4 w-4" />
                    Suggest New Test
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Suggest New Test</DialogTitle>
                    <DialogDescription>Suggest a test not in the catalog. Admin will review and approve.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Test Name</label>
                      <Input 
                        value={suggestTestName} 
                        onChange={(e) => setSuggestTestName(e.target.value)} 
                        placeholder="e.g., Genetic Screening Panel"
                        data-testid="input-suggest-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Description</label>
                      <Textarea 
                        value={suggestTestDesc} 
                        onChange={(e) => setSuggestTestDesc(e.target.value)} 
                        placeholder="Describe what this test is for..."
                        data-testid="input-suggest-desc"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Suggested Price (₹)</label>
                      <Input 
                        value={suggestTestPrice} 
                        onChange={(e) => setSuggestTestPrice(e.target.value)} 
                        placeholder="1500"
                        data-testid="input-suggest-price"
                      />
                    </div>
                    <Button 
                      className="w-full" 
                      onClick={() => suggestTestMutation.mutate()}
                      disabled={!suggestTestName || suggestTestMutation.isPending}
                      data-testid="button-submit-suggestion"
                    >
                      {suggestTestMutation.isPending ? "Submitting..." : "Submit for Approval"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {myLabTestsLoading ? (
            <Card><CardContent className="py-8"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ) : !myLabTests || myLabTests.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <FlaskConical className="mb-4 h-12 w-12 text-muted-foreground/50" />
                <h3 className="mb-2 text-lg font-medium">No lab tests added</h3>
                <p className="text-sm text-muted-foreground">Add tests from the catalog to start receiving bookings</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>My Lab Tests ({myLabTests.length})</CardTitle>
                <CardDescription>Tests you offer to care seekers</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {myLabTests.map((pt) => (
                  <div key={pt.id} className="flex items-center justify-between rounded-lg border p-3" data-testid={`my-test-row-${pt.id}`}>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{pt.labTest?.testName || "Unknown Test"}</p>
                        {(pt as any).approvalStatus === "pending" && <Badge variant="outline" className="text-yellow-600 border-yellow-500">Pending</Badge>}
                        {(pt as any).approvalStatus === "rejected" && <Badge variant="outline" className="text-destructive border-destructive">Rejected</Badge>}
                        {(pt as any).approvalStatus === "approved" && <Badge variant="outline" className="text-green-600 border-green-500">Approved</Badge>}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                        <Badge variant="outline">{pt.labTest?.category}</Badge>
                        <span className="flex items-center gap-1">
                          <IndianRupee className="h-3.5 w-3.5" />₹{pt.price}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />{pt.turnaroundTime || "N/A"}
                        </span>
                      </div>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => removeTestMutation.mutate(pt.id)}
                      disabled={removeTestMutation.isPending}
                      data-testid={`button-remove-test-${pt.id}`}
                    >
                      <AlertCircle className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="consultants" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={isConsultantDialogOpen} onOpenChange={setIsConsultantDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-consultant">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Consultant
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] flex flex-col">
                <DialogHeader className="shrink-0">
                  <DialogTitle>Add Consultant</DialogTitle>
                  <DialogDescription>Add a new consultant to your practice</DialogDescription>
                </DialogHeader>
                <div className="overflow-y-auto flex-1 pr-1">
                <Form {...consultantForm}>
                  <form onSubmit={consultantForm.handleSubmit((data) => createConsultantMutation.mutate(data))} className="space-y-4">
                    <FormField
                      control={consultantForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Dr. Name" {...field} data-testid="input-consultant-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={consultantForm.control}
                      name="qualification"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Qualification</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., MD, DM (Cardiology)" {...field} data-testid="input-consultant-qualification" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={consultantForm.control}
                      name="specialization"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Specialization</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., Cardiology" {...field} data-testid="input-consultant-specialization" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={consultantForm.control}
                        name="yearsExperience"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Years Experience</FormLabel>
                            <FormControl>
                              <Input type="number" {...field} data-testid="input-consultant-experience" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={consultantForm.control}
                        name="consultationFee"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Consultation Fee (INR)</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g., 100.00" {...field} data-testid="input-consultant-fee" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Registration No.</Label>
                      <Input
                        value={consultantRegNo}
                        onChange={(e) => setConsultantRegNo(e.target.value)}
                        placeholder="Medical registration number"
                        data-testid="input-consultant-reg-no"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Registered Organization</Label>
                      <Input
                        value={consultantRegOrg}
                        onChange={(e) => setConsultantRegOrg(e.target.value)}
                        placeholder="e.g., State Medical Council, MCI, NABL, etc."
                        data-testid="input-consultant-registered-org"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Affiliated Institution (Optional)</Label>
                      <Input
                        value={consultantAffiliation}
                        onChange={(e) => setConsultantAffiliation(e.target.value)}
                        placeholder="e.g., AIIMS Delhi, CMC Vellore"
                        data-testid="input-consultant-affiliation"
                      />
                    </div>
                    <FormField
                      control={consultantForm.control}
                      name="portfolio"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Portfolio / Experience Details</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Describe your clinical experience, past positions, key achievements, areas of expertise, publications, or any other relevant background..."
                              className="min-h-[100px] resize-none"
                              data-testid="input-consultant-portfolio"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="space-y-2">
                      <Label>Consultant Photo</Label>
                      {consultantPhotoFile ? (
                        <div className="flex items-center gap-2 rounded-md border p-2">
                          <Camera className="h-4 w-4 text-muted-foreground" />
                          <span className="flex-1 text-sm truncate">{consultantPhotoFile.name} (cropped)</span>
                          <Button type="button" variant="ghost" size="icon" onClick={() => setConsultantPhotoFile(null)} data-testid="button-remove-consultant-photo">
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <label className="flex items-center gap-2 rounded-md border border-dashed p-3 cursor-pointer hover-elevate" data-testid="label-upload-consultant-photo">
                          <Camera className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">Upload &amp; crop consultant photo</span>
                          <input type="file" className="hidden" accept=".jpg,.jpeg,.png" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setPhotoCropRaw(f); setPhotoCropOpen(true); } e.target.value = ""; }} />
                        </label>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>Registration Document</Label>
                      {consultantDocFile ? (
                        <div className="flex items-center gap-2 rounded-md border p-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="flex-1 text-sm truncate">{consultantDocFile.name}</span>
                          <Button type="button" variant="ghost" size="icon" onClick={() => setConsultantDocFile(null)} data-testid="button-remove-consultant-doc">
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <label className="flex items-center gap-2 rounded-md border border-dashed p-3 cursor-pointer hover-elevate" data-testid="label-upload-consultant-doc">
                          <Upload className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">Upload registration certificate</span>
                          <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => { const f = e.target.files?.[0]; if (f) setConsultantDocFile(f); }} />
                        </label>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>Digital Signature *</Label>
                      <p className="text-xs text-muted-foreground">Upload consultant's digital signature image (used on prescriptions)</p>
                      {consultantSignatureFile ? (
                        <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-2">
                          <PenLine className="h-4 w-4 text-primary" />
                          <span className="flex-1 text-sm truncate">{consultantSignatureFile.name} (cropped)</span>
                          <Button type="button" variant="ghost" size="icon" onClick={() => setConsultantSignatureFile(null)} data-testid="button-remove-consultant-signature">
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <label className="flex items-center gap-2 rounded-md border border-dashed border-primary/30 p-3 cursor-pointer hover-elevate" data-testid="label-upload-consultant-signature">
                          <PenLine className="h-4 w-4 text-primary" />
                          <span className="text-sm text-primary">Upload &amp; crop digital signature</span>
                          <input type="file" className="hidden" accept=".jpg,.jpeg,.png" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setSigCropRaw(f); setSigCropOpen(true); } e.target.value = ""; }} />
                        </label>
                      )}
                    </div>
                    <Button type="submit" className="w-full" disabled={createConsultantMutation.isPending} data-testid="button-save-consultant">
                      {createConsultantMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Add Consultant (Pending Approval)
                    </Button>
                  </form>
                </Form>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {consultantsLoading ? (
            <Card><CardContent className="py-8"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ) : !consultants || consultants.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Stethoscope className="mb-4 h-12 w-12 text-muted-foreground/50" />
                <h3 className="mb-2 text-lg font-medium">No consultants yet</h3>
                <p className="text-sm text-muted-foreground">Click "Add Consultant" to add your first consultant</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {consultants.map((consultant) => (
                <Card key={consultant.id}>
                  <CardContent className="flex items-center justify-between gap-4 py-4">
                    {(consultant as any).photoUrl ? (
                      <img src={(consultant as any).photoUrl} alt={consultant.name} className="h-36 w-36 rounded-full object-cover border shrink-0" data-testid={`img-consultant-photo-${consultant.id}`} />
                    ) : (
                      <div className="h-36 w-36 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-4xl font-medium shrink-0">
                        {consultant.name.charAt(0)}
                      </div>
                    )}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{consultant.name}</p>
                        {consultant.approvalStatus === "pending" && <Badge variant="outline" className="text-yellow-600 border-yellow-500">Pending</Badge>}
                        {consultant.approvalStatus === "rejected" && <Badge variant="outline" className="text-destructive border-destructive">Rejected</Badge>}
                        {consultant.approvalStatus === "approved" && <Badge variant="outline" className="text-green-600 border-green-500">Approved</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">{consultant.qualification}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                        <span>{consultant.specialization}</span>
                        <span>{consultant.yearsExperience} years exp.</span>
                        <span>₹{consultant.consultationFee}</span>
                      </div>
                      {consultant.availableSlots && consultant.availableSlots.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {consultant.availableSlots.slice(0, 3).map((slot, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">
                              {slot}
                            </Badge>
                          ))}
                          {consultant.availableSlots.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{consultant.availableSlots.length - 3} more
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="cursor-pointer" title="Replace photo" data-testid={`label-replace-photo-${consultant.id}`}>
                        <Button size="sm" variant="ghost" asChild>
                          <span><Camera className="h-3.5 w-3.5" /></span>
                        </Button>
                        <input type="file" className="hidden" accept=".jpg,.jpeg,.png" onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          setCropTargetConsultantId(String(consultant.id));
                          setListPhotoCropRaw(f);
                          setListPhotoCropOpen(true);
                          e.target.value = "";
                        }} />
                      </label>
                      <label className="cursor-pointer" title="Replace signature" data-testid={`label-replace-sig-${consultant.id}`}>
                        <Button size="sm" variant="ghost" asChild>
                          <span><PenLine className="h-3.5 w-3.5" /></span>
                        </Button>
                        <input type="file" className="hidden" accept=".jpg,.jpeg,.png" onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          setCropTargetConsultantId(String(consultant.id));
                          setListSigCropRaw(f);
                          setListSigCropOpen(true);
                          e.target.value = "";
                        }} />
                      </label>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenSlotsEditor(consultant)}
                        data-testid={`button-manage-slots-${consultant.id}`}
                      >
                        <Calendar className="mr-1 h-3.5 w-3.5" />
                        Slots
                      </Button>
                      {consultant.rating && <StarRating rating={parseFloat(consultant.rating)} />}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="emergency" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={isEmergencyDialogOpen} onOpenChange={setIsEmergencyDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-emergency-team">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Emergency Team
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Emergency Team</DialogTitle>
                  <DialogDescription>Register an emergency team for your facility</DialogDescription>
                </DialogHeader>
                <Form {...emergencyForm}>
                  <form onSubmit={emergencyForm.handleSubmit((data) => createEmergencyMutation.mutate(data))} className="space-y-4">
                    <FormField
                      control={emergencyForm.control}
                      name="teamLeadName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Team Lead Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Team Lead Name" {...field} data-testid="input-emergency-lead" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={emergencyForm.control}
                      name="qualification"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Qualification</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., MD, DM (Cardiology)" {...field} data-testid="input-emergency-qualification" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={emergencyForm.control}
                      name="department"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Department</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., Cardiology, Nephrology" {...field} data-testid="input-emergency-department" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={emergencyForm.control}
                      name="consultationFee"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Consultation Fee (INR)</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., 5000.00" {...field} data-testid="input-emergency-fee" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="space-y-2">
                      <Label>Registration No.</Label>
                      <Input
                        value={emergencyRegNo}
                        onChange={(e) => setEmergencyRegNo(e.target.value)}
                        placeholder="Registration number"
                        data-testid="input-emergency-reg-no"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Registered Organization</Label>
                      <Input
                        value={emergencyRegOrg}
                        onChange={(e) => setEmergencyRegOrg(e.target.value)}
                        placeholder="e.g., State Medical Council, MCI, NABL, etc."
                        data-testid="input-emergency-registered-org"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Registration Document</Label>
                      {emergencyDocFile ? (
                        <div className="flex items-center gap-2 rounded-md border p-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="flex-1 text-sm truncate">{emergencyDocFile.name}</span>
                          <Button type="button" variant="ghost" size="icon" onClick={() => setEmergencyDocFile(null)} data-testid="button-remove-emergency-doc">
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <label className="flex items-center gap-2 rounded-md border border-dashed p-3 cursor-pointer hover-elevate" data-testid="label-upload-emergency-doc">
                          <Upload className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">Upload registration certificate</span>
                          <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => { const f = e.target.files?.[0]; if (f) setEmergencyDocFile(f); }} />
                        </label>
                      )}
                    </div>
                    <Button type="submit" className="w-full" disabled={createEmergencyMutation.isPending} data-testid="button-save-emergency-team">
                      {createEmergencyMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Add Emergency Team (Pending Approval)
                    </Button>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>

          {emergencyLoading ? (
            <Card><CardContent className="py-8"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ) : !emergencyTeams || emergencyTeams.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <AlertCircle className="mb-4 h-12 w-12 text-muted-foreground/50" />
                <h3 className="mb-2 text-lg font-medium">No emergency teams yet</h3>
                <p className="text-sm text-muted-foreground">Click "Add Emergency Team" to register your first emergency team</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {emergencyTeams.map((team: any) => (
                <Card key={team.id}>
                  <CardContent className="flex items-center justify-between gap-4 py-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{team.department} Team</p>
                        {team.approvalStatus === "pending" && <Badge variant="outline" className="text-yellow-600 border-yellow-500">Pending</Badge>}
                        {team.approvalStatus === "rejected" && <Badge variant="outline" className="text-destructive border-destructive">Rejected</Badge>}
                        {team.approvalStatus === "approved" && <Badge variant="outline" className="text-green-600 border-green-500">Approved</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">Team Lead: {team.teamLeadName}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                        <span>{team.qualification}</span>
                        <span>Fee: ₹{team.consultationFee}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="teleradiology" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle>Teleradiology Services</CardTitle>
                  <CardDescription>
                    Provide remote radiology interpretations for hospitals and clinics
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 text-green-600" />
                  <div>
                    <p className="font-medium text-green-700 dark:text-green-300">Teleradiology Enabled</p>
                    <p className="text-sm text-green-600 dark:text-green-400">
                      You can receive and process teleradiology bookings from seekers. 
                      Bookings will appear in your Bookings tab.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="mb-3 font-medium">Available Modalities ({modalities?.length || 0})</h4>
                {modalitiesLoading ? (
                  <Skeleton className="h-24 w-full" />
                ) : !modalities || modalities.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No modalities available</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {modalities.map((modality) => (
                      <div
                        key={modality.id}
                        className="flex items-center justify-between rounded-lg border p-3"
                        data-testid={`modality-row-${modality.id}`}
                      >
                        <div>
                          <p className="font-medium">{modality.name}</p>
                          {modality.category && (
                            <p className="text-xs text-muted-foreground">{modality.category}</p>
                          )}
                        </div>
                        <Badge variant="secondary">{modality.status}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <Link href="/provider/bookings">
                  <Button variant="outline" data-testid="button-view-bookings">
                    View Teleradiology Bookings
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!editingSlotsFor} onOpenChange={(open) => !open && setEditingSlotsFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage Booking Slots</DialogTitle>
            <DialogDescription>
              {editingSlotsFor?.name} - Add or edit available appointment slots
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
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
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditingSlotsFor(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveSlots} disabled={updateSlotsMutation.isPending} data-testid="button-save-slots">
              {updateSlotsMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Slots
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Crop dialog for photo in consultant add form */}
      <ImageCropDialog
        open={photoCropOpen}
        onOpenChange={setPhotoCropOpen}
        imageFile={photoCropRaw}
        aspect={1}
        title="Crop Consultant Photo"
        onCropComplete={async (blob, filename) => {
          const croppedFile = new File([blob], filename, { type: blob.type });
          setConsultantPhotoFile(croppedFile);
        }}
      />

      {/* Crop dialog for signature in consultant add form */}
      <ImageCropDialog
        open={sigCropOpen}
        onOpenChange={setSigCropOpen}
        imageFile={sigCropRaw}
        aspect={3}
        title="Crop Digital Signature"
        onCropComplete={async (blob, filename) => {
          const croppedFile = new File([blob], filename, { type: blob.type });
          setConsultantSignatureFile(croppedFile);
        }}
      />

      {/* Crop dialog for photo replacement from list */}
      <ImageCropDialog
        open={listPhotoCropOpen}
        onOpenChange={setListPhotoCropOpen}
        imageFile={listPhotoCropRaw}
        aspect={1}
        title="Crop Consultant Photo"
        onCropComplete={async (blob, filename) => {
          if (!cropTargetConsultantId) return;
          try {
            const formData = new FormData();
            formData.append("file", blob, filename);
            const res = await fetch("/api/upload/document", { method: "POST", body: formData, credentials: "include" });
            if (!res.ok) throw new Error("Upload failed");
            const { url } = await res.json();
            await apiRequest("PATCH", `/api/consultants/${cropTargetConsultantId}/photo`, { photoUrl: url });
            queryClient.invalidateQueries({ queryKey: ["/api/provider/my-consultants"] });
            toast({ title: "Photo updated" });
          } catch {
            toast({ title: "Failed to update photo", variant: "destructive" });
          }
        }}
      />

      {/* Crop dialog for signature replacement from list */}
      <ImageCropDialog
        open={listSigCropOpen}
        onOpenChange={setListSigCropOpen}
        imageFile={listSigCropRaw}
        aspect={3}
        title="Crop Digital Signature"
        onCropComplete={async (blob, filename) => {
          if (!cropTargetConsultantId) return;
          try {
            const formData = new FormData();
            formData.append("file", blob, filename);
            const res = await fetch("/api/upload/document", { method: "POST", body: formData, credentials: "include" });
            if (!res.ok) throw new Error("Upload failed");
            const { url } = await res.json();
            await apiRequest("PATCH", `/api/provider/consultants/${cropTargetConsultantId}`, { digitalSignatureUrl: url });
            queryClient.invalidateQueries({ queryKey: ["/api/provider/my-consultants"] });
            toast({ title: "Signature updated" });
          } catch {
            toast({ title: "Failed to update signature", variant: "destructive" });
          }
        }}
      />
    </div>
  );
}
