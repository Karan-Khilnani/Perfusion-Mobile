import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { apiFetch } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import {
  type AttachmentDraft,
  pickCaseFileAttachment,
  uploadCaseFileAttachment,
} from "@/lib/case-file-attachments";

type Consultant = {
  id: string;
  name?: string;
  displayName?: string;
  specialization?: string;
  qualification?: string;
  hospital?: string;
  institute?: string;
  city?: string;
  consultationFee?: string;
  computedCustomerPrice?: string;
  availabilityPreview?: {
    label: string | null;
    date: string | null;
    windows: { from: string; to: string; appointmentSlot: string }[];
  };
  availability?: Record<string, string[]>;
  availableSlots?: string[];
};

const SPECIALTIES = ["All", "Critical Care", "Cardiology", "Neurology", "Pulmonology"];

export default function NewConsultationScreen() {
  const palette = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"explore" | "details">("explore");
  const [specialty, setSpecialty] = useState("All");
  const [todayOnly, setTodayOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<{ consultant: Consultant; slot: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [allergyNotSpecified, setAllergyNotSpecified] = useState(true);
  const [reportFiles, setReportFiles] = useState<AttachmentDraft[]>([]);
  const [chartFiles, setChartFiles] = useState<AttachmentDraft[]>([]);
  const [createdBooking, setCreatedBooking] = useState<{ id?: string } | null>(null);
  const [attachmentUploadError, setAttachmentUploadError] = useState<string | null>(null);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const [form, setForm] = useState({
    patientName: "", patientAge: "", patientGender: "", patientPhone: "", patientWeight: "", uhidIpNumber: "",
    allergies: "", comorbidities: "", presentingComplaint: "", presentIllness: "",
    provisionalDiagnosis: "", examination: "", investigations: "",
  });

  const consultants = useQuery<Consultant[]>({
    queryKey: ["mobile-consultants"],
    refetchOnMount: "always",
    queryFn: async () => {
      const response = await apiFetch("/api/consultants");
      if (!response.ok) throw new Error("Unable to load consultants");
      return response.json();
    },
  });
  const filtered = useMemo(() => (consultants.data || []).filter((item) => {
    const text = `${item.displayName || item.name || ""} ${item.specialization || ""} ${item.hospital || item.institute || ""}`.toLowerCase();
    const specialtyMatch = specialty === "All" || (item.specialization || "").toLowerCase().includes(specialty.toLowerCase());
    const availabilityMatch = !todayOnly || item.availabilityPreview?.label === "Available Today";
    return specialtyMatch && text.includes(search.trim().toLowerCase()) && availabilityMatch;
  }), [consultants.data, search, specialty, todayOnly]);

  const finishBooking = (booking: { id?: string }) => {
    queryClient.invalidateQueries({ queryKey: ["consultations"] });
    setConfirming(false);
    router.replace(booking.id ? `/case-file/${booking.id}` : "/(tabs)");
  };

  const uploadBookingDocuments = async (booking: { id?: string }) => {
    if (!booking.id) {
      setAttachmentUploadError("The booking was saved, but its Case File could not be identified.");
      return;
    }
    setUploadingAttachments(true);
    setAttachmentUploadError(null);
    try {
      for (const file of reportFiles) {
        await uploadCaseFileAttachment(booking.id, file, "general");
      }
      for (const file of chartFiles) {
        await uploadCaseFileAttachment(booking.id, file, "treatment_chart");
      }
      setCreatedBooking(null);
      finishBooking(booking);
    } catch (error) {
      setAttachmentUploadError(error instanceof Error ? error.message : "Please retry the document uploads.");
    } finally {
      setUploadingAttachments(false);
    }
  };

  const chooseBookingDocument = async (kind: "report" | "chart") => {
    try {
      const file = await pickCaseFileAttachment("document");
      if (!file) return;
      const addFile = (current: AttachmentDraft[]) => current.some((existing) =>
        existing.uri === file.uri || (existing.name === file.name && existing.size === file.size)
      ) ? current : [...current, file];
      if (kind === "report") setReportFiles(addFile);
      else setChartFiles(addFile);
    } catch (error) {
      Alert.alert("Could not add file", error instanceof Error ? error.message : "Choose a supported document and try again.");
    }
  };

  const book = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Choose a consultant and slot");
      const response = await apiFetch("/api/bookings", {
        method: "POST",
        body: JSON.stringify({
          bookingType: "consultation",
          serviceId: selected.consultant.id,
          serviceName: selected.consultant.specialization || selected.consultant.displayName || selected.consultant.name || "Consultation",
          providerName: selected.consultant.displayName || selected.consultant.name,
          appointmentSlot: selected.slot,
          patientName: form.patientName.trim(),
          patientAge: Number(form.patientAge),
          patientGender: form.patientGender,
          patientContact: form.patientPhone.trim(),
          patientWeight: form.patientWeight ? Number(form.patientWeight) : undefined,
          uhidIpNumber: form.uhidIpNumber.trim() || undefined,
          patientAllergyNotSpecified: allergyNotSpecified,
          patientAllergies: allergyNotSpecified ? undefined : form.allergies.trim(),
          comorbidities: form.comorbidities,
          presentingComplaint: form.presentingComplaint.trim(),
          presentIllness: form.presentIllness.trim() || undefined,
          provisionalDiagnosis: form.provisionalDiagnosis.trim() || undefined,
          examination: form.examination.trim() || undefined,
          investigations: form.investigations.trim() || undefined,
          amount: selected.consultant.computedCustomerPrice || selected.consultant.consultationFee || "0",
          urgency: "routine",
          status: "booked",
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "Booking failed");
      return body;
    },
    onSuccess: (booking: { id?: string }) => {
      if (reportFiles.length || chartFiles.length) {
        setCreatedBooking(booking);
        void uploadBookingDocuments(booking);
      } else {
        finishBooking(booking);
      }
    },
  });

  const valid = !!selected && !!form.patientName.trim() && !!form.patientAge && !!form.patientGender && !!form.patientPhone.trim() && !!form.presentingComplaint.trim() && (allergyNotSpecified || !!form.allergies.trim());
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <View style={[styles.screen, { backgroundColor: palette.background, paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={[styles.header, { borderBottomColor: palette.border }]}>
        <Pressable onPress={() => step === "details" ? setStep("explore") : router.back()} style={styles.iconButton}><Feather name="arrow-left" size={21} color={palette.foreground} /></Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: palette.foreground }]}>New Consultation</Text>
          <Text style={[styles.headerStep, { color: palette.mutedForeground }]}>{step === "explore" ? "1 of 2 · Explore consultants" : "2 of 2 · Patient & clinical details"}</Text>
        </View>
      </View>

      {step === "explore" ? (
        <KeyboardAwareScrollViewCompat
          style={{ flex: 1 }}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.search, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <Feather name="search" size={17} color={palette.mutedForeground} />
            <TextInput value={search} onChangeText={setSearch} placeholder="Search consultants" placeholderTextColor={palette.mutedForeground} style={[styles.searchInput, { color: palette.foreground }]} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {SPECIALTIES.map((item) => (
              <Pressable key={item} onPress={() => setSpecialty(item)} style={[styles.chip, { backgroundColor: specialty === item ? palette.foreground : palette.card, borderColor: specialty === item ? palette.foreground : palette.border }]}>
                <Text style={[styles.chipText, { color: specialty === item ? palette.card : palette.foreground }]}>{item}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={[styles.toggleRow, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.toggleTitle, { color: palette.foreground }]}>Available today only</Text>
              <Text style={[styles.toggleHint, { color: palette.mutedForeground }]}>Show consultants with open slots today</Text>
            </View>
            <Switch value={todayOnly} onValueChange={setTodayOnly} trackColor={{ false: palette.muted, true: `${palette.primary}70` }} thumbColor={todayOnly ? palette.primary : palette.card} />
          </View>
          {consultants.isLoading ? (
            <ActivityIndicator color={palette.primary} style={{ marginTop: 40 }} />
          ) : consultants.isError ? (
            <View style={{ alignItems: "center", gap: 10, marginTop: 32, paddingHorizontal: 24 }}>
              <Text style={{ color: palette.destructive, textAlign: "center" }}>
                {consultants.error instanceof Error ? consultants.error.message : "Unable to load current availability."}
              </Text>
              <Pressable onPress={() => consultants.refetch()} accessibilityRole="button">
                <Text style={{ color: palette.primary, fontWeight: "600" }}>Try again</Text>
              </Pressable>
            </View>
          ) : filtered.length ? filtered.map((consultant) => (
            <ConsultantCard key={consultant.id} consultant={consultant} onChoose={(slot) => { setSelected({ consultant, slot }); setStep("details"); }} />
          )) : (
            <Text style={{ color: palette.mutedForeground, textAlign: "center", marginTop: 28 }}>
              {todayOnly
                ? "No consultants have eligible slots today."
                : consultants.data?.length
                  ? "No consultants match your search."
                  : "No consultants have upcoming availability."}
            </Text>
          )}
        </KeyboardAwareScrollViewCompat>
      ) : (
        <KeyboardAwareScrollViewCompat
          style={{ flex: 1 }}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.selectedCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <View style={[styles.photo, { backgroundColor: palette.accent }]}><Feather name="user" size={22} color={palette.mutedForeground} /></View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.selectedName, { color: palette.foreground }]}>{selected?.consultant.displayName || selected?.consultant.name}</Text>
              <Text style={[styles.selectedMeta, { color: palette.primary }]}>{selected?.consultant.specialization} · {selected?.slot}</Text>
            </View>
          </View>
          <Text style={[styles.sectionTitle, { color: palette.foreground }]}>Patient details</Text>
          <Input label="Patient Name*" value={form.patientName} onChangeText={(value) => update("patientName", value)} />
          <View style={styles.twoCol}>
            <Input compact label="Age*" value={form.patientAge} keyboardType="numeric" onChangeText={(value) => update("patientAge", value)} />
            <Input compact label="Gender*" value={form.patientGender} placeholder="Male / Female / Other" onChangeText={(value) => update("patientGender", value)} />
          </View>
          <Input label="Patient's Contact Number*" value={form.patientPhone} keyboardType="phone-pad" placeholder="+91" onChangeText={(value) => update("patientPhone", value)} />
          <View style={styles.twoCol}>
            <Input compact label="Weight (kg)" value={form.patientWeight} keyboardType="numeric" onChangeText={(value) => update("patientWeight", value)} />
            <Input compact label="UHID / IP Number" value={form.uhidIpNumber} onChangeText={(value) => update("uhidIpNumber", value)} />
          </View>
          <Pressable onPress={() => setAllergyNotSpecified((value) => !value)} style={styles.checkboxRow}>
            <View style={[styles.checkbox, { backgroundColor: allergyNotSpecified ? palette.foreground : palette.card, borderColor: palette.foreground }]}>
              {allergyNotSpecified && <Feather name="check" size={13} color={palette.card} />}
            </View>
            <Text style={[styles.checkboxText, { color: palette.foreground }]}>No known allergies / Not specified</Text>
          </Pressable>
          {!allergyNotSpecified && <Input label="Allergies*" value={form.allergies} onChangeText={(value) => update("allergies", value)} />}
          <Input
            multiline
            label="Comorbidities / Past Illness"
            value={form.comorbidities}
            placeholder="Enter one condition per line"
            onChangeText={(value) => update("comorbidities", value)}
            testID="input-comorbidities"
          />
          <Text style={{ color: palette.mutedForeground, fontSize: 11, marginTop: -7 }}>
            Optional. Duplicate entries are saved once, ignoring case.
          </Text>
          <Input multiline label="Presenting Complaint*" value={form.presentingComplaint} placeholder="Main complaint or reason for seeking medical attention" onChangeText={(value) => update("presentingComplaint", value)} />
          <Input multiline label="Present Illness" value={form.presentIllness} placeholder="History and details of the current illness or episode" onChangeText={(value) => update("presentIllness", value)} />
          <Text style={[styles.sectionTitle, { color: palette.foreground }]}>Clinical Details</Text>
          <Input multiline label="Examination" value={form.examination} placeholder="Physical examination findings, vitals, systemic examination…" onChangeText={(value) => update("examination", value)} />
          <Input multiline label="Investigations" value={form.investigations} placeholder="Lab results, imaging findings, ECG…" onChangeText={(value) => update("investigations", value)} />
          <Input multiline label="Provisional Diagnosis" value={form.provisionalDiagnosis} onChangeText={(value) => update("provisionalDiagnosis", value)} />
          <View style={styles.uploadRow}>
            <UploadPrompt
              label="Upload Reports"
              icon="file-text"
              count={reportFiles.length}
              onPress={() => void chooseBookingDocument("report")}
            />
            <UploadPrompt
              label="Treatment Chart"
              icon="clipboard"
              count={chartFiles.length}
              onPress={() => void chooseBookingDocument("chart")}
            />
          </View>
          {(reportFiles.length > 0 || chartFiles.length > 0) && (
            <View style={styles.fileList}>
              {[...reportFiles.map((file, index) => ({ file, kind: "report" as const, index })),
                ...chartFiles.map((file, index) => ({ file, kind: "chart" as const, index }))].map(({ file, kind, index }) => (
                <View key={`${kind}-${file.uri}`} style={[styles.selectedFile, { backgroundColor: palette.card, borderColor: palette.border }]}>
                  <Feather name={kind === "report" ? "file-text" : "clipboard"} size={15} color={palette.primary} />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={[styles.selectedFileName, { color: palette.foreground }]}>{file.name}</Text>
                    <Text style={[styles.selectedFileMeta, { color: palette.mutedForeground }]}>{kind === "report" ? "Report" : "Treatment chart"}</Text>
                  </View>
                  <Pressable
                    onPress={() => kind === "report"
                      ? setReportFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))
                      : setChartFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}
                    accessibilityLabel={`Remove ${file.name}`}
                    hitSlop={8}
                  >
                    <Feather name="x" size={17} color={palette.mutedForeground} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
          <Text style={[styles.patientIdNote, { color: palette.mutedForeground }]}>Selected files are added to the private Case File after the booking is created.</Text>
          <Text style={[styles.patientIdNote, { color: palette.mutedForeground }]}>A unique Perfusion Patient ID will be generated for a new patient and saved for future consultations.</Text>
          <Pressable disabled={!valid} onPress={() => setConfirming(true)} style={[styles.bookButton, { backgroundColor: valid ? palette.primary : palette.muted }]}>
            <Text style={[styles.bookButtonText, { color: valid ? "#FFFFFF" : palette.mutedForeground }]}>Book Consultation</Text>
          </Pressable>
        </KeyboardAwareScrollViewCompat>
      )}

      <Modal
        transparent
        visible={confirming}
        animationType="slide"
        onRequestClose={() => {
          if (!createdBooking && !uploadingAttachments) setConfirming(false);
        }}
      >
        <View style={styles.backdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            disabled={!!createdBooking || uploadingAttachments}
            onPress={() => setConfirming(false)}
          />
          <View style={[styles.confirmSheet, { backgroundColor: palette.card, paddingBottom: Math.max(insets.bottom, 18) }]}>
            <Text style={[styles.confirmTitle, { color: palette.foreground }]}>Confirm consultation</Text>
            <Text style={[styles.confirmLine, { color: palette.foreground }]}>{form.patientName}</Text>
            <Text style={[styles.confirmMeta, { color: palette.mutedForeground }]}>{selected?.consultant.specialization} · {selected?.consultant.displayName || selected?.consultant.name}</Text>
            <Text style={[styles.confirmMeta, { color: palette.mutedForeground }]}>{selected?.slot}</Text>
            <View style={[styles.postpaid, { backgroundColor: palette.accent }]}>
              <Feather name="info" size={16} color={palette.foreground} />
              <Text style={[styles.postpaidText, { color: palette.foreground }]}>Postpaid, billed later. Booking cannot be undone in this app.</Text>
            </View>
            {!!book.error && <Text style={[styles.error, { color: palette.primary }]}>{book.error.message}</Text>}
            {!!attachmentUploadError && (
              <Text accessibilityRole="alert" style={[styles.error, { color: palette.primary }]}>
                Booking saved, but some files need a retry: {attachmentUploadError}
              </Text>
            )}
            <Pressable
              onPress={() => createdBooking ? void uploadBookingDocuments(createdBooking) : book.mutate()}
              disabled={book.isPending || uploadingAttachments}
              style={[styles.bookButton, { backgroundColor: palette.primary, opacity: book.isPending || uploadingAttachments ? 0.75 : 1 }]}
            >
              {book.isPending || uploadingAttachments
                ? <ActivityIndicator color="#FFFFFF" />
                : <Text style={[styles.bookButtonText, { color: "#FFFFFF" }]}>
                    {createdBooking && attachmentUploadError ? "Retry document uploads" : "Confirm Booking"}
                  </Text>}
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ConsultantCard({ consultant, onChoose }: { consultant: Consultant; onChoose: (slot: string) => void }) {
  const palette = useColors();
  const preview = consultant.availabilityPreview;
  const windows = preview?.windows.slice(0, 3) ?? [];
  return (
    <View style={[styles.consultantCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
      <View style={styles.consultantMain}>
        <View style={[styles.photo, { backgroundColor: palette.accent }]}><Feather name="user" size={24} color={palette.mutedForeground} /></View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.consultantName, { color: palette.foreground }]}>{consultant.displayName || consultant.name || "Consultant"}</Text>
          <Text style={[styles.specialization, { color: palette.primary }]}>{consultant.specialization || "Specialist"}</Text>
          <Text style={[styles.credentials, { color: palette.mutedForeground }]}>{consultant.qualification || "Verified provider"} · {consultant.hospital || consultant.institute || consultant.city || "Perfusion network"}</Text>
        </View>
      </View>
      <View style={styles.slots}>
        {preview?.label && (
          <Text style={[styles.tomorrowText, { color: palette.primary, marginBottom: 4 }]}>
            {preview.label}{preview.date ? ` · ${preview.date}` : ""}
          </Text>
        )}
        {windows.length ? windows.map((window) => (
          <Pressable
            key={window.appointmentSlot}
            onPress={() => onChoose(window.appointmentSlot)}
            style={[styles.slot, { backgroundColor: palette.accent }]}
          >
            <Text style={[styles.slotText, { color: palette.foreground }]}>{window.from}{window.to ? ` – ${window.to}` : ""}</Text>
          </Pressable>
        )) : <View style={[styles.tomorrow, { backgroundColor: `${palette.warning}15` }]}>
          <Text style={[styles.tomorrowText, { color: palette.warning }]}>
            {preview?.label ?? "No upcoming availability"}
          </Text>
        </View>}
      </View>
    </View>
  );
}

function Input({ label, compact, multiline, ...props }: React.ComponentProps<typeof TextInput> & { label: string; compact?: boolean }) {
  const palette = useColors();
  return (
    <View style={[styles.field, compact && { flex: 1 }]}>
      <Text style={[styles.label, { color: palette.foreground }]}>{label}</Text>
      <TextInput
        {...props}
        multiline={multiline}
        placeholderTextColor={palette.mutedForeground}
        style={[styles.input, multiline && styles.textarea, { color: palette.foreground, backgroundColor: palette.card, borderColor: palette.border }]}
      />
    </View>
  );
}

function UploadPrompt({
  label,
  icon,
  count,
  onPress,
}: {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  count: number;
  onPress: () => void;
}) {
  const palette = useColors();
  return (
    <Pressable onPress={onPress} style={[styles.upload, { borderColor: palette.border, backgroundColor: palette.card }]}>
      <Feather name={icon} size={19} color={palette.foreground} />
      <Text style={[styles.uploadText, { color: palette.foreground }]}>{label}{count ? ` · ${count}` : ""}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { height: 64, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth },
  iconButton: { width: 42, height: 42, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontFamily: "Sora_600SemiBold" },
  headerStep: { fontSize: 10, marginTop: 2, fontFamily: "Inter_400Regular" },
  content: { padding: 18, gap: 13 },
  search: { height: 46, borderRadius: 14, borderWidth: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: 13, gap: 8 },
  searchInput: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },
  chips: { gap: 7 },
  chip: { height: 32, borderRadius: 16, borderWidth: 1, paddingHorizontal: 13, alignItems: "center", justifyContent: "center" },
  chipText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  toggleRow: { borderWidth: 1, borderRadius: 14, padding: 13, flexDirection: "row", alignItems: "center" },
  toggleTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  toggleHint: { fontSize: 10, marginTop: 3, fontFamily: "Inter_400Regular" },
  consultantCard: { borderRadius: 17, borderWidth: 1, padding: 14, gap: 14 },
  consultantMain: { flexDirection: "row", gap: 12 },
  photo: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  consultantName: { fontSize: 15, fontFamily: "Sora_600SemiBold" },
  specialization: { fontSize: 12, fontFamily: "Inter_700Bold", marginTop: 3 },
  credentials: { fontSize: 10, lineHeight: 15, fontFamily: "Inter_400Regular", marginTop: 3 },
  slots: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  slot: { borderRadius: 15, paddingHorizontal: 11, paddingVertical: 7 },
  slotText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  tomorrow: { borderRadius: 15, paddingHorizontal: 11, paddingVertical: 7 },
  tomorrowText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  selectedCard: { borderRadius: 16, borderWidth: 1, padding: 13, flexDirection: "row", alignItems: "center", gap: 11 },
  selectedName: { fontSize: 14, fontFamily: "Sora_600SemiBold" },
  selectedMeta: { fontSize: 11, fontFamily: "Inter_600SemiBold", marginTop: 4 },
  sectionTitle: { fontSize: 16, fontFamily: "Sora_600SemiBold", marginTop: 8 },
  twoCol: { flexDirection: "row", gap: 10 },
  field: { gap: 6 },
  label: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  input: { height: 46, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, fontSize: 13, fontFamily: "Inter_400Regular" },
  textarea: { minHeight: 98, height: "auto", paddingVertical: 12, textAlignVertical: "top" },
  checkboxRow: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 5 },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  checkboxText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  uploadRow: { flexDirection: "row", gap: 9 },
  upload: { flex: 1, minHeight: 72, borderRadius: 13, borderWidth: 1, alignItems: "center", justifyContent: "center", gap: 7 },
  uploadText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  fileList: { gap: 7 },
  selectedFile: { borderWidth: 1, borderRadius: 11, padding: 10, flexDirection: "row", alignItems: "center", gap: 9 },
  selectedFileName: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  selectedFileMeta: { fontSize: 9, textTransform: "capitalize", marginTop: 2, fontFamily: "Inter_400Regular" },
  patientIdNote: { fontSize: 10, lineHeight: 15, fontFamily: "Inter_400Regular" },
  bookButton: { height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: 3 },
  bookButtonText: { fontSize: 14, fontFamily: "Sora_600SemiBold" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,.38)", justifyContent: "flex-end" },
  confirmSheet: { padding: 20, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  confirmTitle: { fontSize: 19, fontFamily: "Inter_700Bold", marginBottom: 18 },
  confirmLine: { fontSize: 16, fontFamily: "Inter_700Bold" },
  confirmMeta: { fontSize: 12, marginTop: 5, fontFamily: "Inter_400Regular" },
  postpaid: { borderRadius: 12, padding: 12, flexDirection: "row", gap: 9, marginTop: 18 },
  postpaidText: { flex: 1, fontSize: 11, lineHeight: 16, fontFamily: "Inter_500Medium" },
  error: { fontSize: 11, marginTop: 10, fontFamily: "Inter_500Medium" },
});