import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, isAdmin, isProvider, updateUserRole } from "./auth";
import { registerAuthRoutes } from "./auth/routes";
import type { BookingStatus, UserRole, ProviderType, ProviderStatus, ServiceStatus } from "@shared/schema";
import multer from "multer";
import path from "path";
import fs from "fs";
import { notifyAdminLabBooking, notifyUserReportReady, triggerVoiceCall, cancelVoiceCall } from "./services/msg91";
import { generateBookingNumber } from "./services/booking-number";
import { calculateCustomerPrice, deriveMarginFromPrice, derivePriceFromMargin } from "./services/pricing";
import { processReport, type BookingReportData } from "./services/report-processor";
import { generateAndStorePrescriptionPdf, type PrescriptionPdfData } from "./services/prescription-pdf";
import { sendPushNotification, getVapidPublicKey, type PushPayload } from "./services/push-notifications";

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
        properties: {
          enable_chat: true,
          enable_screenshare: true,
          enable_recording: "cloud",
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

// Configure multer for file uploads
const uploadDir = path.join(process.cwd(), "uploads", "reports");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const reportStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `report-${uniqueSuffix}${ext}`);
  },
});

const uploadReport = multer({
  storage: reportStorage,
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

// Configure multer for registration document uploads
const docUploadDir = path.join(process.cwd(), "uploads", "documents");
if (!fs.existsSync(docUploadDir)) {
  fs.mkdirSync(docUploadDir, { recursive: true });
}

const documentStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, docUploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `doc-${uniqueSuffix}${ext}`);
  },
});

const uploadDocument = multer({
  storage: documentStorage,
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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Setup authentication
  await setupAuth(app);
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
      res.json(consultants);
    } catch (error) {
      console.error("Error fetching provider consultants:", error);
      res.status(500).json({ message: "Failed to fetch consultants" });
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
      const consultant = await storage.createConsultant(consultantData);
      res.status(201).json(consultant);
    } catch (error) {
      console.error("Error creating consultant:", error);
      res.status(500).json({ message: "Failed to create consultant" });
    }
  });

  app.patch("/api/provider/consultants/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const provider = await storage.getProviderByUserId(userId);
      if (!provider) {
        return res.status(403).json({ message: "Provider profile required" });
      }
      
      const consultant = await storage.getConsultantById(req.params.id);
      if (!consultant || consultant.providerId !== provider.id) {
        return res.status(404).json({ message: "Consultant not found or access denied" });
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
      if (!consultant || consultant.providerId !== provider.id) {
        return res.status(404).json({ message: "Consultant not found or access denied" });
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

  app.get("/api/consultants/:id", async (req, res) => {
    try {
      const consultant = await storage.getConsultantById(req.params.id);
      if (!consultant) {
        return res.status(404).json({ message: "Consultant not found" });
      }
      const defaultMarginSetting = await storage.getPlatformSetting("default_margin_percent");
      const defaultMargin = parseFloat(defaultMarginSetting?.settingValue || "15");
      const baseCost = parseFloat(consultant.consultationFee);
      const pricing = calculateCustomerPrice(baseCost, consultant.customerPrice, consultant.marginOverride, defaultMargin);
      res.json({
        ...consultant,
        computedCustomerPrice: pricing.customerPrice.toFixed(2),
      });
    } catch (error) {
      console.error("Error fetching consultant:", error);
      res.status(500).json({ message: "Failed to fetch consultant" });
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
          return { ...b, specialization: consultant?.specialization || null };
        }
        return b;
      }));
      res.json(enriched);
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

      // Active consultations: consultation bookings where prescription NOT yet signed
      const consultationBookings = allBookings.filter(
        (b) => b.bookingType === "consultation" &&
          !["cancelled", "completed"].includes(b.status) &&
          !b.prescriptionApprovedAt
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
      const readyReports = allBookings.filter(
        (b) => b.bookingType === "lab" &&
          (b.status === "report_ready" || !!b.processedReportUrl)
      );

      res.json({ activeConsultations, readyReports });
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
      res.status(500).json({ message: "Failed to fetch dashboard data" });
    }
  });

  // Get booking by video room URL (for video-room page to know booking context)
  app.get("/api/bookings/room/:roomUrl", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const roomUrl = decodeURIComponent(req.params.roomUrl);
      const booking = await storage.getBookingByVideoRoomUrl(roomUrl);
      if (!booking) return res.status(404).json({ message: "Booking not found" });
      // Only allow the seeker or the provider assigned to this booking
      const provider = booking.providerId ? await storage.getProviderById(booking.providerId) : null;
      const isSeeker = booking.userId === userId;
      const isProviderUser = provider?.userId === userId;
      if (!isSeeker && !isProviderUser) return res.status(403).json({ message: "Access denied" });
      res.json(booking);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch booking" });
    }
  });

  app.post("/api/bookings", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const bookingData = {
        ...req.body,
        userId,
      };
      
      // For consultation bookings, link to the provider who owns the consultant
      if (bookingData.bookingType === "consultation" && bookingData.serviceId) {
        const consultant = await storage.getConsultantById(bookingData.serviceId);
        if (consultant && consultant.providerId) {
          bookingData.providerId = consultant.providerId;
        }
        
        // Generate Daily.co room for video calls
        const roomName = `perfusion-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const dailyRoom = await createDailyRoom(roomName);
        bookingData.videoRoomId = dailyRoom ? dailyRoom.url : null;
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
          providerBaseCost = parseFloat(consultant.consultationFee);
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

      const booking = await storage.createBooking(bookingData);

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

      res.status(201).json(booking);
    } catch (error) {
      console.error("Error creating booking:", error);
      res.status(500).json({ message: "Failed to create booking" });
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

  // Generate/update prescription for consultation bookings
  app.patch("/api/bookings/:id/prescription", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      const booking = await storage.getBookingById(req.params.id);
      
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }
      
      // Only allow providers and admins to generate prescriptions
      if (user.role !== "provider" && user.role !== "admin") {
        return res.status(403).json({ message: "Only providers can generate prescriptions" });
      }
      
      // For providers, verify they own this booking (via consultant ownership)
      if (user.role === "provider") {
        const provider = await storage.getProviderByUserId(user.id);
        if (!provider) {
          return res.status(403).json({ message: "Provider profile not found" });
        }
        // Check if this consultant belongs to this provider
        const consultant = await storage.getConsultantById(booking.serviceId);
        if (!consultant || consultant.providerId !== provider.id) {
          return res.status(403).json({ message: "You can only generate prescriptions for your own consultations" });
        }
      }
      
      // Only for consultation bookings
      if (booking.bookingType !== "consultation") {
        return res.status(400).json({ message: "Prescriptions can only be generated for consultations" });
      }

      // Reject edits on approved (signed & locked) prescriptions
      if ((booking as any).prescriptionApprovedAt) {
        return res.status(409).json({ message: "This prescription has been confirmed and is permanently locked. It cannot be edited." });
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
      console.error("Error generating prescription:", error);
      res.status(500).json({ message: "Failed to generate prescription" });
    }
  });

  // Generate prescription PDF
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
        return res.status(404).json({ message: "No prescription generated yet" });
      }

      // For confirmed (signed & locked) prescriptions, serve only the frozen stored PDF
      if ((booking as any).prescriptionApprovedAt && (booking as any).prescriptionPdfUrl) {
        return res.json({
          locked: true,
          prescriptionPdfUrl: (booking as any).prescriptionPdfUrl,
          message: "This prescription has been confirmed and is available as a signed PDF.",
        });
      }
      
      // Fetch consultant details for the prescription
      let consultant: any = null;
      if (booking.serviceId) {
        consultant = await storage.getConsultantById(booking.serviceId);
      }

      // Fetch care seeker (user) details for referring facility info
      const bookingUser = await storage.getUserById(booking.userId);
      
      // Build prescription data object for PDF generation
      const prescriptionData = {
        prescriptionId: booking.bookingNumber || `PFN-${booking.id.substring(0, 8).toUpperCase()}`,
        dateTime: booking.prescriptionGeneratedAt ? new Date(booking.prescriptionGeneratedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : new Date().toLocaleString("en-IN"),
        mode: "Teleconsultation",
        referringFacility: bookingUser?.hospitalName || null,
        referringDoctor: null as string | null,
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
      console.error("Error generating prescription PDF data:", error);
      res.status(500).json({ message: "Failed to generate prescription" });
    }
  });

  // Confirm & Sign prescription (provider-only: locks + atomically saves current draft + generates server-side frozen PDF + audit log)
  app.post("/api/bookings/:id/prescription/confirm", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;

      // Only providers (assigned consultant's owner) may digitally sign — not admins
      if (user.role !== "provider") {
        return res.status(403).json({ message: "Only the assigned provider may confirm and sign a prescription." });
      }

      const booking = await storage.getBookingById(req.params.id);
      if (!booking) return res.status(404).json({ message: "Booking not found" });
      if (booking.bookingType !== "consultation") return res.status(400).json({ message: "Only consultation bookings can have prescriptions confirmed" });

      // Strict ownership: verify the consultant belongs to this provider
      const provider = await storage.getProviderByUserId(user.id);
      if (!provider) return res.status(403).json({ message: "Provider profile not found" });
      const consultant = await storage.getConsultantById(booking.serviceId);
      if (!consultant || consultant.providerId !== provider.id) {
        return res.status(403).json({ message: "You can only sign prescriptions for your own consultants" });
      }

      if ((booking as any).prescriptionApprovedAt) {
        return res.status(409).json({ message: "Prescription is already confirmed and permanently locked." });
      }

      // Accept current prescription content from request body (atomic save+confirm)
      const { diagnosis, medications, physicianNotes, followUp } = req.body as {
        diagnosis?: string;
        medications?: string;
        physicianNotes?: string;
        followUp?: string;
      };

      const finalDiagnosis = (diagnosis || "").trim() || booking.prescriptionDiagnosis || null;
      if (!finalDiagnosis) {
        return res.status(400).json({ message: "Diagnosis is required before confirming a prescription." });
      }

      // Atomically update prescription content before confirming
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

      // Lock the prescription with approval metadata
      const updated = await storage.updateBooking(freshBooking.id, {
        prescriptionApprovedAt: approvedAt,
        prescriptionApprovedByUserId: user.id,
        prescriptionApproverIp: approverIp,
        prescriptionOtpVerified: false,
        prescriptionPdfUrl,
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
      console.error("Error confirming prescription:", error);
      res.status(500).json({ message: "Failed to confirm prescription" });
    }
  });

  // Public verification endpoint (no auth required)
  app.get("/api/verify/prescription/:bookingId", async (req: any, res) => {
    try {
      const booking = await storage.getBookingById(req.params.bookingId);
      if (!booking || booking.bookingType !== "consultation") {
        return res.status(404).json({ message: "Prescription not found" });
      }
      if (!(booking as any).prescriptionApprovedAt) {
        return res.status(404).json({ message: "This prescription has not been confirmed yet" });
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
      console.error("Error verifying prescription:", error);
      res.status(500).json({ message: "Failed to verify prescription" });
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
      const enrichedBookings = bookings.map(booking => {
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
        
        return {
          ...booking,
          providerPrice,
        };
      });
      
      res.json(enrichedBookings);
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

      const allBookings = await storage.getBookingsByProviderId(provider.id);
      const consultationBookings = allBookings.filter((b) => b.bookingType === "consultation");

      // Active consultations (not cancelled or completed), enriched with seeker hospital name
      const activeRaw = consultationBookings.filter(
        (b) => !["cancelled", "completed"].includes(b.status)
      );
      const activeConsultations = await Promise.all(
        activeRaw.map(async (b) => {
          const seeker = await storage.getUserById(b.userId);
          return {
            ...b,
            seekerHospitalName:
              seeker?.hospitalName || seeker?.firstName || "Unknown Hospital",
          };
        })
      );

      // Revenue from ALL consultation bookings for this provider (basePrice only)
      const sum = (filter: (b: (typeof consultationBookings)[0]) => boolean) =>
        consultationBookings
          .filter(filter)
          .reduce((acc, b) => acc + parseFloat(b.basePrice || "0"), 0);

      const revenue = {
        total: sum(() => true),
        paid: sum((b) => b.paymentStatus === "paid"),
        pending: sum((b) => b.paymentStatus === "pending" || b.paymentStatus === "partial"),
      };

      res.json({ activeConsultations, revenue });
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
      res.json(users);
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
      res.json(user);
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
      res.json(updated);
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
      res.json(updated);
    } catch (error) {
      console.error("Error updating own profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
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
      const bookings = await storage.getAllBookings();
      res.json(bookings);
    } catch (error) {
      console.error("Error fetching admin bookings:", error);
      res.status(500).json({ message: "Failed to fetch bookings" });
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
      const recentBookings = bookings
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
  app.post("/api/admin/bookings", isAdmin, async (req: any, res) => {
    try {
      const booking = await storage.createBooking(req.body);
      res.status(201).json(booking);
    } catch (error) {
      console.error("Error creating admin booking:", error);
      res.status(500).json({ message: "Failed to create booking" });
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
        if (!consultant || consultant.providerId !== provider.id) {
          return res.status(403).json({ message: "Access denied. You can only manage your own consultants." });
        }
      }
      
      const { slots } = req.body as { slots: string[] };
      const consultant = await storage.updateConsultant(req.params.id, { availableSlots: slots });
      if (!consultant) {
        return res.status(404).json({ message: "Consultant not found" });
      }
      res.json(consultant);
    } catch (error) {
      console.error("Error updating consultant slots:", error);
      res.status(500).json({ message: "Failed to update slots" });
    }
  });

  app.patch("/api/consultants/:id/photo", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (req.user.role === "provider") {
        const provider = await storage.getProviderByUserId(userId);
        if (!provider) return res.status(403).json({ message: "Provider not found" });
        const consultant = await storage.getConsultantById(req.params.id);
        if (!consultant || consultant.providerId !== provider.id) {
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
      res.json(updated);
    } catch (error) {
      console.error("Error updating booking:", error);
      res.status(500).json({ message: "Failed to update booking" });
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
      
      // Only allow the booking owner to upload documents
      if (booking.userId !== userId) {
        return res.status(403).json({ message: "Access denied. You can only upload documents to your own bookings." });
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
      
      if (booking.userId !== userId) {
        return res.status(403).json({ message: "Access denied." });
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

      // Generate the URL for the uploaded file
      const fileUrl = `/uploads/reports/${req.file.filename}`;
      
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

  // File upload endpoint for registration documents (used during registration and service addition)
  app.post("/api/upload/document", uploadDocument.single("file"), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const fileUrl = `/uploads/documents/${req.file.filename}`;
      
      res.json({ 
        success: true, 
        url: fileUrl,
        filename: req.file.originalname,
        size: req.file.size
      });
    } catch (error) {
      console.error("Error uploading document:", error);
      res.status(500).json({ message: "Failed to upload document" });
    }
  });

  // ===== Admin User Registration Approvals =====
  
  // Get all users pending approval
  app.get("/api/admin/pending-registrations", isAdmin, async (req, res) => {
    try {
      const pendingUsers = await storage.getPendingRegistrations();
      res.json(pendingUsers);
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
      res.json(user);
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
      res.json(updated);
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

  // ─── Call Session State (in-memory) ──────────────────────────────────
  type CallStatus = "ringing" | "accepted" | "declined" | "timeout";
  interface CallSession {
    bookingId: string;
    callerId: string;
    callerName: string;
    callerRole: "seeker" | "provider";
    recipientUserId: string;
    videoRoomUrl: string;
    serviceName: string;
    subtitle: string;
    status: CallStatus;
    createdAt: number;
    twilioCallSid?: string;
  }

  const callSessions = new Map<string, CallSession>(); // key = bookingId
  const sseClients = new Map<string, Set<any>>(); // key = userId → set of res objects

  function broadcastCallEvent(userId: string, event: object) {
    const clients = sseClients.get(userId);
    if (!clients || clients.size === 0) return;
    const data = `data: ${JSON.stringify(event)}\n\n`;
    Array.from(clients).forEach(client => {
      try { client.write(data); } catch {}
    });
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
    for (const s of callSessions.values()) {
      if (s.status === "ringing" && s.recipientUserId === userId) {
        try {
          res.write(`data: ${JSON.stringify({
            type: "incoming_call",
            bookingId: s.bookingId,
            callerName: s.callerName,
            callerRole: s.callerRole,
            videoRoomUrl: s.videoRoomUrl,
            serviceName: s.serviceName,
            subtitle: s.subtitle,
          })}\n\n`);
        } catch {}
        break; // at most one active ringing session per user
      }
    }

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
      const booking = await storage.getBookingById(bookingId);
      if (!booking) return res.status(404).json({ error: "Booking not found" });

      // Check caller is part of this booking
      const provider = await storage.getProviderById(booking.providerId!);
      const isSeeker = booking.userId === callerId;
      const isProviderUser = provider?.userId === callerId;
      if (!isSeeker && !isProviderUser) return res.status(403).json({ error: "Not part of this booking" });

      const callerRole: "seeker" | "provider" = isSeeker ? "seeker" : "provider";

      // Get caller display name
      const callerUser = await storage.getUserById(callerId);
      const callerName = callerUser?.name || callerUser?.email || "Unknown";

      // Build a clean subtitle for the notification/overlay:
      // - Provider calling seeker → "Dr. Name (Specialization)"
      // - Seeker calling provider → "Hospital Name"
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
        subtitle = callerUser?.hospitalName || callerName;
      }

      let videoRoomUrl = booking.videoRoomId || "";
      if (!videoRoomUrl) return res.status(400).json({ error: "No video room for this booking" });

      // Validate the room still exists (Daily.co rooms expire). Recreate if needed.
      const roomValid = await isDailyRoomValid(videoRoomUrl);
      if (!roomValid) {
        console.log(`[Ring] Daily room expired or missing for booking ${bookingId} — recreating`);
        const roomName = `perfusion-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const newRoom = await createDailyRoom(roomName);
        if (!newRoom) return res.status(500).json({ error: "Could not create video room" });
        videoRoomUrl = newRoom.url;
        await storage.updateBooking(bookingId, { videoRoomId: videoRoomUrl });
        console.log(`[Ring] New room created: ${videoRoomUrl}`);
      }

      // Find recipient userId
      const recipientUserId = isSeeker ? provider?.userId : booking.userId;
      if (!recipientUserId) return res.status(400).json({ error: "Cannot find recipient" });

      // Store/update call session
      const session: CallSession = {
        bookingId,
        callerId,
        callerName,
        callerRole,
        recipientUserId,
        videoRoomUrl,
        serviceName: booking.serviceName || "",
        subtitle,
        status: "ringing",
        createdAt: Date.now(),
      };
      callSessions.set(bookingId, session);

      // Auto-timeout after 5 minutes
      setTimeout(() => {
        const s = callSessions.get(bookingId);
        if (s && s.status === "ringing") {
          s.status = "timeout";
          // Cancel the Twilio voice call if it somehow never ended
          if (s.twilioCallSid) cancelVoiceCall(s.twilioCallSid).catch(() => {});
          broadcastCallEvent(callerId, { type: "call_timeout", bookingId });
          broadcastCallEvent(recipientUserId, { type: "call_timeout", bookingId });
          setTimeout(() => callSessions.delete(bookingId), 5000);
        }
      }, 300000);

      // Notify recipient via SSE if they're online
      broadcastCallEvent(recipientUserId, {
        type: "incoming_call",
        bookingId,
        callerName,
        callerRole,
        videoRoomUrl,
        serviceName: booking.serviceName,
        subtitle,
      });

      // Send push notification to recipient (even if browser closed)
      const subscriptions = await storage.getPushSubscriptionsByUserId(recipientUserId);
      console.log(`[Ring] Recipient ${recipientUserId} has ${subscriptions.length} push subscription(s)`);
      if (subscriptions.length === 0) {
        console.log(`[Ring] No push subscriptions — recipient will only be alerted via SSE + Twilio voice`);
      }
      const recipientRole: "seeker" | "provider" = callerRole === "seeker" ? "provider" : "seeker";
      const payload: PushPayload = {
        type: "incoming_call",
        bookingId,
        callerName,
        callerRole,
        recipientRole,
        videoRoomUrl,
        subtitle,
        title: "Perfusion",
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

      res.json({ success: true, session: { bookingId, status: "ringing" } });

      // Twilio voice call fallback — rings the recipient's actual phone number
      // even when the phone is locked or the browser is fully closed.
      // Runs entirely after the response is sent so it never adds latency.
      // The returned SID is stored on the session so we can cancel the call
      // the moment the recipient accepts, declines, or the call times out.
      storage.getUserById(recipientUserId).then(async (recipientUser) => {
        if (!recipientUser?.phone) return;
        const svcName = (booking.serviceName || "consultation").replace(/[<>&'"]/g, "");
        const safeCallerName = callerName.replace(/[<>&'"]/g, "");
        const voiceMsg =
          `Hello. You have an incoming ${svcName} call on Perfusion from ${safeCallerName}. ` +
          `Please open the Perfusion app to join the call. ` +
          `This call is from ${safeCallerName} on Perfusion Healthcare.`;
        const sid = await triggerVoiceCall(recipientUser.phone, voiceMsg).catch((err: any) => {
          console.error("[Call] Twilio fallback voice call failed:", err?.message || err);
          return null;
        });
        if (sid) {
          // Attach SID to the session so it can be cancelled on accept/decline/timeout
          const s = callSessions.get(bookingId);
          if (s) s.twilioCallSid = sid;
        }
      }).catch(() => {});
    } catch (error) {
      console.error("[Call] Ring error:", error);
      res.status(500).json({ error: "Failed to initiate ring" });
    }
  });

  // Accept a call — only the intended recipient may accept
  app.post("/api/call/accept/:bookingId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const { bookingId } = req.params;
      const session = callSessions.get(bookingId);
      if (!session) return res.status(404).json({ error: "No active call session" });

      // Verify the acceptor is NOT the caller and IS a participant in the booking
      const booking = await storage.getBookingById(bookingId);
      if (!booking) return res.status(404).json({ error: "Booking not found" });
      const provider = booking.providerId ? await storage.getProviderById(booking.providerId) : null;
      const isSeeker = booking.userId === userId;
      const isProviderUser = provider?.userId === userId;
      if (!isSeeker && !isProviderUser) return res.status(403).json({ error: "Not part of this booking" });
      if (session.callerId === userId) return res.status(403).json({ error: "Caller cannot accept their own call" });

      if (session.status !== "ringing") return res.json({ success: true, status: session.status });

      session.status = "accepted";

      // Cancel the Twilio voice call if it's still ringing
      if (session.twilioCallSid) {
        cancelVoiceCall(session.twilioCallSid).catch(() => {});
      }

      // Notify caller that call was accepted
      broadcastCallEvent(session.callerId, {
        type: "call_accepted",
        bookingId,
        videoRoomUrl: session.videoRoomUrl,
      });

      // Clean up after 10s
      setTimeout(() => callSessions.delete(bookingId), 10000);

      res.json({ success: true, videoRoomUrl: session.videoRoomUrl });
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
      const session = callSessions.get(bookingId);
      if (!session) return res.status(404).json({ error: "No active call session" });

      // Verify the decliner is NOT the caller and IS a participant in the booking
      const booking = await storage.getBookingById(bookingId);
      if (!booking) return res.status(404).json({ error: "Booking not found" });
      const provider = booking.providerId ? await storage.getProviderById(booking.providerId) : null;
      const isSeeker = booking.userId === userId;
      const isProviderUser = provider?.userId === userId;
      if (!isSeeker && !isProviderUser) return res.status(403).json({ error: "Not part of this booking" });
      if (session.callerId === userId) return res.status(403).json({ error: "Caller should use cancel endpoint" });

      session.status = "declined";

      // Cancel the Twilio voice call if it's still ringing
      if (session.twilioCallSid) {
        cancelVoiceCall(session.twilioCallSid).catch(() => {});
      }

      broadcastCallEvent(session.callerId, {
        type: "call_declined",
        bookingId,
      });

      setTimeout(() => callSessions.delete(bookingId), 5000);

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to decline call" });
    }
  });

  // Cancel a call (caller hangs up while ringing)
  app.post("/api/call/cancel/:bookingId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const { bookingId } = req.params;
      const session = callSessions.get(bookingId);
      if (session && session.callerId === userId) {
        session.status = "declined";
        // Cancel the Twilio voice call if it's still ringing
        if (session.twilioCallSid) cancelVoiceCall(session.twilioCallSid).catch(() => {});
        // Find recipient to notify
        const booking = await storage.getBookingById(bookingId);
        if (booking) {
          const provider = await storage.getProviderById(booking.providerId!);
          const recipientUserId = session.callerRole === "seeker" ? provider?.userId : booking.userId;
          if (recipientUserId) {
            broadcastCallEvent(recipientUserId, { type: "call_cancelled", bookingId });
          }
        }
        setTimeout(() => callSessions.delete(bookingId), 5000);
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to cancel call" });
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

      const session = callSessions.get(bookingId);
      if (!session) return res.json({ status: "none" });
      res.json({ status: session.status, videoRoomUrl: session.videoRoomUrl });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch call status" });
    }
  });

  return httpServer;
}
