import { useState, useEffect } from "react";
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
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Edit2, FlaskConical, IndianRupee, Clock, Building2, Stethoscope, Loader2, AlertCircle, ScanLine, CheckCircle2, ArrowRight, Calendar, Upload, FileText, X, Camera, PenLine, FileSpreadsheet, Download, Trash2, Eye, EyeOff } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
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
  const [editFromTime, setEditFromTime] = useState("09:00 AM");
  const [editToTime, setEditToTime] = useState("05:00 PM");
  const [editDays, setEditDays] = useState<string[]>(["Mon", "Tue", "Wed", "Thu", "Fri"]);
  const [calendarMonth, setCalendarMonth] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [dayActionDate, setDayActionDate] = useState<string | null>(null);
  const [dayActionCustomFrom, setDayActionCustomFrom] = useState("09:00 AM");
  const [dayActionCustomTo, setDayActionCustomTo] = useState("05:00 PM");
  const [longPressTimer, setLongPressTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [isAddTestDialogOpen, setIsAddTestDialogOpen] = useState(false);
  const [isSuggestTestDialogOpen, setIsSuggestTestDialogOpen] = useState(false);
  const [isBulkImportDialogOpen, setIsBulkImportDialogOpen] = useState(false);
  const [bulkImportFile, setBulkImportFile] = useState<File | null>(null);
  const [bulkMarginPercent, setBulkMarginPercent] = useState("0");
  const [bulkImportResult, setBulkImportResult] = useState<{ added: number; alreadyRegistered: number; skippedInvalid: number; total: number } | null>(null);
  const [selectedPredefinedTest, setSelectedPredefinedTest] = useState<string>("");
  const [testPrice, setTestPrice] = useState("");
  const [testTAT, setTestTAT] = useState("");
  const [suggestTestName, setSuggestTestName] = useState("");
  const [suggestTestDesc, setSuggestTestDesc] = useState("");
  const [suggestTestPrice, setSuggestTestPrice] = useState("");
  const [testRegNo, setTestRegNo] = useState("");
  const [testRegOrg, setTestRegOrg] = useState("");
  const [editingTest, setEditingTest] = useState<ProviderLabTestWithDetails | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [editTAT, setEditTAT] = useState("");
  const [selectedTestIds, setSelectedTestIds] = useState<Set<string>>(new Set());
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
  const [editingConsultant, setEditingConsultant] = useState<any | null>(null);
  const [editConsultantRegNo, setEditConsultantRegNo] = useState("");
  const [editConsultantRegOrg, setEditConsultantRegOrg] = useState("");
  const [editConsultantAffiliation, setEditConsultantAffiliation] = useState("");
  const [editConsultantDocFile, setEditConsultantDocFile] = useState<File | null>(null);
  const [editingEmergencyTeam, setEditingEmergencyTeam] = useState<any | null>(null);
  const [editEmergencyRegNo, setEditEmergencyRegNo] = useState("");
  const [editEmergencyRegOrg, setEditEmergencyRegOrg] = useState("");
  const [editEmergencyDocFile, setEditEmergencyDocFile] = useState<File | null>(null);
  const [activeServiceTab, setActiveServiceTab] = useState("labs");

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const { data: provider, isLoading: providerLoading } = useQuery<Provider>({
    queryKey: ["/api/providers/me"],
    retry: false,
  });

  const { data: currentUser } = useQuery<any>({ queryKey: ["/api/auth/user"] });
  const [selectedProviderType, setSelectedProviderType] = useState<string>("lab");

  const serviceTabsByType: Record<string, string[]> = {
    lab: ["labs"],
    consultant: ["consultants"],
    hospital: ["labs", "consultants", "emergency", "teleradiology"],
    teleradiology: ["teleradiology"],
    transport: [],
  };

  useEffect(() => {
    if (!provider) return;
    const allowed = serviceTabsByType[provider.type] ?? [];
    if (!allowed.includes(activeServiceTab)) {
      setActiveServiceTab(allowed[0] ?? "labs");
    }
  }, [provider?.type]);

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
        digitalSignatureUrl = await fileToDataUrl(consultantSignatureFile);
      }
      if (consultantPhotoFile) {
        photoUrl = await fileToDataUrl(consultantPhotoFile);
      }
      const response = await apiRequest("POST", "/api/provider/consultants", {
        ...data,
        registrationNumber: consultantRegNo || undefined,
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

  const editConsultantForm = useForm<ConsultantFormData>({
    resolver: zodResolver(consultantSchema),
    defaultValues: { name: "", qualification: "", specialization: "", yearsExperience: 0, consultationFee: "", portfolio: "" },
  });

  const editEmergencyForm = useForm<EmergencyTeamFormData>({
    resolver: zodResolver(emergencyTeamSchema),
    defaultValues: { teamLeadName: "", qualification: "", department: "", consultationFee: "" },
  });

  const openEditConsultant = (c: any) => {
    setEditingConsultant(c);
    editConsultantForm.reset({
      name: c.name || "",
      qualification: c.qualification || "",
      specialization: c.specialization || "",
      yearsExperience: c.yearsExperience || 0,
      consultationFee: c.consultationFee || "",
      portfolio: c.portfolio || "",
    });
    setEditConsultantRegNo(c.registrationNumber || "");
    setEditConsultantRegOrg(c.registeredOrganization || "");
    setEditConsultantAffiliation(c.affiliatedInstitution || "");
    setEditConsultantDocFile(null);
  };

  const openEditEmergencyTeam = (t: any) => {
    setEditingEmergencyTeam(t);
    editEmergencyForm.reset({
      teamLeadName: t.teamLeadName || "",
      qualification: t.qualification || "",
      department: t.department || "",
      consultationFee: t.consultationFee || "",
    });
    setEditEmergencyRegNo(t.registrationNumber || "");
    setEditEmergencyRegOrg(t.registeredOrganization || "");
    setEditEmergencyDocFile(null);
  };

  const updateConsultantMutation = useMutation({
    mutationFn: async (data: ConsultantFormData) => {
      if (!editingConsultant) throw new Error("No consultant selected");
      let registrationDocumentUrl: string | undefined;
      if (editConsultantDocFile) {
        registrationDocumentUrl = await uploadDocument(editConsultantDocFile);
      }
      const res = await apiRequest("PATCH", `/api/provider/consultants/${editingConsultant.id}`, {
        ...data,
        registrationNumber: editConsultantRegNo || undefined,
        registeredOrganization: editConsultantRegOrg || undefined,
        affiliatedInstitution: editConsultantAffiliation || undefined,
        ...(registrationDocumentUrl ? { registrationDocumentUrl } : {}),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/my-consultants"] });
      setEditingConsultant(null);
      toast({ title: "Consultant Updated" });
    },
    onError: () => {
      toast({ title: "Failed", description: "Failed to update consultant.", variant: "destructive" });
    },
  });

  const updateEmergencyMutation = useMutation({
    mutationFn: async (data: EmergencyTeamFormData) => {
      if (!editingEmergencyTeam) throw new Error("No team selected");
      let registrationDocumentUrl: string | undefined;
      if (editEmergencyDocFile) {
        registrationDocumentUrl = await uploadDocument(editEmergencyDocFile);
      }
      const res = await apiRequest("PATCH", `/api/provider/emergency-teams/${editingEmergencyTeam.id}`, {
        ...data,
        registrationNumber: editEmergencyRegNo || undefined,
        registeredOrganization: editEmergencyRegOrg || undefined,
        ...(registrationDocumentUrl ? { registrationDocumentUrl } : {}),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/my-emergency-teams"] });
      setEditingEmergencyTeam(null);
      toast({ title: "Emergency Team Updated" });
    },
    onError: () => {
      toast({ title: "Failed", description: "Failed to update emergency team.", variant: "destructive" });
    },
  });

  const { data: slotOverrides = [] } = useQuery<any[]>({
    queryKey: ["/api/consultants", editingSlotsFor?.id, "slot-overrides"],
    enabled: !!editingSlotsFor?.id,
    queryFn: async () => {
      const res = await fetch(`/api/consultants/${editingSlotsFor!.id}/slot-overrides`, { credentials: "include" });
      return res.json();
    },
  });

  const updateSlotsMutation = useMutation({
    mutationFn: async ({ id, availabilityFrom, availabilityTo, availableDays }: { id: string; availabilityFrom: string; availabilityTo: string; availableDays: string[] }) => {
      const response = await apiRequest("PATCH", `/api/consultants/${id}/slots`, { availabilityFrom, availabilityTo, availableDays });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/my-consultants"] });
      setEditingSlotsFor(null);
      toast({ title: "Availability Updated", description: "Availability hours have been saved." });
    },
    onError: () => {
      toast({ title: "Failed", description: "Failed to update availability.", variant: "destructive" });
    },
  });

  const upsertOverrideMutation = useMutation({
    mutationFn: async ({ consultantId, date, isPaused, customFrom, customTo }: { consultantId: string; date: string; isPaused: boolean; customFrom?: string; customTo?: string }) => {
      const res = await apiRequest("POST", `/api/consultants/${consultantId}/slot-overrides`, { date, isPaused, customFrom, customTo });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/consultants", editingSlotsFor?.id, "slot-overrides"] });
    },
  });

  const deleteOverrideMutation = useMutation({
    mutationFn: async ({ consultantId, date }: { consultantId: string; date: string }) => {
      const res = await apiRequest("DELETE", `/api/consultants/${consultantId}/slot-overrides/${date}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/consultants", editingSlotsFor?.id, "slot-overrides"] });
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
        registrationNumber: testRegNo || undefined,
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

  const editTestMutation = useMutation({
    mutationFn: async ({ id, price, turnaroundTime }: { id: string; price: string; turnaroundTime: string }) => {
      return apiRequest("PATCH", `/api/provider/lab-tests/${id}`, { price, turnaroundTime });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/my-lab-tests"] });
      setEditingTest(null);
      toast({ title: "Test Updated" });
    },
    onError: () => {
      toast({ title: "Failed to update test", variant: "destructive" });
    },
  });

  const toggleTestTatMutation = useMutation({
    mutationFn: async ({ id, tatHidden }: { id: string; tatHidden: boolean }) => {
      return apiRequest("PATCH", `/api/provider/lab-tests/${id}`, { tatHidden });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/my-lab-tests"] });
    },
    onError: () => {
      toast({ title: "Failed to update TAT visibility", variant: "destructive" });
    },
  });

  const bulkTatMutation = useMutation({
    mutationFn: async (tatHidden: boolean) => {
      return apiRequest("PATCH", "/api/provider/lab-tests-tat-visibility", { tatHidden });
    },
    onSuccess: (_data, tatHidden) => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/my-lab-tests"] });
      toast({ title: tatHidden ? "TAT hidden for all tests" : "TAT shown for all tests" });
    },
    onError: () => {
      toast({ title: "Failed to update TAT visibility", variant: "destructive" });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) {
        await apiRequest("DELETE", `/api/provider/lab-tests/${id}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/my-lab-tests"] });
      setSelectedTestIds(new Set());
      toast({ title: "Tests Removed", description: "Selected tests removed from your catalog." });
    },
    onError: () => {
      toast({ title: "Failed to remove tests", variant: "destructive" });
    },
  });

  // Bulk import tests from Excel
  const bulkImportMutation = useMutation({
    mutationFn: async () => {
      if (!bulkImportFile) throw new Error("No file selected");
      const formData = new FormData();
      formData.append("file", bulkImportFile);
      formData.append("marginPercent", bulkMarginPercent);
      const res = await fetch("/api/provider/bulk-import-lab-tests", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Import failed" }));
        throw new Error(err.message || "Import failed");
      }
      return res.json() as Promise<{ added: number; alreadyRegistered: number; skippedInvalid: number; total: number }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/provider/my-lab-tests"] });
      setBulkImportResult(data);
      setBulkImportFile(null);
    },
    onError: (err: any) => {
      toast({ title: "Import Failed", description: err.message || "Failed to import tests.", variant: "destructive" });
    },
  });

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

  const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const handleOpenSlotsEditor = (consultant: Consultant) => {
    setEditingSlotsFor(consultant);
    setEditFromTime(consultant.availabilityFrom || "09:00 AM");
    setEditToTime(consultant.availabilityTo || "05:00 PM");
    setEditDays((consultant as any).availableDays ?? ["Mon", "Tue", "Wed", "Thu", "Fri"]);
    const today = new Date();
    today.setDate(1);
    setCalendarMonth(today);
    setDayActionDate(null);
  };

  const handleSaveDefaultSchedule = () => {
    if (!editingSlotsFor) return;
    updateSlotsMutation.mutate({ id: editingSlotsFor.id, availabilityFrom: editFromTime, availabilityTo: editToTime, availableDays: editDays });
  };

  const toggleDay = (day: string) => {
    setEditDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  // Calendar helpers
  const calendarDaysArray = (): (number | null)[] => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDow = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (number | null)[] = Array(firstDow).fill(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return cells;
  };

  const toDateStr = (day: number): string => {
    const y = calendarMonth.getFullYear();
    const m = String(calendarMonth.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}-${String(day).padStart(2, "0")}`;
  };

  const getOverrideForDate = (dateStr: string) => slotOverrides.find((o: any) => o.date === dateStr);

  const handleDayPointerDown = (day: number) => {
    const dateStr = toDateStr(day);
    const timer = setTimeout(() => {
      // Long press — toggle pause
      if (!editingSlotsFor) return;
      const existing = getOverrideForDate(dateStr);
      if (existing?.isPaused) {
        // Already paused → resume (delete override)
        deleteOverrideMutation.mutate({ consultantId: editingSlotsFor.id, date: dateStr });
        toast({ title: "Day Resumed", description: `${dateStr} will use default hours` });
      } else {
        upsertOverrideMutation.mutate({ consultantId: editingSlotsFor.id, date: dateStr, isPaused: true });
        toast({ title: "Day Paused", description: `No consultations on ${dateStr}` });
      }
    }, 600);
    setLongPressTimer(timer);
  };

  const handleDayPointerUp = (day: number) => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  const handleDayClick = (day: number) => {
    // Only fires for short taps — open custom time dialog
    const dateStr = toDateStr(day);
    const existing = getOverrideForDate(dateStr);
    setDayActionDate(dateStr);
    setDayActionCustomFrom(existing?.customFrom || editFromTime);
    setDayActionCustomTo(existing?.customTo || editToTime);
  };

  const handleSaveDayCustomTime = () => {
    if (!editingSlotsFor || !dayActionDate) return;
    upsertOverrideMutation.mutate({
      consultantId: editingSlotsFor.id,
      date: dayActionDate,
      isPaused: false,
      customFrom: dayActionCustomFrom,
      customTo: dayActionCustomTo,
    });
    setDayActionDate(null);
    toast({ title: "Custom Hours Saved", description: `${dayActionDate}: ${dayActionCustomFrom} – ${dayActionCustomTo}` });
  };

  const handleRemoveDayOverride = () => {
    if (!editingSlotsFor || !dayActionDate) return;
    deleteOverrideMutation.mutate({ consultantId: editingSlotsFor.id, date: dayActionDate });
    setDayActionDate(null);
    toast({ title: "Override Removed", description: `${dayActionDate} reverted to default hours` });
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
      { value: "teleradiology", label: "Teleradiology Centre" },
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

      {(() => {
        const allTabs = [
          { value: "labs", label: "Labs", icon: <FlaskConical className="mr-2 h-4 w-4" /> },
          { value: "consultants", label: "Consultants", icon: <Stethoscope className="mr-2 h-4 w-4" /> },
          { value: "emergency", label: "Emergency", icon: <AlertCircle className="mr-2 h-4 w-4" /> },
          { value: "teleradiology", label: "Teleradiology", icon: <ScanLine className="mr-2 h-4 w-4" /> },
        ];
        const allowedValues = serviceTabsByType[provider.type] ?? [];
        const visibleTabs = allTabs.filter(t => allowedValues.includes(t.value));
        const colsClass: Record<number, string> = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4" };
        const safeActiveTab = allowedValues.includes(activeServiceTab) ? activeServiceTab : (allowedValues[0] ?? "labs");
        return (
      <Tabs value={safeActiveTab} onValueChange={(v) => allowedValues.includes(v) && setActiveServiceTab(v)} className="w-full">
        <TabsList className={`grid w-full ${colsClass[visibleTabs.length] ?? "grid-cols-4"}`}>
          {visibleTabs.map(tab => (
            <TabsTrigger key={tab.value} value={tab.value} data-testid={`tab-${tab.value}`}>
              {tab.icon}
              {tab.label}
            </TabsTrigger>
          ))}
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
              <Dialog open={isBulkImportDialogOpen} onOpenChange={(open) => {
                setIsBulkImportDialogOpen(open);
                if (!open) { setBulkImportFile(null); setBulkImportResult(null); setBulkMarginPercent("0"); }
              }}>
                <DialogTrigger asChild>
                  <Button variant="outline" data-testid="button-bulk-import">
                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                    Bulk Import
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Bulk Import Lab Tests via Excel</DialogTitle>
                    <DialogDescription>Upload your price list with test name, price, and turnaround time. Tests go live immediately.</DialogDescription>
                  </DialogHeader>
                  {bulkImportResult ? (
                    <div className="space-y-4">
                      <div className="rounded-lg border bg-green-50 dark:bg-green-900/20 p-4 space-y-2">
                        <div className="flex items-center gap-2 text-green-700 dark:text-green-400 font-medium">
                          <CheckCircle2 className="h-5 w-5" />
                          Import Complete
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <span className="text-muted-foreground">Tests added:</span>
                          <span className="font-semibold text-green-700 dark:text-green-400">{bulkImportResult.added}</span>
                          <span className="text-muted-foreground">Already registered:</span>
                          <span className="font-semibold">{bulkImportResult.alreadyRegistered}</span>
                          <span className="text-muted-foreground">Skipped (invalid):</span>
                          <span className="font-semibold">{bulkImportResult.skippedInvalid}</span>
                          <span className="text-muted-foreground">Total rows processed:</span>
                          <span className="font-semibold">{bulkImportResult.total}</span>
                        </div>
                      </div>
                      <Button className="w-full" onClick={() => { setIsBulkImportDialogOpen(false); setBulkImportResult(null); }} data-testid="button-bulk-import-done">Done</Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="rounded-lg border bg-muted/40 p-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">Download Template</p>
                          <p className="text-xs text-muted-foreground">3 columns: Test Name · Price (INR) · Turnaround Time</p>
                        </div>
                        <a href="/api/provider/lab-test-import-template" download data-testid="link-download-template">
                          <Button variant="outline" size="sm" type="button">
                            <Download className="mr-1.5 h-3.5 w-3.5" />
                            Template
                          </Button>
                        </a>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Your Margin % <span className="text-muted-foreground font-normal">(applied to all imported tests)</span></label>
                        <div className="relative">
                          <Input
                            type="number"
                            min="0"
                            max="99"
                            step="0.5"
                            value={bulkMarginPercent}
                            onChange={(e) => setBulkMarginPercent(e.target.value)}
                            placeholder="e.g. 50"
                            className="pr-8"
                            data-testid="input-bulk-margin"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                        </div>
                        {parseFloat(bulkMarginPercent) > 0 && (
                          <p className="text-xs text-muted-foreground">
                            Example: ₹100 list price → Customer pays ₹100, Perfusion cost ₹{(100 * (1 - parseFloat(bulkMarginPercent) / 100)).toFixed(0)}, Perfusion earns ₹{(100 * parseFloat(bulkMarginPercent) / 100).toFixed(0)}
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Excel File <span className="text-muted-foreground font-normal">(.xlsx or .xls)</span></label>
                        {bulkImportFile ? (
                          <div className="flex items-center gap-2 rounded-md border p-2">
                            <FileSpreadsheet className="h-4 w-4 text-green-600" />
                            <span className="flex-1 text-sm truncate">{bulkImportFile.name}</span>
                            <Button type="button" variant="ghost" size="icon" onClick={() => setBulkImportFile(null)} data-testid="button-remove-bulk-file">
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <label className="flex items-center gap-2 rounded-md border border-dashed p-4 cursor-pointer hover:bg-muted/50 transition-colors" data-testid="label-bulk-upload">
                            <Upload className="h-5 w-5 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">Click to select your Excel price list</span>
                            <input
                              type="file"
                              className="hidden"
                              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                              onChange={(e) => { const f = e.target.files?.[0]; if (f) setBulkImportFile(f); }}
                            />
                          </label>
                        )}
                      </div>
                      <Button
                        className="w-full"
                        onClick={() => bulkImportMutation.mutate()}
                        disabled={!bulkImportFile || bulkImportMutation.isPending}
                        data-testid="button-run-bulk-import"
                      >
                        {bulkImportMutation.isPending ? (
                          <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Importing...</>
                        ) : (
                          "Import Tests"
                        )}
                      </Button>
                    </div>
                  )}
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
            <>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>My Lab Tests ({myLabTests.length})</CardTitle>
                    <CardDescription>Tests you offer to care seekers</CardDescription>
                  </div>
                  <div className="flex items-center gap-3">
                    {selectedTestIds.size > 0 && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => bulkDeleteMutation.mutate(Array.from(selectedTestIds))}
                        disabled={bulkDeleteMutation.isPending}
                        data-testid="button-bulk-delete"
                      >
                        {bulkDeleteMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                        Delete Selected ({selectedTestIds.size})
                      </Button>
                    )}
                    {myLabTests.every(t => (t as any).tatHidden) ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => bulkTatMutation.mutate(false)}
                        disabled={bulkTatMutation.isPending}
                        data-testid="button-show-all-tat"
                      >
                        {bulkTatMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
                        Show TAT for All
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => bulkTatMutation.mutate(true)}
                        disabled={bulkTatMutation.isPending}
                        data-testid="button-hide-all-tat"
                      >
                        {bulkTatMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <EyeOff className="mr-2 h-4 w-4" />}
                        Hide TAT for All
                      </Button>
                    )}
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="select-all-tests"
                        checked={myLabTests.length > 0 && selectedTestIds.size === myLabTests.length}
                        onCheckedChange={(checked) => {
                          if (checked) setSelectedTestIds(new Set(myLabTests.map(t => t.id)));
                          else setSelectedTestIds(new Set());
                        }}
                        data-testid="checkbox-select-all-tests"
                      />
                      <label htmlFor="select-all-tests" className="text-sm text-muted-foreground cursor-pointer select-none">Select all</label>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {myLabTests.map((pt) => (
                  <div key={pt.id} className="flex items-center gap-2 rounded-lg border p-3" data-testid={`my-test-row-${pt.id}`}>
                    <Checkbox
                      checked={selectedTestIds.has(pt.id)}
                      onCheckedChange={(checked) => {
                        const next = new Set(selectedTestIds);
                        if (checked) next.add(pt.id); else next.delete(pt.id);
                        setSelectedTestIds(next);
                      }}
                      data-testid={`checkbox-test-${pt.id}`}
                    />
                    <div className="flex-1 min-w-0">
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
                        <span className={`flex items-center gap-1 ${(pt as any).tatHidden ? "line-through opacity-40" : ""}`}>
                          <Clock className="h-3.5 w-3.5" />{pt.turnaroundTime || pt.labTest?.turnaroundTime || "N/A"}
                        </span>
                        {(pt as any).tatHidden && (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground border-dashed py-0">TAT hidden</Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleTestTatMutation.mutate({ id: pt.id, tatHidden: !(pt as any).tatHidden })}
                        disabled={toggleTestTatMutation.isPending}
                        title={(pt as any).tatHidden ? "Show TAT to patients" : "Hide TAT from patients"}
                        data-testid={`button-toggle-tat-${pt.id}`}
                      >
                        {(pt as any).tatHidden ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => { setEditingTest(pt); setEditPrice(pt.price); setEditTAT(pt.turnaroundTime || pt.labTest?.turnaroundTime || ""); }}
                        data-testid={`button-edit-test-${pt.id}`}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => removeTestMutation.mutate(pt.id)}
                        disabled={removeTestMutation.isPending}
                        data-testid={`button-remove-test-${pt.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Edit test dialog */}
            <Dialog open={!!editingTest} onOpenChange={(open) => { if (!open) setEditingTest(null); }}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit Test</DialogTitle>
                  <DialogDescription>{editingTest?.labTest?.testName}</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Price (₹)</label>
                    <Input
                      type="number"
                      min="1"
                      value={editPrice}
                      onChange={(e) => setEditPrice(e.target.value)}
                      placeholder="e.g. 500"
                      data-testid="input-edit-price"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Turnaround Time</label>
                    <Input
                      value={editTAT}
                      onChange={(e) => setEditTAT(e.target.value)}
                      placeholder="e.g. 24 hours"
                      data-testid="input-edit-tat"
                    />
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => editTestMutation.mutate({ id: editingTest!.id, price: editPrice, turnaroundTime: editTAT })}
                    disabled={!editPrice || editTestMutation.isPending}
                    data-testid="button-save-edit-test"
                  >
                    {editTestMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : "Save Changes"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            </>
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
                      <p className="text-xs text-muted-foreground">Upload consultant's digital signature image (used on consultation summaries)</p>
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
                    {consultant.photoUrl ? (
                      <img src={consultant.photoUrl} alt={consultant.name} className="h-36 w-36 rounded-full object-cover border shrink-0" data-testid={`img-consultant-photo-${consultant.id}`} />
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
                      {((consultant as any).availableDays?.length > 0 || consultant.availabilityFrom || consultant.availabilityTo) && (
                        <div className="mt-2 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3 shrink-0" />
                          {(consultant as any).availableDays?.length > 0 && (
                            <span>{(consultant as any).availableDays.join(", ")}</span>
                          )}
                          {consultant.availabilityFrom && consultant.availabilityTo && (
                            <span className={(consultant as any).availableDays?.length > 0 ? "ml-1" : ""}>
                              {consultant.availabilityFrom} – {consultant.availabilityTo}
                            </span>
                          )}
                        </div>
                      )}
                      <div className="mt-3 flex items-center gap-2" data-testid={`sig-section-${consultant.id}`}>
                        {consultant.digitalSignatureUrl ? (
                          <img
                            src={consultant.digitalSignatureUrl}
                            alt="Digital signature"
                            className="h-8 max-w-[140px] object-contain rounded border bg-white px-1"
                            data-testid={`img-consultant-signature-${consultant.id}`}
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground italic" data-testid={`text-no-signature-${consultant.id}`}>No signature uploaded</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEditConsultant(consultant)}
                        data-testid={`button-edit-consultant-${consultant.id}`}
                      >
                        <Edit2 className="mr-1 h-3.5 w-3.5" />
                        Edit
                      </Button>
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
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEditEmergencyTeam(team)}
                      data-testid={`button-edit-emergency-${team.id}`}
                    >
                      <Edit2 className="mr-1 h-3.5 w-3.5" />
                      Edit
                    </Button>
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
        );
      })()}

      <Dialog open={!!editingConsultant} onOpenChange={(open) => !open && setEditingConsultant(null)}>
        <DialogContent className="max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>Edit Consultant</DialogTitle>
            <DialogDescription>Update consultant details</DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 pr-1">
            <Form {...editConsultantForm}>
              <form onSubmit={editConsultantForm.handleSubmit((data) => updateConsultantMutation.mutate(data))} className="space-y-4">
                <FormField control={editConsultantForm.control} name="name" render={({ field }) => (
                  <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} data-testid="input-edit-consultant-name" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={editConsultantForm.control} name="qualification" render={({ field }) => (
                  <FormItem><FormLabel>Qualification</FormLabel><FormControl><Input {...field} data-testid="input-edit-consultant-qualification" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={editConsultantForm.control} name="specialization" render={({ field }) => (
                  <FormItem><FormLabel>Specialization</FormLabel><FormControl><Input {...field} data-testid="input-edit-consultant-specialization" /></FormControl><FormMessage /></FormItem>
                )} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={editConsultantForm.control} name="yearsExperience" render={({ field }) => (
                    <FormItem><FormLabel>Years Experience</FormLabel><FormControl><Input type="number" {...field} data-testid="input-edit-consultant-experience" /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={editConsultantForm.control} name="consultationFee" render={({ field }) => (
                    <FormItem><FormLabel>Consultation Fee (INR)</FormLabel><FormControl><Input {...field} data-testid="input-edit-consultant-fee" /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <div className="space-y-2">
                  <Label>Registration No.</Label>
                  <Input value={editConsultantRegNo} onChange={(e) => setEditConsultantRegNo(e.target.value)} placeholder="Medical registration number" data-testid="input-edit-consultant-reg-no" />
                </div>
                <div className="space-y-2">
                  <Label>Registered Organization</Label>
                  <Input value={editConsultantRegOrg} onChange={(e) => setEditConsultantRegOrg(e.target.value)} placeholder="e.g., State Medical Council" data-testid="input-edit-consultant-reg-org" />
                </div>
                <div className="space-y-2">
                  <Label>Affiliated Institution</Label>
                  <Input value={editConsultantAffiliation} onChange={(e) => setEditConsultantAffiliation(e.target.value)} placeholder="e.g., AIIMS Delhi" data-testid="input-edit-consultant-affiliation" />
                </div>
                <FormField control={editConsultantForm.control} name="portfolio" render={({ field }) => (
                  <FormItem><FormLabel>Portfolio / Experience Details</FormLabel><FormControl><Textarea className="min-h-[80px] resize-none" data-testid="input-edit-consultant-portfolio" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <div className="space-y-2">
                  <Label>Registration Document</Label>
                  {editingConsultant?.registrationDocumentUrl && !editConsultantDocFile && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                      <FileText className="h-3.5 w-3.5" />
                      <a href={editingConsultant.registrationDocumentUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">Current document</a>
                    </div>
                  )}
                  {editConsultantDocFile ? (
                    <div className="flex items-center gap-2 rounded-md border p-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="flex-1 text-sm truncate">{editConsultantDocFile.name}</span>
                      <Button type="button" variant="ghost" size="icon" onClick={() => setEditConsultantDocFile(null)}><X className="h-4 w-4" /></Button>
                    </div>
                  ) : (
                    <label className="flex items-center gap-2 rounded-md border border-dashed p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                      <Upload className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{editingConsultant?.registrationDocumentUrl ? "Replace document" : "Upload document"}</span>
                      <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => { const f = e.target.files?.[0]; if (f) setEditConsultantDocFile(f); e.target.value = ""; }} />
                    </label>
                  )}
                </div>
                <Button type="submit" className="w-full" disabled={updateConsultantMutation.isPending} data-testid="button-save-edit-consultant">
                  {updateConsultantMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Save Changes
                </Button>
              </form>
            </Form>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingEmergencyTeam} onOpenChange={(open) => !open && setEditingEmergencyTeam(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Emergency Team</DialogTitle>
            <DialogDescription>Update emergency team details</DialogDescription>
          </DialogHeader>
          <Form {...editEmergencyForm}>
            <form onSubmit={editEmergencyForm.handleSubmit((data) => updateEmergencyMutation.mutate(data))} className="space-y-4">
              <FormField control={editEmergencyForm.control} name="teamLeadName" render={({ field }) => (
                <FormItem><FormLabel>Team Lead Name</FormLabel><FormControl><Input {...field} data-testid="input-edit-emergency-lead" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={editEmergencyForm.control} name="qualification" render={({ field }) => (
                <FormItem><FormLabel>Qualification</FormLabel><FormControl><Input {...field} data-testid="input-edit-emergency-qualification" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={editEmergencyForm.control} name="department" render={({ field }) => (
                <FormItem><FormLabel>Department</FormLabel><FormControl><Input {...field} data-testid="input-edit-emergency-department" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={editEmergencyForm.control} name="consultationFee" render={({ field }) => (
                <FormItem><FormLabel>Consultation Fee (INR)</FormLabel><FormControl><Input {...field} data-testid="input-edit-emergency-fee" /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="space-y-2">
                <Label>Registration No.</Label>
                <Input value={editEmergencyRegNo} onChange={(e) => setEditEmergencyRegNo(e.target.value)} placeholder="Registration number" data-testid="input-edit-emergency-reg-no" />
              </div>
              <div className="space-y-2">
                <Label>Registered Organization</Label>
                <Input value={editEmergencyRegOrg} onChange={(e) => setEditEmergencyRegOrg(e.target.value)} placeholder="e.g., State Medical Council" data-testid="input-edit-emergency-reg-org" />
              </div>
              <div className="space-y-2">
                <Label>Registration Document</Label>
                {editingEmergencyTeam?.registrationDocumentUrl && !editEmergencyDocFile && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <FileText className="h-3.5 w-3.5" />
                    <a href={editingEmergencyTeam.registrationDocumentUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">Current document</a>
                  </div>
                )}
                {editEmergencyDocFile ? (
                  <div className="flex items-center gap-2 rounded-md border p-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1 text-sm truncate">{editEmergencyDocFile.name}</span>
                    <Button type="button" variant="ghost" size="icon" onClick={() => setEditEmergencyDocFile(null)}><X className="h-4 w-4" /></Button>
                  </div>
                ) : (
                  <label className="flex items-center gap-2 rounded-md border border-dashed p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                    <Upload className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{editingEmergencyTeam?.registrationDocumentUrl ? "Replace document" : "Upload document"}</span>
                    <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => { const f = e.target.files?.[0]; if (f) setEditEmergencyDocFile(f); e.target.value = ""; }} />
                  </label>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={updateEmergencyMutation.isPending} data-testid="button-save-edit-emergency">
                {updateEmergencyMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save Changes
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ── Slot Editor Dialog ── */}
      <Dialog open={!!editingSlotsFor} onOpenChange={(open) => { if (!open) { setEditingSlotsFor(null); setDayActionDate(null); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>Manage Availability</DialogTitle>
            <DialogDescription>{editingSlotsFor?.name}</DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="schedule" className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="shrink-0 w-full">
              <TabsTrigger value="schedule" className="flex-1" data-testid="tab-default-schedule">Default Schedule</TabsTrigger>
              <TabsTrigger value="calendar" className="flex-1" data-testid="tab-calendar">Calendar</TabsTrigger>
            </TabsList>

            {/* ── Tab 1: Default Schedule ── */}
            <TabsContent value="schedule" className="flex-1 overflow-auto space-y-5 pt-2">
              <div className="space-y-2">
                <p className="text-sm font-medium">Available Days</p>
                <div className="flex flex-wrap gap-2">
                  {DAYS_OF_WEEK.map((day) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(day)}
                      data-testid={`btn-day-${day}`}
                      className={`h-9 w-12 rounded-md border text-sm font-medium transition-colors select-none
                        ${editDays.includes(day)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-muted-foreground border-border hover:bg-muted"
                        }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Time Window</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">From</label>
                    <Select value={editFromTime} onValueChange={setEditFromTime}>
                      <SelectTrigger data-testid="select-availability-from"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TIMES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">To</label>
                    <Select value={editToTime} onValueChange={setEditToTime}>
                      <SelectTrigger data-testid="select-availability-to"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TIMES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <Button className="w-full" onClick={handleSaveDefaultSchedule} disabled={updateSlotsMutation.isPending} data-testid="button-save-schedule">
                {updateSlotsMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save Default Schedule
              </Button>
            </TabsContent>

            {/* ── Tab 2: Calendar ── */}
            <TabsContent value="calendar" className="flex-1 overflow-auto space-y-3 pt-2">
              <p className="text-xs text-muted-foreground">
                <span className="font-medium">Tap</span> a date to set custom hours.{" "}
                <span className="font-medium">Long-press</span> to pause / resume.
              </p>

              {/* Month nav */}
              <div className="flex items-center justify-between">
                <Button size="sm" variant="ghost" onClick={() => setCalendarMonth(prev => { const d = new Date(prev); d.setMonth(d.getMonth() - 1); return d; })} data-testid="btn-prev-month">‹</Button>
                <span className="text-sm font-medium">
                  {calendarMonth.toLocaleString("default", { month: "long", year: "numeric" })}
                </span>
                <Button size="sm" variant="ghost" onClick={() => setCalendarMonth(prev => { const d = new Date(prev); d.setMonth(d.getMonth() + 1); return d; })} data-testid="btn-next-month">›</Button>
              </div>

              {/* Day-of-week headers */}
              <div className="grid grid-cols-7 gap-1 text-center">
                {["Su","Mo","Tu","We","Th","Fr","Sa"].map(h => (
                  <div key={h} className="text-xs font-medium text-muted-foreground py-1">{h}</div>
                ))}
                {calendarDaysArray().map((day, idx) => {
                  if (!day) return <div key={`empty-${idx}`} />;
                  const dateStr = toDateStr(day);
                  const override = getOverrideForDate(dateStr);
                  const isPaused = override?.isPaused === true;
                  const hasCustom = override && !override.isPaused;
                  const isToday = dateStr === new Date().toISOString().slice(0, 10);
                  return (
                    <button
                      key={dateStr}
                      type="button"
                      data-testid={`cal-day-${dateStr}`}
                      onPointerDown={() => handleDayPointerDown(day)}
                      onPointerUp={() => handleDayPointerUp(day)}
                      onPointerLeave={() => handleDayPointerUp(day)}
                      onClick={() => handleDayClick(day)}
                      className={`relative h-9 w-full rounded-md text-sm font-medium transition-colors select-none touch-none
                        ${isPaused ? "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-700"
                          : hasCustom ? "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700"
                          : isToday ? "border-2 border-primary text-primary"
                          : "hover:bg-muted border border-transparent"}`}
                    >
                      {day}
                      {isPaused && <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[8px] leading-none">off</span>}
                      {hasCustom && <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[8px] leading-none">custom</span>}
                    </button>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
                <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-red-100 dark:bg-red-950 border border-red-300 dark:border-red-700" />Paused</span>
                <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-blue-100 dark:bg-blue-950 border border-blue-300 dark:border-blue-700" />Custom hours</span>
                <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded border-2 border-primary" />Today</span>
              </div>

              {/* Day action sub-panel */}
              {dayActionDate && (
                <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{dayActionDate}</p>
                    <button type="button" onClick={() => setDayActionDate(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">From</label>
                      <Select value={dayActionCustomFrom} onValueChange={setDayActionCustomFrom}>
                        <SelectTrigger data-testid="select-day-from"><SelectValue /></SelectTrigger>
                        <SelectContent>{TIMES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">To</label>
                      <Select value={dayActionCustomTo} onValueChange={setDayActionCustomTo}>
                        <SelectTrigger data-testid="select-day-to"><SelectValue /></SelectTrigger>
                        <SelectContent>{TIMES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1" onClick={handleSaveDayCustomTime} disabled={upsertOverrideMutation.isPending} data-testid="button-save-day-custom">
                      {upsertOverrideMutation.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                      Save Hours
                    </Button>
                    {getOverrideForDate(dayActionDate) && (
                      <Button size="sm" variant="outline" className="flex-1 text-destructive border-destructive hover:bg-destructive/10" onClick={handleRemoveDayOverride} disabled={deleteOverrideMutation.isPending} data-testid="button-remove-day-override">
                        Remove Override
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
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
        aspect={undefined}
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
            formData.append("photo", blob, filename);
            const res = await fetch(`/api/consultants/${cropTargetConsultantId}/upload-photo`, { method: "POST", body: formData, credentials: "include" });
            if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              if (res.status === 401) { toast({ title: "Session expired", description: "Please refresh the page and try again.", variant: "destructive" }); return; }
              throw new Error(err.message || "Upload failed");
            }
            queryClient.invalidateQueries({ queryKey: ["/api/provider/my-consultants"] });
            queryClient.invalidateQueries({ queryKey: ["/api/consultants"] });
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
        aspect={undefined}
        title="Crop Digital Signature"
        onCropComplete={async (blob, filename) => {
          if (!cropTargetConsultantId) return;
          try {
            const formData = new FormData();
            formData.append("signature", blob, filename);
            const res = await fetch(`/api/consultants/${cropTargetConsultantId}/upload-signature`, { method: "POST", body: formData, credentials: "include" });
            if (!res.ok) {
              if (res.status === 401) { toast({ title: "Session expired", description: "Please refresh and try again.", variant: "destructive" }); return; }
              throw new Error("Upload failed");
            }
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
