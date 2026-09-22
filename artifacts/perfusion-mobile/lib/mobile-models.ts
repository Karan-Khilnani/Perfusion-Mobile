export type Role = "provider" | "care_seeker" | "seeker";

export type Booking = {
  id: string;
  bookingNumber?: string | null;
  serviceName?: string | null;
  serviceType?: string | null;
  bookingType?: string | null;
  status: string;
  scheduledDate?: string | null;
  appointmentSlot?: string | null;
  timeSlot?: string | null;
  patientName?: string | null;
  patientAge?: number | null;
  patientGender?: string | null;
  providerName?: string | null;
  providerSpecialization?: string | null;
  providerCity?: string | null;
  providerHospital?: string | null;
  seekerHospitalName?: string | null;
  city?: string | null;
  hospitalName?: string | null;
  videoRoomId?: string | null;
  amount?: string | null;
  isFollowUp?: boolean;
  prescriptionApprovedAt?: string | null;
  postRxCallsEnabled?: boolean;
  postRxVideoEnabled?: boolean;
  caseFileUnreadAdvisories?: number;
};

export type CaseFileCapabilities = {
  canMessage: boolean;
  canAttach: boolean;
  canAddVitals: boolean;
  canComposeAdvisory: boolean;
  canToggleFollowUp: boolean;
  readOnly: boolean;
  callsEnabled: boolean;
  videoEnabled: boolean;
};

export type CaseFileSummary = {
  allergies?: string | null;
  comorbidities?: string | null;
  presentingComplaint?: string | null;
  workingDiagnosis?: string | null;
  clinicalHistory?: string | null;
  submittedByUserId?: string | null;
  submittedAt?: string | null;
};

export type CaseFileProfile = {
  allergies?: string | null;
  comorbidities?: string | null;
  baselineMedications?: string | null;
  baselineParameters?: string | null;
  pastAdmissions?: string | null;
  emergencyContact?: string | null;
};

export type Vital = {
  id: string;
  observedAt: string;
  systolicBp?: number | null;
  diastolicBp?: number | null;
  heartRate?: number | null;
  respiratoryRate?: number | null;
  intake?: number | null;
  output?: number | null;
  hourlyUrineOutput?: number | null;
  gcs?: number | null;
};

export type CaseFileMessage = {
  id: string;
  senderUserId: string;
  senderRole: string;
  kind: string;
  body?: string | null;
  createdAt: string;
  attachment?: {
    id: string;
    originalFilename?: string | null;
    byteSize?: number | null;
    category?: string | null;
    mimeType?: string | null;
  } | null;
};

export type Advisory = {
  id: string;
  narrative: string;
  authoredAt: string;
  authorUserId?: string;
};

export type CaseFileAggregate = {
  booking: Booking & {
    patientName: string;
    patientAge: number;
    patientGender?: string | null;
    providerName?: string | null;
    serviceName: string;
    appointmentSlot?: string | null;
    postRxCallsEnabled: boolean;
    postRxVideoEnabled: boolean;
  };
  capabilities: CaseFileCapabilities;
  summary: CaseFileSummary;
  profile: CaseFileProfile;
  latestVitals?: Vital | null;
  latestVitalsFreshness?: "fresh" | "aging" | "stale" | null;
  advisories?: Advisory[];
};

export function isSeekerRole(role?: string): boolean {
  return role === "care_seeker" || role === "seeker";
}

export function statusPresentation(status: string, colors: Record<string, string>) {
  const normalized = status.toLowerCase();
  if (normalized === "completed" || normalized === "report_ready") {
    return { label: "Completed", dot: colors.success, text: colors.success };
  }
  if (normalized === "cancelled" || normalized === "rejected" || normalized === "expired") {
    return { label: normalized[0].toUpperCase() + normalized.slice(1), dot: colors.terminal, text: colors.terminal };
  }
  if (normalized === "missed") {
    return { label: "Missed", dot: colors.warning, text: colors.warning };
  }
  if (normalized === "ongoing" || normalized === "in_progress" || normalized === "processing") {
    return { label: "Ongoing", dot: colors.quiet, text: colors.quiet };
  }
  return { label: "Scheduled", dot: colors.blue, text: colors.blue };
}

export function isTerminalStatus(status?: string) {
  return ["completed", "cancelled", "rejected", "expired", "missed"].includes((status || "").toLowerCase());
}

export function formatTime(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  }
  const match = value.match(/(\d{1,2}:\d{2})\s*(AM|PM)?/i);
  return match ? `${match[1]}${match[2] ? ` ${match[2].toUpperCase()}` : ""}` : value;
}

export function formatDate(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function formatRemainingWindow(value?: string | null) {
  if (!value) return null;
  const end = new Date(value).getTime();
  if (Number.isNaN(end)) return null;
  const hours = Math.max(0, Math.round((end - Date.now()) / 3_600_000));
  return hours > 24 ? `${Math.round(hours / 24)}d left` : `${hours}h left`;
}