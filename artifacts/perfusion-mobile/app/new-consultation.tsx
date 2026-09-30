import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
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

import { AppAlert } from "@/components/AppAlert";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch, getBaseUrl } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { designTokens } from "@/constants/designTokens";
import { getPushDeviceId } from "@/lib/push-device";
import {
  type AttachmentDraft,
  CaseFileAttachmentUploadError,
  pickCaseFileAttachment,
  uploadCaseFileAttachment,
} from "@/lib/case-file-attachments";
import { isSeekerRole } from "@/lib/mobile-models";

type Consultant = {
  id: string;
  name?: string;
  displayName?: string;
  specialization?: string;
  qualification?: string;
  hospital?: string;
  institute?: string;
  affiliatedInstitution?: string | null;
  registeredOrganization?: string | null;
  city?: string;
  photo?: string | null;
  profilePhoto?: string | null;
  photoUrl?: string | null;
  portfolio?: string | null;
  portfolioPhotos?: Array<{ id: string; filename: string; url: string }>;
  consultationFee?: string;
  computedCustomerPrice?: string;
  yearsOfExperience?: number | string;
  nextAvailableSlot: BookableSlot | null;
};

type BookableSlot = { date: string; start: string; end: string; appointmentSlot: string };
type SlotDate = { date: string; slots: BookableSlot[] };
type SlotsResponse = { dates: SlotDate[] };
const SPECIALTIES = ["All", "Critical Care", "Nephrology", "Orthopedics", "Cardiology"];

function istDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function absoluteFileUrl(uri?: string | null) {
  if (!uri) return undefined;
  return /^https?:\/\//i.test(uri)
    ? uri
    : `${getBaseUrl()}${uri.startsWith("/") ? uri : `/${uri}`}`;
}

function shiftDate(value: string, amount: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount, 12));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function monthDistance(start: string, end: string) {
  const [startYear, startMonth] = start.split("-").map(Number);
  const [endYear, endMonth] = end.split("-").map(Number);
  return (endYear - startYear) * 12 + endMonth - startMonth;
}

function prettyDate(value: string, options: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { ...options, timeZone: "Asia/Kolkata" }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function timeLabel(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

export default function NewConsultationScreen() {
  const palette = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { user, callbackDevices, callbackDevicesLoading, callbackDevicesError, refreshCallbackDevices } = useAuth();
  const seeker = isSeekerRole(user?.role);
  const [step, setStep] = useState<"explore" | "details">("explore");
  const [specialty, setSpecialty] = useState("All");
  const [todayOnly, setTodayOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<{ consultant: Consultant; slot: BookableSlot } | null>(null);
  const [slotConsultant, setSlotConsultant] = useState<Consultant | null>(null);
  const [portfolioConsultant, setPortfolioConsultant] = useState<Consultant | null>(null);
  const [slotSheetOpen, setSlotSheetOpen] = useState(false);
  const [slotDate, setSlotDate] = useState(istDate(new Date()));
  const [monthView, setMonthView] = useState(false);
  const [monthOffset, setMonthOffset] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [allergyNotSpecified, setAllergyNotSpecified] = useState(true);
  const [reportFiles, setReportFiles] = useState<AttachmentDraft[]>([]);
  const [chartFiles, setChartFiles] = useState<AttachmentDraft[]>([]);
  const [createdBooking, setCreatedBooking] = useState<{ id?: string } | null>(null);
  const [attachmentUploadError, setAttachmentUploadError] = useState<string | null>(null);
  const [attachmentUploadBlocked, setAttachmentUploadBlocked] = useState(false);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const [selectedCallbackDeviceId, setSelectedCallbackDeviceId] = useState<string | null>(null);
  const [form, setForm] = useState({
    patientName: "", patientAge: "", patientGender: "", patientPhone: "", patientWeight: "", uhidIpNumber: "",
    allergies: "", comorbidities: "", presentingComplaint: "",
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
  const currentInstallation = useQuery<string>({
    queryKey: ["mobile-push-device-id"],
    queryFn: getPushDeviceId,
    staleTime: Infinity,
  });
  const eligibleCallbackDevices = callbackDevices.filter((device) =>
    !!device.staffName?.trim() && !!device.installationId?.trim()
  );
  const linkedCurrentDevice = eligibleCallbackDevices.find((device) => device.installationId === currentInstallation.data);
  const effectiveCallbackDeviceId = selectedCallbackDeviceId
    ? eligibleCallbackDevices.some((device) => device.id === selectedCallbackDeviceId) ? selectedCallbackDeviceId : null
    : linkedCurrentDevice?.id || null;
  const slotsQuery = useQuery<SlotsResponse>({
    queryKey: ["mobile-bookable-slots", slotConsultant?.id, slotDate],
    enabled: !!slotConsultant && slotSheetOpen,
    queryFn: async () => {
      if (!slotConsultant) throw new Error("Choose a consultant");
      const start = istDate(new Date());
      const end = shiftDate(start, 29);
      const response = await apiFetch(`/api/consultants/${encodeURIComponent(slotConsultant.id)}/bookable-slots?start=${start}&end=${end}`);
      if (!response.ok) throw new Error("Current availability could not be loaded. Please refresh.");
      return response.json();
    },
    staleTime: 0,
  });
  const portfolioQuery = useQuery<Consultant>({
    queryKey: ["mobile-consultant-profile", portfolioConsultant?.id],
    enabled: !!portfolioConsultant,
    queryFn: async () => {
      if (!portfolioConsultant) throw new Error("Choose a consultant");
      const response = await apiFetch(`/api/consultants/${encodeURIComponent(portfolioConsultant.id)}`);
      if (!response.ok) throw new Error("Consultant profile could not be loaded.");
      return response.json();
    },
  });
  const datesWithSlots = useMemo(() => new Map((slotsQuery.data?.dates || []).map((item) => [item.date, item.slots])), [slotsQuery.data]);
  const filtered = useMemo(() => (consultants.data || []).filter((item) => {
    const text = `${item.displayName || item.name || ""} ${item.specialization || ""} ${item.affiliatedInstitution || item.hospital || item.institute || ""}`.toLowerCase();
    const specialtyMatch = specialty === "All" || (item.specialization || "").toLowerCase().includes(specialty.toLowerCase());
    const availabilityMatch = !todayOnly || item.nextAvailableSlot?.date === istDate(new Date());
    return specialtyMatch && text.includes(search.trim().toLowerCase()) && availabilityMatch;
  }).sort((a, b) => {
    if (!a.nextAvailableSlot) return b.nextAvailableSlot ? 1 : 0;
    if (!b.nextAvailableSlot) return -1;
    return `${a.nextAvailableSlot.date}T${a.nextAvailableSlot.start}`.localeCompare(`${b.nextAvailableSlot.date}T${b.nextAvailableSlot.start}`);
  }), [consultants.data, search, specialty, todayOnly]);

  const openSlots = (consultant: Consultant) => {
    if (!consultant.nextAvailableSlot) return;
    const today = istDate(new Date());
    const nextMonth = monthDistance(today, consultant.nextAvailableSlot.date);
    setSlotConsultant(consultant);
    setSlotDate(consultant.nextAvailableSlot.date);
    setMonthView(shiftDate(today, 13) < consultant.nextAvailableSlot.date);
    setMonthOffset(nextMonth);
    setSlotSheetOpen(true);
  };
  const chooseSlot = (consultant: Consultant, slot: BookableSlot) => {
    setSelected({ consultant, slot });
    setSlotSheetOpen(false);
    setStep("details");
  };

  const finishBooking = (booking: { id?: string }) => {
    queryClient.invalidateQueries({ queryKey: ["consultations"] });
    setConfirming(false);
    router.replace(booking.id ? `/case-file/${booking.id}` : "/(tabs)");
  };

  const uploadBookingDocuments = async (booking: { id?: string }) => {
    if (!booking.id) {
      setAttachmentUploadError("The booking was saved, but its Case File could not be identified.");
      setAttachmentUploadBlocked(true);
      return;
    }
    setUploadingAttachments(true);
    setAttachmentUploadError(null);
    setAttachmentUploadBlocked(false);
    try {
      for (const file of reportFiles) {
        await uploadCaseFileAttachment(booking.id, file, "general");
        setReportFiles((current) => current.filter((item) => item !== file));
      }
      for (const file of chartFiles) {
        await uploadCaseFileAttachment(booking.id, file, "treatment_chart");
        setChartFiles((current) => current.filter((item) => item !== file));
      }
      setCreatedBooking(null);
      finishBooking(booking);
    } catch (error) {
      setAttachmentUploadError(error instanceof Error ? error.message : "Please retry the document uploads.");
      setAttachmentUploadBlocked(error instanceof CaseFileAttachmentUploadError && error.status >= 400 && error.status < 500);
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
      AppAlert.alert("Could not add file", error instanceof Error ? error.message : "Choose a supported document and try again.");
    }
  };

  const book = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Choose a consultant and slot");
      if (seeker && !effectiveCallbackDeviceId) throw new Error("Choose an eligible staff member and device for this consultation.");
      const response = await apiFetch("/api/bookings", {
        method: "POST",
        body: JSON.stringify({
          bookingType: "consultation",
          serviceId: selected.consultant.id,
          serviceName: selected.consultant.specialization || selected.consultant.displayName || selected.consultant.name || "Consultation",
          providerName: selected.consultant.displayName || selected.consultant.name,
          appointmentSlot: selected.slot.appointmentSlot,
          bookableStart: selected.slot.date,
          start: selected.slot.start,
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
          provisionalDiagnosis: form.provisionalDiagnosis.trim() || undefined,
          examination: form.examination.trim() || undefined,
          investigations: form.investigations.trim() || undefined,
          amount: selected.consultant.computedCustomerPrice || selected.consultant.consultationFee || "0",
          urgency: "routine",
          status: "booked",
          ...(seeker ? { callbackDeviceId: effectiveCallbackDeviceId } : {}),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 409) {
          throw new Error("That slot is no longer available. Refresh availability and choose a new time.");
        }
        throw new Error(body.message || "Booking failed");
      }
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
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: ["mobile-bookable-slots"] });
      void queryClient.invalidateQueries({ queryKey: ["mobile-consultants"] });
    },
  });

  const valid = !!selected && (!seeker || (!!effectiveCallbackDeviceId && !callbackDevicesLoading && !currentInstallation.isLoading)) && !!form.patientName.trim() && !!form.patientAge && !!form.patientGender && !!form.patientPhone.trim() && !!form.presentingComplaint.trim() && (allergyNotSpecified || !!form.allergies.trim());
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <View style={[styles.screen, { backgroundColor: palette.background, paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={[styles.header, { backgroundColor: palette.card, borderBottomColor: palette.border }]}>
        <Pressable onPress={() => step === "details" ? setStep("explore") : router.back()} style={[styles.iconButton, { backgroundColor: palette.accent }]}><Feather name="arrow-left" size={21} color={palette.foreground} /></Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: palette.quiet }]}>New Consultation</Text>
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
              <Pressable key={item} onPress={() => setSpecialty(item)} style={[styles.chip, { backgroundColor: specialty === item ? palette.primary : palette.card, borderColor: specialty === item ? palette.primary : palette.border }]}>
                <Text style={[styles.chipText, { color: specialty === item ? palette.primaryForeground : palette.foreground }]}>{item}</Text>
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
            <View style={styles.loadingCards}>{[0, 1, 2].map((item) => <View key={item} style={[styles.skeletonCard, { backgroundColor: palette.card, borderColor: palette.border }]}><View style={[styles.skeletonAvatar, { backgroundColor: palette.accent }]} /><View style={{ flex: 1, gap: 8 }}><View style={[styles.skeletonLine, { backgroundColor: palette.accent, width: "65%" }]} /><View style={[styles.skeletonLine, { backgroundColor: palette.accent, width: "88%" }]} /></View></View>)}</View>
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
            <ConsultantCard
              key={consultant.id}
              consultant={consultant}
              onChoose={(slot) => chooseSlot(consultant, slot)}
              onOpenPortfolio={() => setPortfolioConsultant(consultant)}
              onOpenSlots={() => openSlots(consultant)}
            />
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
          <Pressable onPress={() => setStep("explore")} style={[styles.selectedCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <View style={[styles.photo, { backgroundColor: palette.accent }]}><Feather name="user" size={22} color={palette.mutedForeground} /></View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.selectedName, { color: palette.foreground }]}>{selected?.consultant.displayName || selected?.consultant.name}</Text>
              <Text style={[styles.selectedMeta, { color: palette.quiet }]}>{selected?.consultant.specialization} · {selected ? `${prettyDate(selected.slot.date)} · ${timeLabel(selected.slot.start)}` : ""}</Text>
            </View>
              <Text style={{ color: palette.primary, fontSize: 11, fontFamily: "Inter_700Bold" }}>Change</Text>
          </Pressable>
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
          {seeker && (
            <>
              <Text style={[styles.sectionTitle, { color: palette.foreground }]}>Assign staff and device*</Text>
              <Text style={{ color: palette.mutedForeground, fontSize: 12, lineHeight: 18 }}>
                Choose the registered staff member and installation responsible for this consultation. This can be handed off between shifts.
              </Text>
              {callbackDevicesLoading || currentInstallation.isLoading ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}><ActivityIndicator size="small" color={palette.primary} /><Text style={{ color: palette.mutedForeground }}>Loading eligible staff and devices…</Text></View>
              ) : callbackDevicesError ? (
                <View style={{ gap: 8 }}>
                  <Text style={{ color: palette.destructive }}>{callbackDevicesError}</Text>
                  <Pressable onPress={() => void refreshCallbackDevices()}><Text style={{ color: palette.primary, fontFamily: "Inter_600SemiBold" }}>Try again</Text></Pressable>
                </View>
              ) : eligibleCallbackDevices.length ? (
                <View style={{ gap: 8 }}>
                  {eligibleCallbackDevices.map((device) => {
                    const active = effectiveCallbackDeviceId === device.id;
                    return (
                      <Pressable
                        key={device.id}
                        onPress={() => setSelectedCallbackDeviceId(device.id)}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: active }}
                        style={[styles.selectedCard, { backgroundColor: active ? `${palette.primary}12` : palette.card, borderColor: active ? palette.primary : palette.border }]}
                        testID={`staff-device-choice-${device.id}`}
                      >
                        <Feather name={active ? "check-circle" : "smartphone"} size={19} color={active ? palette.primary : palette.mutedForeground} />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.selectedName, { color: palette.foreground }]}>{device.staffName}</Text>
                          <Text style={[styles.selectedMeta, { color: palette.quiet }]}>{device.deviceName}{device.installationId === currentInstallation.data ? " · This installation · default" : ""}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  <Text style={{ color: palette.destructive }}>No eligible staff/device pairs are registered. Each pair needs a staff name and linked installation.</Text>
                  <Pressable onPress={() => router.push("/callback-device")}><Text style={{ color: palette.primary, fontFamily: "Inter_600SemiBold" }}>Manage registered devices</Text></Pressable>
                </View>
              )}
            </>
          )}
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
            <Text style={[styles.bookButtonText, { color: valid ? palette.primaryForeground : palette.mutedForeground }]}>Book Consultation</Text>
          </Pressable>
        </KeyboardAwareScrollViewCompat>
      )}

      <Modal visible={slotSheetOpen} transparent animationType="slide" onRequestClose={() => setSlotSheetOpen(false)}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSlotSheetOpen(false)} />
          <View style={[styles.slotSheet, { backgroundColor: palette.card, paddingBottom: Math.max(insets.bottom, 12) }]}>
            <View style={[styles.sheetHandle, { backgroundColor: palette.border }]} />
            <View style={styles.sheetHeading}>
              <View style={[styles.photo, styles.sheetPhoto, { backgroundColor: palette.accent }]}>
                {slotConsultant?.photo || slotConsultant?.profilePhoto
                  ? <Image source={{ uri: slotConsultant.photo || slotConsultant.profilePhoto || "" }} style={styles.imagePhoto} />
                  : <Feather name="user" size={20} color={palette.mutedForeground} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={[styles.consultantName, { color: palette.foreground }]}>{slotConsultant?.displayName || slotConsultant?.name}</Text>
                <Text style={[styles.specialization, { color: palette.primary }]}>{slotConsultant?.specialization || "Consultant"}</Text>
              </View>
              <Pressable onPress={() => setSlotSheetOpen(false)} style={[styles.closeButton, { backgroundColor: palette.accent }]} accessibilityLabel="Close available slots">
                <Feather name="x" size={18} color={palette.foreground} />
              </Pressable>
            </View>
            <View style={[styles.dateArea, { borderBottomColor: palette.border }]}>
              {!monthView ? (
                <View style={styles.dateStripRow}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateStrip}>
                    {Array.from({ length: 14 }, (_, index) => shiftDate(istDate(new Date()), index)).map((date) => {
                      const hasSlots = (datesWithSlots.get(date) || []).length > 0;
                      const active = slotDate === date;
                      return (
                        <Pressable key={date} disabled={!hasSlots} onPress={() => setSlotDate(date)} style={[styles.dateChip, { borderColor: active ? palette.primary : palette.border, backgroundColor: active ? palette.primary : palette.card, opacity: hasSlots ? 1 : 0.36 }]}>
                           <Text style={[styles.dateDow, { color: active ? palette.primaryForeground : palette.mutedForeground }]}>{prettyDate(date, { weekday: "short" })}</Text>
                           <Text style={[styles.dateNumber, { color: active ? palette.primaryForeground : palette.foreground }]}>{Number(date.slice(-2))}</Text>
                           <Text style={[styles.dateMonth, { color: active ? palette.primaryForeground : palette.mutedForeground }]}>{prettyDate(date, { month: "short" })}</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                  <Pressable onPress={() => { setMonthView(true); setMonthOffset(0); }} style={[styles.calendarButton, { borderColor: palette.border, backgroundColor: palette.card }]} accessibilityLabel="Choose a date within 30 days">
                    <Feather name="calendar" size={19} color={palette.foreground} />
                  </Pressable>
                </View>
              ) : (
                <View style={styles.monthPanel}>
                  <View style={styles.monthHeader}>
                    <Pressable onPress={() => setMonthOffset((value) => Math.max(0, value - 1))} disabled={monthOffset === 0} style={{ padding: 6, opacity: monthOffset === 0 ? 0.3 : 1 }}><Feather name="chevron-left" size={19} color={palette.foreground} /></Pressable>
                    <Text style={[styles.monthTitle, { color: palette.foreground }]}>{(() => {
                      const [year, month] = istDate(new Date()).split("-").map(Number);
                      return prettyDate(new Date(Date.UTC(year, month - 1 + monthOffset, 1, 12)).toISOString().slice(0, 10), { month: "long", year: "numeric" });
                    })()}</Text>
                    <Pressable onPress={() => setMonthOffset((value) => Math.min(monthDistance(istDate(new Date()), shiftDate(istDate(new Date()), 29)), value + 1))} disabled={monthOffset >= monthDistance(istDate(new Date()), shiftDate(istDate(new Date()), 29))} style={{ padding: 6, opacity: monthOffset >= monthDistance(istDate(new Date()), shiftDate(istDate(new Date()), 29)) ? 0.3 : 1 }}><Feather name="chevron-right" size={19} color={palette.foreground} /></Pressable>
                  </View>
                  <View style={styles.calendarGrid}>
                    {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => <Text key={`${day}-${index}`} style={[styles.calendarDow, { color: palette.mutedForeground }]}>{day}</Text>)}
                    {(() => {
                      const base = istDate(new Date());
                      const [baseYear, baseMonth] = base.split("-").map(Number);
                      const firstMonth = new Date(Date.UTC(baseYear, baseMonth - 1 + monthOffset, 1, 12));
                      const year = firstMonth.getUTCFullYear();
                      const month = firstMonth.getUTCMonth() + 1;
                      const offset = (firstMonth.getUTCDay() + 6) % 7;
                      const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
                      return [...Array.from({ length: offset }, (_, i) => <View key={`blank-${i}`} style={styles.calendarDay} />), ...Array.from({ length: count }, (_, i) => {
                        const day = i + 1;
                        const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                        const inRange = date >= base && date <= shiftDate(base, 29);
                        const available = (datesWithSlots.get(date) || []).length > 0;
                        const active = slotDate === date;
                        return <Pressable key={date} disabled={!inRange || !available} onPress={() => { setSlotDate(date); setMonthView(false); }} style={[styles.calendarDay, active && { backgroundColor: palette.primary }]}><Text style={{ color: active ? palette.primaryForeground : inRange && available ? palette.foreground : palette.muted, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>{day}</Text></Pressable>;
                      })];
                    })()}
                  </View>
                  <Pressable onPress={() => setMonthView(false)} style={{ alignItems: "center", paddingTop: 8 }}><Text style={{ color: palette.primary, fontSize: 11, fontFamily: "Inter_700Bold" }}>Back to next 14 days</Text></Pressable>
                </View>
              )}
            </View>
            <ScrollView style={styles.slotScroll} contentContainerStyle={styles.slotScrollContent}>
              {slotsQuery.isFetching && !slotsQuery.data ? (
                <View style={{ gap: 11, paddingTop: 14 }}>{[0, 1, 2].map((item) => <View key={item} style={[styles.slotSkeleton, { backgroundColor: palette.accent }]} />)}</View>
              ) : slotsQuery.isError ? (
                <View style={styles.slotError}>
                  <Feather name="refresh-cw" size={22} color={palette.primary} />
                  <Text style={[styles.emptyTitle, { color: palette.foreground }]}>Availability changed</Text>
                  <Text style={[styles.emptyHint, { color: palette.mutedForeground }]}>Refresh to check the latest bookable times.</Text>
                  <Pressable onPress={() => void slotsQuery.refetch()} style={[styles.refreshButton, { backgroundColor: palette.primary }]}><Text style={styles.refreshButtonText}>Refresh slots</Text></Pressable>
                </View>
              ) : (datesWithSlots.get(slotDate) || []).length ? (
                <>
                  <Text style={[styles.slotSummary, { color: palette.mutedForeground }]}>{prettyDate(slotDate, { weekday: "long", month: "long", day: "numeric" })}</Text>
                  {(["Morning", "Afternoon", "Evening"] as const).map((group) => {
                    const groupSlots = (datesWithSlots.get(slotDate) || []).filter((slot) => {
                      const hour = Number(slot.start.split(":")[0]);
                      return group === "Morning" ? hour < 12 : group === "Afternoon" ? hour >= 12 && hour < 17 : hour >= 17;
                    });
                    if (!groupSlots.length) return null;
                    return <View key={group}>
                      <Text style={[styles.slotGroupTitle, { color: palette.mutedForeground }]}>{group}</Text>
                      <View style={styles.slotGrid}>{groupSlots.map((slot) => <Pressable key={`${slot.date}-${slot.start}`} onPress={() => slotConsultant && chooseSlot(slotConsultant, slot)} style={[styles.slotChoice, { borderColor: palette.border, backgroundColor: palette.card }]}><Text style={[styles.slotChoiceText, { color: palette.foreground }]}>{timeLabel(slot.start)}</Text></Pressable>)}</View>
                    </View>;
                  })}
                </>
              ) : (
                <View style={styles.slotEmpty}>
                  <Feather name="calendar" size={22} color={palette.mutedForeground} />
                  <Text style={[styles.emptyTitle, { color: palette.foreground }]}>No slots on this date</Text>
                  <Text style={[styles.emptyHint, { color: palette.mutedForeground }]}>Choose a highlighted day to see available times.</Text>
                </View>
              )}
            </ScrollView>
            <View style={[styles.slotFooter, { borderTopColor: palette.border }]}>
              <Text style={[styles.footerText, { color: palette.mutedForeground }]}>All times IST · 30-minute consultation</Text>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!portfolioConsultant}
        transparent
        animationType="slide"
        onRequestClose={() => setPortfolioConsultant(null)}
      >
        <View style={styles.portfolioBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setPortfolioConsultant(null)}
            accessibilityLabel="Close consultant profile"
          />
          <View style={[styles.portfolioSheet, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <View style={styles.portfolioHeader}>
              <Text style={[styles.portfolioHeaderTitle, { color: palette.foreground }]}>Consultant profile</Text>
              <Pressable
                onPress={() => setPortfolioConsultant(null)}
                style={[styles.closeButton, { backgroundColor: palette.accent }]}
                accessibilityLabel="Close consultant profile"
              >
                <Feather name="x" size={18} color={palette.foreground} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.portfolioContent}>
              {(() => {
                const profile = portfolioQuery.data || portfolioConsultant;
                if (!profile) return null;
                const profilePhoto = absoluteFileUrl(profile.photoUrl || profile.photo || profile.profilePhoto);
                const hospital = profile.affiliatedInstitution || profile.hospital || profile.institute || "Hospital not listed";
                return (
                  <>
                    <View style={styles.portfolioLead}>
                      <View style={[styles.portfolioAvatar, { backgroundColor: palette.accent }]}>
                        {profilePhoto
                          ? <Image source={{ uri: profilePhoto }} style={styles.portfolioAvatarImage} />
                          : <Feather name="user" size={30} color={palette.mutedForeground} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.portfolioName, { color: palette.foreground }]}>{profile.displayName || profile.name || "Consultant"}</Text>
                        <Text style={[styles.portfolioMeta, { color: palette.primary }]}>{profile.specialization || "Specialist"}</Text>
                        <Text style={[styles.portfolioMeta, { color: palette.mutedForeground }]}>{profile.qualification || "Verified provider"}</Text>
                        <Text style={[styles.portfolioMeta, { color: palette.mutedForeground }]}>{hospital}</Text>
                      </View>
                    </View>
                    {portfolioQuery.isLoading ? (
                      <ActivityIndicator color={palette.primary} style={{ marginVertical: 12 }} />
                    ) : portfolioQuery.isError ? (
                      <View style={styles.portfolioEmpty}>
                        <Text style={[styles.emptyHint, { color: palette.mutedForeground }]}>Consultant portfolio could not be loaded.</Text>
                        <Pressable onPress={() => void portfolioQuery.refetch()} accessibilityRole="button">
                          <Text style={[styles.allSlotsText, { color: palette.primary }]}>Try again</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <>
                        {!!profile.portfolio && (
                          <>
                            <Text style={[styles.portfolioSectionTitle, { color: palette.foreground }]}>ABOUT</Text>
                            <Text style={[styles.portfolioDescription, { color: palette.mutedForeground }]}>{profile.portfolio}</Text>
                          </>
                        )}
                        <Text style={[styles.portfolioSectionTitle, { color: palette.foreground }]}>PORTFOLIO</Text>
                        {profile.portfolioPhotos?.length ? (
                          <View style={styles.portfolioPhotoGrid}>
                            {profile.portfolioPhotos.map((photo) => {
                              const photoUri = absoluteFileUrl(photo.url);
                              return photoUri ? (
                                <Image
                                  key={photo.id}
                                  source={{ uri: photoUri }}
                                  style={styles.portfolioPhotoTile}
                                  accessibilityLabel={photo.filename || "Consultant portfolio photo"}
                                />
                              ) : null;
                            })}
                          </View>
                        ) : (
                          <Text style={[styles.portfolioDescription, { color: palette.mutedForeground }]}>No portfolio photos shared yet.</Text>
                        )}
                      </>
                    )}
                  </>
                );
              })()}
            </ScrollView>
          </View>
        </View>
      </Modal>

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
            <Text style={[styles.confirmMeta, { color: palette.mutedForeground }]}>{selected ? `${prettyDate(selected.slot.date)} · ${timeLabel(selected.slot.start)}` : ""}</Text>
            <View style={[styles.postpaid, { backgroundColor: palette.accent }]}>
              <Feather name="info" size={16} color={palette.foreground} />
              <Text style={[styles.postpaidText, { color: palette.foreground }]}>Postpaid, billed later. Booking cannot be undone in this app.</Text>
            </View>
            {!!book.error && <>
              <Text style={[styles.error, { color: palette.primary }]}>{book.error.message}</Text>
              <Pressable onPress={() => {
                const consultant = selected?.consultant;
                setConfirming(false);
                if (consultant) {
                  setSlotConsultant(consultant);
                  setSlotDate(istDate(new Date()));
                  setSlotSheetOpen(true);
                  void queryClient.invalidateQueries({ queryKey: ["mobile-bookable-slots", consultant.id] });
                }
              }} style={{ paddingVertical: 9 }}>
                <Text style={{ color: palette.primary, fontSize: 12, fontFamily: "Inter_700Bold" }}>Refresh availability and choose another slot</Text>
              </Pressable>
            </>}
            {!!attachmentUploadError && (
              <Text accessibilityRole="alert" style={[styles.error, { color: palette.primary }]}>
                {attachmentUploadBlocked
                  ? `Booking saved, but remaining files could not be added: ${attachmentUploadError}`
                  : `Booking saved, but some files need a retry: ${attachmentUploadError}`}
              </Text>
            )}
            <Pressable
              onPress={() => createdBooking
                ? attachmentUploadBlocked ? finishBooking(createdBooking) : void uploadBookingDocuments(createdBooking)
                : book.mutate()}
              disabled={book.isPending || uploadingAttachments}
              style={[styles.bookButton, { backgroundColor: palette.primary, opacity: book.isPending || uploadingAttachments ? 0.75 : 1 }]}
            >
              {book.isPending || uploadingAttachments
                ? <ActivityIndicator color={palette.primaryForeground} />
                : <Text style={[styles.bookButtonText, { color: palette.primaryForeground }]}>
                    {createdBooking && attachmentUploadBlocked
                      ? "Open Case File"
                      : createdBooking && attachmentUploadError ? "Retry document uploads" : "Confirm Booking"}
                  </Text>}
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ConsultantCard({
  consultant,
  onChoose,
  onOpenPortfolio,
  onOpenSlots,
}: {
  consultant: Consultant;
  onChoose: (slot: BookableSlot) => void;
  onOpenPortfolio: () => void;
  onOpenSlots: () => void;
}) {
  const palette = useColors();
  const next = consultant.nextAvailableSlot;
  const photo = absoluteFileUrl(consultant.photoUrl || consultant.photo || consultant.profilePhoto);
  const name = consultant.displayName || consultant.name || "Consultant";
  const affiliation = consultant.affiliatedInstitution || consultant.hospital || consultant.institute || "Hospital not listed";
  return (
    <View style={[styles.consultantCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
      <Pressable
        onPress={onOpenPortfolio}
        accessibilityRole="button"
        accessibilityLabel={`View ${name}'s portfolio`}
        style={styles.cardMain}
      >
        <View style={[styles.cardPhoto, { backgroundColor: palette.accent }]}>
          {photo ? <Image source={{ uri: photo }} style={styles.cardImage} /> : <Feather name="user" size={23} color={palette.mutedForeground} />}
        </View>
        <View style={styles.cardCopy}>
          <Text numberOfLines={1} style={[styles.consultantName, { color: palette.foreground }]}>{name}</Text>
          <Text numberOfLines={1} style={[styles.specialization, { color: palette.primary }]}>{consultant.specialization || "Specialist"}</Text>
          <Text numberOfLines={2} style={[styles.credentials, { color: palette.mutedForeground }]}>{consultant.qualification || "Verified provider"} · {affiliation}</Text>
        </View>
        <Feather name="chevron-right" size={17} color={palette.mutedForeground} />
      </Pressable>
      <View style={[styles.nextRow, { borderTopColor: palette.border }]}>
        {next ? <>
          <View style={{ flex: 1 }}>
            <Text style={[styles.nextLabel, { color: palette.mutedForeground }]}>NEXT AVAILABLE</Text>
            <Pressable onPress={() => onChoose(next)} style={styles.nextChip}>
              <Feather name="clock" size={13} color={palette.success} />
              <Text style={styles.nextChipText}>{next.appointmentSlot || `${prettyDate(next.date)} · ${timeLabel(next.start)}`}</Text>
            </Pressable>
          </View>
          <Pressable onPress={onOpenSlots} style={styles.allSlots} accessibilityRole="button">
            <Text style={[styles.allSlotsText, { color: palette.primary }]}>All slots</Text><Feather name="chevron-right" size={15} color={palette.primary} />
          </Pressable>
        </> : <View style={[styles.bookedOut, { backgroundColor: palette.accent }]}>
          <Feather name="minus-circle" size={14} color={palette.mutedForeground} />
          <Text style={[styles.bookedOutText, { color: palette.mutedForeground }]}>Fully booked for now</Text>
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
  header: { minHeight: 68, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontFamily: "Sora_600SemiBold", letterSpacing: -0.2 },
  headerStep: { fontSize: 10, marginTop: 2, fontFamily: "Inter_400Regular" },
  content: { padding: designTokens.spacing.gutter, gap: designTokens.spacing.md },
  search: { height: 48, borderRadius: designTokens.radius.medium, borderWidth: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, gap: 8, shadowColor: designTokens.shadow.card.color, shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  searchInput: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },
  chips: { gap: 8, paddingVertical: 2 },
  chip: { minHeight: 40, borderRadius: designTokens.radius.pill, borderWidth: 1, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" },
  chipText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  toggleRow: { borderWidth: 1, borderRadius: designTokens.radius.card, padding: 14, flexDirection: "row", alignItems: "center", shadowColor: designTokens.shadow.card.color, shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  toggleTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  toggleHint: { fontSize: 10, marginTop: 3, fontFamily: "Inter_400Regular" },
  consultantCard: { minHeight: 164, borderRadius: designTokens.radius.card, borderWidth: 1, padding: 14, marginBottom: 12, justifyContent: "space-between", shadowColor: designTokens.shadow.card.color, shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  cardMain: { height: 72, flexDirection: "row", gap: 12, alignItems: "center" },
  cardPhoto: { width: 56, height: 56, borderRadius: 18, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  cardImage: { width: "100%", height: "100%" },
  cardCopy: { flex: 1, justifyContent: "center" },
  photo: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  consultantName: { fontSize: 15, fontFamily: "Sora_600SemiBold", letterSpacing: -0.15 },
  specialization: { fontSize: 12, fontFamily: "Inter_700Bold", marginTop: 3 },
  credentials: { fontSize: 10, lineHeight: 14, fontFamily: "Inter_400Regular", marginTop: 3 },
  nextRow: { minHeight: 58, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 8 },
  nextLabel: { fontSize: 9, letterSpacing: 0.6, fontFamily: "Inter_700Bold", marginBottom: 4 },
  nextChip: { minHeight: 40, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, borderRadius: designTokens.radius.small, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: designTokens.color.greenTint },
  nextChipText: { color: designTokens.color.green, fontFamily: "Inter_700Bold", fontSize: 10 },
  allSlots: { minHeight: 44, flexDirection: "row", alignItems: "center", paddingLeft: 8, paddingBottom: 2 },
  allSlotsText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  bookedOut: { height: 32, flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 9, paddingHorizontal: 10 },
  bookedOutText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  loadingCards: { gap: 12, marginTop: 6 },
  skeletonCard: { height: 164, borderWidth: 1, borderRadius: designTokens.radius.card, padding: 14, flexDirection: "row", alignItems: "flex-start", gap: 12 },
  skeletonAvatar: { width: 54, height: 54, borderRadius: 27 },
  skeletonLine: { height: 10, borderRadius: 6 },
  selectedCard: { borderRadius: designTokens.radius.card, borderWidth: 1, padding: 14, flexDirection: "row", alignItems: "center", gap: 11, shadowColor: designTokens.shadow.card.color, shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  selectedName: { fontSize: 14, fontFamily: "Sora_600SemiBold" },
  selectedMeta: { fontSize: 11, fontFamily: "Inter_600SemiBold", marginTop: 4 },
  sectionTitle: { fontSize: 16, fontFamily: "Sora_600SemiBold", marginTop: 8, letterSpacing: -0.2 },
  twoCol: { flexDirection: "row", gap: 10 },
  field: { gap: 6 },
  label: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  input: { minHeight: 48, borderRadius: designTokens.radius.medium, borderWidth: 1, paddingHorizontal: 13, fontSize: 13, fontFamily: "Inter_400Regular", shadowColor: designTokens.shadow.card.color, shadowOpacity: 0.04, shadowRadius: 7, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
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
  bookButton: { minHeight: 52, borderRadius: designTokens.radius.pill, alignItems: "center", justifyContent: "center", marginTop: 3, shadowColor: designTokens.color.coral, shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  bookButtonText: { fontSize: 14, fontFamily: "Sora_600SemiBold" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,.38)", justifyContent: "flex-end" },
  confirmSheet: { padding: 20, borderTopLeftRadius: designTokens.radius.sheet, borderTopRightRadius: designTokens.radius.sheet, shadowColor: designTokens.shadow.elevated.color, shadowOpacity: 0.16, shadowRadius: 18, shadowOffset: { width: 0, height: -8 }, elevation: 6 },
  confirmTitle: { fontSize: 19, fontFamily: "Sora_600SemiBold", marginBottom: 18 },
  confirmLine: { fontSize: 16, fontFamily: "Inter_700Bold" },
  confirmMeta: { fontSize: 12, marginTop: 5, fontFamily: "Inter_400Regular" },
  postpaid: { borderRadius: 12, padding: 12, flexDirection: "row", gap: 9, marginTop: 18 },
  postpaidText: { flex: 1, fontSize: 11, lineHeight: 16, fontFamily: "Inter_500Medium" },
  error: { fontSize: 11, marginTop: 10, fontFamily: "Inter_500Medium" },
  slotSheet: { height: "84%", borderTopLeftRadius: designTokens.radius.sheet, borderTopRightRadius: designTokens.radius.sheet, overflow: "hidden", shadowColor: designTokens.shadow.elevated.color, shadowOpacity: 0.16, shadowRadius: 18, shadowOffset: { width: 0, height: -8 }, elevation: 6 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 10, marginBottom: 9 },
  sheetHeading: { flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 18, paddingBottom: 13 },
  sheetPhoto: { width: 42, height: 42, overflow: "hidden" },
  imagePhoto: { width: "100%", height: "100%", borderRadius: 21 },
  closeButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  dateArea: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 11 },
  dateStripRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16 },
  dateStrip: { gap: 7, paddingVertical: 2 },
  dateChip: { width: 49, height: 63, borderRadius: 11, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  dateDow: { fontSize: 9, fontFamily: "Inter_600SemiBold" },
  dateNumber: { fontSize: 15, fontFamily: "Inter_700Bold", marginTop: 1 },
  dateMonth: { fontSize: 8, fontFamily: "Inter_600SemiBold", marginTop: 1 },
  calendarButton: { width: 43, height: 62, borderRadius: 11, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  monthPanel: { paddingHorizontal: 19 },
  monthHeader: { height: 32, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  monthTitle: { fontSize: 13, fontFamily: "Inter_700Bold" },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap" },
  calendarDow: { width: "14.2857%", textAlign: "center", fontSize: 9, fontFamily: "Inter_700Bold", paddingVertical: 5 },
  calendarDay: { width: "14.2857%", height: 31, alignItems: "center", justifyContent: "center", borderRadius: 9 },
  slotScroll: { flex: 1 },
  slotScrollContent: { paddingHorizontal: 18, paddingTop: 13, paddingBottom: 14 },
  slotSummary: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  slotGroupTitle: { fontSize: 10, letterSpacing: 0.5, fontFamily: "Inter_700Bold", marginTop: 16, marginBottom: 8 },
  slotGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  slotChoice: { width: "31%", minHeight: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderRadius: designTokens.radius.small },
  slotChoiceText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  slotEmpty: { alignItems: "center", justifyContent: "center", paddingTop: 30, gap: 8 },
  slotError: { alignItems: "center", justifyContent: "center", paddingTop: 28, gap: 8 },
  emptyTitle: { fontSize: 13, fontFamily: "Inter_700Bold", textAlign: "center" },
  emptyHint: { fontSize: 11, lineHeight: 16, textAlign: "center", maxWidth: 240 },
  refreshButton: { borderRadius: 18, paddingHorizontal: 16, paddingVertical: 9, marginTop: 5 },
  refreshButtonText: { color: designTokens.color.card, fontSize: 11, fontFamily: "Inter_700Bold" },
  slotSkeleton: { height: 40, borderRadius: 10 },
  slotFooter: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 12, paddingHorizontal: 18 },
  footerText: { textAlign: "center", fontSize: 10, fontFamily: "Inter_500Medium" },
  portfolioBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.46)" },
  portfolioSheet: { maxHeight: "84%", borderTopLeftRadius: 22, borderTopRightRadius: 22, borderTopWidth: 1, paddingTop: 10 },
  portfolioHeader: { minHeight: 54, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  portfolioHeaderTitle: { fontSize: 16, fontFamily: "Sora_600SemiBold" },
  portfolioContent: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 26, gap: 12 },
  portfolioLead: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 5 },
  portfolioAvatar: { width: 76, height: 76, borderRadius: 38, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  portfolioAvatarImage: { width: "100%", height: "100%" },
  portfolioName: { fontSize: 17, lineHeight: 23, fontFamily: "Sora_600SemiBold" },
  portfolioMeta: { fontSize: 11, lineHeight: 17, fontFamily: "Inter_500Medium" },
  portfolioSectionTitle: { fontSize: 11, letterSpacing: 0.6, fontFamily: "Inter_700Bold", marginTop: 5 },
  portfolioDescription: { fontSize: 12, lineHeight: 19, fontFamily: "Inter_400Regular" },
  portfolioEmpty: { alignItems: "center", gap: 10, paddingVertical: 24 },
  portfolioPhotoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  portfolioPhotoTile: { width: "31%", aspectRatio: 1, borderRadius: 12, backgroundColor: designTokens.color.plumTint },
});