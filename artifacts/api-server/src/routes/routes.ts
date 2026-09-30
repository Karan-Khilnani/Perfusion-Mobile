import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "../storage";
import { setupAuth, isAuthenticated, isLoggedIn, isAdmin, isProvider, updateUserRole } from "../auth";
import { registerAuthRoutes } from "../auth/routes";
import type { BookingStatus, UserRole, ProviderType, ProviderStatus, ServiceStatus } from "@workspace/db";
import { consultants, bookings } from "@workspace/db";
import { db, getPool } from "../db";
import { eq, or, and, isNotNull, notInArray, inArray, sql } from "drizzle-orm";
import { fireOneBooking } from "../services/consultation-scheduler";
import multer from "multer";
import path from "path";
import fs from "fs";
import { uploadFile as supabaseUpload, deletePublicFile, uploadPrivateCaseFile, downloadPrivateCaseFile, downloadLegacyCaseFile, createPrivateCaseFileSignedUrl, deletePrivateCaseFile } from "../services/supabase-storage";
import { notifyAdminLabBooking, notifyAdminConsultantBooking, notifyUserReportReady, cancelVoiceCall, triggerVoiceCall, triggerBridgeCall, formatPhoneNumber } from "../services/msg91";
import { generateBookingNumber } from "../services/booking-number";
import { calculateCustomerPrice, deriveMarginFromPrice, derivePriceFromMargin } from "../services/pricing";
import { processReport, type BookingReportData } from "../services/report-processor";
import { generateAndStorePrescriptionPdf, type PrescriptionPdfData } from "../services/prescription-pdf";
import { generateReceiptPdf, type ReceiptData, type ReceiptType } from "../services/receipt-pdf";
import { generateAndStoreAgreementPdf, type AgreementPdfData } from "../services/agreement-pdf";
import { AGREEMENT_VERSION, AGREEMENT_FULL_TEXT, partnerTypeLabel } from "../services/agreement-text";
import { sendPushNotification, getVapidPublicKey, type PushPayload } from "../services/push-notifications";
import { getCallWindow } from "../services/call-window";
import { resolveConsultationLifecycle } from "../services/consultation-lifecycle";
import { notifyMobileCallEnded, notifyMobileIncomingCall } from "../services/mobile-call-push";
import { getConsultantAvailabilityPreview, getConsultantBookableSlots } from "../services/consultant-availability";
import { normalizeComorbidities } from "../services/patient-comorbidities";
import { createHash, randomUUID } from "crypto";
import { inspectCaseFileVideo, isCaseFileVideo } from "../services/case-file-video";
import { StreamClient } from "@stream-io/node-sdk";
import {
  callbackDeviceAssignment,
  hasActiveCallbackAssignments,
  listDueCallbackDeviceReminders,
  migrateLegacyCallbackDevice,
} from "../services/consultation-callback-devices";
import {
  AssignConsultationCallbackDeviceBody,
  CreateConsultationDeviceBody,
  UpdateConsultationDeviceBody,
} from "@workspace/api-zod";

function callMediaProvider(videoRoomUrl?: string | null): "daily" | "stream" {
  return videoRoomUrl?.startsWith("stream://default/") ? "stream" : "daily";
}

function bookingIdFromStreamLink(roomUrl: string): string | null {
  const match = /^stream:\/\/booking\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(roomUrl);
  return match?.[1] ?? null;
}

type ConsultantBookedSlot = { status: string | null; appointmentSlot: string | null };

async function getConsultationSlotsForRange(
  consultantIds: string[],
  startDate: string,
  endDate: string,
): Promise<Map<string, ConsultantBookedSlot[]>> {
  const slotsByConsultant = new Map<string, ConsultantBookedSlot[]>();
  if (!consultantIds.length) return slotsByConsultant;

  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const datePatterns: string[] = [];
  for (let day = new Date(start); day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
    const year = day.getUTCFullYear();
    const dayOfMonth = day.getUTCDate();
    const monthShort = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(day).toLowerCase();
    const monthLong = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(day).toLowerCase();
    const months = monthShort === "sep" ? "sep|sept|september" : `${monthShort}|${monthLong}`;
    const dayText = String(dayOfMonth);
    const monthNumber = String(day.getUTCMonth() + 1).padStart(2, "0");
    const dateText = String(dayOfMonth).padStart(2, "0");
    datePatterns.push(
      `(?:^|[^0-9])${dayText}\\s+(?:${months})\\s+${year}(?:[^0-9]|$)`,
      `(?:^|[^a-z])(?:${months})\\s+${dayText},?\\s+${year}(?:[^0-9]|$)`,
      `${year}-${monthNumber}-${dateText}`,
    );
  }
  if (!datePatterns.length) return slotsByConsultant;

  const dateConditions = datePatterns.map(pattern => sql`${bookings.appointmentSlot} ~* ${pattern}`);
  const rows = await db.select({
    serviceId: bookings.serviceId,
    status: bookings.status,
    appointmentSlot: bookings.appointmentSlot,
  }).from(bookings).where(and(
    eq(bookings.bookingType, "consultation"),
    inArray(bookings.serviceId, consultantIds),
    notInArray(bookings.status, ["cancelled"]),
    isNotNull(bookings.appointmentSlot),
    or(...dateConditions),
  ));
  for (const row of rows) {
    if (!row.appointmentSlot) continue;
    const current = slotsByConsultant.get(row.serviceId) ?? [];
    current.push({ status: row.status, appointmentSlot: row.appointmentSlot });
    slotsByConsultant.set(row.serviceId, current);
  }
  return slotsByConsultant;
}

async function endStreamMediaSession(session: { videoRoomUrl: string; sessionGeneration: string }): Promise<void> {
  if (callMediaProvider(session.videoRoomUrl) !== "stream") return;
  const apiKey = process.env.STREAM_VIDEO_API_KEY;
  const apiSecret = process.env.STREAM_VIDEO_API_SECRET;
  if (!apiKey || !apiSecret) throw new Error("Stream Video is not configured");
  await new StreamClient(apiKey, apiSecret).video.call("default", session.sessionGeneration).end();
}

async function endStreamMediaSessionWithRetries(
  session: { videoRoomUrl: string; sessionGeneration: string },
  log: any,
  context: Record<string, unknown>,
): Promise<boolean> {
  const retryDelays = [0, 300, 900];
  let lastError: unknown;

  for (let attempt = 0; attempt < retryDelays.length; attempt++) {
    if (retryDelays[attempt] > 0) {
      await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]));
    }
    try {
      await endStreamMediaSession(session);
      return true;
    } catch (error) {
      lastError = error;
      log.warn({ ...context, err: error, attempt: attempt + 1 }, "Stream call cleanup attempt failed");
    }
  }

  log.error({ ...context, err: lastError }, "Stream call cleanup remains pending after retries");
  return false;
}

function sanitizeUserForClient<T extends Record<string, any> | undefined>(user: T) {
  if (!user) return user;
  const {
    password: _password,
    verificationCode: _verificationCode,
    verificationCodeExpiresAt: _verificationCodeExpiresAt,
    ...safeUser
  } = user;
  return safeUser;
}

function getLoginMethod(user: Record<string, any> | undefined) {
  if (!user) return "unavailable";
  if (user.googleId && !user.password) return "google";
  if (user.password) return "password";
  return "unavailable";
}

const CASE_FILE_CLOSED_STATUSES = new Set(["completed", "cancelled"]);
const CASE_FILE_SEEKER_CATEGORIES = new Set(["lab", "radiology", "treatment_chart", "general"]);

async function getCaseFileParticipant(bookingId: string, user: any) {
  const booking = await storage.getBookingById(bookingId);
  if (!booking) return { booking: null, allowed: false, isSeeker: false, isProvider: false, provider: null };
  const provider = booking.providerId ? await storage.getProviderById(booking.providerId) : null;
  const isSeeker = booking.userId === user?.id;
  const isProvider = user?.role === "provider" && provider?.userId === user?.id;
  const allowed = isSeeker || isProvider || user?.role === "admin";
  return { booking, allowed, isSeeker, isProvider, provider };
}

function caseFileReadOnly(booking: any) {
  const storedStatus = String(booking?.status || "").toLowerCase();
  if (CASE_FILE_CLOSED_STATUSES.has(storedStatus)) return true;
  if (booking?.bookingType !== "consultation") return false;
  const lifecycle = resolveConsultationLifecycle(booking);
  return !lifecycle.scheduleAvailable || lifecycle.status === "completed" || lifecycle.status === "cancelled";
}

function withConsultationLifecycle(booking: any) {
  if (booking?.bookingType !== "consultation") return booking;
  const lifecycle = resolveConsultationLifecycle(booking);
  return {
    ...booking,
    status: lifecycle.status,
    consultationLifecycleAvailable: lifecycle.scheduleAvailable,
    postRxCallsEnabled: lifecycle.scheduleAvailable && lifecycle.status === "ongoing",
    postRxVideoEnabled: lifecycle.scheduleAvailable && lifecycle.status === "ongoing",
  };
}

function caseFileFreshness(observedAt: Date | string | null) {
  if (!observedAt) return null;
  const age = Date.now() - new Date(observedAt).getTime();
  return age <= 60 * 60 * 1000 ? "fresh" : age <= 4 * 60 * 60 * 1000 ? "aging" : "stale";
}

async function syncLegacyCaseFileSummary(booking: any) {
  if (booking?.bookingType !== "consultation" || caseFileReadOnly(booking) || booking?.prescriptionApprovedAt) return;
  await getPool().query(`UPDATE case_file_summaries
    SET allergies = $2, working_diagnosis = $3,
        clinical_history = COALESCE($4, clinical_history), submitted_by_user_id = $5,
        submitted_at = COALESCE(submitted_at, now())
    WHERE booking_id = $1`, [
    booking.id,
    booking.patientAllergyNotSpecified ? null : booking.patientAllergies,
    booking.provisionalDiagnosis || null,
    booking.clinicalSummary || null,
    booking.userId,
  ]);
}

function enrichAdminBookingsWithAccessDetails(
  bookingRows: Record<string, any>[],
  userRows: Record<string, any>[],
  providerRows: Record<string, any>[],
) {
  const usersById = new Map(userRows.map((user) => [user.id, user]));
  const providersById = new Map(providerRows.map((provider) => [provider.id, provider]));

  return bookingRows.map((booking) => {
    const seeker = usersById.get(booking.userId);
    const provider = booking.providerId ? providersById.get(booking.providerId) : undefined;
    const providerUser = provider?.userId ? usersById.get(provider.userId) : undefined;

    return {
      ...booking,
      seekerLoginId: seeker?.email ?? null,
      seekerLoginMethod: getLoginMethod(seeker),
      providerLoginId: providerUser?.email ?? null,
      providerLoginMethod: getLoginMethod(providerUser),
    };
  });
}

// Daily.co API helper
async function createDailyRoom(roomName: string): Promise<{ url: string; name: string } | null> {
  const apiKey = process.env.DAILY_API_KEY;
  if (!apiKey) {
    console.error("DAILY_API_KEY not configured");
    return null;
  }

  try {
    const response = await fetch("https://api.daily.co/v1/rooms", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        name: roomName,
        privacy: "private",
        properties: {
          enable_chat: true,
          enable_screenshare: true,
          enable_recording: "cloud",
          enable_prejoin_ui: false,
          enable_cpu_warning_notifications: false,
          exp: Math.floor(Date.now() / 1000) + 30 * 24 * 3600, // Expires in 30 days
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Failed to create Daily room:", error);
      return null;
    }

    const room = await response.json();
    return { url: room.url, name: room.name };
  } catch (error) {
    console.error("Error creating Daily room:", error);
    return null;
  }
}

async function configureDailyRoom(roomUrl: string): Promise<boolean> {
  const apiKey = process.env.DAILY_API_KEY;
  if (!apiKey || !roomUrl) return false;

  try {
    const roomName = new URL(roomUrl).pathname.split("/").filter(Boolean).pop();
    if (!roomName) return false;

    const response = await fetch(`https://api.daily.co/v1/rooms/${encodeURIComponent(roomName)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        privacy: "private",
        properties: {
          enable_prejoin_ui: false,
          enable_cpu_warning_notifications: false,
        },
      }),
    });

    return response.ok;
  } catch {
    return false;
  }
}

// Verify a Daily.co room exists and hasn't expired. Returns true if valid.
async function isDailyRoomValid(roomUrl: string): Promise<boolean> {
  const apiKey = process.env.DAILY_API_KEY;
  if (!apiKey || !roomUrl) return false;

  try {
    // Extract room name from URL: https://<domain>.daily.co/<roomName>
    const roomName = roomUrl.split("/").pop();
    if (!roomName) return false;

    const res = await fetch(`https://api.daily.co/v1/rooms/${roomName}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (res.status === 404) {
      console.log(`[Daily] Room "${roomName}" does not exist`);
      return false;
    }
    if (!res.ok) return false;

    const room = await res.json();
    // Check if the room has an expiry that has already passed
    if (room.config?.exp && room.config.exp < Math.floor(Date.now() / 1000)) {
      console.log(`[Daily] Room "${roomName}" has expired`);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// Configure multer for file uploads (memory storage — files go to Supabase)
const uploadReport = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/gif",
      "application/dicom",
      "application/octet-stream",
    ];
    if (allowedTypes.includes(file.mimetype) || file.originalname.endsWith(".dcm")) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Allowed: PDF, JPEG, PNG, GIF, DICOM"));
    }
  },
});

const caseFileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 75 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/gif",
      "application/dicom",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    const allowedExtensions = /\.(pdf|jpe?g|png|gif|dcm|docx?)$/i;
    if (allowedTypes.includes(file.mimetype) || allowedExtensions.test(file.originalname) || isCaseFileVideo(file.originalname, file.mimetype)) cb(null, true);
    else cb(new Error("Invalid file type. Allowed: PDF, images, DICOM, DOC, or DOCX"));
  },
});

// Configure multer for registration document uploads (memory storage — files go to Supabase)
const uploadDocument = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/gif",
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Allowed: PDF, JPEG, PNG, GIF"));
    }
  },
});

// In-memory multer for Excel file parsing (no disk write needed)
const uploadExcel = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// In-memory multer for photo/signature uploads (converts to base64, no disk persistence)
const uploadImageMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  registerAuthRoutes(app);

  // User Role Management
  app.patch("/api/users/me/role", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const { role } = req.body as { role: UserRole };
      if (!["care_seeker", "provider"].includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }
      
      const user = await updateUserRole(userId, role);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json(user);
    } catch (error) {
      console.error("Error updating user role:", error);
      res.status(500).json({ message: "Failed to update role" });
    }
  });

  // Provider Profile Management
  app.get("/api/providers/me", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const provider = await storage.getProviderByUserId(userId);
      if (!provider) {
        return res.status(404).json({ message: "Provider profile not found" });
      }
      
      res.json(provider);
    } catch (error) {
      console.error("Error fetching provider profile:", error);
      res.status(500).json({ message: "Failed to fetch provider profile" });
    }
  });

  // Auto-create provider profile from user's existing signup data
  app.post("/api/providers/auto-create", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const existing = await storage.getProviderByUserId(userId);
      if (existing) return res.json(existing);

      const user = req.user as any;

      const providerType = req.body.type || "lab";
      const provider = await storage.createProvider({
        userId,
        name: user.hospitalName || `${user.firstName || ""} ${user.lastName || ""}`.trim() || "My Organization",
        type: providerType,
        description: req.body.description || "",
        location: req.body.location || "",
        address: user.hospitalAddress || "",
        phone: user.phone || req.body.phone || "",
        email: user.email,
        licenseNumber: user.hospitalRegistrationNo || "",
        registeredOrganization: user.hospitalRegisteredOrg || "",
        verificationStatus: "pending",
      } as any);

      res.status(201).json(provider);
    } catch (error) {
      console.error("Error auto-creating provider:", error);
      res.status(500).json({ message: "Failed to auto-create provider profile" });
    }
  });

  app.post("/api/providers", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      // Check if provider already exists
      const existing = await storage.getProviderByUserId(userId);
      if (existing) {
        return res.status(400).json({ message: "Provider profile already exists" });
      }
      
      const providerData = {
        ...req.body,
        userId,
        verificationStatus: "pending" as ProviderStatus,
      };
      
      const provider = await storage.createProvider(providerData);
      
      // Update user role to provider
      await storage.updateUserRole(userId, "provider");
      
      res.status(201).json(provider);
    } catch (error) {
      console.error("Error creating provider:", error);
      res.status(500).json({ message: "Failed to create provider profile" });
    }
  });

  app.patch("/api/providers/me", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const provider = await storage.getProviderByUserId(userId);
      if (!provider) {
        return res.status(404).json({ message: "Provider profile not found" });
      }
      
      const updated = await storage.updateProvider(provider.id, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating provider:", error);
      res.status(500).json({ message: "Failed to update provider profile" });
    }
  });

  // Provider Service Management - Labs
  app.get("/api/provider/my-labs", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const provider = await storage.getProviderByUserId(userId);
      if (!provider) {
        return res.json([]);
      }
      const labs = await storage.getLabsByProvider(provider.id);
      res.json(labs);
    } catch (error) {
      console.error("Error fetching provider labs:", error);
      res.status(500).json({ message: "Failed to fetch labs" });
    }
  });

  app.post("/api/provider/labs", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const provider = await storage.getProviderByUserId(userId);
      if (!provider) {
        return res.status(403).json({ message: "Provider profile required" });
      }
      
      const labData = { ...req.body, providerId: provider.id, approvalStatus: "pending" };
      const lab = await storage.createLab(labData);
      res.status(201).json(lab);
    } catch (error) {
      console.error("Error creating lab:", error);
      res.status(500).json({ message: "Failed to create lab" });
    }
  });

  app.patch("/api/provider/labs/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const provider = await storage.getProviderByUserId(userId);
      if (!provider) {
        return res.status(403).json({ message: "Provider profile required" });
      }
      
      const lab = await storage.getLabById(req.params.id);
      if (!lab || lab.providerId !== provider.id) {
        return res.status(404).json({ message: "Lab not found or access denied" });
      }
      
      const updated = await storage.updateLab(req.params.id, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating lab:", error);
      res.status(500).json({ message: "Failed to update lab" });
    }
  });

  app.delete("/api/provider/labs/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const provider = await storage.getProviderByUserId(userId);
      if (!provider) {
        return res.status(403).json({ message: "Provider profile required" });
      }
      
      const lab = await storage.getLabById(req.params.id);
      if (!lab || lab.providerId !== provider.id) {
        return res.status(404).json({ message: "Lab not found or access denied" });
      }
      
      await storage.deleteLab(req.params.id);
      res.json({ message: "Lab deleted" });
    } catch (error) {
      console.error("Error deleting lab:", error);
      res.status(500).json({ message: "Failed to delete lab" });
    }
  });

  // Provider Service Management - Consultants
  app.get("/api/provider/my-consultants", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const provider = await storage.getProviderByUserId(userId);
      if (!provider) {
        return res.json([]);
      }
      const consultants = await storage.getConsultantsByProvider(provider.id);
      const media = consultants.length
        ? (await getPool().query(
            `SELECT id, consultant_id, kind, original_filename, object_path, verification_status
             FROM consultant_profile_media WHERE consultant_id = ANY($1::varchar[])
             ORDER BY created_at, id`,
            [consultants.map((consultant) => consultant.id)],
          )).rows
        : [];
      res.json(consultants.map((consultant) => ({
        ...consultant,
        registrationDocuments: [
          ...(consultant.registrationDocumentUrl ? [{
            id: "legacy", filename: "Registration document", url: consultant.registrationDocumentUrl, status: null,
          }] : []),
          ...media.filter((item: any) => item.consultant_id === consultant.id && item.kind === "registration_document")
            .map((item: any) => ({ id: item.id, filename: item.original_filename, status: item.verification_status })),
        ],
        portfolioPhotos: media.filter((item: any) => item.consultant_id === consultant.id && item.kind === "portfolio_photo")
          .map((item: any) => ({ id: item.id, url: item.object_path, filename: item.original_filename })),
      })));
    } catch (error) {
      console.error("Error fetching provider consultants:", error);
      res.status(500).json({ message: "Failed to fetch consultants" });
    }
  });

  // Profile media stays on the owning consultant; registration documents are private.
  async function ownedProfileConsultant(req: any, res: any) {
    if (req.user?.role !== "provider") {
      res.status(403).json({ message: "Only consultant providers may manage profile media." });
      return null;
    }
    const provider = await storage.getProviderByUserId(req.user.id);
    const consultant = await storage.getConsultantById(req.params.id);
    if (provider?.type !== "consultant" || !consultant || consultant.providerId !== provider.id) {
      res.status(403).json({ message: "Consultant profile not found or access denied." });
      return null;
    }
    return consultant;
  }

  app.post("/api/provider/consultants/:id/media", isAuthenticated, uploadDocument.single("file"), async (req: any, res) => {
    try {
      const consultant = await ownedProfileConsultant(req, res);
      if (!consultant) return;
      const kind = String(req.body?.kind || "");
      if (!["photo", "signature", "portfolio_photo", "registration_document"].includes(kind)) {
        return res.status(400).json({ message: "Unsupported profile media type." });
      }
      if (!req.file) return res.status(400).json({ message: "Choose a PDF or image." });
      if (kind !== "registration_document" && !req.file.mimetype.startsWith("image/")) {
        return res.status(400).json({ message: "Choose an image for this section." });
      }
      if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return res.status(503).json({ message: "Persistent file storage is unavailable. Please try again later." });
      }
      const id = randomUUID();
      const filename = req.file.originalname.slice(0, 255);
      const url = kind === "registration_document"
        ? await uploadPrivateCaseFile(req.file.buffer, filename, req.file.mimetype, id)
        : await supabaseUpload(req.file.buffer, filename, `provider-profile/${consultant.id}/${kind}`, req.file.mimetype);
      if (kind === "photo" || kind === "signature") {
        await storage.updateConsultant(consultant.id, kind === "photo" ? { photoUrl: url } : { digitalSignatureUrl: url });
        return res.json({ id, url, kind });
      }
      await getPool().query(
        `INSERT INTO consultant_profile_media (id, consultant_id, kind, original_filename, object_path)
         VALUES ($1,$2,$3,$4,$5)`,
        [id, consultant.id, kind, filename, url],
      );
      res.status(201).json({ id, filename, kind, url: kind === "portfolio_photo" ? url : undefined, status: kind === "registration_document" ? "under_review" : undefined });
    } catch (error) {
      req.log?.error({ err: error }, "Profile media upload failed");
      res.status(503).json({ message: "Could not save the profile file. Please try again." });
    }
  });

  app.get("/api/provider/consultants/:id/media/:mediaId/signed-url", isAuthenticated, async (req: any, res) => {
    try {
      const consultant = await ownedProfileConsultant(req, res);
      if (!consultant) return;
      const media = (await getPool().query(
        `SELECT object_path, original_filename FROM consultant_profile_media
         WHERE id = $1 AND consultant_id = $2 AND kind = 'registration_document'`,
        [req.params.mediaId, consultant.id],
      )).rows[0];
      if (!media) return res.status(404).json({ message: "Document not found." });
      const url = await createPrivateCaseFileSignedUrl(media.object_path, 300, media.original_filename);
      res.json({ url });
    } catch (error) {
      req.log?.error({ err: error }, "Profile document link failed");
      res.status(503).json({ message: "Could not open the document." });
    }
  });

  app.delete("/api/provider/consultants/:id/media/:mediaId", isAuthenticated, async (req: any, res) => {
    try {
      const consultant = await ownedProfileConsultant(req, res);
      if (!consultant) return;
      const deleted = (await getPool().query(
        `DELETE FROM consultant_profile_media WHERE id = $1 AND consultant_id = $2
         AND kind = 'portfolio_photo' RETURNING object_path`,
        [req.params.mediaId, consultant.id],
      )).rows[0];
      if (!deleted) return res.status(404).json({ message: "Portfolio photo not found." });
      try {
        await deletePublicFile(deleted.object_path);
      } catch (error) {
        req.log?.warn({ err: error }, "Deleted portfolio record but failed to remove stored photo");
      }
      res.json({ ok: true });
    } catch (error) {
      req.log?.error({ err: error }, "Profile photo deletion failed");
      res.status(500).json({ message: "Could not delete the photo." });
    }
  });

  app.post("/api/provider/consultants", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const provider = await storage.getProviderByUserId(userId);
      if (!provider) {
        return res.status(403).json({ message: "Provider profile required" });
      }
      
      const consultantData = { ...req.body, providerId: provider.id, approvalStatus: "pending" };
      // An individual consultant uploads their photo on the Profile page, which
      // stores it on the user account. Copy it to the consultant record when the
      // professional profile is created so seeker-facing pages can display it.
      if (provider.type === "consultant" && !consultantData.photoUrl) {
        const user = await storage.getUserById(userId);
        if (user?.profileImageUrl) {
          consultantData.photoUrl = user.profileImageUrl;
        }
      }
      const consultant = await storage.createConsultant(consultantData);
      res.status(201).json(consultant);
    } catch (error) {
      console.error("Error creating consultant:", error);
      res.status(500).json({ message: "Failed to create consultant" });
    }
  });

  app.patch("/api/provider/consultants/:id", isAuthenticated, async (req: any, res) => {
    try {
      if (req.user?.role !== "provider") {
        res.status(403).json({ message: "Only providers can update their consultant profile." });
        return;
      }
      const userId = req.user?.id;
      const provider = await storage.getProviderByUserId(userId);
      if (!provider) {
        return res.status(403).json({ message: "Provider profile required" });
      }
      if (provider.type !== "consultant") {
        res.status(403).json({ message: "Only consultant providers can update consultant availability." });
        return;
      }
      
      const consultant = await storage.getConsultantById(req.params.id);
      if (!consultant) return res.status(404).json({ message: "Consultant not found" });
      if (consultant.providerId !== provider.id) {
        return res.status(403).json({ message: "Consultant not found or access denied" });
      }
      if (req.body?.status !== undefined && !["active", "paused"].includes(req.body.status)) {
        res.status(400).json({ message: "Availability status must be active or paused." });
        return;
      }
      
      const updated = await storage.updateConsultant(req.params.id, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating consultant:", error);
      res.status(500).json({ message: "Failed to update consultant" });
    }
  });

  app.delete("/api/provider/consultants/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const provider = await storage.getProviderByUserId(userId);
      if (!provider) {
        return res.status(403).json({ message: "Provider profile required" });
      }
      
      const consultant = await storage.getConsultantById(req.params.id);
      if (!consultant) return res.status(404).json({ message: "Consultant not found" });
      if (consultant.providerId && consultant.providerId !== provider.id) {
        return res.status(403).json({ message: "Consultant not found or access denied" });
      }
      
      await storage.deleteConsultant(req.params.id);
      res.json({ message: "Consultant deleted" });
    } catch (error) {
      console.error("Error deleting consultant:", error);
      res.status(500).json({ message: "Failed to delete consultant" });
    }
  });

  // Emergency Teams - Public
  app.get("/api/emergency-teams", async (req, res) => {
    try {
      const teams = await storage.getActiveEmergencyTeams();
      const defaultMarginSetting = await storage.getPlatformSetting("default_margin_percent");
      const defaultMargin = parseFloat(defaultMarginSetting?.settingValue || "15");

      const enriched = teams.map(t => {
        const baseCost = parseFloat(t.consultationFee);
        const pricing = calculateCustomerPrice(baseCost, t.customerPrice, t.marginOverride, defaultMargin);
        return {
          ...t,
          providerBaseCost: baseCost.toFixed(2),
          computedCustomerPrice: pricing.customerPrice.toFixed(2),
          computedMarginPercent: pricing.marginPercent.toFixed(2),
        };
      });
      res.json(enriched);
    } catch (error) {
      console.error("Error fetching emergency teams:", error);
      res.status(500).json({ message: "Failed to fetch emergency teams" });
    }
  });

  app.get("/api/emergency-teams/:id", async (req, res) => {
    try {
      const team = await storage.getEmergencyTeamById(req.params.id);
      if (!team) return res.status(404).json({ message: "Emergency team not found" });
      const defaultMarginSetting = await storage.getPlatformSetting("default_margin_percent");
      const defaultMargin = parseFloat(defaultMarginSetting?.settingValue || "15");
      const baseCost = parseFloat(team.consultationFee);
      const pricing = calculateCustomerPrice(baseCost, team.customerPrice, team.marginOverride, defaultMargin);
      res.json({
        ...team,
        computedCustomerPrice: pricing.customerPrice.toFixed(2),
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch emergency team" });
    }
  });

  // Emergency Teams - Provider
  app.get("/api/provider/my-emergency-teams", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const provider = await storage.getProviderByUserId(userId);
      if (!provider) return res.json([]);
      const teams = await storage.getEmergencyTeamsByProvider(provider.id);
      res.json(teams);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch emergency teams" });
    }
  });

  app.post("/api/provider/emergency-teams", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const provider = await storage.getProviderByUserId(userId);
      if (!provider) return res.status(403).json({ message: "Provider profile required" });
      const teamData = { ...req.body, providerId: provider.id, approvalStatus: "pending" };
      const team = await storage.createEmergencyTeam(teamData);
      res.status(201).json(team);
    } catch (error) {
      res.status(500).json({ message: "Failed to create emergency team" });
    }
  });

  app.patch("/api/provider/emergency-teams/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const provider = await storage.getProviderByUserId(userId);
      if (!provider) return res.status(403).json({ message: "Provider profile required" });
      const team = await storage.getEmergencyTeamById(req.params.id);
      if (!team || team.providerId !== provider.id) return res.status(404).json({ message: "Emergency team not found or access denied" });
      const updated = await storage.updateEmergencyTeam(req.params.id, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating emergency team:", error);
      res.status(500).json({ message: "Failed to update emergency team" });
    }
  });

  // Lab Tests - Direct Catalog (no providers)
  app.get("/api/lab-tests", async (req, res) => {
    try {
      const tests = await storage.getActiveLabTests();
      const defaultMarginSetting = await storage.getPlatformSetting("default_margin_percent");
      const defaultMargin = parseFloat(defaultMarginSetting?.settingValue || "15");
      const allProviderTests = await storage.getProviderLabTests();
      const testsWithProviders = new Set(
        allProviderTests
          .filter(pt => pt.isActive && pt.approvalStatus === "approved")
          .map(pt => pt.labTestId)
      );

      const enrichedTests = tests
        .filter(t => testsWithProviders.has(t.id))
        .map(t => {
          const providerTest = allProviderTests.find(pt => pt.labTestId === t.id && pt.isActive && pt.approvalStatus === "approved");
          const baseCost = parseFloat(providerTest?.price || t.cost);
          const pricing = calculateCustomerPrice(baseCost, t.customerPrice, t.marginOverride, defaultMargin);
          return {
            ...t,
            providerBaseCost: baseCost.toFixed(2),
            computedCustomerPrice: pricing.customerPrice.toFixed(2),
            computedMarginPercent: pricing.marginPercent.toFixed(2),
            tatHidden: providerTest?.tatHidden ?? false,
          };
        });
      res.json(enrichedTests);
    } catch (error) {
      console.error("Error fetching lab tests:", error);
      res.status(500).json({ message: "Failed to fetch lab tests" });
    }
  });

  app.get("/api/lab-tests/all", isAdmin, async (req, res) => {
    try {
      const tests = await storage.getLabTests();
      const defaultMarginSetting = await storage.getPlatformSetting("default_margin_percent");
      const defaultMargin = parseFloat(defaultMarginSetting?.settingValue || "15");
      const allProviderTests = await storage.getProviderLabTests();

      const enrichedTests = tests.map(t => {
        const providerTest = allProviderTests.find(pt => pt.labTestId === t.id && pt.isActive && pt.approvalStatus === "approved");
        const baseCost = parseFloat(providerTest?.price || t.cost);
        const pricing = calculateCustomerPrice(baseCost, t.customerPrice, t.marginOverride, defaultMargin);
        return {
          ...t,
          providerBaseCost: baseCost.toFixed(2),
          computedCustomerPrice: pricing.customerPrice.toFixed(2),
          computedMarginPercent: pricing.marginPercent.toFixed(2),
          hasProvider: !!providerTest,
        };
      });
      res.json(enrichedTests);
    } catch (error) {
      console.error("Error fetching all lab tests:", error);
      res.status(500).json({ message: "Failed to fetch lab tests" });
    }
  });

  app.get("/api/lab-tests/:id", async (req, res) => {
    try {
      const test = await storage.getLabTestById(req.params.id);
      if (!test) {
        return res.status(404).json({ message: "Lab test not found" });
      }
      res.json(test);
    } catch (error) {
      console.error("Error fetching lab test:", error);
      res.status(500).json({ message: "Failed to fetch lab test" });
    }
  });

  // Provider - Add Lab Test to their lab
  app.post("/api/lab-tests", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }
      const provider = await storage.getProviderByUserId(userId);
      
      if (!provider) {
        return res.status(403).json({ message: "Provider profile required" });
      }

      const { labId, testName, cost, turnaroundTime } = req.body;
      
      if (!labId) {
        return res.status(400).json({ message: "Lab ID is required" });
      }

      // Verify the lab belongs to this provider
      const labs = await storage.getLabsByProvider(provider.id);
      const lab = labs.find(l => l.id === labId);
      
      if (!lab) {
        return res.status(403).json({ message: "Lab not found or not owned by you" });
      }

      const test = await storage.createLabTest({
        labId,
        testName,
        cost,
        turnaroundTime,
        category: "General",
        status: "active",
      });
      
      res.status(201).json(test);
    } catch (error) {
      console.error("Error creating lab test:", error);
      res.status(500).json({ message: "Failed to create lab test" });
    }
  });

  // Radiology Modalities
  app.get("/api/radiology-modalities", async (req, res) => {
    try {
      const modalities = await storage.getActiveRadiologyModalities();
      res.json(modalities);
    } catch (error) {
      console.error("Error fetching radiology modalities:", error);
      res.status(500).json({ message: "Failed to fetch modalities" });
    }
  });

  app.get("/api/radiology-modalities/all", isAdmin, async (req, res) => {
    try {
      const modalities = await storage.getRadiologyModalities();
      res.json(modalities);
    } catch (error) {
      console.error("Error fetching all radiology modalities:", error);
      res.status(500).json({ message: "Failed to fetch modalities" });
    }
  });

  app.get("/api/radiology-modalities/:id", async (req, res) => {
    try {
      const modality = await storage.getRadiologyModalityById(req.params.id);
      if (!modality) {
        return res.status(404).json({ message: "Modality not found" });
      }
      res.json(modality);
    } catch (error) {
      console.error("Error fetching radiology modality:", error);
      res.status(500).json({ message: "Failed to fetch modality" });
    }
  });

  // Labs (legacy - kept for backward compatibility)
  app.get("/api/labs", async (req, res) => {
    try {
      const labs = await storage.getLabs();
      res.json(labs);
    } catch (error) {
      console.error("Error fetching labs:", error);
      res.status(500).json({ message: "Failed to fetch labs" });
    }
  });

  app.get("/api/labs/:id", async (req, res) => {
    try {
      const lab = await storage.getLabById(req.params.id);
      if (!lab) {
        return res.status(404).json({ message: "Lab not found" });
      }
      const defaultMarginSetting = await storage.getPlatformSetting("default_margin_percent");
      const defaultMargin = parseFloat(defaultMarginSetting?.settingValue || "15");
      const allProviderTests = await storage.getProviderLabTests();

      const enrichedTests = lab.tests.map(t => {
        const providerTest = allProviderTests.find(pt => pt.labTestId === t.id && pt.isActive && pt.approvalStatus === "approved");
        const baseCost = parseFloat(providerTest?.price || t.cost);
        const pricing = calculateCustomerPrice(baseCost, t.customerPrice, t.marginOverride, defaultMargin);
        return {
          ...t,
          computedCustomerPrice: pricing.customerPrice.toFixed(2),
        };
      });
      res.json({ ...lab, tests: enrichedTests });
    } catch (error) {
      console.error("Error fetching lab:", error);
      res.status(500).json({ message: "Failed to fetch lab" });
    }
  });

  // Consultants (public - only active)
  app.get("/api/consultants", async (req, res) => {
    try {
      const allConsultants = await storage.getActiveConsultants();
      const defaultMarginSetting = await storage.getPlatformSetting("default_margin_percent");
      const defaultMargin = parseFloat(defaultMarginSetting?.settingValue || "15");
      const mobileClient = req.query.mobile === "1" || Boolean(req.get("X-Mobile-Client"));
      const mobileTodayParts = mobileClient ? new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date()) : [];
      const todayValue = (type: Intl.DateTimeFormatPartTypes) => mobileTodayParts.find(part => part.type === type)?.value ?? "";
      const mobileToday = mobileClient
        ? `${todayValue("year")}-${todayValue("month")}-${todayValue("day")}`
        : "";
      const mobileLastDate = mobileClient ? new Date(`${mobileToday}T00:00:00Z`) : null;
      if (mobileLastDate) mobileLastDate.setUTCDate(mobileLastDate.getUTCDate() + 29);
      const mobileEnd = mobileLastDate
        ? `${mobileLastDate.getUTCFullYear()}-${String(mobileLastDate.getUTCMonth() + 1).padStart(2, "0")}-${String(mobileLastDate.getUTCDate()).padStart(2, "0")}`
        : "";
      const bookedSlotsByConsultant = mobileClient
        ? await getConsultationSlotsForRange(allConsultants.map(consultant => consultant.id), mobileToday, mobileEnd)
        : new Map<string, ConsultantBookedSlot[]>();

      const enriched = await Promise.all(allConsultants.map(async c => {
        const baseCost = parseFloat(c.consultationFee);
        const pricing = calculateCustomerPrice(baseCost, c.customerPrice, c.marginOverride, defaultMargin);
        const slotOverrides = await storage.getSlotOverrides(c.id);
        const availabilityPreview = getConsultantAvailabilityPreview(c, slotOverrides);
        let nextAvailableSlot: { date: string; start: string; end: string; appointmentSlot: string } | null = null;
        if (mobileClient) {
          const dateSlots = getConsultantBookableSlots(
            c,
            slotOverrides,
            bookedSlotsByConsultant.get(c.id) ?? [],
            mobileToday,
            mobileEnd,
          );
          nextAvailableSlot = dateSlots[0]?.slots[0] ?? null;
        }
        let photoUrl = c.photoUrl;

        // Files saved under the server's local uploads directory by older
        // deployments are not durable and disappear after a restart.
        if (photoUrl?.startsWith("/api/uploads/") || photoUrl?.startsWith("/uploads/")) {
          photoUrl = null;
        }

        // Legacy individual-consultant profiles may have the uploaded image only
        // on the linked user account. Use it as the public fallback until the
        // consultant row is next updated.
        if (!photoUrl && c.providerId) {
          const provider = await storage.getProviderById(c.providerId);
          if (provider?.type === "consultant") {
            const user = await storage.getUserById(provider.userId);
            const accountPhotoUrl = user?.profileImageUrl;
            // Local upload URLs from older deployments are not durable and may
            // point to files that disappeared on restart. Do not expose a known
            // stale URL as the consultant's public photo.
            photoUrl = accountPhotoUrl
              && !accountPhotoUrl.startsWith("/api/uploads/")
              && !accountPhotoUrl.startsWith("/uploads/")
              ? accountPhotoUrl
              : null;
          }
        }

        return {
          ...c,
          photoUrl,
          providerBaseCost: baseCost.toFixed(2),
          computedCustomerPrice: pricing.customerPrice.toFixed(2),
          computedMarginPercent: pricing.marginPercent.toFixed(2),
          availabilityPreview,
          ...(mobileClient ? { nextAvailableSlot } : {}),
        };
      }));
      res.json(enriched);
    } catch (error) {
      console.error("Error fetching consultants:", error);
      res.status(500).json({ message: "Failed to fetch consultants" });
    }
  });

  app.get("/api/consultants/:id", async (req, res) => {
    try {
      const consultant = await storage.getConsultantById(req.params.id);
      if (!consultant) {
        return res.status(404).json({ message: "Consultant not found" });
      }
      const slotOverrides = await storage.getSlotOverrides(consultant.id);
      const availabilityPreview = getConsultantAvailabilityPreview(consultant, slotOverrides);
      const defaultMarginSetting = await storage.getPlatformSetting("default_margin_percent");
      const defaultMargin = parseFloat(defaultMarginSetting?.settingValue || "15");
      const baseCost = parseFloat(consultant.consultationFee);
      const pricing = calculateCustomerPrice(baseCost, consultant.customerPrice, consultant.marginOverride, defaultMargin);
      let photoUrl = consultant.photoUrl;
      if (photoUrl?.startsWith("/api/uploads/") || photoUrl?.startsWith("/uploads/")) {
        photoUrl = null;
      }
      if (!photoUrl && consultant.providerId) {
        const provider = await storage.getProviderById(consultant.providerId);
        if (provider?.type === "consultant") {
          const user = await storage.getUserById(provider.userId);
          const accountPhotoUrl = user?.profileImageUrl;
          photoUrl = accountPhotoUrl
            && !accountPhotoUrl.startsWith("/api/uploads/")
            && !accountPhotoUrl.startsWith("/uploads/")
            ? accountPhotoUrl
            : null;
        }
      }
      const portfolioMedia = await getPool().query(
        `SELECT id, original_filename, object_path
         FROM consultant_profile_media
         WHERE consultant_id = $1 AND kind = 'portfolio_photo'
         ORDER BY created_at, id`,
        [consultant.id],
      );
      res.json({
        ...consultant,
        photoUrl,
        portfolioPhotos: portfolioMedia.rows.map((item: any) => ({
          id: item.id,
          filename: item.original_filename,
          url: item.object_path,
        })),
        computedCustomerPrice: pricing.customerPrice.toFixed(2),
        availabilityPreview,
      });
    } catch (error) {
      console.error("Error fetching consultant:", error);
      res.status(500).json({ message: "Failed to fetch consultant" });
    }
  });

  app.get("/api/consultants/:id/bookable-slots", async (req, res): Promise<void> => {
    try {
      const consultant = await storage.getConsultantById(req.params.id);
      if (!consultant) {
        res.status(404).json({ message: "Consultant not found" });
        return;
      }
      const start = typeof req.query.start === "string" ? req.query.start : "";
      const end = typeof req.query.end === "string" ? req.query.end : "";
      const isDate = (value: string) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        const parsed = new Date(`${value}T00:00:00Z`);
        return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
      };
      if (!isDate(start) || !isDate(end) || start > end) {
        res.status(400).json({ message: "start and end must be valid YYYY-MM-DD dates with start no later than end." });
        return;
      }
      const todayParts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date());
      const todayValue = (type: Intl.DateTimeFormatPartTypes) => todayParts.find(part => part.type === type)?.value ?? "";
      const today = `${todayValue("year")}-${todayValue("month")}-${todayValue("day")}`;
      const lastAllowedDate = new Date(`${today}T00:00:00Z`);
      lastAllowedDate.setUTCDate(lastAllowedDate.getUTCDate() + 29);
      const horizonEnd = `${lastAllowedDate.getUTCFullYear()}-${String(lastAllowedDate.getUTCMonth() + 1).padStart(2, "0")}-${String(lastAllowedDate.getUTCDate()).padStart(2, "0")}`;
      const rangeLength = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000 + 1;
      if (rangeLength > 30 || end > horizonEnd) {
        res.status(400).json({ message: "Requested dates must fit within the next 30-day booking horizon." });
        return;
      }

      const [slotOverrides, bookingsByConsultant] = await Promise.all([
        storage.getSlotOverrides(consultant.id),
        getConsultationSlotsForRange([consultant.id], start, end),
      ]);
      const bookingsForConsultant = bookingsByConsultant.get(consultant.id) ?? [];
      const dates = getConsultantBookableSlots(consultant, slotOverrides, bookingsForConsultant, start, end);
      res.json({ dates });
    } catch (error) {
      console.error("Error fetching consultant bookable slots:", error);
      res.status(500).json({ message: "Failed to fetch consultant bookable slots" });
    }
  });

  // Hospitals
  app.get("/api/hospitals", async (req, res) => {
    try {
      const hospitals = await storage.getHospitals();
      res.json(hospitals);
    } catch (error) {
      console.error("Error fetching hospitals:", error);
      res.status(500).json({ message: "Failed to fetch hospitals" });
    }
  });

  app.get("/api/hospitals/:id", async (req, res) => {
    try {
      const hospital = await storage.getHospitalById(req.params.id);
      if (!hospital) {
        return res.status(404).json({ message: "Hospital not found" });
      }
      res.json(hospital);
    } catch (error) {
      console.error("Error fetching hospital:", error);
      res.status(500).json({ message: "Failed to fetch hospital" });
    }
  });

  // Critical Care Doctors
  app.get("/api/critical-care/doctors", async (req, res) => {
    try {
      const doctors = await storage.getCriticalCareDoctors();
      res.json(doctors);
    } catch (error) {
      console.error("Error fetching critical care doctors:", error);
      res.status(500).json({ message: "Failed to fetch doctors" });
    }
  });

  app.get("/api/critical-care/doctors/:id", async (req, res) => {
    try {
      const doctor = await storage.getCriticalCareDoctorById(req.params.id);
      if (!doctor) {
        return res.status(404).json({ message: "Doctor not found" });
      }
      res.json(doctor);
    } catch (error) {
      console.error("Error fetching doctor:", error);
      res.status(500).json({ message: "Failed to fetch doctor" });
    }
  });

  // Bookings (User)
  app.get("/api/bookings", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const bookings = await storage.getBookingsByUserId(userId);
      const enriched = await Promise.all(bookings.map(async (b) => {
        if (b.bookingType === "consultation" && b.serviceId) {
          const consultant = await storage.getConsultantById(b.serviceId);
          const provider = b.providerId
            ? await storage.getProviderById(b.providerId)
            : null;
          if (req.get("X-Mobile-Client") === "1") {
            return {
              ...b,
              providerName: consultant?.name || null,
              providerSpecialization: consultant?.specialization || null,
              providerHospital:
                provider?.name || consultant?.affiliatedInstitution || null,
              providerCity: provider?.location || provider?.address || null,
              specialization: consultant?.specialization || null,
            };
          }
          return { ...b, specialization: consultant?.specialization || null };
        }
        return b;
      }));
      res.json(enriched.map(withConsultationLifecycle));
    } catch (error) {
      console.error("Error fetching bookings:", error);
      res.status(500).json({ message: "Failed to fetch bookings" });
    }
  });

  // Dashboard summary — active consultations + ready lab reports for the current seeker
  app.get("/api/user/dashboard", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const allBookings = await storage.getBookingsByUserId(userId);

      // Filter out items the user has dismissed from dashboard
      const visibleBookings = allBookings.filter((b) => !(b as any).dashboardHiddenAt);

      // Consultations: all consultation bookings (active + those with signed Clinical Advisories)
      const consultationBookings = visibleBookings.filter(
        (b) => b.bookingType === "consultation" &&
          !["cancelled"].includes(b.status)
      );
      const activeConsultations = await Promise.all(
        consultationBookings.map(async (b) => {
          const consultant = b.serviceId ? await storage.getConsultantById(b.serviceId) : null;
          return {
            ...b,
            consultantSpecialization: consultant?.specialization || null,
          };
        })
      );

      // Ready lab reports: lab bookings where status=report_ready or processedReportUrl set
      const readyReports = visibleBookings.filter(
        (b) => b.bookingType === "lab" &&
          (b.status === "report_ready" || !!b.processedReportUrl)
      );

      res.json({
        activeConsultations: activeConsultations.map(withConsultationLifecycle),
        readyReports,
        signedPrescriptions: [],
      });
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
      res.status(500).json({ message: "Failed to fetch dashboard data" });
    }
  });

  // Hide one or more bookings from the user's dashboard (soft-hide, data preserved)
  app.post("/api/user/dashboard/hide", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const { ids } = req.body as { ids: string[] };
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "ids array required" });
      }
      const now = new Date();
      for (const id of ids) {
        const booking = await storage.getBookingById(id);
        if (booking && booking.userId === userId) {
          await storage.updateBooking(id, { dashboardHiddenAt: now } as any);
        }
      }
      res.json({ ok: true });
    } catch (error) {
      console.error("Error hiding dashboard items:", error);
      res.status(500).json({ message: "Failed to hide items" });
    }
  });

  // Get booking by video room URL (for video-room page to know booking context)
  app.get("/api/bookings/room/:roomUrl", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const roomUrl = decodeURIComponent(req.params.roomUrl);
      const streamBookingId = bookingIdFromStreamLink(roomUrl);
      const booking = streamBookingId
        ? await storage.getBookingById(streamBookingId)
        : await storage.getBookingByVideoRoomUrl(roomUrl);
      if (!booking) return res.status(404).json({ message: "Booking not found" });
      // Only allow the seeker or the provider assigned to this booking
      const provider = booking.providerId ? await storage.getProviderById(booking.providerId) : null;
      const isSeeker = booking.userId === userId;
      const isProviderUser = provider?.userId === userId;
      if (!isSeeker && !isProviderUser) return res.status(403).json({ message: "Access denied" });

      // Extend the booking with participant display names for the in-call waiting banner.
      // Phone numbers are NEVER sent to the client — calls use the Twilio masked bridge
      // (POST /api/bookings/:id/call) so neither party sees the other's real number.
      const seekerUser = await storage.getUserById(booking.userId);
      let providerName: string | null = null;
      if (provider?.userId) {
        const providerUser = await storage.getUserById(provider.userId);
        providerName =
          `${(providerUser as any)?.firstName ?? ""} ${(providerUser as any)?.lastName ?? ""}`.trim() || null;
      }
      const seekerName =
        `${(seekerUser as any)?.firstName ?? ""} ${(seekerUser as any)?.lastName ?? ""}`.trim() || null;
      const seekerHospitalName = seekerUser?.hospitalName?.trim() || seekerName || "Care Seeker";
      const resolvedProviderName = providerName || (booking as any).serviceName || null;
      const participantRole = isProviderUser ? "provider" : "seeker";
      res.json({
        ...booking,
        seekerName,
        seekerHospitalName,
        providerName: resolvedProviderName,
        participantRole,
        otherParticipantName: participantRole === "provider" ? seekerHospitalName : resolvedProviderName,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch booking" });
    }
  });

  // Generate a Daily.co meeting token with the caller's real name locked in server-side.
  // This is the only reliable way to set participant names — URL params are ignored
  // by Daily when prejoinUI is disabled, and the browser caches names from previous sessions.
  app.get("/api/bookings/room/:roomUrl/daily-token", isAuthenticated, async (req: any, res) => {
    try {
      const roomUrl = decodeURIComponent(req.params.roomUrl);
      const booking = await storage.getBookingByVideoRoomUrl(roomUrl);
      if (!booking) return res.status(404).json({ message: "Booking not found" });

      const userId = req.user?.id;
      const provider = booking.providerId ? await storage.getProviderById(booking.providerId) : null;
      const isSeeker = booking.userId === userId;
      const isProviderUser = provider?.userId === userId;
      if (!isSeeker && !isProviderUser) {
        return res.status(403).json({ message: "Access denied" });
      }

      const session = await storage.getCallSession(booking.id);
      if (!session || session.status !== "accepted") {
        return res.status(409).json({ message: "The call must be accepted before joining the video room" });
      }
      if (callMediaProvider(session.videoRoomUrl) === "stream" || session.videoRoomUrl !== roomUrl) {
        return res.status(409).json({ message: "The requested Daily room does not match the active call session" });
      }

      const apiKey = process.env.DAILY_API_KEY;
      if (!apiKey) return res.status(503).json({ message: "Daily not configured" });

      const configured = await configureDailyRoom(roomUrl);
      if (!configured) {
        return res.status(502).json({ message: "Could not secure the video room" });
      }

      // Extract just the room name from the full URL (last path segment)
      const roomName = roomUrl.split("/").pop();
      if (!roomName) return res.status(400).json({ message: "Invalid room URL" });

      const user = req.user as any;
      const userName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email || "Participant";

      const response = await fetch("https://api.daily.co/v1/meeting-tokens", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          properties: {
            room_name: roomName,
            user_name: userName,
            user_id: user.id,
            start_video_off: session.callType === "voice",
            exp: Math.floor(Date.now() / 1000) + 4 * 3600, // valid 4 hours
          },
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        console.error("[Daily] Token generation failed:", err);
        return res.status(500).json({ message: "Failed to generate token" });
      }

      const { token } = await response.json() as { token: string };
      return res.json({ token, userName });
    } catch (error) {
      console.error("[Daily] Token error:", error);
      return res.status(500).json({ message: "Failed to generate token" });
    }
  });

  // Get a single booking for native/mobile call screens.
  app.get("/api/bookings/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const booking = await storage.getBookingById(req.params.id);
      if (!booking) return res.status(404).json({ message: "Booking not found" });

      const provider = booking.providerId ? await storage.getProviderById(booking.providerId) : null;
      const isParticipant = booking.userId === userId || provider?.userId === userId;
      if (!isParticipant && req.user?.role !== "admin") {
        return res.status(403).json({ message: "Access denied" });
      }

      const isProviderUser = provider?.userId === userId;
      const seekerUser = isProviderUser ? await storage.getUserById(booking.userId) : null;
      const seekerName = seekerUser
        ? `${seekerUser.firstName || ""} ${seekerUser.lastName || ""}`.trim()
        : "";
      return res.json({
        ...withConsultationLifecycle(booking),
        ...(isProviderUser
          ? {
              seekerHospitalName: seekerUser?.hospitalName?.trim() || seekerName || "Care Seeker",
              seekerCity: seekerUser?.city?.trim() || null,
            }
          : {}),
      });
    } catch (error) {
      return res.status(500).json({ message: "Failed to fetch booking" });
    }
  });

  // ─── Case File API ─────────────────────────────────────────────────────────
  // The Case File is participant-authorized, append-only clinical history.
  app.get("/api/bookings/:bookingId/case-file", isAuthenticated, async (req: any, res) => {
    try {
      const access = await getCaseFileParticipant(req.params.bookingId, req.user);
      if (!access.booking) return res.status(404).json({ message: "Booking not found" });
      if (!access.allowed) return res.status(403).json({ message: "Access denied" });
      const pool = getPool();
      const booking = access.booking as any;
      const lifecycle = booking.bookingType === "consultation"
        ? resolveConsultationLifecycle(booking)
        : null;
      const storedSummary = (await pool.query(`SELECT allergies, comorbidities, presenting_complaint AS "presentingComplaint",
        present_illness AS "presentIllness", working_diagnosis AS "workingDiagnosis",
        clinical_history AS "clinicalSummary",
        submitted_by_user_id AS "submittedByUserId", submitted_at AS "submittedAt"
        FROM case_file_summaries WHERE booking_id = $1`, [booking.id])).rows[0];
      const summary = storedSummary ? {
        ...storedSummary,
        presentingComplaint: storedSummary.presentingComplaint || null,
        presentIllness: storedSummary.presentIllness || null,
        workingDiagnosis: booking.provisionalDiagnosis || storedSummary.workingDiagnosis || null,
        clinicalSummary: booking.clinicalSummary || storedSummary.clinicalSummary || null,
        examination: booking.examination || null,
        investigations: booking.investigations || null,
      } : {
        allergies: booking.patientAllergyNotSpecified ? null : booking.patientAllergies,
        comorbidities: null,
        presentingComplaint: null,
        presentIllness: null,
        workingDiagnosis: booking.provisionalDiagnosis || null,
        clinicalSummary: booking.clinicalSummary || null,
        examination: booking.examination || null,
        investigations: booking.investigations || null,
        submittedByUserId: booking.userId,
        submittedAt: booking.createdAt,
      };
      const profile = (await pool.query("SELECT allergies, comorbidities, baseline_medications AS \"baselineMedications\", baseline_parameters AS \"baselineParameters\", past_admissions AS \"pastAdmissions\", emergency_contact AS \"emergencyContact\" FROM case_file_profiles WHERE patient_user_id = $1", [booking.userId])).rows[0] || {
        allergies: booking.patientAllergyNotSpecified ? null : booking.patientAllergies,
        comorbidities: null, baselineMedications: null, baselineParameters: null, pastAdmissions: null, emergencyContact: booking.patientContact || null,
      };
      const latest = (await pool.query(`SELECT id, booking_id AS "bookingId", recorded_by_user_id AS "recordedByUserId",
        observed_at AS "observedAt", systolic_bp AS "systolicBp", diastolic_bp AS "diastolicBp",
        heart_rate AS "heartRate", respiratory_rate AS "respiratoryRate", intake, output,
        hourly_urine_output AS "hourlyUrineOutput", gcs, created_at AS "createdAt"
        FROM case_file_vitals WHERE booking_id = $1 ORDER BY observed_at DESC, id DESC LIMIT 1`, [booking.id])).rows[0] || null;
      const advisories = (await pool.query("SELECT id, booking_id AS \"bookingId\", author_user_id AS \"authorUserId\", narrative, attachment_ids AS \"attachmentIds\", authored_at AS \"authoredAt\" FROM case_file_advisories WHERE booking_id = $1 ORDER BY authored_at ASC, id ASC", [booking.id])).rows;
      const readOnly = caseFileReadOnly(booking);
      const providerUser = access.provider?.userId;
      const isOwnerProvider = access.isProvider;
      const callbackDevice = booking.callbackDeviceId
        ? (await pool.query<{ deviceName: string | null; staffName: string | null }>(
            `SELECT device_name AS "deviceName", staff_name AS "staffName"
             FROM consultation_callback_devices
             WHERE id = $1 AND user_id = $2`,
            [booking.callbackDeviceId, booking.userId],
          )).rows[0] ?? { deviceName: null, staffName: null }
        : { deviceName: null, staffName: null };
      const caseFileBooking = {
        id: booking.id,
        bookingNumber: booking.bookingNumber || null,
        patientName: booking.patientName,
        patientAge: booking.patientAge,
        patientGender: booking.patientGender || null,
        providerName: booking.providerName || null,
        serviceName: booking.serviceName,
        appointmentSlot: booking.appointmentSlot || null,
        status: lifecycle?.status || booking.status,
        consultationLifecycleAvailable: lifecycle?.scheduleAvailable,
        bookingType: booking.bookingType,
        userId: booking.userId,
        providerId: booking.providerId || null,
        callbackDevice: booking.bookingType === "consultation"
          ? callbackDeviceAssignment(booking, callbackDevice.deviceName, callbackDevice.staffName)
          : null,
        postRxCallsEnabled: lifecycle
          ? lifecycle.scheduleAvailable && lifecycle.status === "ongoing"
          : Boolean(booking.postRxCallsEnabled),
        postRxVideoEnabled: lifecycle
          ? lifecycle.scheduleAvailable && lifecycle.status === "ongoing"
          : Boolean(booking.postRxVideoEnabled),
      };
      res.json({
        booking: caseFileBooking,
        summary,
        profile,
        latestVitals: latest,
        latestVitalsFreshness: caseFileFreshness(latest?.observedAt),
        advisories,
        capabilities: {
          canMessage: !readOnly && (access.isSeeker || isOwnerProvider),
          canAttach: !readOnly && (access.isSeeker || isOwnerProvider),
          canAddVitals: !readOnly && access.isSeeker,
          canComposeAdvisory: !readOnly && access.isProvider,
          canToggleFollowUp: !readOnly && access.isProvider,
          canManageCallbackDevice: !readOnly && access.isSeeker && booking.bookingType === "consultation",
          readOnly,
          callsEnabled: lifecycle
            ? lifecycle.scheduleAvailable && lifecycle.status === "ongoing"
            : !!booking.postRxCallsEnabled,
          videoEnabled: lifecycle
            ? lifecycle.scheduleAvailable && lifecycle.status === "ongoing"
            : !!booking.postRxVideoEnabled,
          providerUserId: providerUser || null,
        },
      });
    } catch (error) {
      req.log?.error({ err: error }, "Case File aggregate failed");
      res.status(500).json({ message: "Failed to load Case File" });
    }
  });

  app.get("/api/bookings/:bookingId/case-file/messages", isAuthenticated, async (req: any, res) => {
    try {
      const access = await getCaseFileParticipant(req.params.bookingId, req.user);
      if (!access.booking) return res.status(404).json({ message: "Booking not found" });
      if (!access.allowed) return res.status(403).json({ message: "Access denied" });
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
      const cursor = req.query.cursor ? new Date(String(req.query.cursor)) : null;
      const pool = getPool();
      const result = cursor
        ? await pool.query(`SELECT m.*, a.id AS attachment_id, a.original_filename, a.mime_type, a.byte_size, a.duration_seconds, a.object_path, a.legacy_url, a.source, a.category, a.created_at AS attachment_created_at
          FROM case_file_messages m LEFT JOIN case_file_attachments a ON a.message_id = m.id
          WHERE m.booking_id = $1 AND m.created_at < $2 ORDER BY m.created_at DESC, m.id DESC LIMIT $3`, [access.booking.id, cursor, limit + 1])
        : await pool.query(`SELECT m.*, a.id AS attachment_id, a.original_filename, a.mime_type, a.byte_size, a.duration_seconds, a.object_path, a.legacy_url, a.source, a.category, a.created_at AS attachment_created_at
          FROM case_file_messages m LEFT JOIN case_file_attachments a ON a.message_id = m.id
          WHERE m.booking_id = $1 ORDER BY m.created_at DESC, m.id DESC LIMIT $2`, [access.booking.id, limit + 1]);
      const hasMore = result.rows.length > limit;
      const rows = result.rows.slice(0, limit).reverse();
      const messages = rows.map((row: any) => ({
        id: row.id, bookingId: row.booking_id, senderUserId: row.sender_user_id, senderRole: row.sender_role,
        kind: row.kind, body: row.body, createdAt: row.created_at,
        attachment: row.attachment_id ? {
          id: row.attachment_id, bookingId: row.booking_id, messageId: row.id, uploaderUserId: row.sender_user_id,
          uploaderRole: row.sender_role, originalFilename: row.original_filename, mimeType: row.mime_type, byteSize: row.byte_size, durationSeconds: row.duration_seconds,
          objectPath: null, legacyUrl: null, source: row.source, category: row.category, createdAt: row.attachment_created_at,
        } : null,
      }));
      res.json({ messages, nextCursor: hasMore && messages[0] ? messages[0].createdAt : null });
    } catch (error) {
      req.log?.error({ err: error }, "Case File messages failed");
      res.status(500).json({ message: "Failed to load messages" });
    }
  });

  app.post("/api/bookings/:bookingId/case-file/messages", isAuthenticated, async (req: any, res) => {
    try {
      const access = await getCaseFileParticipant(req.params.bookingId, req.user);
      if (!access.booking) return res.status(404).json({ message: "Booking not found" });
      if (!access.allowed || (!access.isSeeker && !access.isProvider)) return res.status(403).json({ message: "Only Case File participants may send messages" });
      if (caseFileReadOnly(access.booking)) return res.status(403).json({ message: "This Case File is read-only" });
      const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
      if (!body) return res.status(400).json({ message: "Message body is required" });
      if (body.length > 10000) return res.status(400).json({ message: "Message body must be 10,000 characters or fewer" });
      const id = randomUUID();
      const createdAt = new Date();
      await getPool().query("INSERT INTO case_file_messages (id, booking_id, sender_user_id, sender_role, kind, body, created_at) VALUES ($1,$2,$3,$4,'text',$5,$6)", [id, access.booking.id, req.user.id, req.user.role, body, createdAt]);
      const message = { id, bookingId: access.booking.id, senderUserId: req.user.id, senderRole: req.user.role, kind: "text", body, createdAt };
      broadcastCaseFileUpdate(access.booking, { type: "case_file_updated", bookingId: access.booking.id, change: "message_created", messageId: id });
      res.status(201).json(message);
    } catch (error) {
      req.log?.error({ err: error }, "Case File message failed");
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  app.get("/api/bookings/:bookingId/case-file/vitals", isAuthenticated, async (req: any, res) => {
    try {
      const access = await getCaseFileParticipant(req.params.bookingId, req.user);
      if (!access.booking) return res.status(404).json({ message: "Booking not found" });
      if (!access.allowed) return res.status(403).json({ message: "Access denied" });
      const rows = (await getPool().query(`SELECT id, booking_id AS "bookingId", recorded_by_user_id AS "recordedByUserId", observed_at AS "observedAt", systolic_bp AS "systolicBp", diastolic_bp AS "diastolicBp", heart_rate AS "heartRate", respiratory_rate AS "respiratoryRate", intake, output, hourly_urine_output AS "hourlyUrineOutput", gcs, created_at AS "createdAt" FROM case_file_vitals WHERE booking_id = $1 ORDER BY observed_at ASC, id ASC`, [access.booking.id])).rows;
      res.json(rows);
    } catch (error) {
      res.status(500).json({ message: "Failed to load vitals" });
    }
  });

  app.post("/api/bookings/:bookingId/case-file/vitals", isAuthenticated, async (req: any, res) => {
    try {
      const access = await getCaseFileParticipant(req.params.bookingId, req.user);
      if (!access.booking) return res.status(404).json({ message: "Booking not found" });
      if (!access.allowed || !access.isSeeker) return res.status(403).json({ message: "Only the Seeker may add vitals" });
      if (caseFileReadOnly(access.booking)) return res.status(403).json({ message: "This Case File is read-only" });
      const observedAt = new Date(req.body?.observedAt || "");
      if (Number.isNaN(observedAt.getTime())) return res.status(400).json({ message: "A valid observedAt is required" });
      const measurements: Array<[string, number, number]> = [
        ["systolicBp", 0, 300], ["diastolicBp", 0, 300], ["heartRate", 0, 300],
        ["respiratoryRate", 0, 100], ["intake", 0, 100000], ["output", 0, 100000],
        ["hourlyUrineOutput", 0, 100000], ["gcs", 3, 15],
      ];
      const supplied = measurements.filter(([key]) => req.body?.[key] !== undefined && req.body?.[key] !== null && req.body?.[key] !== "");
      if (supplied.length === 0) return res.status(400).json({ message: "At least one vital measurement is required" });
      for (const [key, minimum, maximum] of supplied) {
        const value = req.body[key];
        if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
          return res.status(400).json({ message: `${key} must be a number between ${minimum} and ${maximum}` });
        }
      }
      const id = randomUUID();
      const v = req.body;
      await getPool().query(`INSERT INTO case_file_vitals (id, booking_id, recorded_by_user_id, observed_at, systolic_bp, diastolic_bp, heart_rate, respiratory_rate, intake, output, hourly_urine_output, gcs) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [id, access.booking.id, req.user.id, observedAt, v.systolicBp ?? null, v.diastolicBp ?? null, v.heartRate ?? null, v.respiratoryRate ?? null, v.intake ?? null, v.output ?? null, v.hourlyUrineOutput ?? null, v.gcs ?? null]);
      const result = (await getPool().query(`SELECT id, booking_id AS "bookingId", recorded_by_user_id AS "recordedByUserId", observed_at AS "observedAt", systolic_bp AS "systolicBp", diastolic_bp AS "diastolicBp", heart_rate AS "heartRate", respiratory_rate AS "respiratoryRate", intake, output, hourly_urine_output AS "hourlyUrineOutput", gcs, created_at AS "createdAt" FROM case_file_vitals WHERE id = $1`, [id])).rows[0];
      broadcastCaseFileUpdate(access.booking, { type: "case_file_updated", bookingId: access.booking.id, change: "vitals_added", vitalId: id });
      res.status(201).json(result);
    } catch (error) {
      req.log?.error({ err: error }, "Case File vitals failed");
      res.status(500).json({ message: "Failed to add vitals" });
    }
  });

  app.get("/api/bookings/:bookingId/case-file/advisories", isAuthenticated, async (req: any, res) => {
    try {
      const access = await getCaseFileParticipant(req.params.bookingId, req.user);
      if (!access.booking) return res.status(404).json({ message: "Booking not found" });
      if (!access.allowed) return res.status(403).json({ message: "Access denied" });
      const rows = (await getPool().query(`SELECT id, booking_id AS "bookingId", author_user_id AS "authorUserId", narrative, attachment_ids AS "attachmentIds", authored_at AS "authoredAt" FROM case_file_advisories WHERE booking_id = $1 ORDER BY authored_at ASC, id ASC`, [access.booking.id])).rows;
      res.json(rows);
    } catch (error) {
      res.status(500).json({ message: "Failed to load Clinical Advisories" });
    }
  });

  app.get("/api/bookings/:bookingId/case-file/attachments/:attachmentId/download", isAuthenticated, async (req: any, res) => {
    try {
      const access = await getCaseFileParticipant(req.params.bookingId, req.user);
      if (!access.booking) return res.status(404).json({ message: "Booking not found" });
      if (!access.allowed) return res.status(403).json({ message: "Access denied" });
      const row = (await getPool().query("SELECT legacy_url, object_path, original_filename, mime_type, source FROM case_file_attachments WHERE id = $1 AND booking_id = $2", [req.params.attachmentId, access.booking.id])).rows[0];
      if (!row) return res.status(404).json({ message: "Attachment not found" });
      const target = row.object_path || row.legacy_url;
      if (!target) return res.status(404).json({ message: "Attachment content is unavailable" });
      if (String(row.source || "").startsWith("legacy_") && /^https?:\/\//i.test(target)) {
        const file = await downloadLegacyCaseFile(target);
        const contentType = row.mime_type || file.type || "application/octet-stream";
        const contentDisposition = row.original_filename
          ? `inline; filename="${String(row.original_filename).replace(/["\r\n]/g, "_")}"`
          : "inline";
        res.setHeader("Content-Type", contentType);
        res.setHeader("Content-Disposition", contentDisposition);
        return res.send(Buffer.from(await file.arrayBuffer()));
      }
      if (!String(row.source || "").startsWith("legacy_")) {
        const file = await downloadPrivateCaseFile(String(row.object_path));
        const contentDisposition = row.original_filename
          ? `inline; filename="${String(row.original_filename).replace(/["\r\n]/g, "_")}"`
          : "inline";
        res.setHeader("Content-Type", row.mime_type || file.type || "application/octet-stream");
        res.setHeader("Content-Disposition", contentDisposition);
        return res.send(Buffer.from(await file.arrayBuffer()));
      }
      if (String(row.source || "").startsWith("legacy_") && (target.startsWith("/api/uploads/") || target.startsWith("/uploads/"))) {
        const localPath = path.resolve(process.cwd(), "uploads", target.replace(/^\/api\/uploads\//, "").replace(/^\/uploads\//, ""));
        const uploadsRoot = path.resolve(process.cwd(), "uploads");
        if (!localPath.startsWith(`${uploadsRoot}${path.sep}`)) return res.status(400).json({ message: "Invalid attachment path" });
        res.setHeader("Content-Type", row.mime_type || "application/octet-stream");
        res.setHeader("Content-Disposition", row.original_filename ? `inline; filename="${String(row.original_filename).replace(/["\r\n]/g, "_")}"` : "inline");
        return res.sendFile(localPath);
      }
      return res.status(404).json({ message: "Attachment content is unavailable" });
    } catch (error) {
      req.log?.error({ err: error }, "Case File attachment download failed");
      if (error instanceof Error && error.message.startsWith("Unsupported legacy attachment")) {
        return res.status(400).json({ message: "Attachment source is unsupported" });
      }
      if (error instanceof Error && error.message.startsWith("Legacy Case File download failed")) {
        return res.status(404).json({ message: "Attachment content is unavailable" });
      }
      res.status(500).json({ message: "Failed to download attachment" });
    }
  });

  app.get("/api/bookings/:bookingId/case-file/attachments/:attachmentId/signed-url", isAuthenticated, async (req: any, res) => {
    try {
      const access = await getCaseFileParticipant(req.params.bookingId, req.user);
      if (!access.booking) return res.status(404).json({ message: "Booking not found" });
      if (!access.allowed) return res.status(403).json({ message: "Access denied" });
      const disposition = String(req.query.disposition || "attachment").toLowerCase();
      if (!["inline", "attachment"].includes(disposition)) {
        return res.status(400).json({ message: "disposition must be inline or attachment" });
      }
      const row = (await getPool().query(
        "SELECT object_path, playback_path, original_filename FROM case_file_attachments WHERE id = $1 AND booking_id = $2",
        [req.params.attachmentId, access.booking.id],
      )).rows[0];
      if (!row?.object_path) return res.status(404).json({ message: "Private attachment not found" });
      const expiresIn = 300;
      const downloadName = String(row.original_filename || "clinical-advisory.pdf").replace(/["\r\n\\/]/g, "_");
      const url = await createPrivateCaseFileSignedUrl(
        String(disposition === "inline" ? row.playback_path || row.object_path : row.object_path),
        expiresIn,
        disposition === "attachment" ? downloadName : undefined,
      );
      res.json({ url, expiresIn });
    } catch (error) {
      req.log?.error({ err: error }, "Case File signed download link failed");
      res.status(500).json({ message: "Failed to create a private download link" });
    }
  });

  app.post("/api/bookings/:bookingId/case-file/advisories", isAuthenticated, async (req: any, res) => {
    try {
      const access = await getCaseFileParticipant(req.params.bookingId, req.user);
      if (!access.booking) return res.status(404).json({ message: "Booking not found" });
      if (!access.allowed || !access.isProvider) return res.status(403).json({ message: "Only the assigned Provider may add Clinical Advisories" });
      if (caseFileReadOnly(access.booking)) return res.status(403).json({ message: "This Case File is read-only" });
      const narrative = typeof req.body?.narrative === "string" ? req.body.narrative.trim() : "";
      if (!narrative) return res.status(400).json({ message: "Narrative is required" });
      if (narrative.length > 20000) return res.status(400).json({ message: "Narrative must be 20,000 characters or fewer" });
      const id = randomUUID();
      const pdfAttachmentId = randomUUID();
      const requestedAttachmentIds = Array.isArray(req.body?.attachmentIds)
        ? req.body.attachmentIds.filter((attachmentId: unknown): attachmentId is string => typeof attachmentId === "string")
        : [];
      const attachmentIds = [...new Set([pdfAttachmentId, ...requestedAttachmentIds])];
      const messageId = randomUUID();
      const authoredAt = new Date();
      const booking = access.booking as any;
      const consultant = booking.serviceId ? await storage.getConsultantById(booking.serviceId) : null;
      const bookingUser = await storage.getUserById(booking.userId);
      const providerDisplayName = [req.user.firstName, req.user.lastName].filter(Boolean).join(" ")
        || req.user.email
        || consultant?.name
        || booking.providerName
        || "Perfusion Provider";
      const protocol = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers.host || "localhost:5000";
      const baseUrl = process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : `${protocol}://${host}`;
      const bookingNumber = booking.bookingNumber || `PFN-${String(booking.id).substring(0, 8).toUpperCase()}`;
      const originalFilename = `clinical-advisory-${String(bookingNumber).replace(/[^a-zA-Z0-9._-]/g, "_")}.pdf`;
      let privateObjectPath: string | null = null;
      try {
        const pdfData: PrescriptionPdfData = {
          bookingId: booking.id,
          bookingNumber,
          approvedAt: authoredAt,
          approverIp: req.ip || req.socket?.remoteAddress || "unknown",
          referringFacility: bookingUser?.hospitalName || null,
          referringPhysician: booking.referringPhysician || null,
          onCallDoctorName: booking.onCallDoctorName || null,
          onCallDoctorDesignation: booking.onCallDoctorDesignation || null,
          patientName: booking.patientName,
          patientAge: Number(booking.patientAge) || 0,
          patientGender: booking.patientGender || null,
          uhidIpNumber: booking.uhidIpNumber || null,
          patientContact: booking.patientContact || null,
          patientWeight: booking.patientWeight || null,
          patientAllergies: booking.patientAllergyNotSpecified ? null : booking.patientAllergies || null,
          patientAllergyNotSpecified: booking.patientAllergyNotSpecified ?? true,
          consultantName: consultant?.name || providerDisplayName,
          consultantSpecialization: consultant?.specialization || null,
          consultantQualification: consultant?.qualification || booking.providerName || null,
          consultantRegistrationNo: consultant?.registrationNumber || null,
          consultantYearsExperience: consultant?.yearsExperience || null,
          consultantAffiliation: consultant?.affiliatedInstitution || null,
          consultantSignatureUrl: consultant?.digitalSignatureUrl || null,
          clinicalHistory: booking.clinicalSummary || null,
          examination: null,
          investigations: null,
          diagnosis: booking.provisionalDiagnosis || null,
          physicianNotes: null,
          treatmentPlan: null,
          followUp: null,
          advice: narrative,
          documentMode: "case-file-advisory",
          verificationUrl: `${baseUrl}/api/verify/case-file-advisory/${id}`,
        };
        privateObjectPath = await generateAndStorePrescriptionPdf(
          pdfData,
          baseUrl,
          { storage: "private-case-file" },
        );
      } catch (error) {
        req.log?.error({ err: error }, "Private Clinical Advisory PDF generation failed");
        return res.status(503).json({ message: "Private PDF storage is unavailable. The Clinical Advisory was not saved." });
      }

      const pool = getPool();
      let client: any = null;
      let result: any;
      try {
        client = await pool.connect();
        await client.query("BEGIN");
        result = (await client.query(`INSERT INTO case_file_advisories (id, booking_id, author_user_id, narrative, attachment_ids, authored_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, booking_id AS "bookingId", author_user_id AS "authorUserId", narrative, attachment_ids AS "attachmentIds", authored_at AS "authoredAt"`, [id, booking.id, req.user.id, narrative, attachmentIds, authoredAt])).rows[0];
        await client.query("INSERT INTO case_file_messages (id, booking_id, sender_user_id, sender_role, kind, body, created_at) VALUES ($1,$2,$3,$4,'clinical_advisory_reference',$5,$6)", [messageId, booking.id, req.user.id, req.user.role, JSON.stringify({ advisoryId: id, narrative }), authoredAt]);
        await client.query(
          "INSERT INTO case_file_attachments (id, booking_id, message_id, uploader_user_id, uploader_role, original_filename, mime_type, byte_size, object_path, source, category, created_at) VALUES ($1,$2,NULL,$3,$4,$5,'application/pdf',NULL,$6,'document','uncategorized',$7)",
          [pdfAttachmentId, booking.id, req.user.id, req.user.role, originalFilename, privateObjectPath, authoredAt],
        );
        await client.query("COMMIT");
      } catch (error) {
        if (client) await client.query("ROLLBACK").catch(() => {});
        if (privateObjectPath) {
          await deletePrivateCaseFile(privateObjectPath).catch((cleanupError) => {
            req.log?.error({ err: cleanupError, objectPath: privateObjectPath }, "Failed to clean up unlinked Clinical Advisory PDF");
          });
        }
        throw error;
      } finally {
        client?.release();
      }
      broadcastCaseFileUpdate(booking, { type: "case_file_updated", bookingId: booking.id, change: "advisory_added", advisoryId: id });
      broadcastCaseFileUpdate(booking, { type: "case_file_updated", bookingId: booking.id, change: "message_created", messageId });
      res.status(201).json(result);
    } catch (error) {
      req.log?.error({ err: error }, "Case File Advisory failed");
      res.status(500).json({ message: "Failed to add Clinical Advisory" });
    }
  });

  app.get("/api/verify/case-file-advisory/:advisoryId", async (req: any, res) => {
    try {
      const advisory = (await getPool().query(
        `SELECT id, author_user_id AS "authorUserId", authored_at AS "authoredAt"
         FROM case_file_advisories WHERE id = $1`,
        [req.params.advisoryId],
      )).rows[0];
      if (!advisory) return res.status(404).json({ message: "Clinical Advisory not found" });
      const author = await storage.getUserById(advisory.authorUserId);
      const authorName = [author?.firstName, author?.lastName].filter(Boolean).join(" ") || null;
      res.json({
        document: "Clinical Advisory",
        advisoryId: advisory.id,
        authorName,
        authoredAt: advisory.authoredAt,
        isVerified: true,
      });
    } catch (error) {
      req.log?.error({ err: error }, "Case File Clinical Advisory verification failed");
      res.status(500).json({ message: "Failed to verify Clinical Advisory" });
    }
  });

  app.post("/api/bookings/:bookingId/case-file/attachments", isAuthenticated, caseFileUpload.single("file"), async (req: any, res) => {
    try {
      const access = await getCaseFileParticipant(req.params.bookingId, req.user);
      if (!access.booking) return res.status(404).json({ message: "Booking not found" });
      if (!access.allowed || (!access.isSeeker && !access.isProvider)) return res.status(403).json({ message: "Only Case File participants may attach files" });
      const category = access.isProvider ? "uncategorized" : String(req.body?.category || "uncategorized").toLowerCase();
      if (access.isSeeker && !CASE_FILE_SEEKER_CATEGORIES.has(category)) return res.status(400).json({ message: "Seeker attachments require Lab, Radiology, Treatment Chart, or General category" });
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const video = isCaseFileVideo(req.file.originalname, req.file.mimetype);
      if (video && req.file.size > 75 * 1024 * 1024) return res.status(413).json({ message: "Choose a video smaller than 75 MB." });
      if (!video && req.file.size > 25 * 1024 * 1024) return res.status(413).json({ message: "Choose a file smaller than 25 MB." });
      let durationSeconds: number | null = null;
      let playback: Buffer | undefined;
      if (video) {
        try {
          const inspected = await inspectCaseFileVideo(req.file.buffer);
          if (inspected.durationSeconds > 120.05) return res.status(400).json({ message: "Video must be 2 minutes or less." });
          durationSeconds = inspected.durationSeconds;
          playback = inspected.playback;
          req.file.mimetype = inspected.mimeType;
        } catch (error) {
          req.log?.warn({ err: error }, "Invalid Case File video");
          return res.status(400).json({ message: "Could not verify this video's duration or format." });
        }
      } else if (!req.file.mimetype || req.file.mimetype === "application/octet-stream") {
        const extension = path.extname(req.file.originalname).toLowerCase();
        const types: Record<string, string> = {
          ".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
          ".png": "image/png", ".gif": "image/gif", ".dcm": "application/dicom",
          ".doc": "application/msword",
          ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        };
        if (types[extension]) req.file.mimetype = types[extension];
      }
      const source = ["camera", "photo_gallery", "document"].includes(String(req.body?.source || "document"))
        ? String(req.body?.source || "document")
        : "document";

      const digest = createHash("sha256");
      for (const part of [access.booking.id, req.user.id, source, category, req.file.originalname, req.file.mimetype]) {
        digest.update(String(part)).update("\0");
      }
      digest.update(req.file.buffer);
      const stableId = digest.digest("hex");
      const messageId = `case-file-message-${stableId}`;
      const attachmentId = `case-file-attachment-${stableId}`;
      const pool = getPool();
      const findExisting = async () => (await pool.query(
        `SELECT m.id AS message_id, m.booking_id, m.sender_user_id, m.sender_role, m.kind, m.body,
                m.created_at AS message_created_at, a.id AS attachment_id, a.original_filename,
                a.mime_type, a.byte_size, a.duration_seconds, a.source, a.category, a.uploader_user_id, a.uploader_role,
                a.created_at AS attachment_created_at
         FROM case_file_attachments a
         JOIN case_file_messages m ON m.id = a.message_id
         WHERE a.id = $1`,
        [attachmentId],
      )).rows[0];
      const messageResponse = (row: any) => ({
        id: row.message_id,
        bookingId: row.booking_id,
        senderUserId: row.sender_user_id,
        senderRole: row.sender_role,
        kind: row.kind,
        body: row.body,
        createdAt: row.message_created_at,
        attachment: {
          id: row.attachment_id,
          bookingId: row.booking_id,
          messageId: row.message_id,
          uploaderUserId: row.uploader_user_id,
          uploaderRole: row.uploader_role,
          originalFilename: row.original_filename,
          mimeType: row.mime_type,
          byteSize: row.byte_size,
          durationSeconds: row.duration_seconds,
          objectPath: null,
          legacyUrl: null,
          source: row.source,
          category: row.category,
          createdAt: row.attachment_created_at,
        },
      });

      const existing = await findExisting();
      if (existing) {
        if (existing.booking_id !== access.booking.id || existing.uploader_user_id !== req.user.id) {
          return res.status(409).json({ message: "This document upload conflicts with an existing attachment." });
        }
        return res.status(200).json(messageResponse(existing));
      }
      if (caseFileReadOnly(access.booking)) return res.status(403).json({ message: "This Case File is read-only" });

      let fileUrl: string | null = null;
      let playbackPath: string | null = null;
      try {
        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase storage is not configured");
        fileUrl = await uploadPrivateCaseFile(req.file.buffer, req.file.originalname, req.file.mimetype, attachmentId);
        if (playback) playbackPath = await uploadPrivateCaseFile(playback, "playback.mp4", "video/mp4", `${attachmentId}-playback`);
      } catch (error) {
        if (fileUrl) await deletePrivateCaseFile(fileUrl).catch(() => {});
        if (process.env.NODE_ENV === "production") return res.status(503).json({ message: "File storage is temporarily unavailable. Please try again later." });
        throw error;
      }
      const client = await pool.connect();
      const now = new Date();
      try {
        await client.query("BEGIN");
        await client.query("INSERT INTO case_file_messages (id, booking_id, sender_user_id, sender_role, kind, created_at) VALUES ($1,$2,$3,$4,'attachment',$5)", [messageId, access.booking.id, req.user.id, req.user.role, now]);
        await client.query("INSERT INTO case_file_attachments (id, booking_id, message_id, uploader_user_id, uploader_role, original_filename, mime_type, byte_size, duration_seconds, object_path, playback_path, source, category, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)", [attachmentId, access.booking.id, messageId, req.user.id, req.user.role, req.file.originalname, req.file.mimetype, req.file.size, durationSeconds, fileUrl, playbackPath, source, category, now]);
        const bookingDocumentUrl = `/api/bookings/${encodeURIComponent(access.booking.id)}/case-file/attachments/${encodeURIComponent(attachmentId)}/download`;
        if (category === "general") {
          await client.query(
            `UPDATE bookings
             SET document_urls = CASE
               WHEN $2 = ANY(COALESCE(document_urls, ARRAY[]::text[])) THEN COALESCE(document_urls, ARRAY[]::text[])
               ELSE array_append(COALESCE(document_urls, ARRAY[]::text[]), $2)
             END
             WHERE id = $1`,
            [access.booking.id, bookingDocumentUrl],
          );
        } else if (category === "treatment_chart") {
          await client.query(
            `UPDATE bookings
             SET treatment_chart_urls = CASE
               WHEN $2 = ANY(COALESCE(treatment_chart_urls, ARRAY[]::text[])) THEN COALESCE(treatment_chart_urls, ARRAY[]::text[])
               ELSE array_append(COALESCE(treatment_chart_urls, ARRAY[]::text[]), $2)
             END
             WHERE id = $1`,
            [access.booking.id, bookingDocumentUrl],
          );
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        const duplicate = await findExisting();
        if (duplicate && duplicate.booking_id === access.booking.id && duplicate.uploader_user_id === req.user.id) {
          return res.status(200).json(messageResponse(duplicate));
        }
        if (fileUrl) {
          try {
            await deletePrivateCaseFile(fileUrl);
            if (playbackPath) await deletePrivateCaseFile(playbackPath);
          } catch (cleanupError) {
            req.log?.warn({ err: cleanupError }, "Case File attachment cleanup failed");
          }
        }
        throw error;
      } finally {
        client.release();
      }
      broadcastCaseFileUpdate(access.booking, { type: "case_file_updated", bookingId: access.booking.id, change: "attachment_finalized", messageId });
      res.status(201).json({
        id: messageId,
        bookingId: access.booking.id,
        senderUserId: req.user.id,
        senderRole: req.user.role,
        kind: "attachment",
        body: null,
        createdAt: now,
        attachment: {
          id: attachmentId,
          bookingId: access.booking.id,
          messageId,
          uploaderUserId: req.user.id,
          uploaderRole: req.user.role,
          originalFilename: req.file.originalname,
          mimeType: req.file.mimetype,
          byteSize: req.file.size,
          durationSeconds,
          objectPath: null,
          legacyUrl: null,
          source,
          category,
          createdAt: now,
        },
      });
    } catch (error) {
      req.log?.error({ err: error }, "Case File attachment failed");
      res.status(500).json({ message: "Failed to upload attachment" });
    }
  });

  app.patch("/api/bookings/:bookingId/case-file/follow-up-access", isAuthenticated, async (req: any, res) => {
    try {
      const access = await getCaseFileParticipant(req.params.bookingId, req.user);
      if (!access.booking) return res.status(404).json({ message: "Booking not found" });
      if (!access.allowed || !access.isProvider) return res.status(403).json({ message: "Only the assigned Provider may update follow-up access" });
      if (caseFileReadOnly(access.booking)) return res.status(403).json({ message: "This Case File is read-only" });
      if (access.booking.bookingType === "consultation") {
        const callsEnabled = req.body?.callsEnabled;
        const videoEnabled = req.body?.videoEnabled;
        if (typeof callsEnabled !== "boolean" && typeof videoEnabled !== "boolean") {
          return res.status(400).json({ message: "callsEnabled or videoEnabled is required" });
        }
        if (typeof callsEnabled === "boolean" && typeof videoEnabled === "boolean" && callsEnabled !== videoEnabled) {
          return res.status(400).json({ message: "Consultation calls and video share one lifecycle status." });
        }

        const lifecycle = resolveConsultationLifecycle(access.booking);
        if (!lifecycle.scheduleAvailable || !["ongoing", "paused"].includes(lifecycle.status)) {
          return res.status(409).json({ message: "Only an active consultation can be paused or resumed." });
        }
        const shouldEnableCalls = callsEnabled ?? videoEnabled;
        const nextStatus = shouldEnableCalls ? "ongoing" : "paused";
        const updated = await storage.updateBooking(access.booking.id, { status: nextStatus });
        if (!updated) return res.status(404).json({ message: "Booking not found" });
        broadcastCaseFileUpdate(updated, { type: "case_file_updated", bookingId: updated.id, change: "consultation_status_changed" });
        const isOngoing = resolveConsultationLifecycle(updated).status === "ongoing";
        return res.json({
          canMessage: true,
          canAttach: true,
          canAddVitals: false,
          canComposeAdvisory: true,
          canToggleFollowUp: true,
          readOnly: false,
          callsEnabled: isOngoing,
          videoEnabled: isOngoing,
        });
      }
      const patch: Record<string, boolean> = {};
      if (typeof req.body?.callsEnabled === "boolean") patch.postRxCallsEnabled = req.body.callsEnabled;
      if (typeof req.body?.videoEnabled === "boolean") patch.postRxVideoEnabled = req.body.videoEnabled;
      if (!Object.keys(patch).length) return res.status(400).json({ message: "callsEnabled or videoEnabled is required" });
      await storage.updateBooking(access.booking.id, patch as any);
      broadcastCaseFileUpdate(access.booking, { type: "case_file_updated", bookingId: access.booking.id, change: "follow_up_access_changed" });
      res.json({ canMessage: true, canAttach: true, canAddVitals: false, canComposeAdvisory: true, canToggleFollowUp: true, readOnly: false, callsEnabled: patch.postRxCallsEnabled ?? (access.booking as any).postRxCallsEnabled, videoEnabled: patch.postRxVideoEnabled ?? (access.booking as any).postRxVideoEnabled });
    } catch (error) {
      res.status(500).json({ message: "Failed to update follow-up access" });
    }
  });

  app.post("/api/bookings", isAuthenticated, async (req: any, res) => {
    let mobileSlotLockClient: any = null;
    let mobileSlotLockConsultantId: string | null = null;
    let callbackDeviceGuardClient: any = null;
    const releaseCallbackDeviceGuard = async () => {
      if (!callbackDeviceGuardClient) return;
      const client = callbackDeviceGuardClient;
      callbackDeviceGuardClient = null;
      try {
        await client.query("ROLLBACK");
        client.release();
      } catch (error) {
        client.release(true);
        throw error;
      }
    };
    const releaseMobileSlotLock = async () => {
      if (!mobileSlotLockClient) return;
      const client = mobileSlotLockClient;
      const consultantId = mobileSlotLockConsultantId;
      mobileSlotLockClient = null;
      mobileSlotLockConsultantId = null;
      try {
        if (consultantId) {
          await client.query("SELECT pg_advisory_unlock(hashtext($1))", [consultantId]);
        }
      } catch (error) {
        console.error("Failed to release mobile booking advisory lock:", error);
        client.release(true);
        return;
      }
      if (client) {
        client.release();
      }
    };
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const {
        comorbidities: rawComorbidities,
        presentingComplaint: rawPresentingComplaint,
        presentIllness: rawPresentIllness,
        bookableStart: rawBookableStart,
        start: rawBookableTime,
        callbackDeviceId: rawCallbackDeviceId,
        ...bookingFields
      } = req.body || {};
      if (rawComorbidities != null && typeof rawComorbidities !== "string") {
        res.status(400).json({ message: "Comorbidities / Past Illness must be text." });
        return;
      }
      if (rawPresentingComplaint != null && typeof rawPresentingComplaint !== "string") {
        res.status(400).json({ message: "Presenting Complaint must be text." });
        return;
      }
      if (rawPresentIllness != null && typeof rawPresentIllness !== "string") {
        res.status(400).json({ message: "Present Illness must be text." });
        return;
      }
      const comorbidities = normalizeComorbidities(rawComorbidities);
      const presentingComplaint = typeof rawPresentingComplaint === "string"
        ? rawPresentingComplaint.trim() || null
        : null;
      const presentIllness = typeof rawPresentIllness === "string"
        ? rawPresentIllness.trim() || null
        : null;

      const bookingData = {
        ...bookingFields,
        userId,
      };
      // The client may choose a directory entry but cannot supply confirmation or reminder timestamps.
      delete bookingData.callbackDeviceConfirmedAt;
      delete bookingData.callbackDeviceRemindedAt;
      const requiresCallbackDevice = req.user?.role === "care_seeker" &&
        bookingData.bookingType === "consultation";
      if (requiresCallbackDevice && (typeof rawCallbackDeviceId !== "string" ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawCallbackDeviceId))) {
        return res.status(400).json({ message: "Select a registered, linked callback device with a staff name for this consultation." });
      }
      if (rawCallbackDeviceId !== undefined && rawCallbackDeviceId !== null) {
        if (bookingData.bookingType !== "consultation" ||
            typeof rawCallbackDeviceId !== "string" ||
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawCallbackDeviceId)) {
          return res.status(400).json({ message: "Select a valid callback device for this consultation." });
        }
        const client = await getPool().connect();
        callbackDeviceGuardClient = client;
        await client.query("BEGIN");
        // Keep this row stable against unlink/edit/archive until the booking is
        // inserted on a separate client.
        const device = await client.query(
          `SELECT id FROM consultation_callback_devices
           WHERE id = $1 AND user_id = $2 AND archived_at IS NULL
             AND installation_id IS NOT NULL AND btrim(installation_id) <> ''
             AND staff_name IS NOT NULL AND btrim(staff_name) <> ''
           FOR SHARE`,
          [rawCallbackDeviceId, userId],
        );
        if (!device.rows.length) {
          return res.status(400).json({
            message: "Select a registered, linked callback device with a staff name for this consultation.",
          });
        }
        bookingData.callbackDeviceId = rawCallbackDeviceId;
        bookingData.callbackDeviceConfirmedAt = new Date();
        bookingData.callbackDeviceRemindedAt = null;
      }

      // Validate and resolve follow-up parent booking
      if (bookingData.parentBookingId) {
        const parentBooking = await storage.getBookingById(bookingData.parentBookingId);
        if (!parentBooking || parentBooking.bookingType !== "consultation") {
          return res.status(400).json({ message: "Parent booking must be a valid consultation" });
        }
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        if (new Date(parentBooking.createdAt!) < sevenDaysAgo) {
          return res.status(400).json({ message: "Follow-up consultations can only be booked within 7 days of the original consultation" });
        }
        // Always link back to root booking (not a chain)
        bookingData.parentBookingId = parentBooking.parentBookingId || parentBooking.id;
        bookingData.isFollowUp = true;
        // Copy patient details from parent — seeker should not have to re-enter them
        bookingData.patientName = parentBooking.patientName;
        bookingData.patientAge = parentBooking.patientAge;
        bookingData.patientGender = parentBooking.patientGender;
        bookingData.patientContact = parentBooking.patientContact;
        bookingData.patientWeight = parentBooking.patientWeight || null;
        bookingData.patientAllergies = parentBooking.patientAllergies || null;
        bookingData.patientAllergyNotSpecified = parentBooking.patientAllergyNotSpecified ?? true;
        bookingData.uhidIpNumber = parentBooking.uhidIpNumber || null;
      }
      
      // For consultation bookings, link to the provider who owns the consultant
      if (bookingData.bookingType === "consultation" && bookingData.serviceId) {
        const consultant = await storage.getConsultantById(bookingData.serviceId);
        if (rawBookableStart != null) {
          if (typeof rawBookableStart !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(rawBookableStart)
            || typeof rawBookableTime !== "string" || !/^\d{2}:\d{2}$/.test(rawBookableTime)) {
            return res.status(400).json({ message: "Mobile booking requires bookableStart (YYYY-MM-DD) and start (HH:mm)." });
          }
          if (!consultant) return res.status(404).json({ message: "Consultant not found" });
          const nowParts = new Intl.DateTimeFormat("en-US", {
            timeZone: "Asia/Kolkata",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).formatToParts(new Date());
          const nowPart = (type: Intl.DateTimeFormatPartTypes) => nowParts.find(part => part.type === type)?.value ?? "";
          const today = `${nowPart("year")}-${nowPart("month")}-${nowPart("day")}`;
          const lastAllowedDate = new Date(`${today}T00:00:00Z`);
          lastAllowedDate.setUTCDate(lastAllowedDate.getUTCDate() + 29);
          const lastAllowed = `${lastAllowedDate.getUTCFullYear()}-${String(lastAllowedDate.getUTCMonth() + 1).padStart(2, "0")}-${String(lastAllowedDate.getUTCDate()).padStart(2, "0")}`;
          if (rawBookableStart < today || rawBookableStart > lastAllowed) {
            return res.status(409).json({ message: "This appointment slot is outside the current 30-day booking horizon." });
          }
          mobileSlotLockClient = await getPool().connect();
          mobileSlotLockConsultantId = consultant.id;
          await mobileSlotLockClient.query("SELECT pg_advisory_lock(hashtext($1))", [consultant.id]);
          const [slotOverrides, bookingsByConsultant] = await Promise.all([
            storage.getSlotOverrides(consultant.id),
            getConsultationSlotsForRange([consultant.id], rawBookableStart, rawBookableStart),
          ]);
          const dateSlots = getConsultantBookableSlots(
            consultant,
            slotOverrides,
            bookingsByConsultant.get(consultant.id) ?? [],
            rawBookableStart,
            rawBookableStart,
          );
          const requestedSlot = dateSlots.flatMap(item => item.slots).find(slot => slot.start === rawBookableTime);
          if (!requestedSlot) {
            return res.status(409).json({ message: "This appointment slot is no longer available. Please choose another time." });
          }
          if (!resolveConsultationLifecycle({ appointmentSlot: requestedSlot.appointmentSlot }).scheduleAvailable) {
            return res.status(503).json({ message: "This appointment time could not be confirmed. Please choose another slot." });
          }
          bookingData.appointmentSlot = requestedSlot.appointmentSlot;
        }
        if (consultant && consultant.status !== "active") {
          res.status(409).json({ message: "This consultant is currently unavailable for new bookings." });
          return;
        }
        if (consultant && consultant.providerId) {
          bookingData.providerId = consultant.providerId;
        }
        
        if (process.env.CALL_MEDIA_PROVIDER === "daily") {
          const roomName = `perfusion-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          const dailyRoom = await createDailyRoom(roomName);
          bookingData.videoRoomId = dailyRoom ? dailyRoom.url : null;
        } else {
          // Keep existing booking call links without provisioning a Daily room.
          bookingData.id = randomUUID();
          bookingData.videoRoomId = `stream://booking/${bookingData.id}`;
        }
      }
      if (rawBookableStart != null && bookingData.bookingType !== "consultation") {
        return res.status(400).json({ message: "Mobile bookable slots are only supported for consultation bookings." });
      }
      
      // For lab bookings, auto-assign to enabled provider for that test
      if (bookingData.bookingType === "lab" && bookingData.serviceId) {
        const enabledProvider = await storage.getEnabledProviderForTest(bookingData.serviceId);
        if (enabledProvider) {
          bookingData.providerId = enabledProvider.providerId;
          // Get provider name for display
          const provider = await storage.getProviderById(enabledProvider.providerId);
          if (provider) {
            bookingData.providerName = provider.name;
          }
        }
      }
      
      // For teleradiology bookings, auto-assign to enabled provider for that modality
      if (bookingData.bookingType === "teleradiology" && bookingData.modalityId) {
        const enabledProvider = await storage.getEnabledProviderForModality(bookingData.modalityId);
        if (enabledProvider) {
          bookingData.providerId = enabledProvider.providerId;
          const provider = await storage.getProviderById(enabledProvider.providerId);
          if (provider) {
            bookingData.providerName = provider.name;
          }
        }
      }

      // Calculate billing fields — amount from frontend should be the customer price
      const defaultMarginSetting = await storage.getPlatformSetting("default_margin_percent");
      const defaultMarginPct = parseFloat(defaultMarginSetting?.settingValue || "15");
      let sentAmount = parseFloat(bookingData.amount);

      let providerBaseCost = sentAmount;
      let serviceOverridePrice: string | null = null;
      let serviceOverrideMargin: string | null = null;

      if (bookingData.bookingType === "lab" && bookingData.serviceId) {
        const labTest = await storage.getLabTestById(bookingData.serviceId);
        const enabledProvider = await storage.getEnabledProviderForTest(bookingData.serviceId);
        providerBaseCost = parseFloat(enabledProvider?.price || labTest?.cost || bookingData.amount);
        serviceOverridePrice = labTest?.customerPrice || null;
        serviceOverrideMargin = labTest?.marginOverride || null;
      } else if (bookingData.bookingType === "consultation" && bookingData.serviceId) {
        const consultant = await storage.getConsultantById(bookingData.serviceId);
        if (consultant) {
          const isFollowUpBooking = bookingData.isFollowUp === true;
          const effectiveFee = (isFollowUpBooking && consultant.followUpFee)
            ? consultant.followUpFee
            : consultant.consultationFee;
          providerBaseCost = parseFloat(effectiveFee);
          serviceOverridePrice = consultant.customerPrice || null;
          serviceOverrideMargin = consultant.marginOverride || null;
        }
      }

      const pricing = calculateCustomerPrice(providerBaseCost, serviceOverridePrice, serviceOverrideMargin, defaultMarginPct);

      if (Math.abs(sentAmount - providerBaseCost) < 0.01) {
        sentAmount = pricing.customerPrice;
      }

      const customerAmount = sentAmount;
      const marginAmount = customerAmount - providerBaseCost;
      const marginPercent = providerBaseCost > 0 ? (marginAmount / providerBaseCost) * 100 : 0;

      bookingData.basePrice = providerBaseCost.toFixed(2);
      bookingData.marginPercent = marginPercent.toFixed(2);
      bookingData.marginAmount = marginAmount.toFixed(2);
      bookingData.amount = customerAmount.toFixed(2);
      bookingData.paymentStatus = bookingData.paymentStatus || "pending";
      bookingData.amountPaid = "0";

      if (bookingData.paymentMethod === "pay_now") {
        bookingData.dueDate = new Date();
      } else {
        const dueDate = new Date();
        dueDate.setMonth(dueDate.getMonth() + 1);
        bookingData.dueDate = dueDate;
        bookingData.paymentMethod = "pay_later";
      }
      
      bookingData.bookingNumber = await generateBookingNumber(bookingData.bookingType);

      const booking = bookingData.bookingType === "consultation"
        ? await storage.createConsultationBooking(bookingData, {
          comorbidities,
          presentingComplaint,
          presentIllness,
        })
        : await storage.createBooking(bookingData);
      await releaseMobileSlotLock();
      await releaseCallbackDeviceGuard();

      if (booking.bookingType === "lab") {
        const seekerProvider = await storage.getProviderByUserId(userId);
        const bookingDate = new Date();
        const dateStr = bookingDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
        const timeStr = bookingDate.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });

        notifyAdminLabBooking({
          bookingId: booking.bookingNumber || booking.id,
          seekerHospitalName: seekerProvider?.name || "Unknown Hospital",
          testName: booking.serviceName || "Lab Test",
          bookingDateTime: `${dateStr}, ${timeStr}`,
          contactPersonName: "",
          contactPersonNumber: "",
        }).catch((err: any) => console.error("[Twilio] Lab booking notification failed:", err));
      }

      if (booking.bookingType === "consultation") {
        const seekerProvider = await storage.getProviderByUserId(userId);
        const bookingDate = new Date();
        const dateStr = bookingDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
        const timeStr = bookingDate.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
        const appointmentDateTime = booking.appointmentSlot
          ? `${booking.appointmentSlot}, ${dateStr}`
          : `${dateStr}, ${timeStr}`;

        notifyAdminConsultantBooking({
          seekerHospitalName: seekerProvider?.name || "Unknown Hospital",
          consultantName: booking.serviceName || "Consultant",
          appointmentDateTime,
        }).catch((err: any) => console.error("[Twilio] Consultant booking notification failed:", err));
      }

      res.status(201).json(booking);
    } catch (error: any) {
      console.error("Error creating booking:", error?.message || error, error?.stack);
      res.status(500).json({ message: error?.message || "Failed to create booking" });
    } finally {
      await releaseMobileSlotLock();
      await releaseCallbackDeviceGuard();
    }
  });

  app.patch("/api/bookings/:id/status", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      
      // Only admin or providers can update booking status
      if (user.role !== "admin" && user.role !== "provider") {
        return res.status(403).json({ message: "Access denied. Only admins and providers can update booking status." });
      }
      
      // Fetch the booking first
      const existingBooking = await storage.getBookingById(req.params.id);
      if (!existingBooking) {
        return res.status(404).json({ message: "Booking not found" });
      }

      if (existingBooking.bookingType === "consultation") {
        if (user.role !== "provider") {
          return res.status(403).json({ message: "Only the assigned Provider may pause or resume a consultation." });
        }
        const requestedStatus = req.body?.status;
        if (requestedStatus !== "ongoing" && requestedStatus !== "paused") {
          return res.status(400).json({ message: "Consultation status must be ongoing or paused." });
        }
        const provider = await storage.getProviderByUserId(user.id);
        if (!provider || existingBooking.providerId !== provider.id) {
          return res.status(403).json({ message: "You can only update consultations assigned to you." });
        }

        const lifecycle = resolveConsultationLifecycle(existingBooking);
        if (!lifecycle.scheduleAvailable) {
          return res.status(409).json({ message: "The consultation schedule does not contain a usable start time." });
        }
        if (lifecycle.status !== "ongoing" && lifecycle.status !== "paused") {
          return res.status(409).json({ message: "Only an ongoing consultation can be paused or resumed." });
        }

        const updatedBooking = await storage.updateBooking(req.params.id, { status: requestedStatus });
        if (!updatedBooking) return res.status(404).json({ message: "Booking not found" });
        broadcastCaseFileUpdate(updatedBooking, {
          type: "case_file_updated",
          bookingId: updatedBooking.id,
          change: "consultation_status_changed",
        });
        return res.json(withConsultationLifecycle(updatedBooking));
      }
      
      // If provider, verify they have access to this booking
      // Providers can update bookings where providerId is null (unassigned) or matches their id
      if (user.role === "provider") {
        const provider = await storage.getProviderByUserId(user.id);
        if (!provider) {
          return res.status(403).json({ message: "Provider profile not found" });
        }
        // Allow if booking is unassigned (providerId is null) or belongs to this provider
        if (existingBooking.providerId !== null && existingBooking.providerId !== provider.id) {
          return res.status(403).json({ message: "Access denied. You can only update your own bookings." });
        }
      }
      if (caseFileReadOnly(existingBooking) && (req.body?.reportUrl || req.body?.reportNotes)) {
        return res.status(403).json({ message: "This Case File is read-only" });
      }
      
      const { status, reportUrl, reportNotes } = req.body as { 
        status: BookingStatus; 
        reportUrl?: string; 
        reportNotes?: string;
      };
      
      // Build update data
      const updateData: any = { status };
      if (reportUrl) updateData.reportUrl = reportUrl;
      if (reportNotes) updateData.reportNotes = reportNotes;
      
      const booking = await storage.updateBooking(req.params.id, updateData);
      
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }
      if (status === "report_ready" && booking.bookingType !== "consultation") {
        const sendReportNotification = (processedReportPublicUrl?: string) => {
          let userPhone = booking.patientContact;
          const lookupAndNotify = async () => {
            if (!userPhone && booking.userId) {
              const bookingUser = await storage.getUserById(booking.userId);
              if (bookingUser?.phone) userPhone = bookingUser.phone;
            }
            if (!userPhone) userPhone = process.env.ADMIN_PHONE_NUMBER || null;
            if (userPhone) {
              notifyUserReportReady(
                userPhone,
                booking.patientName || "Patient",
                booking.serviceName || "Test",
                booking.bookingNumber || booking.id,
                processedReportPublicUrl
              ).catch((err: any) => console.error("[Twilio] Report ready notification failed:", err));
            }
          };
          lookupAndNotify().catch(console.error);
        };

        if (booking.reportUrl) {
          const reportFilePath = booking.reportUrl.startsWith("/")
            ? path.join(process.cwd(), booking.reportUrl)
            : booking.reportUrl;

          let providerLabName = "Provider Laboratory";
          if (booking.providerId) {
            const provider = await storage.getProviderById(booking.providerId);
            if (provider?.name) providerLabName = provider.name;
          }

          const appBaseUrl = process.env.REPLIT_DEV_DOMAIN
            ? `https://${process.env.REPLIT_DEV_DOMAIN}`
            : "https://perfusionhealth.com";

          const reportData: BookingReportData = {
            bookingNumber: booking.bookingNumber || String(booking.id),
            patientName: booking.patientName || "Patient",
            patientAge: booking.patientAge || "—",
            patientGender: booking.patientGender || "—",
            testName: booking.serviceName || "Lab Test",
            providerLabName,
            reportDate: new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
            expectedTAT: "As per test",
            actualTAT: "Completed",
            verificationUrl: `${appBaseUrl}/verify/${booking.bookingNumber || booking.id}`,
          };

          processReport(reportFilePath, reportData)
            .then(async (processedUrl) => {
              await storage.updateBooking(booking.id, { processedReportUrl: processedUrl });
              console.log(`[ReportProcessor] Booking ${booking.id} processed report saved: ${processedUrl}`);
              const publicMediaUrl = `${appBaseUrl}${processedUrl}`;
              sendReportNotification(publicMediaUrl);
            })
            .catch((err) => {
              console.error(`[ReportProcessor] Failed to process report for booking ${booking.id}:`, err);
              sendReportNotification();
            });
        } else {
          sendReportNotification();
        }
      }
      
      res.json(booking);
    } catch (error) {
      console.error("Error updating booking status:", error);
      res.status(500).json({ message: "Failed to update booking status" });
    }
  });

  // Generate/update Clinical Advisory for consultation bookings
  app.patch("/api/bookings/:id/prescription", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      const booking = await storage.getBookingById(req.params.id);
      
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }
      if (caseFileReadOnly(booking)) return res.status(403).json({ message: "This Case File is read-only" });
      
      // Only allow providers and admins to generate Clinical Advisories
      if (user.role !== "provider" && user.role !== "admin") {
        return res.status(403).json({ message: "Only providers can generate Clinical Advisories" });
      }
      
      // For providers, verify they own this booking (via consultant ownership)
      if (user.role === "provider") {
        const provider = await storage.getProviderByUserId(user.id);
        if (!provider) {
          return res.status(403).json({ message: "Provider profile not found" });
        }
        // Check if this consultant belongs to this provider (only enforced when the consultant has a provider assigned)
        const consultant = await storage.getConsultantById(booking.serviceId);
        if (!consultant) {
          return res.status(404).json({ message: "Consultant not found for this booking" });
        }
        if (consultant.providerId && consultant.providerId !== provider.id) {
          return res.status(403).json({ message: "You can only generate Clinical Advisories for your own consultations" });
        }
      }
      
      // Only for consultation bookings
      if (booking.bookingType !== "consultation") {
        return res.status(400).json({ message: "Clinical Advisories can only be generated for consultations" });
      }

      // Reject edits on approved (signed & locked) Clinical Advisories
      if ((booking as any).prescriptionApprovedAt) {
        return res.status(409).json({ message: "This Clinical Advisory has been confirmed and is permanently locked. It cannot be edited." });
      }
      
      const { diagnosis, medications, advice, followUp, physicianNotes } = req.body as {
        diagnosis: string;
        medications: string;
        advice: string;
        followUp?: string;
        physicianNotes?: string;
      };
      
      if (!diagnosis || diagnosis.trim().length === 0) {
        return res.status(400).json({ message: "Diagnosis is required" });
      }
      
      const updated = await storage.updateBooking(req.params.id, {
        prescriptionDiagnosis: diagnosis.trim(),
        prescriptionMedications: medications?.trim() || null,
        prescriptionAdvice: advice?.trim() || null,
        prescriptionPhysicianNotes: physicianNotes?.trim() || null,
        prescriptionFollowUp: followUp?.trim() || null,
        prescriptionGeneratedAt: new Date(),
      } as any);
      
      res.json(updated);
    } catch (error) {
      console.error("Error generating Clinical Advisory:", error);
      res.status(500).json({ message: "Failed to generate Clinical Advisory" });
    }
  });

  // Generate Clinical Advisory PDF
  app.get("/api/bookings/:id/prescription-pdf", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const booking = await storage.getBookingById(req.params.id);
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }
      
      // Allow the booking user, provider, or admin to access
      const isOwner = booking.userId === userId;
      const isAdminUser = req.user.role === "admin";
      let isProviderUser = false;
      if (req.user.role === "provider") {
        const provider = await storage.getProviderByUserId(userId);
        if (provider && booking.providerId === provider.id) {
          isProviderUser = true;
        }
      }
      
      if (!isOwner && !isAdminUser && !isProviderUser) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      if (!booking.prescriptionGeneratedAt) {
        return res.status(404).json({ message: "No Clinical Advisory generated yet" });
      }

      // For confirmed (signed & locked) Clinical Advisories, serve only the frozen stored PDF
      if ((booking as any).prescriptionApprovedAt && (booking as any).prescriptionPdfUrl) {
        return res.json({
          locked: true,
          prescriptionPdfUrl: (booking as any).prescriptionPdfUrl,
          message: "This Clinical Advisory has been confirmed and is available as a signed PDF.",
        });
      }
      
      // Fetch consultant details for the Clinical Advisory
      let consultant: any = null;
      if (booking.serviceId) {
        consultant = await storage.getConsultantById(booking.serviceId);
      }

      // Fetch care seeker (user) details for referring facility info
      const bookingUser = await storage.getUserById(booking.userId);
      
      // Build Clinical Advisory data object for PDF generation
      const prescriptionData = {
        prescriptionId: booking.bookingNumber || `PFN-${booking.id.substring(0, 8).toUpperCase()}`,
        dateTime: booking.prescriptionGeneratedAt ? new Date(booking.prescriptionGeneratedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : new Date().toLocaleString("en-IN"),
        mode: "Teleconsultation",
        referringFacility: bookingUser?.hospitalName || null,
        referringDoctor: null as string | null,
        referringPhysician: (booking as any).referringPhysician || null,
        onCallDoctorName: (booking as any).onCallDoctorName || null,
        onCallDoctorDesignation: (booking as any).onCallDoctorDesignation || null,
        patientName: booking.patientName,
        patientAge: booking.patientAge,
        patientGender: booking.patientGender,
        uhidIpNumber: (booking as any).uhidIpNumber || null,
        patientContact: booking.patientContact,
        patientWeight: (booking as any).patientWeight || null,
        patientAllergies: (booking as any).patientAllergyNotSpecified ? null : (booking as any).patientAllergies,
        patientAllergyNotSpecified: (booking as any).patientAllergyNotSpecified,
        consultantName: consultant?.name || booking.serviceName,
        consultantSpecialization: consultant?.specialization || null,
        consultantQualification: consultant?.qualification || booking.providerName,
        consultantRegistrationNo: consultant?.registrationNumber || null,
        consultantYearsExperience: consultant?.yearsExperience || null,
        consultantAffiliation: consultant?.affiliatedInstitution || null,
        consultantSignatureUrl: consultant?.digitalSignatureUrl || null,
        clinicalHistory: booking.clinicalSummary || null,
        examination: booking.examination || null,
        investigations: booking.investigations || null,
        diagnosis: booking.prescriptionDiagnosis || null,
        physicianNotes: (booking as any).prescriptionPhysicianNotes || null,
        treatmentPlan: booking.prescriptionMedications || null,
        followUp: booking.prescriptionFollowUp || null,
      };

      res.json(prescriptionData);
    } catch (error) {
      console.error("Error generating Clinical Advisory PDF data:", error);
      res.status(500).json({ message: "Failed to generate Clinical Advisory" });
    }
  });

  // Confirm & Sign Clinical Advisory (provider-only: locks + atomically saves current draft + generates server-side frozen PDF + audit log)
  app.post("/api/bookings/:id/prescription/confirm", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;

      // Only providers (assigned consultant's owner) may digitally sign — not admins
      if (user.role !== "provider") {
        return res.status(403).json({ message: "Only the assigned provider may confirm and sign a Clinical Advisory." });
      }

      const booking = await storage.getBookingById(req.params.id);
      if (!booking) return res.status(404).json({ message: "Booking not found" });
      if (booking.bookingType !== "consultation") return res.status(400).json({ message: "Only consultation bookings can have Clinical Advisories confirmed" });

      // Ownership: verify the consultant belongs to this provider (only enforced when the consultant has a provider assigned)
      const provider = await storage.getProviderByUserId(user.id);
      if (!provider) return res.status(403).json({ message: "Provider profile not found" });
      const consultant = await storage.getConsultantById(booking.serviceId);
      if (!consultant) {
        return res.status(404).json({ message: "Consultant not found for this booking" });
      }
      // If the consultant has a provider assigned, enforce ownership. If not (e.g. admin-seeded), allow any provider.
      if (consultant.providerId && consultant.providerId !== provider.id) {
        return res.status(403).json({ message: "You can only sign Clinical Advisories for your own consultants" });
      }

      if ((booking as any).prescriptionApprovedAt) {
        return res.status(409).json({ message: "Clinical Advisory is already confirmed and permanently locked." });
      }

      // Accept current Clinical Advisory content from request body (atomic save+confirm)
      const { diagnosis, medications, physicianNotes, followUp } = req.body as {
        diagnosis?: string;
        medications?: string;
        physicianNotes?: string;
        followUp?: string;
      };

      const finalDiagnosis = (diagnosis || "").trim() || booking.prescriptionDiagnosis || null;
      if (!finalDiagnosis) {
         return res.status(400).json({ message: "Diagnosis is required before confirming a Clinical Advisory." });
      }

      // Atomically update Clinical Advisory content before confirming
      if (diagnosis !== undefined || medications !== undefined || physicianNotes !== undefined || followUp !== undefined) {
        await storage.updateBooking(booking.id, {
          prescriptionDiagnosis: finalDiagnosis,
          prescriptionMedications: (medications || "").trim() || booking.prescriptionMedications || null,
          prescriptionPhysicianNotes: (physicianNotes || "").trim() || (booking as any).prescriptionPhysicianNotes || null,
          prescriptionFollowUp: (followUp || "").trim() || booking.prescriptionFollowUp || null,
          prescriptionGeneratedAt: new Date(),
        } as any);
      }

      // Re-fetch with updated data
      const freshBooking = await storage.getBookingById(booking.id);
      if (!freshBooking) return res.status(404).json({ message: "Booking not found after update" });

      const bookingUser = await storage.getUserById(freshBooking.userId);
      const approvedAt = new Date();
      // Use req.ip which respects 'trust proxy' setting for reliable IP attribution
      const approverIp = req.ip || req.socket?.remoteAddress || "unknown";

      // Build base URL for QR code
      const protocol = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers.host || "localhost:5000";
      const baseUrl = process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : `${protocol}://${host}`;

      const providerDisplayName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email || user.id;

      const pdfData: PrescriptionPdfData = {
        bookingId: freshBooking.id,
        bookingNumber: (freshBooking as any).bookingNumber || `PFN-${freshBooking.id.substring(0, 8).toUpperCase()}`,
        approvedAt,
        approverIp,
        referringFacility: bookingUser?.hospitalName || null,
        referringPhysician: (freshBooking as any).referringPhysician || null,
        onCallDoctorName: (freshBooking as any).onCallDoctorName || null,
        onCallDoctorDesignation: (freshBooking as any).onCallDoctorDesignation || null,
        patientName: freshBooking.patientName,
        patientAge: freshBooking.patientAge,
        patientGender: freshBooking.patientGender,
        uhidIpNumber: (freshBooking as any).uhidIpNumber || null,
        patientContact: freshBooking.patientContact,
        patientWeight: (freshBooking as any).patientWeight || null,
        patientAllergies: (freshBooking as any).patientAllergyNotSpecified ? null : (freshBooking as any).patientAllergies,
        patientAllergyNotSpecified: (freshBooking as any).patientAllergyNotSpecified ?? true,
        consultantName: consultant.name,
        consultantSpecialization: consultant.specialization || null,
        consultantQualification: consultant.qualification || null,
        consultantRegistrationNo: consultant.registrationNumber || null,
        consultantYearsExperience: consultant.yearsExperience || null,
        consultantAffiliation: consultant.affiliatedInstitution || null,
        consultantSignatureUrl: consultant.digitalSignatureUrl || null,
        clinicalHistory: freshBooking.clinicalSummary || null,
        examination: freshBooking.examination || null,
        investigations: freshBooking.investigations || null,
        diagnosis: freshBooking.prescriptionDiagnosis || null,
        physicianNotes: (freshBooking as any).prescriptionPhysicianNotes || null,
        treatmentPlan: freshBooking.prescriptionMedications || null,
        followUp: freshBooking.prescriptionFollowUp || null,
      };

      const prescriptionPdfUrl = await generateAndStorePrescriptionPdf(pdfData, baseUrl);

      // Lock the Clinical Advisory with approval metadata and reset all post-rx feature toggles
      const postRxExpiresAt = new Date(approvedAt.getTime() + 24 * 60 * 60 * 1000);
      const updated = await storage.updateBooking(freshBooking.id, {
        prescriptionApprovedAt: approvedAt,
        prescriptionApprovedByUserId: user.id,
        prescriptionApproverIp: approverIp,
        prescriptionOtpVerified: false,
        prescriptionPdfUrl,
        postRxExpiresAt,
        postRxVideoEnabled: false,
        postRxCallsEnabled: false,
        postRxUploadsEnabled: false,
      } as any);

      // Write medicolegal audit log
      await storage.createAuditLog({
        userId: user.id,
        action: "PRESCRIPTION_CONFIRMED",
        entityType: "booking",
        entityId: freshBooking.id,
        details: JSON.stringify({
          bookingNumber: (freshBooking as any).bookingNumber,
          consultantName: consultant.name,
          consultantRegistrationNo: consultant.registrationNumber || null,
          providerUserId: user.id,
          providerDisplayName,
          patientName: freshBooking.patientName,
          approverIp,
          prescriptionPdfUrl,
          confirmedAt: approvedAt.toISOString(),
        }),
      });

      res.json({ ...updated, prescriptionPdfUrl });
    } catch (error) {
      console.error("Error confirming Clinical Advisory:", error);
      res.status(500).json({ message: "Failed to confirm Clinical Advisory" });
    }
  });

  // Download a signed Clinical Advisory PDF — streams the file directly (regenerates if missing on disk)
  app.get("/api/bookings/:id/prescription/download", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const booking = await storage.getBookingById(req.params.id);
      if (!booking || booking.bookingType !== "consultation") {
        return res.status(404).json({ message: "Booking not found" });
      }

      // Auth: owner, provider assigned to this booking, or admin
      const isOwner = booking.userId === userId;
      const isAdminUser = req.user.role === "admin";
      let isProviderUser = false;
      if (req.user.role === "provider") {
        const provider = await storage.getProviderByUserId(userId);
        if (provider && booking.providerId === provider.id) isProviderUser = true;
      }
      if (!isOwner && !isAdminUser && !isProviderUser) {
        return res.status(403).json({ message: "Access denied" });
      }

      if (!(booking as any).prescriptionApprovedAt) {
        return res.status(404).json({ message: "Clinical Advisory has not been confirmed yet" });
      }

      // Try to serve the existing stored file first
      const storedRelPath = (booking as any).prescriptionPdfUrl as string | null;
      if (storedRelPath) {
        // Remote URL (Supabase Storage) — redirect the browser to it
        if (/^https?:\/\//i.test(storedRelPath)) {
          return res.redirect(storedRelPath);
        }
        const absPath = path.join(process.cwd(), storedRelPath);
        if (fs.existsSync(absPath)) {
          const safeName = `clinical-advisory-${(booking as any).bookingNumber || booking.id}.pdf`;
          res.setHeader("Content-Type", "application/pdf");
          res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
          return fs.createReadStream(absPath).pipe(res);
        }
      }

      // File missing (e.g. different deployment instance) — regenerate on the fly
      const bookingUser = await storage.getUserById(booking.userId);
      const consultant = booking.serviceId ? await storage.getConsultantById(booking.serviceId) : null;
      if (!consultant) {
        return res.status(404).json({ message: "Consultant not found; cannot regenerate PDF" });
      }

      const protocol = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers.host || "localhost:5000";
      const baseUrl = process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : `${protocol}://${host}`;

      const pdfData: PrescriptionPdfData = {
        bookingId: booking.id,
        bookingNumber: (booking as any).bookingNumber || `PFN-${booking.id.substring(0, 8).toUpperCase()}`,
        approvedAt: new Date((booking as any).prescriptionApprovedAt),
        approverIp: (booking as any).prescriptionApproverIp || "unknown",
        referringFacility: bookingUser?.hospitalName || null,
        referringPhysician: (booking as any).referringPhysician || null,
        onCallDoctorName: (booking as any).onCallDoctorName || null,
        onCallDoctorDesignation: (booking as any).onCallDoctorDesignation || null,
        patientName: booking.patientName,
        patientAge: booking.patientAge,
        patientGender: booking.patientGender,
        uhidIpNumber: (booking as any).uhidIpNumber || null,
        patientContact: booking.patientContact,
        patientWeight: (booking as any).patientWeight || null,
        patientAllergies: (booking as any).patientAllergyNotSpecified ? null : (booking as any).patientAllergies,
        patientAllergyNotSpecified: (booking as any).patientAllergyNotSpecified ?? true,
        consultantName: consultant.name,
        consultantSpecialization: consultant.specialization || null,
        consultantQualification: consultant.qualification || null,
        consultantRegistrationNo: consultant.registrationNumber || null,
        consultantYearsExperience: consultant.yearsExperience || null,
        consultantAffiliation: consultant.affiliatedInstitution || null,
        consultantSignatureUrl: consultant.digitalSignatureUrl || null,
        clinicalHistory: booking.clinicalSummary || null,
        examination: booking.examination || null,
        investigations: booking.investigations || null,
        diagnosis: booking.prescriptionDiagnosis || null,
        physicianNotes: (booking as any).prescriptionPhysicianNotes || null,
        treatmentPlan: booking.prescriptionMedications || null,
        followUp: booking.prescriptionFollowUp || null,
      };

      const newPdfUrl = await generateAndStorePrescriptionPdf(pdfData, baseUrl);
      // Persist the newly regenerated URL so future downloads are fast
      await storage.updateBooking(booking.id, { prescriptionPdfUrl: newPdfUrl } as any);

      // Remote URL (Supabase Storage) — redirect
      if (/^https?:\/\//i.test(newPdfUrl)) {
        return res.redirect(newPdfUrl);
      }

      const newAbsPath = path.join(process.cwd(), newPdfUrl);
      const safeName = `clinical-advisory-${(booking as any).bookingNumber || booking.id}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
      fs.createReadStream(newAbsPath).pipe(res);
    } catch (error) {
      console.error("Error downloading Clinical Advisory PDF:", error);
      res.status(500).json({ message: "Failed to download Clinical Advisory PDF" });
    }
  });

  // ── Clinical Advisory Review Summaries ─────────────────────────────────────────

  // Create + confirm a review summary (within 24h post-rx window)
  app.post("/api/bookings/:id/prescription-reviews", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (user.role !== "provider") {
        return res.status(403).json({ message: "Only providers may add review summaries." });
      }

      const booking = await storage.getBookingById(req.params.id);
      if (!booking) return res.status(404).json({ message: "Booking not found" });
      if (booking.bookingType !== "consultation") {
        return res.status(400).json({ message: "Review summaries are only for consultation bookings." });
      }
      if (!(booking as any).prescriptionApprovedAt) {
        return res.status(409).json({ message: "The initial Clinical Advisory must be confirmed before adding review summaries." });
      }

      // Gating: must be within the 24h post-rx window
      const postRxExpiresAt = (booking as any).postRxExpiresAt ? new Date((booking as any).postRxExpiresAt) : null;
      if (!postRxExpiresAt || new Date() > postRxExpiresAt) {
        return res.status(403).json({ message: "The 24-hour review window has expired. No new review summaries can be added." });
      }

      // Ownership check
      const provider = await storage.getProviderByUserId(user.id);
      if (!provider) return res.status(403).json({ message: "Provider profile not found" });
      const consultant = await storage.getConsultantById(booking.serviceId);
      const ownsAssignedBooking = booking.providerId === provider.id;
      const ownsConsultant = consultant?.providerId === provider.id;
      if (!ownsAssignedBooking && !ownsConsultant) {
        return res.status(403).json({ message: "You can only add review summaries for your own consultants." });
      }

      const { diagnosis, medications, physicianNotes, followUp, advice } = req.body as {
        diagnosis?: string;
        medications?: string;
        physicianNotes?: string;
        followUp?: string;
        advice?: string;
      };
      if (!diagnosis?.trim()) {
        return res.status(400).json({ message: "Diagnosis is required for a review summary." });
      }

      const pool = getPool();
      let approvedAt!: Date;
      const approverIp = req.ip || req.socket?.remoteAddress || "unknown";
      const protocol = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers.host || "localhost:5000";
      const baseUrl = process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : `${protocol}://${host}`;
      const bookingUser = await storage.getUserById(booking.userId);
      const client = await pool.connect();
      let review: any;
      let reviewNumber = 0;
      let individualPdfUrl = "";
      let trailPdfUrl = "";
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [booking.id]);
        approvedAt = new Date();
        const existingReviewsResult = await client.query(
          "SELECT * FROM prescription_reviews WHERE booking_id = $1 ORDER BY approved_at ASC, review_number ASC, id ASC",
          [booking.id]
        );
        reviewNumber = existingReviewsResult.rows.reduce(
          (max: number, existing: any) => Math.max(max, Number(existing.review_number) || 0),
          0
        ) + 1;

        const basePdfData: PrescriptionPdfData = {
          bookingId: booking.id,
          bookingNumber: (booking as any).bookingNumber || `PFN-${booking.id.substring(0, 8).toUpperCase()}`,
          approvedAt,
          approverIp,
          reviewNumber,
          referringFacility: bookingUser?.hospitalName || null,
          referringPhysician: (booking as any).referringPhysician || null,
          onCallDoctorName: (booking as any).onCallDoctorName || null,
          onCallDoctorDesignation: (booking as any).onCallDoctorDesignation || null,
          patientName: booking.patientName,
          patientAge: booking.patientAge,
          patientGender: booking.patientGender,
          uhidIpNumber: (booking as any).uhidIpNumber || null,
          patientContact: booking.patientContact,
          patientWeight: (booking as any).patientWeight || null,
          patientAllergies: (booking as any).patientAllergyNotSpecified ? null : (booking as any).patientAllergies,
          patientAllergyNotSpecified: (booking as any).patientAllergyNotSpecified ?? true,
          consultantName: consultant?.name || booking.serviceName,
          consultantSpecialization: consultant?.specialization || null,
          consultantQualification: consultant?.qualification || null,
          consultantRegistrationNo: consultant?.registrationNumber || null,
          consultantYearsExperience: consultant?.yearsExperience || null,
          consultantAffiliation: consultant?.affiliatedInstitution || null,
          consultantSignatureUrl: consultant?.digitalSignatureUrl || null,
          clinicalHistory: booking.clinicalSummary || null,
          examination: booking.examination || null,
          investigations: booking.investigations || null,
          diagnosis: diagnosis.trim(),
          physicianNotes: (physicianNotes || "").trim() || null,
          treatmentPlan: (medications || "").trim() || null,
          advice: (advice || "").trim() || null,
          followUp: (followUp || "").trim() || null,
        };

        const insertResult = await client.query(
          `INSERT INTO prescription_reviews
            (booking_id, provider_id, review_number, diagnosis, medications, physician_notes, follow_up, advice, approved_at, approved_by_user_id, approver_ip)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           RETURNING *`,
          [
            booking.id,
            provider.id,
            reviewNumber,
            diagnosis.trim(),
            (medications || "").trim() || null,
            (physicianNotes || "").trim() || null,
            (followUp || "").trim() || null,
            (advice || "").trim() || null,
            approvedAt,
            user.id,
            approverIp,
          ]
        );

        individualPdfUrl = await generateAndStorePrescriptionPdf(basePdfData, baseUrl);
        trailPdfUrl = await generateAndStorePrescriptionPdf({
          ...basePdfData,
          prescriptionTrail: [
            {
              label: "Initial Clinical Advisory",
              approvedAt: new Date((booking as any).prescriptionApprovedAt),
              diagnosis: (booking as any).prescriptionDiagnosis || null,
              physicianNotes: (booking as any).prescriptionPhysicianNotes || null,
              treatmentPlan: (booking as any).prescriptionMedications || null,
              advice: (booking as any).prescriptionAdvice || null,
              followUp: (booking as any).prescriptionFollowUp || null,
            },
            ...existingReviewsResult.rows.map((existing: any) => ({
              label: `Review Summary #${existing.review_number}`,
              approvedAt: new Date(existing.approved_at),
              diagnosis: existing.diagnosis || null,
              physicianNotes: existing.physician_notes || null,
              treatmentPlan: existing.medications || null,
              advice: existing.advice || null,
              followUp: existing.follow_up || null,
            })),
            {
              label: `Review Summary #${reviewNumber}`,
              approvedAt,
              diagnosis: diagnosis.trim(),
              physicianNotes: (physicianNotes || "").trim() || null,
              treatmentPlan: (medications || "").trim() || null,
              advice: (advice || "").trim() || null,
              followUp: (followUp || "").trim() || null,
            },
          ],
        }, baseUrl);

        const updateResult = await client.query(
          "UPDATE prescription_reviews SET pdf_url = $1, trail_pdf_url = $2 WHERE id = $3 RETURNING *",
          [individualPdfUrl, trailPdfUrl, insertResult.rows[0].id]
        );
        review = updateResult.rows[0];
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }

      await storage.createAuditLog({
        userId: user.id,
        action: "REVIEW_SUMMARY_CONFIRMED",
        entityType: "booking",
        entityId: booking.id,
        details: JSON.stringify({
          reviewId: review.id,
          reviewNumber,
          consultantName: consultant?.name,
          patientName: booking.patientName,
          approverIp,
          pdfUrl: individualPdfUrl,
          trailPdfUrl,
          confirmedAt: approvedAt.toISOString(),
        }),
      });

      res.status(201).json({ ...review, reviewNumber });
    } catch (error) {
      req.log?.error({ error }, "Error creating review summary");
      res.status(500).json({ message: "Failed to create review summary" });
    }
  });

  // List all review summaries for a booking
  app.get("/api/bookings/:id/prescription-reviews", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      const booking = await storage.getBookingById(req.params.id);
      if (!booking) return res.status(404).json({ message: "Booking not found" });

      // Auth: booking owner, assigned provider, or admin
      const isOwner = booking.userId === user.id;
      const isAdminUser = user.role === "admin";
      let isProviderUser = false;
      if (user.role === "provider") {
        const provider = await storage.getProviderByUserId(user.id);
        if (provider && booking.providerId === provider.id) isProviderUser = true;
        // Also allow if consultant belongs to provider
        if (!isProviderUser && booking.serviceId) {
          const consultant = await storage.getConsultantById(booking.serviceId);
          if (consultant?.providerId) {
            if (provider && consultant.providerId === provider.id) isProviderUser = true;
          }
        }
      }
      if (!isOwner && !isAdminUser && !isProviderUser) {
        return res.status(403).json({ message: "Access denied" });
      }

      const pool = getPool();
      const result = await pool.query(
        "SELECT * FROM prescription_reviews WHERE booking_id = $1 ORDER BY approved_at ASC, review_number ASC, id ASC",
        [booking.id]
      );
      const reviews = result.rows.map((r: any) => ({
        id: r.id,
        bookingId: r.booking_id,
        providerId: r.provider_id,
        reviewNumber: r.review_number,
        diagnosis: r.diagnosis,
        medications: r.medications,
        physicianNotes: r.physician_notes,
        followUp: r.follow_up,
        advice: r.advice,
        approvedAt: r.approved_at,
        approvedByUserId: r.approved_by_user_id,
        approverIp: r.approver_ip,
        pdfUrl: r.pdf_url,
        trailPdfUrl: r.trail_pdf_url,
        createdAt: r.created_at,
      }));
      res.json(reviews);
    } catch (error) {
      req.log?.error({ error }, "Error fetching review summaries");
      res.status(500).json({ message: "Failed to fetch review summaries" });
    }
  });

  // Download the latest cumulative Clinical Advisory trail (original + every review to date)
  app.get("/api/bookings/:id/prescription-trail/download", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      const booking = await storage.getBookingById(req.params.id);
      if (!booking) return res.status(404).json({ message: "Booking not found" });

      const isOwner = booking.userId === user.id;
      const isAdminUser = user.role === "admin";
      let isProviderUser = false;
      if (user.role === "provider") {
        const provider = await storage.getProviderByUserId(user.id);
        if (provider && booking.providerId === provider.id) isProviderUser = true;
        if (!isProviderUser && booking.serviceId) {
          const consultant = await storage.getConsultantById(booking.serviceId);
          if (provider && consultant?.providerId === provider.id) isProviderUser = true;
        }
      }
      if (!isOwner && !isAdminUser && !isProviderUser) {
        return res.status(403).json({ message: "Access denied" });
      }

      const pool = getPool();
      const reviewsResult = await pool.query(
        "SELECT * FROM prescription_reviews WHERE booking_id = $1 ORDER BY approved_at ASC, review_number ASC, id ASC",
        [booking.id]
      );
      if (!reviewsResult.rows.length) {
        const originalPdfUrl = (booking as any).prescriptionPdfUrl;
        if (originalPdfUrl && /^https?:\/\//i.test(originalPdfUrl)) return res.redirect(originalPdfUrl);
        return res.status(404).json({ message: "PDF not available" });
      }

      const latestReview = reviewsResult.rows[reviewsResult.rows.length - 1];
      if (
        latestReview.trail_pdf_url &&
        /^https?:\/\//i.test(latestReview.trail_pdf_url)
      ) {
        return res.redirect(latestReview.trail_pdf_url);
      }

      // Reviews created before cumulative PDFs were introduced are upgraded on first download.
      const bookingUser = await storage.getUserById(booking.userId);
      const consultant = await storage.getConsultantById(booking.serviceId);
      const protocol = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers.host || "localhost:5000";
      const baseUrl = process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : `${protocol}://${host}`;
      const approvedAt = new Date(latestReview.approved_at);
      const pdfData: PrescriptionPdfData = {
        bookingId: booking.id,
        bookingNumber: (booking as any).bookingNumber || `PFN-${booking.id.substring(0, 8).toUpperCase()}`,
        approvedAt,
        approverIp: latestReview.approver_ip || "unknown",
        reviewNumber: latestReview.review_number,
        referringFacility: bookingUser?.hospitalName || null,
        referringPhysician: (booking as any).referringPhysician || null,
        onCallDoctorName: (booking as any).onCallDoctorName || null,
        onCallDoctorDesignation: (booking as any).onCallDoctorDesignation || null,
        patientName: booking.patientName,
        patientAge: booking.patientAge,
        patientGender: booking.patientGender,
        uhidIpNumber: (booking as any).uhidIpNumber || null,
        patientContact: booking.patientContact,
        patientWeight: (booking as any).patientWeight || null,
        patientAllergies: (booking as any).patientAllergyNotSpecified ? null : (booking as any).patientAllergies,
        patientAllergyNotSpecified: (booking as any).patientAllergyNotSpecified ?? true,
        consultantName: consultant?.name || booking.serviceName,
        consultantSpecialization: consultant?.specialization || null,
        consultantQualification: consultant?.qualification || null,
        consultantRegistrationNo: consultant?.registrationNumber || null,
        consultantYearsExperience: consultant?.yearsExperience || null,
        consultantAffiliation: consultant?.affiliatedInstitution || null,
        consultantSignatureUrl: consultant?.digitalSignatureUrl || null,
        clinicalHistory: booking.clinicalSummary || null,
        examination: booking.examination || null,
        investigations: booking.investigations || null,
        diagnosis: latestReview.diagnosis || null,
        physicianNotes: latestReview.physician_notes || null,
        treatmentPlan: latestReview.medications || null,
        followUp: latestReview.follow_up || null,
        prescriptionTrail: [
          {
            label: "Initial Clinical Advisory",
            approvedAt: new Date((booking as any).prescriptionApprovedAt),
            diagnosis: (booking as any).prescriptionDiagnosis || null,
            physicianNotes: (booking as any).prescriptionPhysicianNotes || null,
            treatmentPlan: (booking as any).prescriptionMedications || null,
            advice: (booking as any).prescriptionAdvice || null,
            followUp: (booking as any).prescriptionFollowUp || null,
          },
          ...reviewsResult.rows.map((review: any) => ({
            label: `Review Summary #${review.review_number}`,
            approvedAt: new Date(review.approved_at),
            diagnosis: review.diagnosis || null,
            physicianNotes: review.physician_notes || null,
            treatmentPlan: review.medications || null,
            advice: review.advice || null,
            followUp: review.follow_up || null,
          })),
        ],
      };
      const cumulativePdfUrl = await generateAndStorePrescriptionPdf(pdfData, baseUrl);
      await pool.query("UPDATE prescription_reviews SET trail_pdf_url = $1 WHERE id = $2", [
        cumulativePdfUrl,
        latestReview.id,
      ]);
      return res.redirect(cumulativePdfUrl);
    } catch (error) {
      req.log?.error({ error }, "Error downloading Clinical Advisory trail");
      res.status(500).json({ message: "Failed to download Clinical Advisory trail" });
    }
  });

  // Download a review summary PDF
  app.get("/api/prescription-reviews/:reviewId/download", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      const pool = getPool();
      const result = await pool.query(
        "SELECT * FROM prescription_reviews WHERE id = $1",
        [req.params.reviewId]
      );
      if (!result.rows.length) return res.status(404).json({ message: "Review summary not found" });
      const review = result.rows[0];

      const booking = await storage.getBookingById(review.booking_id);
      if (!booking) return res.status(404).json({ message: "Booking not found" });

      // Auth: booking owner, assigned provider, or admin
      const isOwner = booking.userId === user.id;
      const isAdminUser = user.role === "admin";
      let isProviderUser = false;
      if (user.role === "provider") {
        const provider = await storage.getProviderByUserId(user.id);
        if (provider && booking.providerId === provider.id) isProviderUser = true;
        if (!isProviderUser && booking.serviceId) {
          const consultant = await storage.getConsultantById(booking.serviceId);
          if (consultant?.providerId) {
            if (provider && consultant.providerId === provider.id) isProviderUser = true;
          }
        }
      }
      if (!isOwner && !isAdminUser && !isProviderUser) {
        return res.status(403).json({ message: "Access denied" });
      }

      if (review.pdf_url && /^https?:\/\//i.test(review.pdf_url)) {
        return res.redirect(review.pdf_url);
      }
      return res.status(404).json({ message: "PDF not available" });
    } catch (error) {
      req.log?.error({ error }, "Error downloading review summary PDF");
      res.status(500).json({ message: "Failed to download review summary" });
    }
  });

  // Public verification endpoint (no auth required)
  app.get("/api/verify/prescription/:bookingId", async (req: any, res) => {
    try {
      const booking = await storage.getBookingById(req.params.bookingId);
      if (!booking || booking.bookingType !== "consultation") {
        return res.status(404).json({ message: "Clinical Advisory not found" });
      }
      if (!(booking as any).prescriptionApprovedAt) {
        return res.status(404).json({ message: "This Clinical Advisory has not been confirmed yet" });
      }

      let consultant: any = null;
      if (booking.serviceId) consultant = await storage.getConsultantById(booking.serviceId);
      const bookingUser = await storage.getUserById(booking.userId);

      res.json({
        prescriptionId: (booking as any).bookingNumber || `PFN-${booking.id.substring(0, 8).toUpperCase()}`,
        patientName: booking.patientName,
        referringFacility: bookingUser?.hospitalName || null,
        consultantName: consultant?.name || booking.serviceName,
        consultantSpecialization: consultant?.specialization || null,
        consultantQualification: consultant?.qualification || null,
        consultantRegistrationNo: consultant?.registrationNumber || null,
        consultantYearsExperience: consultant?.yearsExperience || null,
        consultantAffiliation: consultant?.affiliatedInstitution || null,
        confirmedAt: (booking as any).prescriptionApprovedAt,
        prescriptionPdfUrl: (booking as any).prescriptionPdfUrl || null,
        isVerified: true,
      });
    } catch (error) {
      console.error("Error verifying Clinical Advisory:", error);
      res.status(500).json({ message: "Failed to verify Clinical Advisory" });
    }
  });

  // Save on-call doctor info (care seeker before joining video call)
  app.patch("/api/bookings/:id/on-call-doctor", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const booking = await storage.getBookingById(req.params.id);
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }
      if (booking.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      const { onCallDoctorName, onCallDoctorDesignation } = req.body;
      const updated = await storage.updateBooking(req.params.id, {
        onCallDoctorName: onCallDoctorName || null,
        onCallDoctorDesignation: onCallDoctorDesignation || null,
      } as any);
      res.json(updated);
    } catch (error) {
      console.error("Error saving on-call doctor info:", error);
      res.status(500).json({ message: "Failed to save on-call doctor info" });
    }
  });

  // Provider endpoints
  app.get("/api/provider/bookings", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      
      // Verify user is a provider
      if (user.role !== "provider") {
        return res.status(403).json({ message: "Access denied. Only providers can access this endpoint." });
      }
      
      // Get the provider profile for this user
      const provider = await storage.getProviderByUserId(user.id);
      if (!provider) {
        return res.status(404).json({ message: "Provider profile not found" });
      }
      
      // Get only bookings assigned to this provider
      const bookings = await storage.getBookingsByProviderId(provider.id);
      
      // Get all provider assignments for lab tests and modalities
      const providerLabTests = await storage.getProviderLabTestsByProvider(provider.id);
      const providerModalities = await storage.getProviderModalitiesByProvider(provider.id);
      
      // Enrich bookings with provider's price
      const enrichedBookings = await Promise.all(bookings.map(async booking => {
        let providerPrice = null;
        
        if (booking.bookingType === "lab" && booking.serviceId) {
          const assignment = providerLabTests.find(plt => plt.labTestId === booking.serviceId);
          if (assignment) {
            providerPrice = assignment.price;
          }
        } else if (booking.bookingType === "teleradiology" && booking.modalityId) {
          const assignment = providerModalities.find(pm => pm.modalityId === booking.modalityId);
          if (assignment) {
            providerPrice = assignment.price;
          }
        }

        let seekerHospitalDetails = {};
        if (req.get("X-Mobile-Client") === "1") {
          const seeker = await storage.getUserById(booking.userId);
          seekerHospitalDetails = {
            seekerHospitalName: seeker?.hospitalName || undefined,
            seekerHospitalLocation:
              seeker?.hospitalAddress || seeker?.location || seeker?.city || undefined,
          };
        }
        
        return {
          ...booking,
          providerPrice,
          ...seekerHospitalDetails,
        };
      }));
      
      res.json(enrichedBookings.map(withConsultationLifecycle));
    } catch (error) {
      console.error("Error fetching provider bookings:", error);
      res.status(500).json({ message: "Failed to fetch bookings" });
    }
  });

  // Provider dashboard — active consultations + revenue summary
  app.get("/api/provider/dashboard", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (user.role !== "provider") {
        return res.status(403).json({ message: "Access denied. Only providers can access this endpoint." });
      }
      const provider = await storage.getProviderByUserId(user.id);
      if (!provider) {
        return res.status(404).json({ message: "Provider profile not found" });
      }

      const providerType = provider.type;
      const allBookings = await storage.getBookingsByProviderId(provider.id);

      const makeSum = (bookings: typeof allBookings) =>
        (filter: (b: (typeof allBookings)[0]) => boolean) =>
          bookings.filter(filter).reduce((acc, b) => acc + parseFloat(b.basePrice || "0"), 0);

      const enrichConsultations = async (bookings: typeof allBookings) => {
        const active = bookings.filter((b) => !["cancelled", "completed"].includes(b.status));
        return Promise.all(
          active.map(async (b) => {
            const seeker = await storage.getUserById(b.userId);
            return { ...b, seekerHospitalName: seeker?.hospitalName || seeker?.firstName || "Unknown Hospital" };
          })
        );
      };

      if (providerType === "lab") {
        const labBookings = allBookings.filter((b) => b.bookingType === "lab");
        const assignments = await storage.getProviderLabTestsByProvider(provider.id);
        const activeLabTestCount = assignments.length;
        const sum = makeSum(labBookings);
        const revenue = {
          total: sum(() => true),
          paid: sum((b) => b.paymentStatus === "paid"),
          pending: sum((b) => b.paymentStatus === "pending" || b.paymentStatus === "partial"),
        };
        return res.json({ providerType, activeLabTestCount, revenue });
      }

      if (providerType === "teleradiology") {
        const teleBookings = allBookings.filter((b) => b.bookingType === "teleradiology");
        const assignments = await storage.getProviderModalitiesByProvider(provider.id);
        const activeModalityCount = assignments.length;
        const sum = makeSum(teleBookings);
        const revenue = {
          total: sum(() => true),
          paid: sum((b) => b.paymentStatus === "paid"),
          pending: sum((b) => b.paymentStatus === "pending" || b.paymentStatus === "partial"),
        };
        return res.json({ providerType, activeModalityCount, revenue });
      }

      if (providerType === "hospital") {
        const consultationBookings = allBookings.filter((b) => b.bookingType === "consultation");
        const activeConsultations = await enrichConsultations(consultationBookings);
        const assignments = await storage.getProviderLabTestsByProvider(provider.id);
        const activeLabTestCount = assignments.length;
        const sum = makeSum(allBookings);
        const revenue = {
          total: sum(() => true),
          paid: sum((b) => b.paymentStatus === "paid"),
          pending: sum((b) => b.paymentStatus === "pending" || b.paymentStatus === "partial"),
        };
        return res.json({ providerType, activeConsultations, activeLabTestCount, revenue });
      }

      // consultant (default)
      const consultationBookings = allBookings.filter((b) => b.bookingType === "consultation");
      const activeConsultations = await enrichConsultations(consultationBookings);
      const providerConsultants = await storage.getConsultantsByProvider(provider.id);
      const consultant = providerConsultants[0] || null;
      const sum = makeSum(consultationBookings);
      const revenue = {
        total: sum(() => true),
        paid: sum((b) => b.paymentStatus === "paid"),
        pending: sum((b) => b.paymentStatus === "pending" || b.paymentStatus === "partial"),
      };
      res.json({ providerType, activeConsultations, consultant, revenue });
    } catch (error) {
      console.error("Error fetching provider dashboard:", error);
      res.status(500).json({ message: "Failed to fetch dashboard data" });
    }
  });

  app.get("/api/provider/labs", isAuthenticated, async (req: any, res) => {
    try {
      const labs = await storage.getLabs();
      res.json(labs.slice(0, 1));
    } catch (error) {
      console.error("Error fetching provider labs:", error);
      res.status(500).json({ message: "Failed to fetch labs" });
    }
  });

  // ===== Provider Lab Tests (what tests the provider offers) =====
  
  // Get tests the provider is enabled for
  app.get("/api/provider/my-lab-tests", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (user.role !== "provider") {
        return res.status(403).json({ message: "Access denied. Providers only." });
      }
      
      const provider = await storage.getProviderByUserId(user.id);
      if (!provider) {
        return res.json([]);
      }
      
      const assignments = await storage.getProviderLabTestsByProvider(provider.id);
      const labTests = await storage.getLabTests();
      
      const enriched = assignments.map(a => ({
        ...a,
        labTest: labTests.find(t => t.id === a.labTestId),
      }));
      res.json(enriched);
    } catch (error) {
      console.error("Error fetching provider lab tests:", error);
      res.status(500).json({ message: "Failed to fetch lab tests" });
    }
  });

  // Add a test from the predefined catalog to provider's offerings
  app.post("/api/provider/lab-tests", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (user.role !== "provider") {
        return res.status(403).json({ message: "Access denied. Providers only." });
      }
      
      const provider = await storage.getProviderByUserId(user.id);
      if (!provider) {
        return res.status(404).json({ message: "Provider profile not found" });
      }
      
      const assignment = await storage.createProviderLabTest({
        providerId: provider.id,
        labTestId: req.body.labTestId,
        price: req.body.price,
        turnaroundTime: req.body.turnaroundTime,
        registrationNo: req.body.registrationNo,
        registeredOrganization: req.body.registeredOrganization,
        registrationDocumentUrl: req.body.registrationDocumentUrl,
        approvalStatus: "pending",
      });
      res.status(201).json(assignment);
    } catch (error) {
      console.error("Error adding provider lab test:", error);
      res.status(500).json({ message: "Failed to add lab test" });
    }
  });

  // Update provider's test offering (price, turnaround)
  app.patch("/api/provider/lab-tests/:id", isAuthenticated, isProvider, async (req: any, res) => {
    try {
      const provider = await storage.getProviderByUserId(req.user.id);
      if (!provider) return res.status(403).json({ message: "Not a provider" });
      const existing = await storage.getProviderLabTestById(req.params.id);
      if (existing && String(existing.providerId) !== String(provider.id)) {
        return res.status(403).json({ message: "Not authorized" });
      }
      const updated = await storage.updateProviderLabTest(req.params.id, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating provider lab test:", error);
      res.status(500).json({ message: "Failed to update lab test" });
    }
  });

  // Bulk set TAT visibility for all of a provider's lab tests
  app.patch("/api/provider/lab-tests-tat-visibility", isAuthenticated, isProvider, async (req: any, res) => {
    try {
      const provider = await storage.getProviderByUserId(req.user.id);
      if (!provider) return res.status(403).json({ message: "Not a provider" });
      const { tatHidden } = req.body;
      if (typeof tatHidden !== "boolean") return res.status(400).json({ message: "tatHidden must be boolean" });
      await storage.bulkSetProviderLabTestTatHidden(provider.id, tatHidden);
      res.json({ success: true });
    } catch (error) {
      console.error("Error bulk updating TAT visibility:", error);
      res.status(500).json({ message: "Failed to update TAT visibility" });
    }
  });

  // Remove a test from provider's offerings
  app.delete("/api/provider/lab-tests/:id", isAuthenticated, isProvider, async (req: any, res) => {
    try {
      const provider = await storage.getProviderByUserId(req.user.id);
      if (!provider) return res.status(403).json({ message: "Not a provider" });
      const existing = await storage.getProviderLabTestById(req.params.id);
      if (existing && String(existing.providerId) !== String(provider.id)) {
        return res.status(403).json({ message: "Not authorized" });
      }
      await storage.deleteProviderLabTest(req.params.id);
      res.json({ message: "Lab test removed" });
    } catch (error) {
      console.error("Error deleting provider lab test:", error);
      res.status(500).json({ message: "Failed to remove lab test" });
    }
  });

  // Suggest a new test (Other option) - pending admin approval
  app.post("/api/provider/suggest-lab-test", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (user.role !== "provider") {
        return res.status(403).json({ message: "Access denied. Providers only." });
      }
      
      const provider = await storage.getProviderByUserId(user.id);
      if (!provider) {
        return res.status(404).json({ message: "Provider profile not found" });
      }
      
      const suggestion = await storage.createSuggestedLabTest({
        providerId: provider.id,
        testName: req.body.testName,
        description: req.body.description,
        suggestedPrice: req.body.suggestedPrice,
      });
      res.status(201).json(suggestion);
    } catch (error) {
      console.error("Error suggesting lab test:", error);
      res.status(500).json({ message: "Failed to suggest lab test" });
    }
  });

  // Download Excel template for bulk lab test import
  app.get("/api/provider/lab-test-import-template", isAuthenticated, isProvider, async (_req, res) => {
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      const rows = [
        ["Test Name", "Price (INR)", "Turnaround Time"],
        ["Complete Blood Count (CBC)", 250, "24 hours"],
        ["Lipid Profile", 500, "24 hours"],
        ["Thyroid Stimulating Hormone (TSH)", 350, "48 hours"],
      ];
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = [{ wch: 40 }, { wch: 15 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, ws, "Lab Tests");
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Disposition", "attachment; filename=lab-test-import-template.xlsx");
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(buf);
    } catch (error) {
      console.error("Error generating template:", error);
      res.status(500).json({ message: "Failed to generate template" });
    }
  });

  // Bulk import lab tests from uploaded Excel file
  app.post("/api/provider/bulk-import-lab-tests", isAuthenticated, isProvider, uploadExcel.single("file"), async (req: any, res) => {
    try {
      const provider = await storage.getProviderByUserId(req.user.id);
      if (!provider) return res.status(404).json({ message: "Provider profile not found" });

      if (!req.file) return res.status(400).json({ message: "Excel file is required" });

      const marginPercent = parseFloat(req.body.marginPercent ?? "0");
      if (isNaN(marginPercent) || marginPercent < 0 || marginPercent >= 100) {
        return res.status(400).json({ message: "marginPercent must be a number between 0 and 99" });
      }

      const XLSX = await import("xlsx");
      const wb = XLSX.read(req.file.buffer, { type: "buffer" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

      // Skip header row, parse name + price
      const dataRows = rows.slice(1);

      const existingTests = await storage.getLabTests();
      const existingByName = new Map<string, typeof existingTests[0]>();
      for (const t of existingTests) {
        existingByName.set(t.testName.toLowerCase().trim(), t);
      }

      const existingPLTs = await storage.getProviderLabTestsByProvider(provider.id);
      const assignedTestIds = new Set(existingPLTs.map(p => p.labTestId));

      let added = 0;
      let alreadyRegistered = 0;
      let skippedInvalid = 0;

      for (const row of dataRows) {
        const rawName = String(row[0] ?? "").trim();
        const rawPrice = row[1];
        const price = typeof rawPrice === "number" ? rawPrice : parseFloat(String(rawPrice ?? "").replace(/[^0-9.]/g, ""));
        const rawTat = String(row[2] ?? "").trim();
        const turnaroundTime = rawTat || "As per lab";

        if (!rawName || isNaN(price) || price <= 0 || price >= 100000000) {
          skippedInvalid++;
          continue;
        }

        const normalizedName = rawName.toLowerCase().trim();
        const existingTest = existingByName.get(normalizedName);

        // If provider already has this test assigned, skip entirely without touching catalog data
        if (existingTest && assignedTestIds.has(existingTest.id)) {
          alreadyRegistered++;
          continue;
        }

        const cost = Math.round(price * (1 - marginPercent / 100) * 100) / 100;

        try {
          let labTest: typeof existingTest;
          if (!existingTest) {
            // Create new catalog entry with pricing + TAT from this import
            labTest = await storage.createLabTest({
              testName: rawName,
              cost: cost.toFixed(2),
              turnaroundTime,
              customerPrice: price.toFixed(2),
              status: "active",
            });
            existingByName.set(normalizedName, labTest);
          } else {
            // Update pricing + TAT on existing catalog entry (provider is not yet assigned)
            await storage.updateLabTest(existingTest.id, {
              cost: cost.toFixed(2),
              customerPrice: price.toFixed(2),
              turnaroundTime,
            });
            labTest = existingTest;
          }

          await storage.createProviderLabTest({
            providerId: provider.id,
            labTestId: labTest!.id,
            price: cost.toFixed(2),
            turnaroundTime,
            approvalStatus: "approved",
            isActive: true,
          });
          assignedTestIds.add(labTest!.id);
          added++;
        } catch (rowError) {
          console.error(`Bulk import: skipping row "${rawName}" due to error:`, rowError);
          skippedInvalid++;
        }
      }

      res.json({ message: "Import complete", added, alreadyRegistered, skippedInvalid, total: dataRows.length });
    } catch (error) {
      console.error("Error in provider bulk import:", error);
      res.status(500).json({ message: "Failed to import lab tests" });
    }
  });

  // Get provider's suggestions
  app.get("/api/provider/my-suggestions", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (user.role !== "provider") {
        return res.status(403).json({ message: "Access denied. Providers only." });
      }
      
      const provider = await storage.getProviderByUserId(user.id);
      if (!provider) {
        return res.json({ labTests: [], modalities: [] });
      }
      
      const labTests = await storage.getSuggestedLabTestsByProvider(provider.id);
      const modalities = await storage.getSuggestedModalitiesByProvider(provider.id);
      
      res.json({ labTests, modalities });
    } catch (error) {
      console.error("Error fetching provider suggestions:", error);
      res.status(500).json({ message: "Failed to fetch suggestions" });
    }
  });

  // ===== Provider Modalities (what modalities the provider offers) =====
  
  app.get("/api/provider/my-modalities", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (user.role !== "provider") {
        return res.status(403).json({ message: "Access denied. Providers only." });
      }
      
      const provider = await storage.getProviderByUserId(user.id);
      if (!provider) {
        return res.json([]);
      }
      
      const assignments = await storage.getProviderModalitiesByProvider(provider.id);
      const modalities = await storage.getRadiologyModalities();
      
      const enriched = assignments.map(a => ({
        ...a,
        modality: modalities.find(m => m.id === a.modalityId),
      }));
      res.json(enriched);
    } catch (error) {
      console.error("Error fetching provider modalities:", error);
      res.status(500).json({ message: "Failed to fetch modalities" });
    }
  });

  app.post("/api/provider/modalities", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (user.role !== "provider") {
        return res.status(403).json({ message: "Access denied. Providers only." });
      }
      
      const provider = await storage.getProviderByUserId(user.id);
      if (!provider) {
        return res.status(404).json({ message: "Provider profile not found" });
      }
      
      const assignment = await storage.createProviderModality({
        providerId: provider.id,
        modalityId: req.body.modalityId,
        price: req.body.price,
        turnaroundTime: req.body.turnaroundTime,
        registrationNo: req.body.registrationNo,
        registeredOrganization: req.body.registeredOrganization,
      });
      res.status(201).json(assignment);
    } catch (error) {
      console.error("Error adding provider modality:", error);
      res.status(500).json({ message: "Failed to add modality" });
    }
  });

  app.patch("/api/provider/modalities/:id", isAuthenticated, isProvider, async (req: any, res) => {
    try {
      const provider = await storage.getProviderByUserId(req.user.id);
      if (!provider) return res.status(403).json({ message: "Not a provider" });
      const existing = await storage.getProviderModalityById(req.params.id);
      if (existing && String(existing.providerId) !== String(provider.id)) {
        return res.status(403).json({ message: "Not authorized" });
      }
      const updated = await storage.updateProviderModality(req.params.id, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating provider modality:", error);
      res.status(500).json({ message: "Failed to update modality" });
    }
  });

  app.delete("/api/provider/modalities/:id", isAuthenticated, isProvider, async (req: any, res) => {
    try {
      const provider = await storage.getProviderByUserId(req.user.id);
      if (!provider) return res.status(403).json({ message: "Not a provider" });
      const existing = await storage.getProviderModalityById(req.params.id);
      if (existing && String(existing.providerId) !== String(provider.id)) {
        return res.status(403).json({ message: "Not authorized" });
      }
      await storage.deleteProviderModality(req.params.id);
      res.json({ message: "Modality removed" });
    } catch (error) {
      console.error("Error deleting provider modality:", error);
      res.status(500).json({ message: "Failed to remove modality" });
    }
  });

  app.post("/api/provider/suggest-modality", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (user.role !== "provider") {
        return res.status(403).json({ message: "Access denied. Providers only." });
      }
      
      const provider = await storage.getProviderByUserId(user.id);
      if (!provider) {
        return res.status(404).json({ message: "Provider profile not found" });
      }
      
      const suggestion = await storage.createSuggestedModality({
        providerId: provider.id,
        modalityName: req.body.modalityName,
        description: req.body.description,
        suggestedPrice: req.body.suggestedPrice,
      });
      res.status(201).json(suggestion);
    } catch (error) {
      console.error("Error suggesting modality:", error);
      res.status(500).json({ message: "Failed to suggest modality" });
    }
  });

  // Referral Hospitals
  app.get("/api/referral/hospitals", async (req, res) => {
    try {
      const hospitals = await storage.getReferralHospitals();
      res.json(hospitals);
    } catch (error) {
      console.error("Error fetching referral hospitals:", error);
      res.status(500).json({ message: "Failed to fetch referral hospitals" });
    }
  });

  app.get("/api/referral/hospitals/:id", async (req, res) => {
    try {
      const hospital = await storage.getReferralHospitalById(req.params.id);
      if (!hospital) {
        return res.status(404).json({ message: "Referral hospital not found" });
      }
      res.json(hospital);
    } catch (error) {
      console.error("Error fetching referral hospital:", error);
      res.status(500).json({ message: "Failed to fetch referral hospital" });
    }
  });

  // Transport Services
  app.get("/api/transport/services", async (req, res) => {
    try {
      const location = req.query.location as string | undefined;
      if (location) {
        const services = await storage.getTransportServicesByLocation(location);
        return res.json(services);
      }
      const services = await storage.getTransportServices();
      res.json(services);
    } catch (error) {
      console.error("Error fetching transport services:", error);
      res.status(500).json({ message: "Failed to fetch transport services" });
    }
  });

  app.get("/api/transport/services/:id", async (req, res) => {
    try {
      const service = await storage.getTransportServiceById(req.params.id);
      if (!service) {
        return res.status(404).json({ message: "Transport service not found" });
      }
      res.json(service);
    } catch (error) {
      console.error("Error fetching transport service:", error);
      res.status(500).json({ message: "Failed to fetch transport service" });
    }
  });

  // ── Admin: Bulk-complete stale bookings (reminder already fired, still open) ─
  app.post("/api/admin/bookings/bulk-complete-stale", isAdmin, async (req, res) => {
    try {
      const result = await db
        .update(bookings)
        .set({ status: "completed" } as any)
        .where(
          and(
            isNotNull(bookings.reminderFiredAt),
            notInArray(bookings.status, ["completed", "cancelled"]),
            notInArray(bookings.bookingType, ["consultation"])
          )
        )
        .returning({ id: bookings.id, bookingNumber: bookings.bookingNumber });
      res.json({ ok: true, updated: result.length, bookings: result });
    } catch (e: any) {
      console.error("Bulk complete stale error:", e);
      res.status(500).json({ message: e?.message || "Failed" });
    }
  });

  // ── Admin: Test Twilio reminder for a specific booking ───────────────────
  // POST /api/admin/test-reminder  { ref }  — accepts booking number (PHC/...) OR UUID
  // POST /api/admin/test-twilio    { phone } — places a single test call
  app.post("/api/admin/test-reminder", isAdmin, async (req, res) => {
    try {
      const { ref } = req.body as { ref?: string };
      if (!ref?.trim()) return res.status(400).json({ message: "ref (booking number or ID) is required" });
      const val = ref.trim();
      const [booking] = await db.select().from(bookings).where(
        or(eq(bookings.id, val), eq(bookings.bookingNumber, val))
      );
      if (!booking) return res.status(404).json({ message: `No booking found for "${val}"` });
      // Clear the fired flag so this booking can be re-fired
      await db.update(bookings).set({ reminderFiredAt: null } as any).where(eq(bookings.id, booking.id));
      await fireOneBooking(booking);
      res.json({ ok: true, message: `Reminders fired for booking ${booking.bookingNumber || booking.id}. Check Twilio dashboard and server logs.` });
    } catch (e: any) {
      console.error("Test reminder error:", e);
      res.status(500).json({ message: e?.message || "Failed", stack: e?.stack });
    }
  });

  app.post("/api/admin/test-twilio", isAdmin, async (req, res) => {
    try {
      const { phone } = req.body as { phone?: string };
      if (!phone) return res.status(400).json({ message: "phone is required" });
      await triggerVoiceCall(phone, "Hello. This is a test call from Perfusion Healthcare. If you hear this, Twilio is working correctly.");
      res.json({ ok: true, message: `Test call placed to ${phone}` });
    } catch (e: any) {
      console.error("Test Twilio error:", e);
      res.status(500).json({ message: e?.message || "Failed", stack: e?.stack });
    }
  });

  // POST /api/admin/test-exotel  { from, to } — places a real masked call via Exotel
  app.post("/api/admin/test-exotel", isAdmin, async (req, res) => {
    try {
      const exotelSid = process.env.EXOTEL_SID;
      const exotelApiKey = process.env.EXOTEL_API_KEY;
      const exotelApiToken = process.env.EXOTEL_API_TOKEN;
      const exotelVirtualNumber = process.env.EXOTEL_VIRTUAL_NUMBER;

      if (!exotelSid || !exotelApiKey || !exotelApiToken || !exotelVirtualNumber) {
        return res.json({ ok: false, message: "Exotel env vars are not configured (EXOTEL_SID, EXOTEL_API_KEY, EXOTEL_API_TOKEN, EXOTEL_VIRTUAL_NUMBER)." });
      }

      const { from: fromPhone, to: toPhone } = req.body as { from?: string; to?: string };
      if (!fromPhone || !toPhone) {
        return res.status(400).json({ ok: false, message: "'from' and 'to' phone numbers are required." });
      }

      const exotelUrl = `https://api.exotel.com/v1/Accounts/${exotelSid}/Calls/connect.json`;
      const exotelBasicAuth = Buffer.from(`${exotelApiKey}:${exotelApiToken}`).toString("base64");
      const params = new URLSearchParams({
        From: fromPhone,
        To: toPhone,
        CallerId: exotelVirtualNumber,
      });

      const exotelRes = await fetch(exotelUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": `Basic ${exotelBasicAuth}`,
        },
        body: params.toString(),
      });

      const rawText = await exotelRes.text();
      let parsed: any = null;
      try { parsed = JSON.parse(rawText); } catch {}

      if (!exotelRes.ok) {
        const errMsg = parsed?.RestException?.Message || rawText || `HTTP ${exotelRes.status}`;
        console.error(`[Exotel] Test call failed: ${exotelRes.status}`, rawText);
        return res.json({ ok: false, message: `Exotel returned ${exotelRes.status}: ${errMsg}`, raw: rawText });
      }

      const callSid = parsed?.Call?.Sid || parsed?.sid || "unknown";
      console.log(`[Exotel] Test call initiated — Sid: ${callSid}, from: ${fromPhone}, to: ${toPhone}`);
      res.json({ ok: true, message: `Call initiated successfully. Exotel Sid: ${callSid}. Both phones should ring within 5–10 seconds.`, raw: rawText });
    } catch (e: any) {
      console.error("[Exotel] Test call error:", e);
      res.json({ ok: false, message: e?.message || "Request failed", stack: e?.stack });
    }
  });

  // Admin Routes
  app.get("/api/admin/providers", isAdmin, async (req, res) => {
    try {
      const providers = await storage.getProviders();
      res.json(providers);
    } catch (error) {
      console.error("Error fetching providers:", error);
      res.status(500).json({ message: "Failed to fetch providers" });
    }
  });

  app.patch("/api/admin/providers/:id/status", isAdmin, async (req, res) => {
    try {
      const { status, notes } = req.body as { status: ProviderStatus; notes?: string };
      const provider = await storage.updateProviderStatus(req.params.id, status, notes);
      if (!provider) {
        return res.status(404).json({ message: "Provider not found" });
      }
      res.json(provider);
    } catch (error) {
      console.error("Error updating provider status:", error);
      res.status(500).json({ message: "Failed to update provider status" });
    }
  });

  app.get("/api/admin/users", isAdmin, async (req, res) => {
    try {
      const users = await storage.getUsers();
      res.json(users.map(sanitizeUserForClient));
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.patch("/api/admin/users/:id/role", isAdmin, async (req, res) => {
    try {
      const { role } = req.body as { role: UserRole };
      const user = await updateUserRole(req.params.id, role);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(user);
    } catch (error) {
      console.error("Error updating user role:", error);
      res.status(500).json({ message: "Failed to update user role" });
    }
  });

  app.patch("/api/admin/users/:id/active", isAdmin, async (req, res) => {
    try {
      const { isActive } = req.body as { isActive: boolean };
      const user = await storage.updateUserActive(req.params.id, isActive);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(sanitizeUserForClient(user));
    } catch (error) {
      console.error("Error updating user status:", error);
      res.status(500).json({ message: "Failed to update user status" });
    }
  });

  // Admin - Update any user's profile details + photo
  app.patch("/api/admin/users/:id/profile", isAdmin, async (req: any, res) => {
    try {
      const allowedFields = [
        "firstName", "lastName", "phone", "email",
        "hospitalName", "hospitalAddress", "hospitalRegistrationNo", "hospitalRegisteredOrg",
        "profileImageUrl", "registrationDocumentUrl",
      ] as const;
      const data: Record<string, string | null> = {};
      for (const key of allowedFields) {
        if (req.body[key] !== undefined) data[key] = req.body[key];
      }
      const updated = await storage.updateUser(req.params.id, data);
      if (!updated) return res.status(404).json({ message: "User not found" });
      res.json(sanitizeUserForClient(updated));
    } catch (error) {
      console.error("Error updating user profile (admin):", error);
      res.status(500).json({ message: "Failed to update user profile" });
    }
  });

  // Self-service profile update (any authenticated user updates their own profile)
  app.patch("/api/profile", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const allowedFields = [
        "firstName", "lastName", "phone", "email",
        "hospitalName", "hospitalAddress", "hospitalRegistrationNo", "hospitalRegisteredOrg",
        "profileImageUrl", "registrationDocumentUrl",
      ] as const;
      const data: Record<string, string | null> = {};
      for (const key of allowedFields) {
        if (req.body[key] !== undefined) data[key] = req.body[key];
      }
      const updated = await storage.updateUser(userId, data);
      if (!updated) return res.status(404).json({ message: "User not found" });

      // The Profile page is also the professional profile for individual
      // consultants. Keep the consultant-service photo used by seeker pages in
      // sync with the account photo saved above.
      if (data.profileImageUrl !== undefined) {
        const provider = await storage.getProviderByUserId(userId);
        if (provider?.type === "consultant") {
          const [consultant] = await storage.getConsultantsByProvider(provider.id);
          if (consultant) {
            await storage.updateConsultant(consultant.id, {
              photoUrl: data.profileImageUrl,
            } as any);
          }
        }
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating own profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // POST /api/profile/change-password ─────────────────────────────────────────
  app.post("/api/profile/change-password", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current password and new password are required" });
      }
      if (newPassword.length < 8) {
        return res.status(400).json({ message: "New password must be at least 8 characters" });
      }

      const { getPool } = await import("../db");
      const pool = getPool();
      const { rows } = await pool.query(`SELECT password FROM users WHERE id = $1`, [userId]);
      if (!rows[0]) return res.status(404).json({ message: "User not found" });

      const existingHash: string | null = rows[0].password;
      if (!existingHash) {
        return res.status(400).json({ message: "Your account uses Google sign-in and does not have a password. Please use Google to log in." });
      }

      const { verifyPassword } = await import("../auth/index");
      const isValid = await verifyPassword(currentPassword, existingHash);
      if (!isValid) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }

      const bcrypt = await import("bcryptjs");
      const newHash = await bcrypt.hash(newPassword, 10);
      await pool.query(`UPDATE users SET password = $1 WHERE id = $2`, [newHash, userId]);

      req.log?.info({ userId }, "User changed password");
      return res.json({ success: true });
    } catch (error) {
      req.log?.error({ err: error }, "Error changing password");
      return res.status(500).json({ message: "Failed to change password" });
    }
  });

  // ── Account device directory and per-consultation assignment ────────────
  const callbackDeviceColumns = `id, staff_name AS "staffName", device_name AS "deviceName", phone_number AS "phoneNumber",
    installation_id AS "installationId", created_at AS "createdAt", updated_at AS "updatedAt"`;
  const validCallbackPhone = (phone: string) =>
    /^\+?[\d\s\-().]{7,25}$/.test(phone) && phone.replace(/\D/g, "").length >= 7;

  app.get("/api/profile/callback-devices", isAuthenticated, async (req: any, res) => {
    if (req.user.role !== "care_seeker") {
      res.status(403).json({ message: "Only seeker accounts can manage callback devices." });
      return;
    }
    try {
      await migrateLegacyCallbackDevice(req.user.id);
      const { rows } = await getPool().query(
        `SELECT ${callbackDeviceColumns} FROM consultation_callback_devices
         WHERE user_id = $1 AND archived_at IS NULL ORDER BY created_at ASC, id ASC`,
        [req.user.id],
      );
      res.json(rows);
    } catch (error) {
      req.log?.error({ err: error }, "Could not list registered callback devices");
      res.status(500).json({ message: "Could not load registered devices" });
    }
  });

  app.post("/api/profile/callback-devices", isAuthenticated, async (req: any, res) => {
    if (req.user.role !== "care_seeker") {
      return res.status(403).json({ message: "Only seeker accounts can manage callback devices." });
    }
    const parsed = CreateConsultationDeviceBody.safeParse(req.body);
    if (!parsed.success ||
        !parsed.data.deviceName.trim() ||
        !validCallbackPhone(parsed.data.phoneNumber.trim()) ||
        (parsed.data.staffName !== undefined && !parsed.data.staffName.trim())) {
      return res.status(400).json({ message: "Enter a device name and valid personal mobile number." });
    }
    try {
      await migrateLegacyCallbackDevice(req.user.id);
      const { rows } = await getPool().query(
        `INSERT INTO consultation_callback_devices (user_id, staff_name, device_name, phone_number, installation_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING ${callbackDeviceColumns}`,
        [req.user.id, parsed.data.staffName?.trim() || null, parsed.data.deviceName.trim(), parsed.data.phoneNumber.trim(),
          parsed.data.installationId?.trim() || null],
      );
      return res.status(201).json(rows[0]);
    } catch (error: any) {
      if (error?.code === "23505") return res.status(409).json({ message: "This device installation is already registered." });
      req.log?.error({ err: error }, "Could not register callback device");
      return res.status(500).json({ message: "Could not register device" });
    }
  });

  app.patch("/api/profile/callback-devices/:id", isAuthenticated, async (req: any, res) => {
    if (req.user.role !== "care_seeker") {
      return res.status(403).json({ message: "Only seeker accounts can manage callback devices." });
    }
    const parsed = UpdateConsultationDeviceBody.safeParse(req.body);
    if (!parsed.success || !Object.keys(parsed.data).length ||
        (parsed.data.staffName !== undefined && !parsed.data.staffName.trim()) ||
        (parsed.data.deviceName !== undefined && !parsed.data.deviceName.trim()) ||
        (parsed.data.phoneNumber !== undefined && !validCallbackPhone(parsed.data.phoneNumber.trim())) ||
        (typeof parsed.data.installationId === "string" && !parsed.data.installationId.trim())) {
      return res.status(400).json({ message: "Enter valid device details." });
    }
    let client: any = null;
    try {
      client = await getPool().connect();
      await client.query("BEGIN");
      const locked = await client.query(
        `SELECT id FROM consultation_callback_devices
         WHERE id = $1 AND user_id = $2 AND archived_at IS NULL FOR UPDATE`,
        [req.params.id, req.user.id],
      );
      if (!locked.rows.length) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Device not found." });
      }
      if (parsed.data.installationId === null &&
          await hasActiveCallbackAssignments(req.user.id, req.params.id)) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          message: "Reassign this device's active consultations before unlinking its installation.",
        });
      }
      const { rows } = await client.query(
        `UPDATE consultation_callback_devices SET
           staff_name = COALESCE($3, staff_name),
           device_name = COALESCE($4, device_name),
           phone_number = COALESCE($5, phone_number),
           installation_id = CASE WHEN $6::boolean THEN $7 ELSE installation_id END,
           updated_at = now()
         WHERE id = $1 AND user_id = $2 AND archived_at IS NULL
         RETURNING ${callbackDeviceColumns}, legacy_user_id AS "legacyUserId"`,
         [req.params.id, req.user.id, parsed.data.staffName?.trim() ?? null,
           parsed.data.deviceName?.trim() ?? null, parsed.data.phoneNumber?.trim() ?? null,
          Object.prototype.hasOwnProperty.call(parsed.data, "installationId"),
          parsed.data.installationId?.trim() || null],
      );
      const { legacyUserId, ...device } = rows[0];
      if (legacyUserId) {
        await client.query(
          `UPDATE mobile_callback_devices SET device_name = $2, phone_number = $3, updated_at = now()
           WHERE user_id = $1`,
          [req.user.id, device.deviceName, device.phoneNumber],
        );
      }
      await client.query("COMMIT");
      return res.json(device);
    } catch (error: any) {
      if (client) await client.query("ROLLBACK").catch(() => {});
      if (error?.code === "23505") return res.status(409).json({ message: "This device installation is already registered." });
      req.log?.error({ err: error }, "Could not update callback device");
      return res.status(500).json({ message: "Could not update device" });
    } finally {
      client?.release();
    }
  });

  app.delete("/api/profile/callback-devices/:id", isAuthenticated, async (req: any, res) => {
    if (req.user.role !== "care_seeker") {
      return res.status(403).json({ message: "Only seeker accounts can manage callback devices." });
    }
    let client: any = null;
    try {
      client = await getPool().connect();
      await client.query("BEGIN");
      const { rows } = await client.query(
        `SELECT id FROM consultation_callback_devices
         WHERE id = $1 AND user_id = $2 AND archived_at IS NULL FOR UPDATE`,
        [req.params.id, req.user.id],
      );
      if (!rows.length) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Device not found." });
      }
      if (await hasActiveCallbackAssignments(req.user.id, req.params.id)) {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "Reassign this device's active consultations before removing it." });
      }
      await client.query(
        `UPDATE consultation_callback_devices SET archived_at = now(), installation_id = NULL, updated_at = now()
         WHERE id = $1 AND user_id = $2`,
        [req.params.id, req.user.id],
      );
      await client.query("COMMIT");
      return res.status(204).end();
    } catch (error) {
      if (client) await client.query("ROLLBACK").catch(() => {});
      req.log?.error({ err: error }, "Could not remove callback device");
      return res.status(500).json({ message: "Could not remove device" });
    } finally {
      client?.release();
    }
  });

  app.put("/api/bookings/:bookingId/callback-device", isAuthenticated, async (req: any, res) => {
    const parsed = AssignConsultationCallbackDeviceBody.safeParse(req.body);
    if (!parsed.success || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parsed.data.deviceId)) {
      return res.status(400).json({ message: "Select a registered callback device." });
    }
    let client: any = null;
    try {
      const access = await getCaseFileParticipant(req.params.bookingId, req.user);
      if (!access.booking || access.booking.bookingType !== "consultation") {
        return res.status(404).json({ message: "Consultation not found." });
      }
      if (!access.isSeeker || caseFileReadOnly(access.booking)) {
        return res.status(403).json({ message: "This consultation's callback device cannot be changed." });
      }
      client = await getPool().connect();
      await client.query("BEGIN");
      const device = (await client.query(
        `SELECT device_name AS "deviceName", staff_name AS "staffName"
         FROM consultation_callback_devices
         WHERE id = $1 AND user_id = $2 AND archived_at IS NULL
           AND installation_id IS NOT NULL AND btrim(installation_id) <> ''
           AND staff_name IS NOT NULL AND btrim(staff_name) <> ''
         FOR SHARE`,
        [parsed.data.deviceId, req.user.id],
      )).rows[0];
      if (!device) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "Select a registered callback device linked to an installation and named staff member.",
        });
      }
      const latest = (await client.query(
        `SELECT id, booking_type AS "bookingType", status,
           appointment_slot AS "appointmentSlot"
         FROM bookings WHERE id = $1 AND user_id = $2 AND booking_type = 'consultation'
         FOR UPDATE`,
        [req.params.bookingId, req.user.id],
      )).rows[0];
      if (!latest || caseFileReadOnly(latest)) {
        await client.query("ROLLBACK");
        return res.status(403).json({ message: "This consultation's callback device cannot be changed." });
      }
      const lifecycle = resolveConsultationLifecycle(latest);
      const { rows } = await client.query(
        `UPDATE bookings SET callback_device_id = $2, callback_device_confirmed_at = now(),
           callback_device_reminded_at = NULL, updated_at = now()
         WHERE id = $1 AND user_id = $3 AND booking_type = 'consultation'
           AND status NOT IN ('completed', 'cancelled', 'rejected', 'report_ready')
           AND now() < $4::timestamptz
         RETURNING callback_device_id AS "callbackDeviceId",
           callback_device_confirmed_at AS "callbackDeviceConfirmedAt"`,
        [req.params.bookingId, parsed.data.deviceId, req.user.id, lifecycle.expiresAt?.toISOString()],
      );
      if (!rows.length) {
        await client.query("ROLLBACK");
        return res.status(403).json({ message: "This consultation's callback device cannot be changed." });
      }
      await client.query("COMMIT");
      broadcastCaseFileUpdate(access.booking, {
        type: "case_file_updated", bookingId: access.booking.id, change: "callback_device_changed",
      });
      return res.json(callbackDeviceAssignment(
        { ...latest, ...rows[0] },
        device.deviceName,
        device.staffName,
      ));
    } catch (error) {
      if (client) await client.query("ROLLBACK").catch(() => {});
      req.log?.error({ err: error }, "Could not assign consultation callback device");
      return res.status(500).json({ message: "Could not update this consultation's callback device" });
    } finally {
      client?.release();
    }
  });

  // Personal device numbers are never included in booking or Case File responses.
  // An admin must deliberately reveal the assigned device for an active case.
  app.get("/api/admin/bookings/:bookingId/callback-device", isAdmin, async (req: any, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      const booking = await storage.getBookingById(req.params.bookingId);
      if (!booking || booking.bookingType !== "consultation") {
        return res.status(404).json({ message: "Consultation not found." });
      }
      const status = String(booking.status || "").toLowerCase();
      const lifecycle = resolveConsultationLifecycle(booking);
      if (["completed", "cancelled", "rejected", "report_ready"].includes(status) ||
          lifecycle.status === "completed" || lifecycle.status === "cancelled") {
        return res.status(403).json({ message: "Emergency device access is limited to active consultations." });
      }
      if (!booking.callbackDeviceId) return res.json(null);
      const device = (await getPool().query<{ deviceName: string; phoneNumber: string }>(
        `SELECT device_name AS "deviceName", phone_number AS "phoneNumber"
         FROM consultation_callback_devices WHERE id = $1 AND user_id = $2`,
        [booking.callbackDeviceId, booking.userId],
      )).rows[0];
      if (!device) return res.json(null);
      // Audit the reveal, not the number itself. Fail closed if auditing fails.
      await storage.createAuditLog({
        userId: req.user.id,
        action: "CALLBACK_DEVICE_EMERGENCY_REVEALED",
        entityType: "booking",
        entityId: booking.id,
        details: JSON.stringify({ deviceId: booking.callbackDeviceId, purpose: "emergency" }),
      });
      return res.json({ bookingId: booking.id, ...device });
    } catch (error) {
      req.log?.error({ err: error }, "Could not reveal emergency callback device");
      return res.status(500).json({ message: "Could not reveal emergency callback device" });
    }
  });

  app.get("/api/callback-device/reminders", isAuthenticated, async (req: any, res) => {
    if (req.user.role !== "care_seeker") {
      res.status(403).json({ message: "Only seeker accounts can view callback-device reminders." });
      return;
    }
    try {
      res.json(await listDueCallbackDeviceReminders(req.user.id));
    } catch (error) {
      req.log?.error({ err: error }, "Could not load callback-device reminders");
      res.status(500).json({ message: "Could not load callback-device reminders" });
    }
  });

  // Older mobile builds still use this single-device route; keep it in sync
  // with the directory until all installed clients use the collection API.
  // ── Mobile Callback Device (legacy compatibility) ────────────────────────
  app.get("/api/profile/callback-device", isAuthenticated, async (req: any, res) => {
    if (req.user.role !== "care_seeker") {
      return res.status(403).json({ message: "Only seeker accounts can manage callback devices." });
    }
    try {
      await migrateLegacyCallbackDevice(req.user.id);
      const result = await getPool().query(
        `SELECT device_name AS "deviceName", phone_number AS "phoneNumber", updated_at AS "updatedAt"
         FROM consultation_callback_devices WHERE legacy_user_id = $1 AND archived_at IS NULL`,
        [req.user.id],
      );
      return res.json(result.rows[0] ?? null);
    } catch (error) {
      req.log?.error({ err: error }, "Error fetching callback device");
      return res.status(500).json({ message: "Failed to fetch callback device" });
    }
  });

  app.put("/api/profile/callback-device", isAuthenticated, async (req: any, res) => {
    if (req.user.role !== "care_seeker") {
      return res.status(403).json({ message: "Only seeker accounts can manage callback devices." });
    }
    const { deviceName, phoneNumber } = req.body ?? {};
    if (typeof deviceName !== "string" || !deviceName.trim() || deviceName.trim().length > 100) {
      return res.status(400).json({ message: "Device name is required (up to 100 characters)" });
    }
    if (typeof phoneNumber !== "string" || !/^\+?[\d\s\-().]{7,25}$/.test(phoneNumber.trim()) ||
        phoneNumber.replace(/\D/g, "").length < 7) {
      return res.status(400).json({ message: "Enter a valid callback phone number" });
    }
    try {
      const result = await getPool().query(
        `INSERT INTO mobile_callback_devices (user_id, device_name, phone_number)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO UPDATE
         SET device_name = EXCLUDED.device_name, phone_number = EXCLUDED.phone_number, updated_at = now()
         RETURNING device_name AS "deviceName", phone_number AS "phoneNumber", updated_at AS "updatedAt"`,
        [req.user.id, deviceName.trim(), phoneNumber.trim()],
      );
      await migrateLegacyCallbackDevice(req.user.id);
      await getPool().query(
        `UPDATE consultation_callback_devices SET device_name = $2, phone_number = $3,
           archived_at = NULL, updated_at = now()
         WHERE legacy_user_id = $1`,
        [req.user.id, deviceName.trim(), phoneNumber.trim()],
      );
      return res.json(result.rows[0]);
    } catch (error) {
      req.log?.error({ err: error }, "Error saving callback device");
      return res.status(500).json({ message: "Failed to save callback device" });
    }
  });

  // ── Ward Contacts (seeker phone numbers per ward) ─────────────────────────
  app.get("/api/profile/ward-contacts", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const { getPool } = await import("../db");
      const pool = getPool();
      const result = await pool.query(
        `SELECT id, user_id, ward_name, phone_number, created_at FROM seeker_ward_contacts WHERE user_id = $1 ORDER BY created_at ASC`,
        [userId]
      );
      res.json(result.rows.map((r: any) => ({
        id: r.id,
        userId: r.user_id,
        wardName: r.ward_name,
        phoneNumber: r.phone_number,
        createdAt: r.created_at,
      })));
    } catch (error) {
      req.log?.error({ err: error }, "Error fetching ward contacts");
      res.status(500).json({ message: "Failed to fetch ward contacts" });
    }
  });

  app.post("/api/profile/ward-contacts", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const { wardName, phoneNumber } = req.body as { wardName?: string; phoneNumber?: string };
      if (!wardName?.trim()) return res.status(400).json({ message: "Ward name is required" });
      if (!phoneNumber?.trim()) return res.status(400).json({ message: "Phone number is required" });
      if (!/^\+?[\d\s\-(). ]{7,25}$/.test(phoneNumber.trim())) return res.status(400).json({ message: "Invalid phone number format" });
      const { getPool } = await import("../db");
      const pool = getPool();
      const result = await pool.query(
        `INSERT INTO seeker_ward_contacts (user_id, ward_name, phone_number) VALUES ($1, $2, $3) RETURNING id, user_id, ward_name, phone_number, created_at`,
        [userId, wardName.trim(), phoneNumber.trim()]
      );
      const r = result.rows[0];
      res.status(201).json({ id: r.id, userId: r.user_id, wardName: r.ward_name, phoneNumber: r.phone_number, createdAt: r.created_at });
    } catch (error) {
      req.log?.error({ err: error }, "Error creating ward contact");
      res.status(500).json({ message: "Failed to create ward contact" });
    }
  });

  app.patch("/api/profile/ward-contacts/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const { wardName, phoneNumber } = req.body as { wardName?: string; phoneNumber?: string };
      if (phoneNumber !== undefined && !/^\+?[\d\s\-(). ]{7,25}$/.test(phoneNumber.trim())) return res.status(400).json({ message: "Invalid phone number format" });
      const { getPool } = await import("../db");
      const pool = getPool();
      const existing = await pool.query(`SELECT id FROM seeker_ward_contacts WHERE id = $1 AND user_id = $2`, [req.params.id, userId]);
      if (!existing.rows.length) return res.status(404).json({ message: "Ward contact not found" });
      const result = await pool.query(
        `UPDATE seeker_ward_contacts SET ward_name = COALESCE($1, ward_name), phone_number = COALESCE($2, phone_number) WHERE id = $3 AND user_id = $4 RETURNING id, user_id, ward_name, phone_number, created_at`,
        [wardName?.trim() ?? null, phoneNumber?.trim() ?? null, req.params.id, userId]
      );
      const r = result.rows[0];
      res.json({ id: r.id, userId: r.user_id, wardName: r.ward_name, phoneNumber: r.phone_number, createdAt: r.created_at });
    } catch (error) {
      req.log?.error({ err: error }, "Error updating ward contact");
      res.status(500).json({ message: "Failed to update ward contact" });
    }
  });

  app.delete("/api/profile/ward-contacts/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const { getPool } = await import("../db");
      const pool = getPool();
      const result = await pool.query(`DELETE FROM seeker_ward_contacts WHERE id = $1 AND user_id = $2`, [req.params.id, userId]);
      if ((result as any).rowCount === 0) return res.status(404).json({ message: "Ward contact not found" });
      res.json({ message: "Ward contact deleted" });
    } catch (error) {
      req.log?.error({ err: error }, "Error deleting ward contact");
      res.status(500).json({ message: "Failed to delete ward contact" });
    }
  });

  // Admin - Lab Tests CRUD
  app.post("/api/admin/lab-tests", isAdmin, async (req, res) => {
    try {
      const test = await storage.createLabTest(req.body);
      res.status(201).json(test);
    } catch (error) {
      console.error("Error creating lab test:", error);
      res.status(500).json({ message: "Failed to create lab test" });
    }
  });

  app.patch("/api/admin/lab-tests/:id", isAdmin, async (req, res) => {
    try {
      const existing = await storage.getLabTestById(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Lab test not found" });
      }

      const updateData = { ...req.body };

      if (updateData.customerPrice !== undefined && updateData.marginOverride === undefined) {
        const allProviderTests = await storage.getProviderLabTests();
        const providerTest = allProviderTests.find(pt => pt.labTestId === req.params.id && pt.isActive && pt.approvalStatus === "approved");
        const baseCost = parseFloat(providerTest?.price || existing.cost);
        const cp = parseFloat(updateData.customerPrice);
        if (!isNaN(cp) && baseCost > 0) {
          updateData.marginOverride = deriveMarginFromPrice(baseCost, cp).toFixed(2);
        }
      } else if (updateData.marginOverride !== undefined && updateData.customerPrice === undefined) {
        const allProviderTests = await storage.getProviderLabTests();
        const providerTest = allProviderTests.find(pt => pt.labTestId === req.params.id && pt.isActive && pt.approvalStatus === "approved");
        const baseCost = parseFloat(providerTest?.price || existing.cost);
        const mo = parseFloat(updateData.marginOverride);
        if (!isNaN(mo)) {
          updateData.customerPrice = derivePriceFromMargin(baseCost, mo).toFixed(2);
        }
      }

      const test = await storage.updateLabTest(req.params.id, updateData);
      res.json(test);
    } catch (error) {
      console.error("Error updating lab test:", error);
      res.status(500).json({ message: "Failed to update lab test" });
    }
  });

  app.patch("/api/admin/lab-tests/:id/status", isAdmin, async (req, res) => {
    try {
      const { status } = req.body as { status: ServiceStatus };
      const test = await storage.updateLabTestStatus(req.params.id, status);
      if (!test) {
        return res.status(404).json({ message: "Lab test not found" });
      }
      res.json(test);
    } catch (error) {
      console.error("Error updating lab test status:", error);
      res.status(500).json({ message: "Failed to update lab test status" });
    }
  });

  app.delete("/api/admin/lab-tests/:id", isAdmin, async (req, res) => {
    try {
      await storage.deleteLabTest(req.params.id);
      res.json({ message: "Lab test deleted" });
    } catch (error) {
      console.error("Error deleting lab test:", error);
      res.status(500).json({ message: "Failed to delete lab test" });
    }
  });

  app.post("/api/admin/bulk-import-lab-tests", isAdmin, async (req, res) => {
    try {
      const { providerUserId, tests } = req.body as { providerUserId: string; tests?: { name: string; price: number }[] };
      if (!providerUserId) return res.status(400).json({ message: "providerUserId is required" });

      const provider = await storage.getProviderByUserId(providerUserId);
      if (!provider) return res.status(404).json({ message: "No provider found for that user ID" });

      let importTests: { name: string; price: number }[];
      if (tests && Array.isArray(tests) && tests.length > 0) {
        importTests = tests;
      } else {
        const testDataPath = path.join(process.cwd(), "server/data/ganga-lab-tests.json");
        if (!fs.existsSync(testDataPath)) {
          return res.status(404).json({ message: "No tests provided and no import data file found" });
        }
        importTests = JSON.parse(fs.readFileSync(testDataPath, "utf-8"));
      }

      const invalidItems = importTests.filter(t => !t.name || typeof t.name !== "string" || !t.name.trim() || typeof t.price !== "number" || !isFinite(t.price) || t.price <= 0);
      if (invalidItems.length > 0) {
        return res.status(400).json({ message: `${invalidItems.length} items have invalid name or price`, firstInvalid: invalidItems[0] });
      }

      const existingTests = await storage.getLabTests();
      const existingByName = new Map<string, typeof existingTests[0]>();
      for (const t of existingTests) {
        existingByName.set(t.testName.toLowerCase().trim(), t);
      }

      const existingProviderTests = await storage.getProviderLabTestsByProvider(provider.id);
      const existingPLTByTestId = new Set(existingProviderTests.map(plt => plt.labTestId));

      let testsCreated = 0;
      let assignmentsCreated = 0;
      let skippedDuplicates = 0;

      for (const item of importTests) {
        const normalizedName = item.name.toLowerCase().trim();
        let labTest = existingByName.get(normalizedName);

        if (!labTest) {
          labTest = await storage.createLabTest({
            testName: item.name,
            cost: item.price.toFixed(2),
            turnaroundTime: "As per lab",
            status: "active",
          });
          existingByName.set(normalizedName, labTest);
          testsCreated++;
        }

        if (!existingPLTByTestId.has(labTest.id)) {
          await storage.createProviderLabTest({
            providerId: provider.id,
            labTestId: labTest.id,
            price: item.price.toFixed(2),
            approvalStatus: "approved",
            isActive: true,
          });
          existingPLTByTestId.add(labTest.id);
          assignmentsCreated++;
        } else {
          skippedDuplicates++;
        }
      }

      res.json({
        message: "Bulk import completed",
        provider: { id: provider.id, name: provider.name, type: provider.type },
        totalInFile: importTests.length,
        testsCreated,
        assignmentsCreated,
        skippedDuplicates,
      });
    } catch (error) {
      console.error("Error in bulk import:", error);
      res.status(500).json({ message: "Failed to bulk import lab tests" });
    }
  });

  // Admin - Consultants CRUD
  app.get("/api/admin/consultants", isAdmin, async (req, res) => {
    try {
      const allConsultants = await storage.getConsultants();
      const defaultMarginSetting = await storage.getPlatformSetting("default_margin_percent");
      const defaultMargin = parseFloat(defaultMarginSetting?.settingValue || "15");

      const enriched = allConsultants.map(c => {
        const baseCost = parseFloat(c.consultationFee);
        const pricing = calculateCustomerPrice(baseCost, c.customerPrice, c.marginOverride, defaultMargin);
        return {
          ...c,
          providerBaseCost: baseCost.toFixed(2),
          computedCustomerPrice: pricing.customerPrice.toFixed(2),
          computedMarginPercent: pricing.marginPercent.toFixed(2),
        };
      });
      res.json(enriched);
    } catch (error) {
      console.error("Error fetching consultants:", error);
      res.status(500).json({ message: "Failed to fetch consultants" });
    }
  });

  app.post("/api/admin/consultants", isAdmin, async (req, res) => {
    try {
      const consultant = await storage.createConsultant({ ...req.body, approvalStatus: "approved" });
      res.status(201).json(consultant);
    } catch (error) {
      console.error("Error creating consultant:", error);
      res.status(500).json({ message: "Failed to create consultant" });
    }
  });

  app.patch("/api/admin/consultants/:id", isAdmin, async (req, res) => {
    try {
      const existing = await storage.getConsultantById(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Consultant not found" });
      }

      const updateData = { ...req.body };
      const baseCost = parseFloat(existing.consultationFee);

      if (updateData.customerPrice !== undefined && updateData.marginOverride === undefined) {
        const cp = parseFloat(updateData.customerPrice);
        if (!isNaN(cp) && baseCost > 0) {
          updateData.marginOverride = deriveMarginFromPrice(baseCost, cp).toFixed(2);
        }
      } else if (updateData.marginOverride !== undefined && updateData.customerPrice === undefined) {
        const mo = parseFloat(updateData.marginOverride);
        if (!isNaN(mo)) {
          updateData.customerPrice = derivePriceFromMargin(baseCost, mo).toFixed(2);
        }
      }

      const consultant = await storage.updateConsultant(req.params.id, updateData);
      res.json(consultant);
    } catch (error) {
      console.error("Error updating consultant:", error);
      res.status(500).json({ message: "Failed to update consultant" });
    }
  });

  app.patch("/api/admin/consultants/:id/status", isAdmin, async (req, res) => {
    try {
      const { status } = req.body as { status: ServiceStatus };
      const consultant = await storage.updateConsultantStatus(req.params.id, status);
      if (!consultant) {
        return res.status(404).json({ message: "Consultant not found" });
      }
      res.json(consultant);
    } catch (error) {
      console.error("Error updating consultant status:", error);
      res.status(500).json({ message: "Failed to update consultant status" });
    }
  });

  app.delete("/api/admin/consultants/:id", isAdmin, async (req, res) => {
    try {
      await storage.deleteConsultant(req.params.id);
      res.json({ message: "Consultant deleted" });
    } catch (error) {
      console.error("Error deleting consultant:", error);
      res.status(500).json({ message: "Failed to delete consultant" });
    }
  });

  // Admin - Radiology Modalities CRUD
  app.post("/api/admin/radiology-modalities", isAdmin, async (req, res) => {
    try {
      const modality = await storage.createRadiologyModality(req.body);
      res.status(201).json(modality);
    } catch (error) {
      console.error("Error creating radiology modality:", error);
      res.status(500).json({ message: "Failed to create modality" });
    }
  });

  app.patch("/api/admin/radiology-modalities/:id", isAdmin, async (req, res) => {
    try {
      const modality = await storage.updateRadiologyModality(req.params.id, req.body);
      if (!modality) {
        return res.status(404).json({ message: "Modality not found" });
      }
      res.json(modality);
    } catch (error) {
      console.error("Error updating radiology modality:", error);
      res.status(500).json({ message: "Failed to update modality" });
    }
  });

  app.patch("/api/admin/radiology-modalities/:id/status", isAdmin, async (req, res) => {
    try {
      const { status } = req.body as { status: ServiceStatus };
      const modality = await storage.updateRadiologyModalityStatus(req.params.id, status);
      if (!modality) {
        return res.status(404).json({ message: "Modality not found" });
      }
      res.json(modality);
    } catch (error) {
      console.error("Error updating radiology modality status:", error);
      res.status(500).json({ message: "Failed to update modality status" });
    }
  });

  app.delete("/api/admin/radiology-modalities/:id", isAdmin, async (req, res) => {
    try {
      await storage.deleteRadiologyModality(req.params.id);
      res.json({ message: "Radiology modality deleted" });
    } catch (error) {
      console.error("Error deleting radiology modality:", error);
      res.status(500).json({ message: "Failed to delete modality" });
    }
  });

  // ===== Provider-Test Assignments (Admin manages which provider handles which test) =====
  
  // Get all provider-test assignments with provider details
  app.get("/api/admin/provider-lab-tests", isAdmin, async (req, res) => {
    try {
      const assignments = await storage.getProviderLabTests();
      const providers = await storage.getProviders();
      const labTests = await storage.getLabTests();
      
      const enriched = assignments.map(a => ({
        ...a,
        provider: providers.find(p => p.id === a.providerId),
        labTest: labTests.find(t => t.id === a.labTestId),
      }));
      res.json(enriched);
    } catch (error) {
      console.error("Error fetching provider lab tests:", error);
      res.status(500).json({ message: "Failed to fetch provider lab tests" });
    }
  });

  // Get providers assigned to a specific test
  app.get("/api/admin/lab-tests/:testId/providers", isAdmin, async (req, res) => {
    try {
      const assignments = await storage.getProviderLabTestsByTest(req.params.testId);
      const providers = await storage.getProviders();
      
      const enriched = assignments.map(a => ({
        ...a,
        provider: providers.find(p => p.id === a.providerId),
      }));
      res.json(enriched);
    } catch (error) {
      console.error("Error fetching test providers:", error);
      res.status(500).json({ message: "Failed to fetch test providers" });
    }
  });

  // Enable provider for a test
  app.post("/api/admin/provider-lab-tests", isAdmin, async (req, res) => {
    try {
      const assignment = await storage.createProviderLabTest({ ...req.body, approvalStatus: "approved" });
      res.status(201).json(assignment);
    } catch (error) {
      console.error("Error creating provider lab test:", error);
      res.status(500).json({ message: "Failed to assign provider to test" });
    }
  });

  // Update provider-test assignment
  app.patch("/api/admin/provider-lab-tests/:id", isAdmin, async (req, res) => {
    try {
      const updated = await storage.updateProviderLabTest(req.params.id, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating provider lab test:", error);
      res.status(500).json({ message: "Failed to update assignment" });
    }
  });

  // Remove provider from test
  app.delete("/api/admin/provider-lab-tests/:id", isAdmin, async (req, res) => {
    try {
      await storage.deleteProviderLabTest(req.params.id);
      res.json({ message: "Provider removed from test" });
    } catch (error) {
      console.error("Error deleting provider lab test:", error);
      res.status(500).json({ message: "Failed to remove provider from test" });
    }
  });

  // ===== Suggested Lab Tests (Providers suggest, Admin approves) =====
  
  app.get("/api/admin/suggested-lab-tests", isAdmin, async (req, res) => {
    try {
      const suggestions = await storage.getPendingSuggestedLabTests();
      const providers = await storage.getProviders();
      
      const enriched = suggestions.map(s => ({
        ...s,
        provider: providers.find(p => p.id === s.providerId),
      }));
      res.json(enriched);
    } catch (error) {
      console.error("Error fetching suggested lab tests:", error);
      res.status(500).json({ message: "Failed to fetch suggestions" });
    }
  });

  app.patch("/api/admin/suggested-lab-tests/:id", isAdmin, async (req, res) => {
    try {
      const { status, adminNotes } = req.body;
      const updated = await storage.updateSuggestedLabTestStatus(req.params.id, status, adminNotes);
      res.json(updated);
    } catch (error) {
      console.error("Error updating suggested lab test:", error);
      res.status(500).json({ message: "Failed to update suggestion" });
    }
  });

  // ===== Provider-Modality Assignments (Admin manages which provider handles which modality) =====
  
  app.get("/api/admin/provider-modalities", isAdmin, async (req, res) => {
    try {
      const assignments = await storage.getProviderModalities();
      const providers = await storage.getProviders();
      const modalities = await storage.getRadiologyModalities();
      
      const enriched = assignments.map(a => ({
        ...a,
        provider: providers.find(p => p.id === a.providerId),
        modality: modalities.find(m => m.id === a.modalityId),
      }));
      res.json(enriched);
    } catch (error) {
      console.error("Error fetching provider modalities:", error);
      res.status(500).json({ message: "Failed to fetch provider modalities" });
    }
  });

  app.get("/api/admin/modalities/:modalityId/providers", isAdmin, async (req, res) => {
    try {
      const assignments = await storage.getProviderModalitiesByModality(req.params.modalityId);
      const providers = await storage.getProviders();
      
      const enriched = assignments.map(a => ({
        ...a,
        provider: providers.find(p => p.id === a.providerId),
      }));
      res.json(enriched);
    } catch (error) {
      console.error("Error fetching modality providers:", error);
      res.status(500).json({ message: "Failed to fetch modality providers" });
    }
  });

  app.post("/api/admin/provider-modalities", isAdmin, async (req, res) => {
    try {
      const assignment = await storage.createProviderModality(req.body);
      res.status(201).json(assignment);
    } catch (error) {
      console.error("Error creating provider modality:", error);
      res.status(500).json({ message: "Failed to assign provider to modality" });
    }
  });

  app.patch("/api/admin/provider-modalities/:id", isAdmin, async (req, res) => {
    try {
      const updated = await storage.updateProviderModality(req.params.id, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating provider modality:", error);
      res.status(500).json({ message: "Failed to update assignment" });
    }
  });

  app.delete("/api/admin/provider-modalities/:id", isAdmin, async (req, res) => {
    try {
      await storage.deleteProviderModality(req.params.id);
      res.json({ message: "Provider removed from modality" });
    } catch (error) {
      console.error("Error deleting provider modality:", error);
      res.status(500).json({ message: "Failed to remove provider from modality" });
    }
  });

  // ===== Suggested Modalities (Providers suggest, Admin approves) =====
  
  app.get("/api/admin/suggested-modalities", isAdmin, async (req, res) => {
    try {
      const suggestions = await storage.getPendingSuggestedModalities();
      const providers = await storage.getProviders();
      
      const enriched = suggestions.map(s => ({
        ...s,
        provider: providers.find(p => p.id === s.providerId),
      }));
      res.json(enriched);
    } catch (error) {
      console.error("Error fetching suggested modalities:", error);
      res.status(500).json({ message: "Failed to fetch suggestions" });
    }
  });

  app.patch("/api/admin/suggested-modalities/:id", isAdmin, async (req, res) => {
    try {
      const { status, adminNotes } = req.body;
      const updated = await storage.updateSuggestedModalityStatus(req.params.id, status, adminNotes);
      res.json(updated);
    } catch (error) {
      console.error("Error updating suggested modality:", error);
      res.status(500).json({ message: "Failed to update suggestion" });
    }
  });

  // Admin - Bookings Management (view all platform activity)
  app.get("/api/admin/bookings", isAdmin, async (req, res) => {
    try {
      const [bookings, users, providers] = await Promise.all([
        storage.getAllBookings(),
        storage.getUsers(),
        storage.getProviders(),
      ]);
      res.json(enrichAdminBookingsWithAccessDetails(bookings, users, providers));
    } catch (error) {
      console.error("Error fetching admin bookings:", error);
      res.status(500).json({ message: "Failed to fetch bookings" });
    }
  });

  app.post("/api/admin/bookings/:id/access-copy-audit", isAdmin, async (req: any, res) => {
    try {
      const booking = await storage.getBookingById(req.params.id);
      if (!booking) return res.status(404).json({ message: "Booking not found" });

      const allowedSurfaces = new Set(["all_bookings", "dashboard", "appointments"]);
      const allowedAudiences = new Set(["seeker", "provider", "both"]);
      const surface = String(req.body?.surface || "");
      const audience = String(req.body?.audience || "");
      if (!allowedSurfaces.has(surface) || !allowedAudiences.has(audience)) {
        return res.status(400).json({ message: "Invalid audit details" });
      }

      await storage.createAuditLog({
        userId: req.user.id,
        action: "export_booking_access_details",
        entityType: "booking",
        entityId: booking.id,
        details: JSON.stringify({ surface, audience }),
      });

      return res.json({ success: true });
    } catch (error) {
      console.error("Error auditing booking access copy:", error);
      return res.status(500).json({ message: "Failed to authorize access-detail copy" });
    }
  });

  // Admin dashboard stats
  app.get("/api/admin/stats", isAdmin, async (req, res) => {
    try {
      const bookings = await storage.getAllBookings();
      const providers = await storage.getProviders();
      const users = await storage.getUsers();
      const consultants = await storage.getConsultants();
      const labTests = await storage.getLabTests();
      const modalities = await storage.getRadiologyModalities();

      // Booking stats by type
      const consultationBookings = bookings.filter(b => b.bookingType === "consultation");
      const labBookings = bookings.filter(b => b.bookingType === "lab");
      const teleradiologyBookings = bookings.filter(b => b.bookingType === "teleradiology");

      // Status breakdown
      const pendingBookings = bookings.filter(b => b.status === "pending");
      const bookedBookings = bookings.filter(b => b.status === "booked");
      const confirmedBookings = bookings.filter(b => b.status === "confirmed");
      const completedBookings = bookings.filter(b => b.status === "completed");
      const cancelledBookings = bookings.filter(b => b.status === "cancelled");

      // Revenue calculation
      const totalRevenue = bookings
        .filter(b => b.status === "completed" && b.paymentStatus === "paid")
        .reduce((sum, b) => sum + parseFloat(b.amount || "0"), 0);
      
      const pendingRevenue = bookings
        .filter(b => b.status !== "cancelled" && b.paymentStatus !== "paid")
        .reduce((sum, b) => sum + parseFloat(b.amount || "0"), 0);

      // Recent bookings (last 10)
      const recentBookings = enrichAdminBookingsWithAccessDetails(bookings, users, providers)
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
        .slice(0, 10);

      res.json({
        overview: {
          totalBookings: bookings.length,
          totalProviders: providers.length,
          totalUsers: users.length,
          totalRevenue,
          pendingRevenue,
        },
        byType: {
          consultation: consultationBookings.length,
          lab: labBookings.length,
          teleradiology: teleradiologyBookings.length,
        },
        byStatus: {
          pending: pendingBookings.length,
          booked: bookedBookings.length,
          confirmed: confirmedBookings.length,
          completed: completedBookings.length,
          cancelled: cancelledBookings.length,
        },
        services: {
          consultants: consultants.length,
          labTests: labTests.length,
          modalities: modalities.length,
        },
        recentBookings,
      });
    } catch (error) {
      console.error("Error fetching admin stats:", error);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  // Admin - Create booking on behalf of user
  // For consultation type: performs the same business logic as the user flow
  // (pricing calculation, booking number generation, video room creation, provider linking).
  // For other types: simple pass-through (existing behaviour preserved).
  app.post("/api/admin/bookings", isAdmin, async (req: any, res) => {
    try {
      const bookingData: any = { ...req.body };

      if (bookingData.bookingType === "consultation") {
        // ── Validate required fields ──────────────────────────────────────────
        if (!bookingData.userId)      return res.status(400).json({ message: "userId (Care Seeker) is required" });
        if (!bookingData.serviceId)   return res.status(400).json({ message: "serviceId (Consultant) is required" });
        if (!bookingData.patientName?.trim()) return res.status(400).json({ message: "Patient name is required" });
        if (!bookingData.patientAge)  return res.status(400).json({ message: "Patient age is required" });
        if (!bookingData.clinicalSummary?.trim()) return res.status(400).json({ message: "Clinical summary is required" });

        // ── Validate seeker ───────────────────────────────────────────────────
        const seeker = await storage.getUserById(bookingData.userId);
        if (!seeker) return res.status(400).json({ message: "Care Seeker not found" });
        if (seeker.role !== "care_seeker") {
          return res.status(400).json({ message: "Selected account is not a Care Seeker" });
        }

        // ── Resolve consultant → provider ────────────────────────────────────
        const consultant = await storage.getConsultantById(bookingData.serviceId);
        if (!consultant) return res.status(400).json({ message: "Consultant not found" });

        bookingData.serviceName = consultant.name;
        if (consultant.providerId) {
          bookingData.providerId = consultant.providerId;
          const provider = await storage.getProviderById(consultant.providerId);
          if (provider) bookingData.providerName = provider.name;
        }

        if (process.env.CALL_MEDIA_PROVIDER === "daily") {
          try {
            const roomName = `perfusion-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const dailyRoom = await createDailyRoom(roomName);
            bookingData.videoRoomId = dailyRoom ? dailyRoom.url : null;
          } catch {
            bookingData.videoRoomId = null;
          }
        } else {
          bookingData.id = randomUUID();
          bookingData.videoRoomId = `stream://booking/${bookingData.id}`;
        }

        // ── Pricing ───────────────────────────────────────────────────────────
        const defaultMarginSetting = await storage.getPlatformSetting("default_margin_percent");
        const defaultMarginPct = parseFloat(defaultMarginSetting?.settingValue || "15");
        const providerBaseCost = parseFloat(consultant.consultationFee || "0");
        const pricing = calculateCustomerPrice(
          providerBaseCost,
          consultant.customerPrice || null,
          consultant.marginOverride || null,
          defaultMarginPct,
        );
        const customerAmount = pricing.customerPrice;
        const marginAmount = customerAmount - providerBaseCost;
        const marginPercent = providerBaseCost > 0 ? (marginAmount / providerBaseCost) * 100 : 0;

        bookingData.basePrice     = providerBaseCost.toFixed(2);
        bookingData.marginPercent = marginPercent.toFixed(2);
        bookingData.marginAmount  = marginAmount.toFixed(2);
        bookingData.amount        = customerAmount.toFixed(2);

        // ── Payment ───────────────────────────────────────────────────────────
        const isPayNow = bookingData.paymentMethod === "pay_now";
        if (isPayNow) {
          // Admin confirms payment has been received — mark as paid immediately
          bookingData.paymentStatus = "paid";
          bookingData.amountPaid   = customerAmount.toFixed(2);
          bookingData.paidAt       = new Date();
          bookingData.dueDate      = new Date();
          bookingData.paymentMethod = "pay_now";
        } else {
          // Pay Later — invoice remains open
          bookingData.paymentStatus = "pending";
          bookingData.amountPaid    = "0";
          const dueDate = new Date();
          dueDate.setMonth(dueDate.getMonth() + 1);
          bookingData.dueDate      = dueDate;
          bookingData.paymentMethod = "pay_later";
        }

        // ── Booking number & status ───────────────────────────────────────────
        bookingData.status        = "booked";
        bookingData.bookingNumber = await generateBookingNumber("consultation");
      }

      const booking = await storage.createBooking(bookingData);
      res.status(201).json(booking);
    } catch (error: any) {
      console.error("Error creating admin booking:", error);
      res.status(500).json({ message: error?.message || "Failed to create booking" });
    }
  });

  // Admin - Update booking (full control)
  app.patch("/api/admin/bookings/:id", isAdmin, async (req, res) => {
    try {
      const booking = await storage.updateBooking(req.params.id, req.body);
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }
      res.json(booking);
    } catch (error) {
      console.error("Error updating admin booking:", error);
      res.status(500).json({ message: "Failed to update booking" });
    }
  });

  // Admin - Update provider details
  app.patch("/api/admin/providers/:id", isAdmin, async (req, res) => {
    try {
      const provider = await storage.updateProvider(req.params.id, req.body);
      if (!provider) {
        return res.status(404).json({ message: "Provider not found" });
      }
      res.json(provider);
    } catch (error) {
      console.error("Error updating provider:", error);
      res.status(500).json({ message: "Failed to update provider" });
    }
  });

  // Consultant slots management (for admin and providers only)
  app.patch("/api/consultants/:id/slots", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      
      // Only admin or providers can update slots
      if (user.role !== "admin" && user.role !== "provider") {
        return res.status(403).json({ message: "Access denied. Only admins and providers can manage slots." });
      }
      
      // If provider, verify consultant belongs to them
      if (user.role === "provider") {
        const provider = await storage.getProviderByUserId(user.id);
        if (!provider) {
          return res.status(403).json({ message: "Provider profile not found" });
        }
        const consultant = await storage.getConsultantById(req.params.id);
        if (!consultant) return res.status(404).json({ message: "Consultant not found" });
        if (consultant.providerId && consultant.providerId !== provider.id) {
          return res.status(403).json({ message: "Access denied. You can only manage your own consultants." });
        }
      }
      
      const { availabilityFrom, availabilityTo, availableDays, availableSlots, slotSeries } = req.body as { availabilityFrom?: string; availabilityTo?: string; availableDays?: string[]; availableSlots?: string[]; slotSeries?: { days: string[]; from: string; to: string; paused?: boolean; disabled?: boolean }[] };
      const consultant = await storage.updateConsultant(req.params.id, { availabilityFrom, availabilityTo, availableDays, slotSeries, ...(availableSlots !== undefined ? { availableSlots } : {}) } as any);
      if (!consultant) {
        return res.status(404).json({ message: "Consultant not found" });
      }
      res.json(consultant);
    } catch (error) {
      console.error("Error updating consultant slots:", error);
      res.status(500).json({ message: "Failed to update slots" });
    }
  });

  // Slot override helpers — re-used auth check
  async function verifyConsultantOwnership(req: any, res: any): Promise<boolean> {
    const user = req.user;
    if (user.role !== "admin" && user.role !== "provider") {
      res.status(403).json({ message: "Access denied." });
      return false;
    }
    if (user.role === "provider") {
      const provider = await storage.getProviderByUserId(user.id);
      if (!provider) { res.status(403).json({ message: "Provider profile not found" }); return false; }
      const consultant = await storage.getConsultantById(req.params.id);
      if (!consultant) { res.status(404).json({ message: "Consultant not found" }); return false; }
      if (consultant.providerId && consultant.providerId !== provider.id) {
        res.status(403).json({ message: "Access denied. You can only manage your own consultants." });
        return false;
      }
    }
    return true;
  }

  app.get("/api/consultants/:id/slot-overrides", isAuthenticated, async (req: any, res) => {
    try {
      if (!await verifyConsultantOwnership(req, res)) return;
      const overrides = await storage.getSlotOverrides(req.params.id);
      res.json(overrides);
    } catch (error) {
      console.error("Error fetching slot overrides:", error);
      res.status(500).json({ message: "Failed to fetch slot overrides" });
    }
  });

  app.post("/api/consultants/:id/slot-overrides", isAuthenticated, async (req: any, res) => {
    try {
      if (!await verifyConsultantOwnership(req, res)) return;
      const { date, isPaused, customFrom, customTo } = req.body as { date: string; isPaused: boolean; customFrom?: string; customTo?: string };
      if (!date) return res.status(400).json({ message: "date is required" });
      const override = await storage.upsertSlotOverride({ consultantId: req.params.id, date, isPaused: !!isPaused, customFrom: customFrom ?? null, customTo: customTo ?? null });
      res.json(override);
    } catch (error) {
      console.error("Error upserting slot override:", error);
      res.status(500).json({ message: "Failed to save slot override" });
    }
  });

  app.delete("/api/consultants/:id/slot-overrides/:date", isAuthenticated, async (req: any, res) => {
    try {
      if (!await verifyConsultantOwnership(req, res)) return;
      await storage.deleteSlotOverride(req.params.id, req.params.date);
      res.json({ ok: true });
    } catch (error) {
      console.error("Error deleting slot override:", error);
      res.status(500).json({ message: "Failed to delete slot override" });
    }
  });

  // Read-only slot overrides for the booking form — any authenticated user may fetch
  app.get("/api/consultants/:id/public-slot-overrides", isAuthenticated, async (req: any, res) => {
    try {
      const overrides = await storage.getSlotOverrides(req.params.id);
      res.json(overrides);
    } catch (error) {
      console.error("Error fetching public slot overrides:", error);
      res.status(500).json({ message: "Failed to fetch slot overrides" });
    }
  });

  app.patch("/api/consultants/:id/photo", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (req.user.role === "provider") {
        const provider = await storage.getProviderByUserId(userId);
        if (!provider) return res.status(403).json({ message: "Provider not found" });
        const consultant = await storage.getConsultantById(req.params.id);
        if (!consultant) return res.status(404).json({ message: "Consultant not found" });
        if (consultant.providerId && consultant.providerId !== provider.id) {
          return res.status(403).json({ message: "Access denied" });
        }
      } else if (req.user.role !== "admin") {
        return res.status(403).json({ message: "Access denied" });
      }
      const { photoUrl } = req.body;
      const updated = await storage.updateConsultant(req.params.id, { photoUrl } as any);
      if (!updated) return res.status(404).json({ message: "Consultant not found" });
      res.json(updated);
    } catch (error) {
      console.error("Error updating consultant photo:", error);
      res.status(500).json({ message: "Failed to update photo" });
    }
  });

  // Combined upload + DB update in one authenticated request — stores as base64 (no filesystem)
  app.post("/api/consultants/:id/upload-photo", isAuthenticated, uploadImageMemory.single("photo"), async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (req.user.role === "provider") {
        const provider = await storage.getProviderByUserId(userId);
        if (!provider) return res.status(403).json({ message: "Provider not found" });
        const consultant = await storage.getConsultantById(req.params.id);
        if (!consultant) return res.status(404).json({ message: "Consultant not found" });
        if (consultant.providerId && consultant.providerId !== provider.id) {
          return res.status(403).json({ message: "Access denied" });
        }
      } else if (req.user.role !== "admin") {
        return res.status(403).json({ message: "Access denied" });
      }
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return res.status(503).json({ message: "Photo storage is temporarily unavailable. Please try again later." });
      }

      let photoUrl: string;
      try {
        photoUrl = await supabaseUpload(req.file.buffer, req.file.originalname, "consultant-photos", req.file.mimetype);
      } catch (supabaseErr) {
        console.error("Supabase consultant photo upload failed:", supabaseErr);
        return res.status(503).json({ message: "Photo storage is temporarily unavailable. Please try again later." });
      }

      const updated = await storage.updateConsultant(req.params.id, { photoUrl } as any);
      if (!updated) return res.status(404).json({ message: "Consultant not found" });
      res.json({ photoUrl, consultant: updated });
    } catch (error) {
      console.error("Error uploading consultant photo:", error);
      res.status(500).json({ message: "Failed to upload photo" });
    }
  });

  // Upload + store digital signature as base64 (no filesystem)
  app.post("/api/consultants/:id/upload-signature", isAuthenticated, uploadImageMemory.single("signature"), async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (req.user.role === "provider") {
        const provider = await storage.getProviderByUserId(userId);
        if (!provider) return res.status(403).json({ message: "Provider not found" });
        const consultant = await storage.getConsultantById(req.params.id);
        if (!consultant) return res.status(404).json({ message: "Consultant not found" });
        if (consultant.providerId && consultant.providerId !== provider.id) {
          return res.status(403).json({ message: "Access denied" });
        }
      } else if (req.user.role !== "admin") {
        return res.status(403).json({ message: "Access denied" });
      }
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      let digitalSignatureUrl: string | null = null;
      if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        try {
          digitalSignatureUrl = await supabaseUpload(req.file.buffer, req.file.originalname, "consultant-signatures", req.file.mimetype);
        } catch (supabaseErr) {
          console.warn("Supabase signature upload failed, using local fallback:", supabaseErr);
        }
      }
      if (!digitalSignatureUrl) {
        const fsSync = await import("fs");
        const pathLib = await import("path");
        const ext = pathLib.default.extname(req.file.originalname) || ".png";
        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
        const uploadsDir = pathLib.default.join(process.cwd(), "uploads", "consultant-signatures");
        fsSync.default.mkdirSync(uploadsDir, { recursive: true });
        fsSync.default.writeFileSync(pathLib.default.join(uploadsDir, uniqueName), req.file.buffer);
        digitalSignatureUrl = `/api/uploads/consultant-signatures/${uniqueName}`;
      }
      const updated = await storage.updateConsultant(req.params.id, { digitalSignatureUrl } as any);
      if (!updated) return res.status(404).json({ message: "Consultant not found" });
      res.json({ digitalSignatureUrl, consultant: updated });
    } catch (error) {
      console.error("Error uploading consultant signature:", error);
      res.status(500).json({ message: "Failed to upload signature" });
    }
  });

  // Booking update endpoint (for patient details form)
  app.patch("/api/bookings/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const booking = await storage.getBookingById(req.params.id);
      
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }
      
      // Only allow the booking owner to update
      if (booking.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const updated = await storage.updateBooking(req.params.id, req.body);
      await syncLegacyCaseFileSummary(updated);
      res.json(updated);
    } catch (error) {
      console.error("Error updating booking:", error);
      res.status(500).json({ message: "Failed to update booking" });
    }
  });

  // In-call document upload — seeker or provider uploads a file during a video consultation.
  // File is saved to disk, appended to documentUrls, and broadcast to both parties via SSE.
  app.post("/api/bookings/:id/call-document", isAuthenticated, uploadReport.single("file"), async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const booking = await storage.getBookingById(req.params.id);
      if (!booking) return res.status(404).json({ message: "Booking not found" });
      if (caseFileReadOnly(booking)) return res.status(403).json({ message: "This Case File is read-only" });

      // Allow the seeker (booking owner) or the assigned provider
      let isAuthorised = booking.userId === userId;
      if (!isAuthorised && booking.providerId) {
        // Check if the current user is the provider for this consultant
        const provider = await storage.getProviderByUserId(userId);
        if (provider) {
          const [consultant] = await db
            .select()
            .from(consultants)
            .where(eq(consultants.providerId, provider.id))
            .limit(1);
          if (consultant && consultant.id === booking.providerId) {
            isAuthorised = true;
          }
        }
      }
      if (!isAuthorised) return res.status(403).json({ message: "Access denied" });

      if (!req.file) return res.status(400).json({ message: "No file uploaded" });

      let fileUrl: string | null = null;
      if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        try {
          fileUrl = await supabaseUpload(req.file.buffer, req.file.originalname, "call-documents", req.file.mimetype);
        } catch (supabaseErr) {
          console.warn("Supabase call-document upload failed, using local fallback:", supabaseErr);
        }
      }
      if (!fileUrl) {
        const fsSync = await import("fs");
        const pathLib = await import("path");
        const ext = pathLib.default.extname(req.file.originalname) || ".bin";
        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
        const uploadsDir = pathLib.default.join(process.cwd(), "uploads", "call-documents");
        fsSync.default.mkdirSync(uploadsDir, { recursive: true });
        fsSync.default.writeFileSync(pathLib.default.join(uploadsDir, uniqueName), req.file.buffer);
        fileUrl = `/api/uploads/call-documents/${uniqueName}`;
      }
      const fileName = req.file.originalname;

      // Append to documentUrls
      const existing = (booking.documentUrls || []).filter((u: any) => u && u !== "undefined");
      await storage.updateBooking(booking.id, { documentUrls: [...existing, fileUrl] } as any);

      // Broadcast SSE document_uploaded to both seeker and provider.
      // booking.providerId is providers.id — look it up directly to get the
      // provider's userId. (Do NOT query consultants.id = booking.providerId;
      // booking.serviceId is the consultants.id, booking.providerId is providers.id.)
      const event = { type: "document_uploaded", bookingId: booking.id, url: fileUrl, fileName };
      broadcastCallEvent(booking.userId, event);
      if (booking.providerId) {
        const providerRow = await storage.getProviderById(booking.providerId);
        if (providerRow?.userId) broadcastCallEvent(providerRow.userId, event);
      }

      res.json({ url: fileUrl, fileName });
    } catch (error) {
      console.error("[CallDoc] Upload error:", error);
      res.status(500).json({ message: "Upload failed" });
    }
  });

  // Document upload endpoint for patients
  app.patch("/api/bookings/:id/documents", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const booking = await storage.getBookingById(req.params.id);
      
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }
      if (caseFileReadOnly(booking)) return res.status(403).json({ message: "This Case File is read-only" });
      
      // Only allow the booking owner to upload documents
      if (booking.userId !== userId) {
        return res.status(403).json({ message: "Access denied. You can only upload documents to your own bookings." });
      }

      // After Clinical Advisory: uploads only allowed while in 24h window AND uploads toggle is on
      if ((booking as any).prescriptionApprovedAt) {
        const expiresAt = (booking as any).postRxExpiresAt ? new Date((booking as any).postRxExpiresAt) : null;
        const inWindow = !!(expiresAt && new Date() < expiresAt);
        const uploadsEnabled = !!(booking as any).postRxUploadsEnabled;
        if (!inWindow || !uploadsEnabled) {
          const message = !inWindow
            ? "Post-consultation 24-hour window has expired — no further uploads are accepted."
            : "Document uploads are currently disabled. Ask the consultant to re-enable uploads.";
          return res.status(403).json({ message });
        }
      }
      
      const { documentUrl } = req.body as { documentUrl: string };
      
      // Append to existing document URLs array, filtering out any null/undefined values
      const existingDocs = (booking.documentUrls || []).filter((u: any) => u && u !== "undefined" && u !== "null");
      const newDocUrls = [...existingDocs, documentUrl];
      
      const updated = await storage.updateBooking(req.params.id, { documentUrls: newDocUrls } as any);
      res.json(updated);
    } catch (error) {
      console.error("Error uploading document:", error);
      res.status(500).json({ message: "Failed to upload document" });
    }
  });

  // Append treatment chart URL to a booking
  app.patch("/api/bookings/:id/treatment-charts", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const booking = await storage.getBookingById(req.params.id);
      
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }
      if (caseFileReadOnly(booking)) return res.status(403).json({ message: "This Case File is read-only" });
      
      if (booking.userId !== userId) {
        return res.status(403).json({ message: "Access denied." });
      }

      // After Clinical Advisory: uploads only allowed while in 24h window AND uploads toggle is on
      if ((booking as any).prescriptionApprovedAt) {
        const expiresAt = (booking as any).postRxExpiresAt ? new Date((booking as any).postRxExpiresAt) : null;
        const inWindow = !!(expiresAt && new Date() < expiresAt);
        const uploadsEnabled = !!(booking as any).postRxUploadsEnabled;
        if (!inWindow || !uploadsEnabled) {
          const message = !inWindow
            ? "Post-consultation 24-hour window has expired — no further uploads are accepted."
            : "Document uploads are currently disabled. Ask the consultant to re-enable uploads.";
          return res.status(403).json({ message });
        }
      }
      
      const { chartUrl } = req.body as { chartUrl: string };
      
      const existingCharts = ((booking as any).treatmentChartUrls || []).filter((u: any) => u && u !== "undefined" && u !== "null");
      const newChartUrls = [...existingCharts, chartUrl];
      
      const updated = await storage.updateBooking(req.params.id, { treatmentChartUrls: newChartUrls } as any);
      res.json(updated);
    } catch (error) {
      console.error("Error uploading treatment chart:", error);
      res.status(500).json({ message: "Failed to upload treatment chart" });
    }
  });

  // File upload endpoint for reports
  app.post("/api/upload/report", isAuthenticated, uploadReport.single("file"), async (req: any, res) => {
    try {
      const user = req.user;
      
      // Only admin or providers can upload reports
      if (user.role !== "admin" && user.role !== "provider") {
        return res.status(403).json({ message: "Access denied" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      let fileUrl: string | null = null;
      if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        try {
          fileUrl = await supabaseUpload(req.file.buffer, req.file.originalname, "reports", req.file.mimetype);
        } catch (supabaseErr) {
          console.warn("Supabase report upload failed, using local fallback:", supabaseErr);
        }
      }
      if (!fileUrl) {
        const fsSync = await import("fs");
        const pathLib = await import("path");
        const ext = pathLib.default.extname(req.file.originalname) || ".bin";
        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
        const uploadsDir = pathLib.default.join(process.cwd(), "uploads", "reports");
        fsSync.default.mkdirSync(uploadsDir, { recursive: true });
        fsSync.default.writeFileSync(pathLib.default.join(uploadsDir, uniqueName), req.file.buffer);
        fileUrl = `/api/uploads/reports/${uniqueName}`;
      }

      res.json({ 
        success: true, 
        url: fileUrl,
        filename: req.file.originalname,
        size: req.file.size
      });
    } catch (error) {
      console.error("Error uploading report file:", error);
      res.status(500).json({ message: "Failed to upload file" });
    }
  });

  // Public upload endpoint for registration documents — used during sign-up before a session exists.
  // Accepts base64-encoded JSON. Rate exposure is acceptable: the URL is only meaningful if the
  // caller subsequently completes a valid registration request that references it.
  app.post("/api/upload/registration-document", async (req: any, res: any) => {
    try {
      const { base64, filename, mimeType } = req.body as {
        base64?: string;
        filename?: string;
        mimeType?: string;
      };

      if (!base64 || !filename) {
        return res.status(400).json({ message: "No file data received. Please select a file and try again." });
      }

      const buffer = Buffer.from(base64, "base64");
      const MAX_BYTES = 5 * 1024 * 1024;
      if (buffer.length > MAX_BYTES) {
        const mb = (buffer.length / (1024 * 1024)).toFixed(1);
        return res.status(400).json({ message: `File is too large (${mb} MB). Maximum allowed size is 5 MB.` });
      }

      let fileUrl: string | null = null;

      if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        try {
          fileUrl = await supabaseUpload(buffer, filename, "documents", mimeType || "application/octet-stream");
        } catch (supabaseErr) {
          console.warn("Supabase registration-document upload failed, using local fallback:", supabaseErr);
        }
      }
      if (!fileUrl) {
        const { default: fsSync } = await import("fs");
        const { default: pathLib } = await import("path");
        const ext = pathLib.extname(filename) || ".bin";
        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
        const uploadsDir = pathLib.join(process.cwd(), "uploads", "documents");
        fsSync.mkdirSync(uploadsDir, { recursive: true });
        fsSync.writeFileSync(pathLib.join(uploadsDir, uniqueName), buffer);
        fileUrl = `/api/uploads/documents/${uniqueName}`;
      }

      res.json({ success: true, url: fileUrl, filename, size: buffer.length });
    } catch (error: any) {
      req.log?.error({ err: error }, "Error uploading registration document");
      res.status(500).json({ message: "Something went wrong saving the file. Please try again." });
    }
  });

  // File upload endpoint for registration documents (used during registration and service addition)
  // Document upload — accepts base64-encoded JSON so it travels through the
  // same credentials/CORS path as every other API call (no FormData/multipart).
  app.post("/api/upload/document", isLoggedIn, async (req: any, res: any) => {
    try {
      const { base64, filename, mimeType } = req.body as {
        base64?: string;
        filename?: string;
        mimeType?: string;
      };

      if (!base64 || !filename) {
        return res.status(400).json({ message: "No file data received. Please select a file and try again." });
      }

      // Validate size server-side (base64 is ~4/3× larger, so decode first)
      const buffer = Buffer.from(base64, "base64");
      const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
      if (buffer.length > MAX_BYTES) {
        const mb = (buffer.length / (1024 * 1024)).toFixed(1);
        return res.status(400).json({ message: `File is too large (${mb} MB). Maximum allowed size is 5 MB.` });
      }

      let fileUrl: string | null = null;

      if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        try {
          fileUrl = await supabaseUpload(buffer, filename, "documents", mimeType || "application/octet-stream");
        } catch (supabaseErr) {
          console.error("Supabase document upload failed:", supabaseErr);
          return res.status(503).json({ message: "File storage is temporarily unavailable. Please try again later." });
        }
      }
      if (!fileUrl) {
        if (process.env.NODE_ENV === "production") {
          return res.status(503).json({ message: "File storage is temporarily unavailable. Please try again later." });
        }

        // Local disk fallback — served at /api/uploads/documents/
        const { default: fsSync } = await import("fs");
        const { default: pathLib } = await import("path");
        const ext = pathLib.extname(filename) || ".bin";
        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
        const uploadsDir = pathLib.join(process.cwd(), "uploads", "documents");
        fsSync.mkdirSync(uploadsDir, { recursive: true });
        fsSync.writeFileSync(pathLib.join(uploadsDir, uniqueName), buffer);
        fileUrl = `/api/uploads/documents/${uniqueName}`;
      }

      res.json({ success: true, url: fileUrl, filename, size: buffer.length });
    } catch (error: any) {
      req.log?.error({ err: error }, "Error uploading document");
      res.status(500).json({ message: "Something went wrong saving the file. Please try again." });
    }
  });

  // ===== Admin User Registration Approvals =====
  
  // Get all users pending approval
  app.get("/api/admin/pending-registrations", isAdmin, async (req, res) => {
    try {
      const pendingUsers = await storage.getPendingRegistrations();
      res.json(pendingUsers.map(sanitizeUserForClient));
    } catch (error) {
      console.error("Error fetching pending registrations:", error);
      res.status(500).json({ message: "Failed to fetch pending registrations" });
    }
  });

  // Approve or reject a user registration
  app.patch("/api/admin/users/:id/approval", isAdmin, async (req, res) => {
    try {
      const { status, notes } = req.body as { status: "approved" | "rejected"; notes?: string };
      const user = await storage.updateUserApproval(req.params.id, status, notes);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(sanitizeUserForClient(user));
    } catch (error) {
      console.error("Error updating user approval:", error);
      res.status(500).json({ message: "Failed to update user approval" });
    }
  });

  // ===== Admin Service Registration Approvals =====
  
  // Get all pending service registrations (labs, consultants, provider-tests, provider-modalities)
  app.get("/api/admin/pending-services", isAdmin, async (req, res) => {
    try {
      const pendingLabs = await storage.getPendingLabs();
      const pendingConsultants = await storage.getPendingConsultants();
      const pendingLabTests = await storage.getPendingProviderLabTests();
      const pendingModalities = await storage.getPendingProviderModalities();
      const pendingEmergencyTeams = await storage.getPendingEmergencyTeams();
      
      const providers = await storage.getProviders();
      const labTests = await storage.getLabTests();
      const modalities = await storage.getRadiologyModalities();
      
      res.json({
        labs: pendingLabs.map(l => ({ ...l, provider: providers.find(p => p.id === l.providerId) })),
        consultants: pendingConsultants.map(c => ({ ...c, provider: providers.find(p => p.id === c.providerId) })),
        labTests: pendingLabTests.map(pt => ({
          ...pt,
          provider: providers.find(p => p.id === pt.providerId),
          labTest: labTests.find(t => t.id === pt.labTestId),
        })),
        modalities: pendingModalities.map(pm => ({
          ...pm,
          provider: providers.find(p => p.id === pm.providerId),
          modality: modalities.find(m => m.id === pm.modalityId),
        })),
        emergencyTeams: pendingEmergencyTeams.map(et => ({ ...et, provider: providers.find(p => p.id === et.providerId) })),
      });
    } catch (error) {
      console.error("Error fetching pending services:", error);
      res.status(500).json({ message: "Failed to fetch pending services" });
    }
  });

  // Approve or reject a lab registration
  app.patch("/api/admin/labs/:id/approval", isAdmin, async (req, res) => {
    try {
      const { status } = req.body as { status: "approved" | "rejected" };
      const lab = await storage.updateLabApproval(req.params.id, status);
      if (!lab) return res.status(404).json({ message: "Lab not found" });
      res.json(lab);
    } catch (error) {
      res.status(500).json({ message: "Failed to update lab approval" });
    }
  });

  // Approve or reject a consultant registration
  app.patch("/api/admin/consultants/:id/approval", isAdmin, async (req, res) => {
    try {
      const { status } = req.body as { status: "approved" | "rejected" };
      const consultant = await storage.updateConsultantApproval(req.params.id, status);
      if (!consultant) return res.status(404).json({ message: "Consultant not found" });
      res.json(consultant);
    } catch (error) {
      res.status(500).json({ message: "Failed to update consultant approval" });
    }
  });

  // Approve or reject a provider lab test registration
  app.patch("/api/admin/provider-lab-tests/:id/approval", isAdmin, async (req, res) => {
    try {
      const { status } = req.body as { status: "approved" | "rejected" };
      const plt = await storage.updateProviderLabTestApproval(req.params.id, status);
      if (!plt) return res.status(404).json({ message: "Provider lab test not found" });
      res.json(plt);
    } catch (error) {
      res.status(500).json({ message: "Failed to update provider lab test approval" });
    }
  });

  // Approve or reject an emergency team registration
  app.patch("/api/admin/emergency-teams/:id/approval", isAdmin, async (req: any, res) => {
    try {
      const { status } = req.body;
      if (!["approved", "rejected"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      const updated = await storage.updateEmergencyTeamApproval(req.params.id, status);
      if (!updated) return res.status(404).json({ message: "Emergency team not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update emergency team approval" });
    }
  });

  // Approve or reject a provider modality registration
  app.patch("/api/admin/provider-modalities/:id/approval", isAdmin, async (req, res) => {
    try {
      const { status } = req.body as { status: "approved" | "rejected" };
      const pm = await storage.updateProviderModalityApproval(req.params.id, status);
      if (!pm) return res.status(404).json({ message: "Provider modality not found" });
      res.json(pm);
    } catch (error) {
      res.status(500).json({ message: "Failed to update provider modality approval" });
    }
  });

  // Platform settings - get default margin
  app.get("/api/settings/margin", isAuthenticated, async (req, res) => {
    try {
      const setting = await storage.getPlatformSetting("default_margin_percent");
      res.json({ marginPercent: setting?.settingValue || "15" });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch margin setting" });
    }
  });

  // Admin - Update default margin
  app.put("/api/admin/settings/margin", isAdmin, async (req: any, res) => {
    try {
      const { marginPercent } = req.body;
      if (isNaN(parseFloat(marginPercent)) || parseFloat(marginPercent) < 0) {
        return res.status(400).json({ message: "Invalid margin percentage" });
      }
      const setting = await storage.upsertPlatformSetting("default_margin_percent", marginPercent.toString());
      await storage.createAuditLog({
        userId: req.user.id,
        action: "update_margin",
        entityType: "setting",
        entityId: "default_margin_percent",
        details: JSON.stringify({ newValue: marginPercent }),
      });
      res.json(setting);
    } catch (error) {
      res.status(500).json({ message: "Failed to update margin" });
    }
  });

  // Admin - Record payment for a booking
  app.post("/api/admin/bookings/:id/payment", isAdmin, async (req: any, res) => {
    try {
      const { amount, method } = req.body;
      if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
        return res.status(400).json({ message: "Invalid payment amount" });
      }
      const booking = await storage.recordPayment(req.params.id, parseFloat(amount), method || "manual");
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }
      await storage.createAuditLog({
        userId: req.user.id,
        action: "record_payment",
        entityType: "booking",
        entityId: req.params.id,
        details: JSON.stringify({ amount, method: method || "manual" }),
      });
      res.json(booking);
    } catch (error) {
      res.status(500).json({ message: "Failed to record payment" });
    }
  });

  // Razorpay - Create order for a single booking
  app.post("/api/payments/create-order", isAuthenticated, async (req: any, res) => {
    try {
      const Razorpay = (await import("razorpay")).default;
      const razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID!,
        key_secret: process.env.RAZORPAY_KEY_SECRET!,
      });

      const { bookingId } = req.body;
      if (!bookingId) {
        return res.status(400).json({ message: "Booking ID is required" });
      }

      const booking = await storage.getBookingById(bookingId);
      if (!booking || booking.userId !== req.user.id) {
        return res.status(404).json({ message: "Booking not found" });
      }

      const dueAmount = parseFloat(booking.amount || "0") - parseFloat(booking.amountPaid || "0");
      if (dueAmount <= 0) {
        return res.status(400).json({ message: "No outstanding amount" });
      }

      const amountInPaise = Math.round(dueAmount * 100);

      const order = await razorpay.orders.create({
        amount: amountInPaise,
        currency: "INR",
        receipt: bookingId,
        notes: { bookingId, userId: req.user.id },
      });

      await storage.updateBooking(bookingId, { razorpayOrderId: order.id } as any);

      res.json({ orderId: order.id, amount: amountInPaise, currency: "INR", keyId: process.env.RAZORPAY_KEY_ID });
    } catch (error) {
      console.error("Error creating Razorpay order:", error);
      res.status(500).json({ message: "Failed to create payment order" });
    }
  });

  // Razorpay - Create order for multiple bookings (billing page pay selected)
  app.post("/api/payments/create-bulk-order", isAuthenticated, async (req: any, res) => {
    try {
      const Razorpay = (await import("razorpay")).default;
      const razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID!,
        key_secret: process.env.RAZORPAY_KEY_SECRET!,
      });

      const { bookingIds } = req.body;
      if (!bookingIds || !Array.isArray(bookingIds) || bookingIds.length === 0) {
        return res.status(400).json({ message: "No bookings selected" });
      }

      let totalAmount = 0;
      for (const id of bookingIds) {
        const booking = await storage.getBookingById(id);
        if (!booking || booking.userId !== req.user.id) continue;
        const due = parseFloat(booking.amount || "0") - parseFloat(booking.amountPaid || "0");
        if (due > 0) totalAmount += due;
      }

      if (totalAmount <= 0) {
        return res.status(400).json({ message: "No outstanding amount" });
      }

      const amountInPaise = Math.round(totalAmount * 100);
      const order = await razorpay.orders.create({
        amount: amountInPaise,
        currency: "INR",
        receipt: `bulk_${Date.now()}`,
        notes: { bookingIds: JSON.stringify(bookingIds), userId: req.user.id },
      });

      res.json({ orderId: order.id, amount: amountInPaise, currency: "INR", keyId: process.env.RAZORPAY_KEY_ID, bookingIds });
    } catch (error) {
      console.error("Error creating bulk Razorpay order:", error);
      res.status(500).json({ message: "Failed to create bulk payment order" });
    }
  });

  // Razorpay - Verify payment and mark booking(s) as paid
  app.post("/api/payments/verify", isAuthenticated, async (req: any, res) => {
    try {
      const crypto = await import("crypto");
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature, bookingId, bookingIds } = req.body;

      const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest("hex");

      if (expectedSignature !== razorpay_signature) {
        return res.status(400).json({ message: "Invalid payment signature" });
      }

      if (bookingId) {
        const booking = await storage.getBookingById(bookingId);
        if (booking) {
          const due = parseFloat(booking.amount || "0") - parseFloat(booking.amountPaid || "0");
          await storage.recordPayment(bookingId, due, "razorpay");
          await storage.updateBooking(bookingId, { razorpayPaymentId: razorpay_payment_id } as any);
        }
      }

      if (bookingIds && Array.isArray(bookingIds)) {
        for (const id of bookingIds) {
          const booking = await storage.getBookingById(id);
          if (booking && booking.userId === req.user.id) {
            const due = parseFloat(booking.amount || "0") - parseFloat(booking.amountPaid || "0");
            if (due > 0) {
              await storage.recordPayment(id, due, "razorpay");
              await storage.updateBooking(id, { razorpayPaymentId: razorpay_payment_id } as any);
            }
          }
        }
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error verifying payment:", error);
      res.status(500).json({ message: "Payment verification failed" });
    }
  });

  // Admin - Extend due date
  app.patch("/api/admin/bookings/:id/due-date", isAdmin, async (req: any, res) => {
    try {
      const { dueDate } = req.body;
      const booking = await storage.updateBooking(req.params.id, { dueDate: new Date(dueDate) });
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }
      await storage.createAuditLog({
        userId: req.user.id,
        action: "extend_due_date",
        entityType: "booking",
        entityId: req.params.id,
        details: JSON.stringify({ newDueDate: dueDate }),
      });
      res.json(booking);
    } catch (error) {
      res.status(500).json({ message: "Failed to extend due date" });
    }
  });

  // Admin - Disable/Enable user account
  app.patch("/api/admin/users/:id/account-status", isAdmin, async (req: any, res) => {
    try {
      const { disabled, reason } = req.body;
      const user = await storage.getUserById(req.params.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const updated = await storage.updateUser(req.params.id, { approvalStatus: disabled ? "rejected" : "approved" });
      await storage.createAuditLog({
        userId: req.user.id,
        action: disabled ? "disable_account" : "enable_account",
        entityType: "user",
        entityId: req.params.id,
        details: JSON.stringify({ reason }),
      });
      res.json(sanitizeUserForClient(updated));
    } catch (error) {
      res.status(500).json({ message: "Failed to update account status" });
    }
  });

  // Billing - Get bookings with billing info for current user
  app.get("/api/billing/my-invoices", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { startDate, endDate, status } = req.query;
      const start = startDate ? new Date(startDate as string) : new Date(0);
      const end = endDate ? new Date(endDate as string) : new Date();
      const filters: any = { userId };
      if (status) filters.paymentStatus = status as string;
      const invoices = await storage.getBookingsByDateRange(start, end, filters);
      res.json(invoices);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch invoices" });
    }
  });

  // Billing - Get provider earnings
  app.get("/api/billing/provider-earnings", isAuthenticated, isProvider, async (req: any, res) => {
    try {
      const provider = await storage.getProviderByUserId(req.user.id);
      if (!provider) {
        return res.status(404).json({ message: "Provider not found" });
      }
      const { startDate, endDate } = req.query;
      const start = startDate ? new Date(startDate as string) : new Date(0);
      const end = endDate ? new Date(endDate as string) : new Date();
      const bookings = await storage.getBookingsByDateRange(start, end, { providerId: provider.id });
      res.json(bookings);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch provider earnings" });
    }
  });

  // Admin - Get all invoices with filters
  app.get("/api/admin/billing/invoices", isAdmin, async (req: any, res) => {
    try {
      const { startDate, endDate, status, userId, providerId } = req.query;
      const start = startDate ? new Date(startDate as string) : new Date(0);
      const end = endDate ? new Date(endDate as string) : new Date();
      const filters: any = {};
      if (status) filters.paymentStatus = status as string;
      if (userId) filters.userId = userId as string;
      if (providerId) filters.providerId = providerId as string;
      const invoices = await storage.getBookingsByDateRange(start, end, filters);
      res.json(invoices);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch invoices" });
    }
  });

  // Admin - Get overdue bookings
  app.get("/api/admin/billing/overdue", isAdmin, async (req, res) => {
    try {
      const overdue = await storage.getOverdueBookings();
      res.json(overdue);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch overdue bookings" });
    }
  });

  // Audit log
  app.get("/api/admin/audit-log", isAdmin, async (req: any, res) => {
    try {
      const { entityType, entityId } = req.query;
      const logs = await storage.getAuditLogs({
        entityType: entityType as string,
        entityId: entityId as string,
      });
      res.json(logs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch audit logs" });
    }
  });

  // Admin analytics - revenue summary
  app.get("/api/admin/analytics/revenue", isAdmin, async (req: any, res) => {
    try {
      const { startDate, endDate } = req.query;
      const start = startDate ? new Date(startDate as string) : new Date(0);
      const end = endDate ? new Date(endDate as string) : new Date();
      const allBookings = await storage.getBookingsByDateRange(start, end, {});
      
      const grossRevenue = allBookings.reduce((sum, b) => sum + parseFloat(b.amount || "0"), 0);
      const providerPayout = allBookings.reduce((sum, b) => sum + parseFloat(b.basePrice || b.amount || "0"), 0);
      const netRevenue = allBookings.reduce((sum, b) => sum + parseFloat(b.marginAmount || "0"), 0);
      const totalPaid = allBookings.reduce((sum, b) => sum + parseFloat(b.amountPaid || "0"), 0);
      const totalOutstanding = grossRevenue - totalPaid;
      
      const byServiceType: any = {};
      for (const b of allBookings) {
        if (!byServiceType[b.bookingType]) {
          byServiceType[b.bookingType] = { count: 0, revenue: 0, margin: 0 };
        }
        byServiceType[b.bookingType].count++;
        byServiceType[b.bookingType].revenue += parseFloat(b.amount || "0");
        byServiceType[b.bookingType].margin += parseFloat(b.marginAmount || "0");
      }
      
      const byProvider: any = {};
      for (const b of allBookings) {
        const key = b.providerId || "unassigned";
        if (!byProvider[key]) {
          byProvider[key] = { name: b.providerName || "Unassigned", count: 0, revenue: 0, payout: 0 };
        }
        byProvider[key].count++;
        byProvider[key].revenue += parseFloat(b.amount || "0");
        byProvider[key].payout += parseFloat(b.basePrice || b.amount || "0");
      }
      
      const bySeeker: any = {};
      for (const b of allBookings) {
        if (!bySeeker[b.userId]) {
          bySeeker[b.userId] = { count: 0, revenue: 0, paid: 0, outstanding: 0 };
        }
        bySeeker[b.userId].count++;
        bySeeker[b.userId].revenue += parseFloat(b.amount || "0");
        bySeeker[b.userId].paid += parseFloat(b.amountPaid || "0");
        bySeeker[b.userId].outstanding += parseFloat(b.amount || "0") - parseFloat(b.amountPaid || "0");
      }
      
      const overdue = allBookings.filter(b => b.dueDate && new Date(b.dueDate) < new Date() && (b.paymentStatus === "pending" || b.paymentStatus === "partial"));
      
      res.json({
        summary: { grossRevenue, providerPayout, netRevenue, totalPaid, totalOutstanding },
        byServiceType,
        byProvider: Object.values(byProvider),
        bySeeker: Object.values(bySeeker),
        overdueCount: overdue.length,
        totalBookings: allBookings.length,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  setInterval(async () => {
    try {
      const overdue = await storage.getOverdueBookings();
      let markedOverdue = 0;
      const usersToDisable = new Set<string>();

      for (const booking of overdue) {
        if (booking.paymentStatus !== "overdue") {
          await storage.updateBooking(booking.id, { paymentStatus: "overdue" as any });
          markedOverdue++;
        }
        if (booking.dueDate) {
          const daysPastDue = Math.floor((Date.now() - new Date(booking.dueDate).getTime()) / (1000 * 60 * 60 * 24));
          if (daysPastDue >= 30) {
            usersToDisable.add(booking.userId);
          }
        }
      }

      for (const userId of Array.from(usersToDisable)) {
        const user = await storage.getUserById(userId);
        if (user && user.approvalStatus !== "rejected") {
          await storage.updateUser(userId, { approvalStatus: "rejected" });
          await storage.createAuditLog({
            userId: "system",
            action: "auto_disable_account",
            entityType: "user",
            entityId: userId,
            details: JSON.stringify({ reason: "Overdue payment exceeding 30 days" }),
          });
          console.log(`[Billing] Auto-disabled account for user ${userId} due to overdue payment > 30 days`);
        }
      }

      if (markedOverdue > 0 || usersToDisable.size > 0) {
        console.log(`[Billing] Marked ${markedOverdue} bookings overdue, disabled ${usersToDisable.size} accounts`);
      }
    } catch (error) {
      console.error("[Billing] Error checking overdue bookings:", error);
    }
  }, 60 * 60 * 1000);

  // ─── Push Subscription Routes ────────────────────────────────────────
  app.get("/api/push/vapid-public-key", (req, res) => {
    const key = getVapidPublicKey();
    if (!key) return res.status(503).json({ error: "Push notifications not configured" });
    res.json({ publicKey: key });
  });

  app.post("/api/push/subscribe", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const { endpoint, p256dh, auth } = req.body;
      if (!endpoint || !p256dh || !auth) return res.status(400).json({ error: "Missing subscription fields" });
      await storage.savePushSubscription(userId, endpoint, p256dh, auth);
      res.json({ success: true });
    } catch (error) {
      console.error("[Push] Subscribe error:", error);
      res.status(500).json({ error: "Failed to save subscription" });
    }
  });

  app.delete("/api/push/unsubscribe", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const { endpoint } = req.body;
      if (!endpoint) return res.status(400).json({ error: "Missing endpoint" });
      await storage.deletePushSubscription(userId, endpoint);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to remove subscription" });
    }
  });

  // ─── Mobile Push Token Registration ──────────────────────────────────────
  app.post("/api/push/mobile-token", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const { token, platform, tokenType = "EXPO", deviceId } = req.body;
      if (!token || !platform) return res.status(400).json({ error: "Missing token or platform" });
      if (!["EXPO", "APNS_VOIP", "FCM"].includes(tokenType)) {
        return res.status(400).json({ error: "Invalid mobile push token type" });
      }
      if (deviceId != null && (typeof deviceId !== "string" || deviceId.length > 120 || deviceId.length < 8)) {
        return res.status(400).json({ error: "Invalid device ID" });
      }
      const pool = getPool();
      await pool.query(
        `INSERT INTO mobile_push_tokens (user_id, token, platform, token_type, device_id, updated_at)
         VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT (token) DO UPDATE SET user_id = $1, platform = $3, token_type = $4,
           device_id = $5, updated_at = now()`,
        [userId, token, platform, tokenType, deviceId || null]
      );
      res.json({ success: true });
    } catch (error) {
      console.error("[MobilePush] Register error:", error);
      res.status(500).json({ error: "Failed to register token" });
    }
  });

  app.delete("/api/push/mobile-token", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const { token } = req.body;
      if (!token) return res.status(400).json({ error: "Missing token" });
      const pool = getPool();
      await pool.query(`DELETE FROM mobile_push_tokens WHERE token = $1 AND user_id = $2`, [token, userId]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to remove token" });
    }
  });

  // ─── Incoming call poll endpoint for mobile app ───────────────────────────
  app.get("/api/call/incoming", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const sessions = await storage.getActiveCallSessionsForRecipient(userId);
      const session = sessions.find(s => s.status === "ringing");
      if (!session) return res.json(null);
      res.json({
        bookingId: session.bookingId,
        sessionGeneration: session.sessionGeneration,
        callerName: session.callerName,
        callerRole: session.callerRole,
        callType: session.callType,
        videoRoomUrl: session.videoRoomUrl,
        mediaProvider: callMediaProvider(session.videoRoomUrl),
        serviceName: session.serviceName,
        subtitle: session.subtitle,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch incoming call" });
    }
  });

  // ─── Call Session State (DB-backed — shared across all autoscale instances) ──
  const sseClients = new Map<string, Set<any>>(); // key = userId → set of res objects

  function broadcastCallEvent(userId: string, event: object) {
    const clients = sseClients.get(userId);
    if (!clients || clients.size === 0) return;
    const data = `data: ${JSON.stringify(event)}\n\n`;
    Array.from(clients).forEach(client => {
      try { client.write(data); } catch {}
    });
  }

  function broadcastTerminalCallEvent(
    session: { bookingId: string; sessionGeneration: string; callerId: string; recipientUserId: string },
    event: object,
    pushType: Exclude<PushPayload["type"], "incoming_call" | "callback_device_reminder">,
    log: any,
  ) {
    const userIds = new Set([session.callerId, session.recipientUserId]);
    for (const userId of userIds) {
      broadcastCallEvent(userId, event);
      const payload: PushPayload = {
        type: pushType,
        bookingId: session.bookingId,
        sessionGeneration: session.sessionGeneration,
      };
      // Acceptance promotes Telecom's incoming call into an ongoing call; only
      // send this control push for a call that has actually ended.
      if (pushType !== "call_accepted") {
        void notifyMobileCallEnded(userId, session)
          .catch(error => log.warn(
            { err: error, bookingId: session.bookingId, sessionGeneration: session.sessionGeneration, userId },
            "Could not deliver native call cleanup push",
          ));
      }
      void storage.getPushSubscriptionsByUserId(userId)
        .then(subscriptions => Promise.all(subscriptions.map(subscription => sendPushNotification(subscription, payload))))
        .catch(error => log.warn({ err: error, bookingId: session.bookingId, sessionGeneration: session.sessionGeneration, userId }, "Could not deliver terminal call push"));
    }
  }

  function requireCallSessionGeneration(
    req: any,
    res: any,
    session: { sessionGeneration: string },
  ): boolean {
    const requestedGeneration = req.body?.sessionGeneration;
    if (typeof requestedGeneration !== "string" || !requestedGeneration.trim()) {
      res.status(400).json({ error: "Missing or invalid sessionGeneration" });
      return false;
    }
    if (requestedGeneration !== session.sessionGeneration) {
      res.status(409).json({ error: "Call session has changed" });
      return false;
    }
    return true;
  }

  function broadcastCaseFileUpdate(booking: any, event: object) {
    broadcastCallEvent(booking.userId, event);
    if (booking.providerId) {
      storage.getProviderById(booking.providerId).then((provider) => {
        if (provider?.userId && provider.userId !== booking.userId) broadcastCallEvent(provider.userId, event);
      }).catch(() => {});
    }
  }

  // SSE endpoint — clients connect here to receive real-time call events
  app.get("/api/call-events", isAuthenticated, (req: any, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).end();

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    // Send heartbeat every 25s to keep connection alive
    const heartbeat = setInterval(() => {
      try { res.write(": heartbeat\n\n"); } catch { clearInterval(heartbeat); }
    }, 25000);

    if (!sseClients.has(userId)) sseClients.set(userId, new Set());
    sseClients.get(userId)!.add(res);

    // Replay any active ringing session for this user so they see the
    // incoming call overlay when opening the app directly (e.g. after
    // hearing a Twilio voice alert) rather than via push notification.
    storage.getActiveCallSessionsForRecipient(userId).then(activeSessions => {
      const s = activeSessions.find(session => session.status === "ringing");
      if (s) {
        try {
          res.write(`data: ${JSON.stringify({
            type: "incoming_call",
            bookingId: s.bookingId,
            sessionGeneration: s.sessionGeneration,
            callerName: s.callerName,
            callerRole: s.callerRole,
            callType: s.callType,
            videoRoomUrl: s.videoRoomUrl,
            mediaProvider: callMediaProvider(s.videoRoomUrl),
            serviceName: s.serviceName,
            subtitle: s.subtitle,
          })}\n\n`);
        } catch {}
      }
    }).catch(() => {});

    req.on("close", () => {
      clearInterval(heartbeat);
      sseClients.get(userId)?.delete(res);
    });
  });

  // Initiate a call ring — called by Person A when they click Join Call
  app.post("/api/call/ring/:bookingId", isAuthenticated, async (req: any, res) => {
    try {
      const callerId = req.user?.id;
      if (!callerId) return res.status(401).json({ error: "Not authenticated" });

      const { bookingId } = req.params;
      const callType: "voice" | "video" = req.body?.callType === "voice" ? "voice" : "video";
      const booking = await storage.getBookingById(bookingId);
      if (!booking) return res.status(404).json({ error: "Booking not found" });

      // Check caller is part of this booking
      const provider = await storage.getProviderById(booking.providerId!);
      const isSeeker = booking.userId === callerId;
      const isProviderUser = provider?.userId === callerId;
      if (!isSeeker && !isProviderUser) return res.status(403).json({ error: "Not part of this booking" });

      const callerRole: "seeker" | "provider" = isSeeker ? "seeker" : "provider";

      const lifecycle = resolveConsultationLifecycle(booking);
      if (!lifecycle.scheduleAvailable || lifecycle.status !== "ongoing") {
        const error = !lifecycle.scheduleAvailable
          ? "The consultation schedule does not contain a usable start time"
          : lifecycle.status === "paused"
            ? "Calls are paused for this consultation"
            : lifecycle.status === "completed"
              ? "The consultation call window has expired"
              : lifecycle.status === "cancelled"
                ? "This consultation has been cancelled"
                : "The consultation has not started";
        return res.status(403).json({
          error,
          status: lifecycle.status,
          windowStart: lifecycle.startsAt,
          windowEnd: lifecycle.expiresAt,
        });
      }

      // Fast-path conflict response; the guarded upsert below remains the
      // authoritative cross-instance check for concurrent ring requests.
      const existingSession = await storage.getCallSession(bookingId);
      if (existingSession && (existingSession.status === "ringing" || existingSession.status === "accepted")) {
        return res.status(409).json({
          error: "A call session is already active",
          status: existingSession.status,
          mediaProvider: callMediaProvider(existingSession.videoRoomUrl),
        });
      }

      // Get caller display name
      const callerUser = await storage.getUserById(callerId);
      const callerName =
        `${callerUser?.firstName || ""} ${callerUser?.lastName || ""}`.trim() ||
        callerUser?.email ||
        "Unknown";

      // The recipient always sees the other side: seekers see the consultant,
      // while doctors see the seeker's hospital and the booked patient.
      let subtitle = callerName;
      if (callerRole === "provider") {
        const consultant = await storage.getConsultantById(booking.serviceId);
        if (consultant) {
          subtitle = consultant.specialization
            ? `${consultant.name} (${consultant.specialization})`
            : consultant.name;
        } else {
          subtitle = booking.serviceName || callerName;
        }
      } else {
        subtitle = booking.patientName?.trim() || "Patient";
      }
      const displayCallerName = callerRole === "seeker"
        ? callerUser?.hospitalName?.trim() || callerName
        : callerName;

      // Find recipient userId
      const recipientUserId = isSeeker ? provider?.userId : booking.userId;
      if (!recipientUserId) return res.status(400).json({ error: "Cannot find recipient" });

      // Persist call session to DB — shared across all autoscale instances
      const SESSION_TTL_MS = 300_000; // 5 minutes
      const sessionGeneration = randomUUID();
      const mediaProvider: "daily" | "stream" = process.env.CALL_MEDIA_PROVIDER === "daily" ? "daily" : "stream";
      let videoRoomUrl = booking.videoRoomId || "";
      if (mediaProvider === "stream") {
        const streamApiKey = process.env.STREAM_VIDEO_API_KEY;
        const streamApiSecret = process.env.STREAM_VIDEO_API_SECRET;
        if (!streamApiKey || !streamApiSecret) {
          req.log.error("Stream Video credentials are not configured");
          return res.status(503).json({ error: "Stream Video is not configured" });
        }
        try {
          const streamClient = new StreamClient(streamApiKey, streamApiSecret);
          await streamClient.video.call("default", sessionGeneration).getOrCreate({
            data: {
              created_by_id: callerId,
              members: [{ user_id: callerId }, { user_id: recipientUserId }],
            },
          });
          videoRoomUrl = `stream://default/${sessionGeneration}`;
        } catch (error) {
          req.log.error({ err: error, bookingId, sessionGeneration }, "Failed to create Stream Video call");
          return res.status(502).json({ error: "Could not create Stream Video call" });
        }
      } else {
        // Stream booking links are not media rooms. Only the explicit rollback
        // provisions a Daily room for a booking originally created on Stream.
        const roomValid = videoRoomUrl.startsWith("https://") && await isDailyRoomValid(videoRoomUrl);
        if (!roomValid) {
          req.log.info({ bookingId }, "Daily room expired or missing; recreating");
          const roomName = `perfusion-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          const newRoom = await createDailyRoom(roomName);
          if (!newRoom) return res.status(500).json({ error: "Could not create video room" });
          videoRoomUrl = newRoom.url;
          await storage.updateBooking(bookingId, { videoRoomId: videoRoomUrl });
          req.log.info({ bookingId, videoRoomUrl }, "Created replacement Daily room");
        }
      }
      const createdSession = await storage.createCallSession({
        bookingId,
        sessionGeneration,
        callerId,
        callerName: displayCallerName,
        callerRole,
        recipientUserId,
        videoRoomUrl,
        callType,
        serviceName: booking.serviceName || "",
        subtitle,
        status: "ringing",
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      });
      if (!createdSession) {
        return res.status(409).json({ error: "A call session is already active" });
      }

      // Auto-timeout only the generation created by this request, and only
      // after its persisted expiry time has elapsed.
      setTimeout(async () => {
        try {
          const expired = await storage.expireRingingCallSession(bookingId, sessionGeneration);
          if (expired) {
            endStreamMediaSession(expired).catch((error) =>
              req.log.warn({ err: error, bookingId }, "Could not close timed-out Stream call"));
            if (expired.twilioCallSid) cancelVoiceCall(expired.twilioCallSid).catch(() => {});
            broadcastTerminalCallEvent(
              expired,
              { type: "call_timeout", bookingId, sessionGeneration, mediaProvider: callMediaProvider(expired.videoRoomUrl) },
              "call_timeout",
              req.log,
            );
            setTimeout(() => storage.deleteCallSession(bookingId, sessionGeneration, ["timeout"]), 5000);
          }
        } catch {}
      }, SESSION_TTL_MS + 1000);

      // Notify recipient via SSE if they're online
      broadcastCallEvent(recipientUserId, {
        type: "incoming_call",
        bookingId,
        sessionGeneration,
        callerName: displayCallerName,
        callerRole,
        videoRoomUrl,
        mediaProvider,
        serviceName: booking.serviceName,
        subtitle,
        callType,
      });

      // Send push notification to recipient (even if browser closed)
      const subscriptions = await storage.getPushSubscriptionsByUserId(recipientUserId);
      req.log.info({ recipientUserId, subscriptions: subscriptions.length }, "Loaded recipient push subscriptions");
      if (subscriptions.length === 0) {
        req.log.info({ recipientUserId }, "Recipient has no push subscriptions");
      }
      const recipientRole: "seeker" | "provider" = callerRole === "seeker" ? "provider" : "seeker";
      const payload: PushPayload = {
        type: "incoming_call",
        bookingId,
        sessionGeneration,
        callerName: displayCallerName,
        callerRole,
        recipientRole,
        videoRoomUrl,
        mediaProvider,
        subtitle,
        title: callerRole === "seeker" ? displayCallerName : "Perfusion",
        body: subtitle,
      };
      for (const sub of subscriptions) {
        sendPushNotification(sub, payload).then((result) => {
          if (result.expired) {
            // Remove expired/invalid subscriptions so future deliveries aren't degraded
            storage.deletePushSubscription(recipientUserId, sub.endpoint).catch(() => {});
          }
        }).catch(() => {});
      }

      notifyMobileIncomingCall(recipientUserId, {
        bookingId,
        sessionGeneration,
        callerId,
        callerName: displayCallerName,
        callerRole,
        callType,
        videoRoomUrl,
        mediaProvider,
        serviceName: booking.serviceName || "",
        subtitle,
      }).catch((error) => req.log.error({ err: error }, "Mobile incoming-call push failed"));

      res.json({ success: true, session: { bookingId, sessionGeneration, status: "ringing", callType, videoRoomUrl, mediaProvider } });
    } catch (error) {
      req.log.error({ err: error }, "Call ring error");
      res.status(500).json({ error: "Failed to initiate ring" });
    }
  });

  // Accept a call — only the intended recipient may accept
  app.post("/api/call/accept/:bookingId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const { bookingId } = req.params;
      const session = await storage.getCallSession(bookingId);
      if (!session) return res.status(404).json({ error: "No active call session" });
      if (!requireCallSessionGeneration(req, res, session)) return;

      // Verify the acceptor is NOT the caller and IS a participant in the booking
      const booking = await storage.getBookingById(bookingId);
      if (!booking) return res.status(404).json({ error: "Booking not found" });
      const provider = booking.providerId ? await storage.getProviderById(booking.providerId) : null;
      const isSeeker = booking.userId === userId;
      const isProviderUser = provider?.userId === userId;
      if (!isSeeker && !isProviderUser) return res.status(403).json({ error: "Not part of this booking" });
      if (session.callerId === userId) return res.status(403).json({ error: "Caller cannot accept their own call" });

      if (booking.bookingType === "consultation") {
        const lifecycle = resolveConsultationLifecycle(booking);
        if (!lifecycle.scheduleAvailable || lifecycle.status !== "ongoing") {
          return res.status(403).json({
            error: lifecycle.status === "paused"
              ? "Calls are paused for this consultation"
              : "This consultation is not currently available for calls",
            status: lifecycle.status,
          });
        }
      }

      if (session.status !== "ringing") {
        return res.status(409).json({ error: "Call is no longer ringing", status: session.status });
      }

      // Ring sessions expire after five minutes; an answered call must remain
      // visible to both participants for the duration of the consultation.
      const acceptedSession = await storage.transitionCallSession(bookingId, session.sessionGeneration, ["ringing"], {
        status: "accepted",
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      });
      if (!acceptedSession) {
        return res.status(409).json({ error: "Call is no longer ringing or has changed" });
      }

      // Cancel the Twilio voice call if it's still ringing
      if (session.twilioCallSid) {
        cancelVoiceCall(session.twilioCallSid).catch(() => {});
      }

      // Notify both participants so any duplicate browser notification closes.
      broadcastTerminalCallEvent(session, {
        type: "call_accepted",
        bookingId,
        sessionGeneration: acceptedSession.sessionGeneration,
        callType: session.callType,
        videoRoomUrl: session.videoRoomUrl,
        mediaProvider: callMediaProvider(session.videoRoomUrl),
      }, "call_accepted", req.log);

      // Keep the accepted session alive for 2 hours so the ring-guard can detect
      // it on page refresh — the 10 s window was too short and caused ghost re-rings.
      setTimeout(async () => {
        try {
          const mediaCleanupCompleted = await endStreamMediaSessionWithRetries(
            acceptedSession,
            req.log,
            { bookingId, sessionGeneration: acceptedSession.sessionGeneration, reason: "accepted_call_expired" },
          );
          const endedSession = await storage.endExpiredAcceptedCallSession(bookingId, acceptedSession.sessionGeneration);
          if (!endedSession) return;
          const endedEvent = {
            type: "call_ended",
            bookingId,
            sessionGeneration: acceptedSession.sessionGeneration,
            mediaProvider: callMediaProvider(acceptedSession.videoRoomUrl),
            mediaCleanupCompleted,
          };
          broadcastTerminalCallEvent(acceptedSession, endedEvent, "call_ended", req.log);
          setTimeout(
            () => storage.deleteCallSession(bookingId, acceptedSession.sessionGeneration, ["ended"], true).catch(() => {}),
            5000,
          );
        } catch (error) {
          req.log.error({ err: error, bookingId, sessionGeneration: acceptedSession.sessionGeneration }, "Expired accepted call cleanup failed");
        }
      }, 2 * 60 * 60 * 1000 + 1000);

      res.json({
        success: true,
        videoRoomUrl: acceptedSession.videoRoomUrl,
        mediaProvider: callMediaProvider(acceptedSession.videoRoomUrl),
        callType: acceptedSession.callType,
        sessionGeneration: acceptedSession.sessionGeneration,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to accept call" });
    }
  });

  // Decline a call — only the intended recipient may decline
  app.post("/api/call/decline/:bookingId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const { bookingId } = req.params;
      const session = await storage.getCallSession(bookingId);
      if (!session) return res.status(404).json({ error: "No active call session" });
      if (!requireCallSessionGeneration(req, res, session)) return;

      // Verify the decliner is NOT the caller and IS a participant in the booking
      const booking = await storage.getBookingById(bookingId);
      if (!booking) return res.status(404).json({ error: "Booking not found" });
      const provider = booking.providerId ? await storage.getProviderById(booking.providerId) : null;
      const isSeeker = booking.userId === userId;
      const isProviderUser = provider?.userId === userId;
      if (!isSeeker && !isProviderUser) return res.status(403).json({ error: "Not part of this booking" });
      if (session.callerId === userId) return res.status(403).json({ error: "Caller should use cancel endpoint" });

      const declinedSession = await storage.transitionCallSession(bookingId, session.sessionGeneration, ["ringing"], { status: "declined" });
      if (!declinedSession) return res.status(409).json({ error: "Call is no longer ringing or has changed" });
      endStreamMediaSession(declinedSession).catch((error) =>
        req.log.warn({ err: error, bookingId }, "Could not close declined Stream call"));

      // Cancel the Twilio voice call if it's still ringing
      if (session.twilioCallSid) {
        cancelVoiceCall(session.twilioCallSid).catch(() => {});
      }

      broadcastTerminalCallEvent(session, {
        type: "call_declined",
        bookingId,
        sessionGeneration: session.sessionGeneration,
        mediaProvider: callMediaProvider(session.videoRoomUrl),
      }, "call_declined", req.log);

      setTimeout(() => storage.deleteCallSession(bookingId, session.sessionGeneration, ["declined"]), 5000);

      res.json({ success: true, mediaProvider: callMediaProvider(session.videoRoomUrl) });
    } catch (error) {
      res.status(500).json({ error: "Failed to decline call" });
    }
  });

  // Cancel a call (caller hangs up while ringing)
  app.post("/api/call/cancel/:bookingId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const { bookingId } = req.params;
      const session = await storage.getCallSession(bookingId);
      if (!session) return res.status(404).json({ error: "No active call session" });
      if (!requireCallSessionGeneration(req, res, session)) return;
      if (session.callerId !== userId) return res.status(403).json({ error: "Only the caller can cancel" });
      {
        const cancelledSession = await storage.transitionCallSession(bookingId, session.sessionGeneration, ["ringing"], { status: "declined" });
        if (!cancelledSession) return res.status(409).json({ error: "Call is no longer ringing or has changed" });
        endStreamMediaSession(cancelledSession).catch((error) =>
          req.log.warn({ err: error, bookingId }, "Could not close cancelled Stream call"));
        // Cancel the Twilio voice call if it's still ringing
        if (session.twilioCallSid) cancelVoiceCall(session.twilioCallSid).catch(() => {});
        broadcastTerminalCallEvent(session, {
          type: "call_cancelled",
          bookingId,
          sessionGeneration: session.sessionGeneration,
          mediaProvider: callMediaProvider(session.videoRoomUrl),
        }, "call_cancelled", req.log);
        setTimeout(() => storage.deleteCallSession(bookingId, session.sessionGeneration, ["declined"]), 5000);
      }
      res.json({ success: true, mediaProvider: callMediaProvider(session.videoRoomUrl) });
    } catch (error) {
      res.status(500).json({ error: "Failed to cancel call" });
    }
  });

  // End an accepted call, or stop a ringing call for either participant.
  app.post("/api/call/end/:bookingId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const { bookingId } = req.params;
      const session = await storage.getCallSession(bookingId);
      if (!session) return res.status(404).json({ error: "No active call session" });
      if (!requireCallSessionGeneration(req, res, session)) return;

      const booking = await storage.getBookingById(bookingId);
      if (!booking) return res.status(404).json({ error: "Booking not found" });
      const provider = booking.providerId ? await storage.getProviderById(booking.providerId) : null;
      const isSeeker = booking.userId === userId;
      const isProviderUser = provider?.userId === userId;
      if (!isSeeker && !isProviderUser) return res.status(403).json({ error: "Not part of this booking" });
      if (session.callerId !== userId && session.recipientUserId !== userId) {
        return res.status(403).json({ error: "Not a participant in this call" });
      }

      if (session.status === "ended") {
        const mediaCleanupCompleted = await endStreamMediaSessionWithRetries(
          session,
          req.log,
          { bookingId, sessionGeneration: session.sessionGeneration, reason: "repeated_hangup" },
        );
        return res.json({
          success: true,
          status: "ended",
          mediaProvider: callMediaProvider(session.videoRoomUrl),
          mediaCleanupCompleted,
        });
      }
      if (session.status !== "accepted" && session.status !== "ringing") {
        return res.status(409).json({ error: "Call is no longer active", status: session.status });
      }

      // Try provider teardown with a bounded retry policy. Even when the
      // provider is unavailable, the server lifecycle and both clients must
      // transition out of the active call state.
      const mediaCleanupCompleted = await endStreamMediaSessionWithRetries(
        session,
        req.log,
        { bookingId, sessionGeneration: session.sessionGeneration, reason: "participant_hangup" },
      );
      const endedSession = await storage.transitionCallSession(bookingId, session.sessionGeneration, ["accepted", "ringing"], { status: "ended" });
      if (!endedSession) return res.status(409).json({ error: "Call is no longer active or has changed" });
      if (session.status === "ringing" && session.twilioCallSid) {
        cancelVoiceCall(session.twilioCallSid).catch(() => {});
      }

      const endedEvent = {
        type: "call_ended",
        bookingId,
        sessionGeneration: session.sessionGeneration,
        mediaProvider: callMediaProvider(session.videoRoomUrl),
        mediaCleanupCompleted,
      };
      broadcastTerminalCallEvent(session, endedEvent, "call_ended", req.log);

      // Keep the ended status queryable briefly so both clients can observe it.
      setTimeout(() => {
        storage.deleteCallSession(bookingId, session.sessionGeneration, ["ended"]).catch(() => {});
      }, 5000);

      res.json({
        success: true,
        status: "ended",
        mediaProvider: callMediaProvider(session.videoRoomUrl),
        mediaCleanupCompleted,
        ...(mediaCleanupCompleted ? {} : { warning: "Call ended, but Stream media cleanup is still pending." }),
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to end call" });
    }
  });

  // Mint short-lived Stream credentials only for a caller/recipient on an accepted Stream session.
  app.get("/api/call/stream-credentials/:bookingId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const { bookingId } = req.params;
      const booking = await storage.getBookingById(bookingId);
      if (!booking) return res.status(404).json({ error: "Booking not found" });

      const provider = booking.providerId ? await storage.getProviderById(booking.providerId) : null;
      const isSeeker = booking.userId === userId;
      const isProviderUser = provider?.userId === userId;
      if (!isSeeker && !isProviderUser) return res.status(403).json({ error: "Not part of this booking" });

      const session = await storage.getCallSession(bookingId);
      if (!session || session.status !== "accepted") {
        return res.status(409).json({ error: "The call must be accepted before joining Stream Video" });
      }
      if (callMediaProvider(session.videoRoomUrl) !== "stream") {
        return res.status(409).json({ error: "The active call is not using Stream Video" });
      }
      if (session.callerId !== userId && session.recipientUserId !== userId) {
        return res.status(403).json({ error: "Not a participant in this call" });
      }
      const bookingParticipantIds = [booking.userId, provider?.userId].filter((id): id is string => Boolean(id));
      if (
        !provider?.userId ||
        session.videoRoomUrl !== `stream://default/${session.sessionGeneration}` ||
        session.callerId === session.recipientUserId ||
        !bookingParticipantIds.includes(session.callerId) ||
        !bookingParticipantIds.includes(session.recipientUserId)
      ) {
        return res.status(403).json({ error: "Call participants do not match this booking" });
      }

      const apiKey = process.env.STREAM_VIDEO_API_KEY;
      const apiSecret = process.env.STREAM_VIDEO_API_SECRET;
      if (!apiKey || !apiSecret) {
        req.log.error({ bookingId }, "Stream Video credentials are not configured");
        return res.status(503).json({ error: "Stream Video is not configured" });
      }

      const callId = session.sessionGeneration;
      const user = req.user as any;
      const userName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email || "Participant";
      try {
        const streamClient = new StreamClient(apiKey, apiSecret);
        await streamClient.video.call("default", callId).getOrCreate({
          data: {
            created_by_id: session.callerId,
            members: [{ user_id: session.callerId }, { user_id: session.recipientUserId }],
          },
        });
        // A call-scoped token cannot join another booking's room even if its ID is learned.
        // Cover the two-hour accepted-session lifetime plus a small reconnect margin.
        const token = streamClient.generateCallToken({
          user_id: userId,
          call_cids: [`default:${callId}`],
          validity_in_seconds: 2 * 60 * 60 + 5 * 60,
        });
        return res.json({
          apiKey,
          token,
          callId,
          callType: "default",
          userId,
          userName,
          sessionGeneration: session.sessionGeneration,
          mediaProvider: "stream",
        });
      } catch (error) {
        req.log.error({ err: error, bookingId, sessionGeneration: session.sessionGeneration }, "Failed to generate Stream Video credentials");
        return res.status(502).json({ error: "Failed to generate Stream Video credentials" });
      }
    } catch (error) {
      req.log.error({ err: error }, "Stream Video credentials request failed");
      return res.status(500).json({ error: "Failed to fetch Stream Video credentials" });
    }
  });

  // Get current call session status — only booking participants may query
  app.get("/api/call/status/:bookingId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const { bookingId } = req.params;

      // Verify user is a participant in this booking
      const booking = await storage.getBookingById(bookingId);
      if (!booking) return res.status(404).json({ error: "Booking not found" });
      const provider = booking.providerId ? await storage.getProviderById(booking.providerId) : null;
      const isSeeker = booking.userId === userId;
      const isProviderUser = provider?.userId === userId;
      if (!isSeeker && !isProviderUser) return res.status(403).json({ error: "Not part of this booking" });

      const session = await storage.getCallSession(bookingId);
      if (!session) return res.json({ status: "none", mediaProvider: "daily" });
      res.json({
        status: session.status,
        sessionGeneration: session.sessionGeneration,
        videoRoomUrl: session.videoRoomUrl,
        mediaProvider: callMediaProvider(session.videoRoomUrl),
        callType: session.callType,
        isCaller: session.callerId === userId,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch call status" });
    }
  });

  // ── Call Window: status + admin extend ────────────────────────────────────

  // GET /api/bookings/:id/call-window — returns the current window status
  app.get("/api/bookings/:id/call-window", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const { id } = req.params;
      const booking = await storage.getBookingById(id);
      if (!booking) return res.status(404).json({ error: "Booking not found" });

      const isAdminUser = req.user.role === "admin";
      const provider = booking.providerId ? await storage.getProviderById(booking.providerId) : null;
      const isSeeker = booking.userId === userId;
      const isProviderUser = provider?.userId === userId;
      if (!isSeeker && !isProviderUser && !isAdminUser) {
        return res.status(403).json({ error: "Not authorised" });
      }

      if (booking.bookingType === "consultation") {
        const lifecycle = resolveConsultationLifecycle(booking);
        const reason = !lifecycle.scheduleAvailable
          ? "schedule_unavailable"
          : lifecycle.status === "scheduled"
            ? "before_window"
            : lifecycle.status === "ongoing"
              ? "active"
              : lifecycle.status === "paused"
                ? "paused"
                : lifecycle.status === "cancelled"
                  ? "cancelled"
                  : "expired";
        return res.json({
          open: lifecycle.scheduleAvailable && lifecycle.status === "ongoing",
          reason,
          windowStart: lifecycle.startsAt,
          windowEnd: lifecycle.expiresAt,
          extendedUntil: null,
        });
      }

      const status = getCallWindow(booking);
      res.json({
        open: status.open,
        reason: status.reason,
        windowStart: status.windowStart,
        windowEnd: status.windowEnd,
        extendedUntil: status.extendedUntil,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get call window status" });
    }
  });

  // PATCH /api/bookings/:id/call-window/extend — admin sets new expiry
  app.patch("/api/bookings/:id/call-window/extend", isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { durationMinutes } = req.body;
      if (!durationMinutes || typeof durationMinutes !== "number" || durationMinutes <= 0) {
        return res.status(400).json({ error: "durationMinutes must be a positive number" });
      }

      const booking = await storage.getBookingById(id);
      if (!booking) return res.status(404).json({ error: "Booking not found" });
      if (booking.bookingType === "consultation") {
        return res.status(400).json({ error: "Consultation call windows are fixed at 24 hours from the scheduled start." });
      }

      const extendedUntil = new Date(Date.now() + durationMinutes * 60 * 1000);
      await storage.updateBooking(id, { callWindowExtendedUntil: extendedUntil } as any);

      res.json({ success: true, extendedUntil });
    } catch (error) {
      res.status(500).json({ error: "Failed to extend call window" });
    }
  });

  // PATCH /api/bookings/:id/post-rx-features — provider toggles post-advisory feature access
  app.patch("/api/bookings/:id/post-rx-features", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (user.role !== "provider") {
        return res.status(403).json({ error: "Only providers can update post-advisory features" });
      }
      const booking = await storage.getBookingById(req.params.id);
      if (!booking) return res.status(404).json({ error: "Booking not found" });
      if (caseFileReadOnly(booking)) return res.status(403).json({ error: "This Case File is read-only" });
      const requestedFeatures = req.body as {
        videoEnabled?: boolean;
        callsEnabled?: boolean;
        uploadsEnabled?: boolean;
      };
      if (
        booking.bookingType === "consultation" &&
        (requestedFeatures.videoEnabled !== undefined || requestedFeatures.callsEnabled !== undefined)
      ) {
        const { videoEnabled, callsEnabled, uploadsEnabled } = requestedFeatures;
        if (
          (videoEnabled !== undefined && typeof videoEnabled !== "boolean") ||
          (callsEnabled !== undefined && typeof callsEnabled !== "boolean") ||
          (uploadsEnabled !== undefined && typeof uploadsEnabled !== "boolean")
        ) {
          return res.status(400).json({ error: "Feature values must be boolean" });
        }
        if (videoEnabled !== undefined && callsEnabled !== undefined && videoEnabled !== callsEnabled) {
          return res.status(400).json({ error: "Consultation calls and video share one lifecycle status." });
        }

        const provider = await storage.getProviderByUserId(user.id);
        if (!provider || booking.providerId !== provider.id) {
          return res.status(403).json({ error: "You can only update consultations assigned to you" });
        }
        const consultant = await storage.getConsultantById(booking.serviceId);
        if (consultant?.providerId && consultant.providerId !== provider.id) {
          return res.status(403).json({ error: "You can only update consultations assigned to you" });
        }

        const lifecycle = resolveConsultationLifecycle(booking);
        if (!lifecycle.scheduleAvailable || !["ongoing", "paused"].includes(lifecycle.status)) {
          return res.status(409).json({ error: "Only an active consultation can be paused or resumed" });
        }
        if (uploadsEnabled !== undefined) {
          const expiresAt = (booking as any).postRxExpiresAt ? new Date((booking as any).postRxExpiresAt) : null;
          if (!(booking as any).prescriptionApprovedAt || !expiresAt || new Date() > expiresAt) {
            return res.status(400).json({ error: "The post-advisory upload window is unavailable or expired" });
          }
        }

        const shouldEnableCalls = callsEnabled ?? videoEnabled;
        const updated = await storage.updateBooking(booking.id, {
          status: shouldEnableCalls ? "ongoing" : "paused",
          ...(uploadsEnabled !== undefined ? { postRxUploadsEnabled: uploadsEnabled } : {}),
        } as any);
        if (!updated) return res.status(404).json({ error: "Booking not found" });
        return res.json(withConsultationLifecycle(updated));
      }
      if (!(booking as any).prescriptionApprovedAt) {
        return res.status(400).json({ error: "Clinical Advisory must be confirmed before toggling post-advisory features" });
      }
      const expiresAt = (booking as any).postRxExpiresAt ? new Date((booking as any).postRxExpiresAt) : null;
      if (!expiresAt || new Date() > expiresAt) {
        return res.status(400).json({ error: "The 24-hour post-advisory feature window has expired" });
      }
      const provider = await storage.getProviderByUserId(user.id);
      if (!provider) return res.status(403).json({ error: "Provider profile not found" });
      // Primary ownership check: booking must belong to this provider
      if (booking.providerId && booking.providerId !== provider.id) {
        return res.status(403).json({ error: "You can only update features for your own bookings" });
      }
      // Supplemental check: if it's a consultant service, verify consultant belongs to this provider
      const consultant = await storage.getConsultantById(booking.serviceId);
      if (consultant?.providerId && consultant.providerId !== provider.id) {
        return res.status(403).json({ error: "You can only update features for your own bookings" });
      }
      const { videoEnabled, callsEnabled, uploadsEnabled } = requestedFeatures;
      const patch: Record<string, boolean> = {};
      if (videoEnabled !== undefined) patch.postRxVideoEnabled = videoEnabled;
      if (callsEnabled !== undefined) patch.postRxCallsEnabled = callsEnabled;
      if (uploadsEnabled !== undefined) patch.postRxUploadsEnabled = uploadsEnabled;
      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ error: "At least one feature flag must be specified" });
      }
      const updated = await storage.updateBooking(booking.id, patch as any);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update post-advisory features" });
    }
  });

  // ── Booking receipt PDF ────────────────────────────────────────────────────
  // GET /api/bookings/:id/receipt?type=seeker|provider
  // seeker  → full amount paid by patient
  // provider → base price after deducting Perfusion margin
  // Admin can download either type; seeker/provider limited to their own
  app.get("/api/bookings/:id/receipt", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const role   = req.user?.role as string;
      const { id } = req.params;
      const type: ReceiptType = req.query.type === "provider" ? "provider" : "seeker";

      const booking = await storage.getBookingById(id);
      if (!booking) return res.status(404).json({ error: "Booking not found" });

      if (role !== "admin") {
        if (type === "seeker" && booking.userId !== userId) {
          return res.status(403).json({ error: "Access denied" });
        }
        if (type === "provider") {
          const provider = booking.providerId ? await storage.getProviderById(booking.providerId) : null;
          if (!provider || provider.userId !== userId) {
            return res.status(403).json({ error: "Access denied" });
          }
        }
      }

      const b = booking as any;
      const receiptData: ReceiptData = {
        receiptType: type,
        bookingNumber: b.bookingNumber || "",
        bookingId: booking.id,
        bookingType: booking.bookingType as "consultation" | "lab" | "teleradiology",
        status: booking.status,
        createdAt: new Date(booking.createdAt ?? Date.now()),
        patientName: booking.patientName,
        patientAge: booking.patientAge,
        patientGender: b.patientGender ?? null,
        patientContact: b.patientContact ?? null,
        uhidIpNumber: b.uhidIpNumber ?? null,
        ipdNumber: b.ipdNumber ?? null,
        serviceName: booking.serviceName,
        providerName: b.providerName ?? null,
        appointmentSlot: b.appointmentSlot ?? null,
        modalityName: b.modalityName ?? null,
        urgency: b.urgency ?? null,
        accessionNumber: b.accessionNumber ?? null,
        provisionalDiagnosis: b.provisionalDiagnosis ?? null,
        fullAmount: parseFloat(booking.amount ?? "0"),
        basePrice: b.basePrice ? parseFloat(b.basePrice) : null,
        marginAmount: b.marginAmount ? parseFloat(b.marginAmount) : null,
        marginPercent: b.marginPercent ? parseFloat(b.marginPercent) : null,
        amountPaid: parseFloat(b.amountPaid ?? "0"),
        paymentStatus: b.paymentStatus ?? "pending",
        paymentMethod: b.paymentMethod ?? null,
        razorpayPaymentId: b.razorpayPaymentId ?? null,
        razorpayOrderId: b.razorpayOrderId ?? null,
        paidAt: b.paidAt ? new Date(b.paidAt) : null,
        dueDate: b.dueDate ? new Date(b.dueDate) : null,
      };

      const pdfBytes = await generateReceiptPdf(receiptData);
      const bn = b.bookingNumber || id.slice(0, 8).toUpperCase();
      const filename = `receipt-${bn}-${type}.pdf`;

      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": pdfBytes.length,
      });
      res.send(Buffer.from(pdfBytes));
    } catch (error) {
      console.error("[Receipt] Error generating receipt:", error);
      res.status(500).json({ error: "Failed to generate receipt" });
    }
  });

  // ── Twilio masked bridge call ──────────────────────────────────────────────
  // POST /api/bookings/:id/call — initiates a two-leg masked bridge call via Twilio.
  // Step 1: Twilio calls Party A (the initiator's phone).
  // Step 2: When Party A answers, Twilio hits /api/webhooks/twilio/bridge?to=<partyB>
  //         and receives TwiML telling it to dial Party B — bridging both through
  //         a Twilio number so neither sees the other's real number.

  function maskPhone(phone: string): string {
    const digits = phone.replace(/\D/g, "");
    if (digits.length <= 4) return "XXXX";
    return "X".repeat(digits.length - 4) + digits.slice(-4);
  }

  app.post("/api/bookings/:id/call", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const { id } = req.params;

      if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
        return res.status(503).json({ error: "Phone call service is not configured on this instance." });
      }

      const booking = await storage.getBookingById(id);
      if (!booking) return res.status(404).json({ error: "Booking not found" });
      if (booking.bookingType !== "consultation") {
        return res.status(400).json({ error: "Phone calls are only available for consultation bookings" });
      }
      const lifecycle = resolveConsultationLifecycle(booking);
      if (!lifecycle.scheduleAvailable || lifecycle.status !== "ongoing") {
        const error = !lifecycle.scheduleAvailable
          ? "The consultation schedule does not contain a usable start time"
          : lifecycle.status === "paused"
            ? "Phone calls are paused for this consultation"
            : lifecycle.status === "completed"
              ? "The consultation call window has expired"
              : lifecycle.status === "cancelled"
                ? "This consultation has been cancelled"
                : "The consultation has not started";
        return res.status(403).json({ error, status: lifecycle.status });
      }

      const isSeeker = booking.userId === userId;
      const provider = booking.providerId ? await storage.getProviderById(booking.providerId) : null;
      const isProviderUser = provider?.userId === userId;

      if (!isSeeker && !isProviderUser) {
        return res.status(403).json({ error: "Not authorised" });
      }

      if (!booking.callbackPhone) {
        return res.status(400).json({ error: "No call-back number set on this booking" });
      }

      const consultant = await storage.getConsultantById(booking.serviceId);
      // For individual consultant providers the phone lives on provider.phone (My Profile);
      // for hospital/clinic providers it lives on consultant.contactPhone (Services page).
      const consultantPhone = (consultant as any)?.contactPhone || (provider as any)?.phone;
      if (!consultantPhone) {
        return res.status(400).json({ error: "No contact phone number found for this consultant. Please add one in My Profile or the consultant's Services profile." });
      }

      let fromPhone: string;
      let toPhone: string;
      let callerRole: "seeker" | "provider";

      if (isSeeker) {
        fromPhone = booking.callbackPhone;
        toPhone = consultantPhone;
        callerRole = "seeker";
      } else {
        fromPhone = consultantPhone;
        toPhone = booking.callbackPhone;
        callerRole = "provider";
      }

      // Build the TwiML webhook URL — Twilio fetches this when Party A answers
      // and receives instructions to dial Party B.
      // Normalise toPhone to E.164 here so the webhook always dials the right number
      // regardless of how the phone was stored (e.g. bare 10-digit vs +91...).
      const appDomain = process.env.REPLIT_DOMAINS?.split(",")[0];
      if (!appDomain) {
        return res.status(503).json({ error: "App domain not configured — cannot build bridge webhook URL." });
      }
      const toPhoneE164 = formatPhoneNumber(toPhone);
      const bridgeWebhookUrl = `https://${appDomain}/api/webhooks/twilio/bridge?to=${encodeURIComponent(toPhoneE164)}`;

      let twilioCallSid: string | null = null;
      let callStatus: "initiated" | "failed" = "initiated";

      const sid = await triggerBridgeCall(fromPhone, bridgeWebhookUrl);
      if (sid) {
        twilioCallSid = sid;
      } else {
        callStatus = "failed";
      }

      const pool = getPool();
      await pool.query(
        `INSERT INTO call_logs (booking_id, initiator_user_id, caller_role, caller_phone_masked, callee_phone_masked, exotel_call_sid, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, userId, callerRole, maskPhone(fromPhone), maskPhone(toPhone), twilioCallSid, callStatus]
      );

      if (callStatus === "failed") {
        return res.status(502).json({ error: "Failed to connect call. Check Twilio credentials and account balance." });
      }

      return res.json({ success: true, callSid: twilioCallSid });
    } catch (error) {
      console.error("[Call] Error:", error);
      return res.status(500).json({ error: "Failed to initiate call" });
    }
  });

  // ── Twilio TwiML bridge webhook ─────────────────────────────────────────────
  // POST /api/webhooks/twilio/bridge?to=<partyB>
  // Twilio fetches this URL when Party A answers. We return TwiML instructing
  // Twilio to dial Party B, completing the masked bridge.
  // Intentionally unauthenticated — Twilio initiates this request.
  app.post("/api/webhooks/twilio/bridge", (req: any, res) => {
    const toPhone = req.query.to as string | undefined;
    if (!toPhone) {
      res.set("Content-Type", "text/xml");
      return res.send("<Response><Say>Configuration error. Missing bridge target.</Say></Response>");
    }
    const safePhone = toPhone.replace(/[^+\d]/g, "");
    const twiml = `<Response><Dial>${safePhone}</Dial></Response>`;
    res.set("Content-Type", "text/xml");
    res.send(twiml);
  });

  // GET /api/admin/bookings/:id/call-logs — admin view of Exotel call logs per booking
  app.get("/api/admin/bookings/:id/call-logs", isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const pool = getPool();
      const result = await pool.query(
        `SELECT id, booking_id, initiator_user_id, caller_role, caller_phone_masked, callee_phone_masked,
                exotel_call_sid, status, duration_seconds, created_at
         FROM call_logs WHERE booking_id = $1 ORDER BY created_at DESC`,
        [id]
      );
      res.json(result.rows);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch call logs" });
    }
  });

  // ── Exotel status callback webhook ────────────────────────────────────────
  // POST /api/webhooks/exotel/status — called by Exotel when a call ends
  // Payload (form-encoded): CallSid, Status, Duration (seconds)
  // Updates call_logs.status and call_logs.duration_seconds for the matching SID.
  // This endpoint is intentionally unauthenticated (Exotel initiates the request).
  app.post("/api/webhooks/exotel/status", async (req: any, res) => {
    try {
      const callSid = req.body?.CallSid as string | undefined;
      const rawStatus = (req.body?.Status as string | undefined)?.toLowerCase();
      const duration = req.body?.Duration !== undefined ? parseInt(req.body.Duration, 10) : null;

      if (!callSid) {
        return res.status(400).send("Missing CallSid");
      }

      const terminalStatus: "completed" | "failed" =
        rawStatus === "completed" ? "completed" : "failed";

      const durationSeconds = duration != null && !isNaN(duration) && duration >= 0 ? duration : null;

      const pool = getPool();
      await pool.query(
        `UPDATE call_logs
         SET status = $1, duration_seconds = COALESCE($2, duration_seconds)
         WHERE exotel_call_sid = $3`,
        [terminalStatus, durationSeconds, callSid]
      );

      return res.status(200).send("OK");
    } catch (error) {
      console.error("[Exotel webhook] Error processing status callback:", error);
      return res.status(500).send("Error");
    }
  });

  // ── Agreement Routes ───────────────────────────────────────────────────────

  // GET /api/agreements/check — check if current user has signed the current version
  app.get("/api/agreements/check", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const pool = getPool();
      const result = await pool.query(
        `SELECT id, agreement_version, signed_at FROM user_agreements
         WHERE user_id = $1 AND agreement_version = $2
         ORDER BY signed_at DESC LIMIT 1`,
        [userId, AGREEMENT_VERSION]
      );
      if (result.rows.length > 0) {
        return res.json({ signed: true, version: result.rows[0].agreement_version, signedAt: result.rows[0].signed_at });
      }
      return res.json({ signed: false });
    } catch (error) {
      req.log.error({ err: error }, "Error checking agreement");
      return res.status(500).json({ message: "Failed to check agreement" });
    }
  });

  // GET /api/agreements/current — returns the canonical agreement text, version,
  // and the current user's pre-filled acceptance fields (single source of truth).
  app.get("/api/agreements/current", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user as any;
      if (!user?.id) return res.status(401).json({ message: "Unauthorized" });

      let providerType: string | null = null;
      let providerOrgName: string | null = null;
      if (user.role === "provider") {
        try {
          const provider = await storage.getProviderByUserId(user.id);
          providerType = (provider as any)?.type ?? null;
          providerOrgName = (provider as any)?.registeredOrganization ?? null;
        } catch {
          providerType = null;
        }
      }

      const partyName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email;
      const organizationName = providerOrgName || user.hospitalName || "";

      return res.json({
        version: AGREEMENT_VERSION,
        content: AGREEMENT_FULL_TEXT,
        fields: {
          partyName,
          organizationName,
          email: user.email,
          phone: user.phone || "",
          role: user.role,
          roleLabel: partnerTypeLabel(user.role, providerType),
        },
      });
    } catch (error) {
      req.log.error({ err: error }, "Error fetching current agreement");
      return res.status(500).json({ message: "Failed to fetch agreement" });
    }
  });

  // POST /api/agreements/sign — record electronic acceptance and generate PDF
  app.post("/api/agreements/sign", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user as any;
      if (!user?.id) return res.status(401).json({ message: "Unauthorized" });

      const pool = getPool();

      // Idempotency: already signed this version?
      const existing = await pool.query(
        `SELECT id, unique_ref FROM user_agreements WHERE user_id = $1 AND agreement_version = $2`,
        [user.id, AGREEMENT_VERSION]
      );
      if (existing.rows.length > 0) {
        return res.json({ signed: true, id: existing.rows[0].id, uniqueRef: existing.rows[0].unique_ref });
      }

      const ipAddress =
        (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
        req.socket?.remoteAddress ||
        "unknown";
      const userAgent = req.headers["user-agent"] || "";
      const partyName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email;

      // Resolve provider record for type + registered org name (mirrors /api/agreements/current)
      let providerType: string | null = null;
      let providerOrgName: string | null = null;
      if (user.role === "provider") {
        try {
          const provider = await storage.getProviderByUserId(user.id);
          providerType = (provider as any)?.type ?? null;
          providerOrgName = (provider as any)?.registeredOrganization ?? null;
        } catch {
          providerType = null;
        }
      }
      const orgName = providerOrgName || user.hospitalName || "";

      // Unique acceptance reference: PHPL-AGR-{userId8}-{timestamp}{rand}
      const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
      const uniqueRef = `PHPL-AGR-${String(user.id).replace(/-/g, "").slice(0, 8).toUpperCase()}-${Date.now()}${rand}`;

      // Insert agreement record first (without PDF). ON CONFLICT makes this
      // concurrency-safe: a unique index on (user_id, agreement_version)
      // collapses concurrent double-submits to a single row.
      const insertResult = await pool.query(
        `INSERT INTO user_agreements
           (user_id, unique_ref, agreement_version, party_name, organization_name, email, phone, role, provider_type, ip_address, user_agent, signed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
         ON CONFLICT (user_id, agreement_version) DO NOTHING
         RETURNING id, signed_at`,
        [user.id, uniqueRef, AGREEMENT_VERSION, partyName, orgName || null, user.email, user.phone || null, user.role, providerType, ipAddress, userAgent]
      );

      // Lost the race: another concurrent request already inserted the row.
      if (insertResult.rows.length === 0) {
        const winner = await pool.query(
          `SELECT id, unique_ref FROM user_agreements WHERE user_id = $1 AND agreement_version = $2`,
          [user.id, AGREEMENT_VERSION]
        );
        return res.json({ signed: true, id: winner.rows[0]?.id, uniqueRef: winner.rows[0]?.unique_ref });
      }

      const agreementId = insertResult.rows[0].id;
      const signedAt: Date = insertResult.rows[0].signed_at;

      // Generate signed PDF in background (don't block response)
      const pdfData: AgreementPdfData = {
        uniqueRef,
        partyName,
        organizationName: orgName,
        email: user.email,
        phone: user.phone || "",
        role: user.role,
        providerType,
        signedAt,
        ipAddress,
        userAgent,
      };

      res.json({ signed: true, id: agreementId, uniqueRef });

      // Generate and store PDF asynchronously
      generateAndStoreAgreementPdf(pdfData)
        .then((pdfUrl) => {
          pool.query(`UPDATE user_agreements SET pdf_url = $1 WHERE id = $2`, [pdfUrl, agreementId])
            .catch((e) => req.log.error({ err: e }, "Failed to update agreement pdf_url"));
        })
        .catch((e) => req.log.error({ err: e }, "Failed to generate agreement PDF"));
    } catch (error) {
      req.log.error({ err: error }, "Error signing agreement");
      return res.status(500).json({ message: "Failed to record agreement" });
    }
  });

  // GET /api/admin/agreements — list all signed agreements (admin)
  app.get("/api/admin/agreements", isAdmin, async (req: any, res) => {
    try {
      const pool = getPool();
      const result = await pool.query(
        `SELECT id, user_id, unique_ref, agreement_version, party_name, organization_name, email, phone, role,
                provider_type, ip_address, pdf_url, signed_at, created_at
         FROM user_agreements
         ORDER BY signed_at DESC`
      );
      const rows = result.rows.map((r: any) => ({
        id: r.id,
        userId: r.user_id,
        uniqueRef: r.unique_ref,
        agreementVersion: r.agreement_version,
        partyName: r.party_name,
        organizationName: r.organization_name,
        email: r.email,
        phone: r.phone,
        role: r.role,
        roleLabel: partnerTypeLabel(r.role, r.provider_type),
        ipAddress: r.ip_address,
        pdfUrl: r.pdf_url,
        signedAt: r.signed_at,
        createdAt: r.created_at,
      }));
      return res.json(rows);
    } catch (error) {
      req.log.error({ err: error }, "Error fetching agreements");
      return res.status(500).json({ message: "Failed to fetch agreements" });
    }
  });

  // GET /api/admin/agreements/enforcement — current pause/resume status
  app.get("/api/admin/agreements/enforcement", isAdmin, async (req: any, res) => {
    try {
      const pool = getPool();
      const row = await pool.query(
        `SELECT setting_value FROM platform_settings WHERE setting_key = 'agreement_enforcement_enabled' LIMIT 1`
      );
      // Default: enabled (if setting row absent, enforcement is on)
      const enabled = row.rows.length === 0 || row.rows[0].setting_value !== "false";
      return res.json({ enabled });
    } catch (error) {
      req.log.error({ err: error }, "Error fetching agreement enforcement status");
      return res.status(500).json({ message: "Failed to fetch enforcement status" });
    }
  });

  // POST /api/admin/agreements/enforcement — pause or resume agreement prompting
  app.post("/api/admin/agreements/enforcement", isAdmin, async (req: any, res) => {
    try {
      const { enabled } = req.body as { enabled: boolean };
      if (typeof enabled !== "boolean") {
        return res.status(400).json({ message: "'enabled' (boolean) is required" });
      }
      await storage.upsertPlatformSetting("agreement_enforcement_enabled", String(enabled));
      req.log.info({ enabled }, "Agreement enforcement status updated");
      return res.json({ enabled });
    } catch (error) {
      req.log.error({ err: error }, "Error updating agreement enforcement");
      return res.status(500).json({ message: "Failed to update enforcement status" });
    }
  });

  // ── Admin: test Twilio voice call ─────────────────────────────────────────
  // POST /api/admin/test-voice-call  { phone: "+919876543210" }
  // Lets an admin verify that Twilio is configured and can place calls.
  app.post("/api/admin/test-voice-call", isAdmin, async (req: any, res) => {
    try {
      const { phone } = req.body;
      if (!phone) return res.status(400).json({ error: "phone is required" });
      const message =
        "Hello. This is a test call from Perfusion Healthcare. " +
        "Twilio voice call integration is working correctly. " +
        "You may now hang up.";
      const sid = await triggerVoiceCall(phone, message);
      if (sid) {
        return res.json({ success: true, sid });
      } else {
        return res.status(500).json({ success: false, error: "Call failed — check server logs for details" });
      }
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || "Unknown error" });
    }
  });

  return httpServer;
}
