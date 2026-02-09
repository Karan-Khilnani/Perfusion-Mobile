import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, isAdmin, isProvider, updateUserRole } from "./auth";
import { registerAuthRoutes } from "./auth/routes";
import type { BookingStatus, UserRole, ProviderType, ProviderStatus, ServiceStatus } from "@shared/schema";
import multer from "multer";
import path from "path";
import fs from "fs";

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
          exp: Math.floor(Date.now() / 1000) + 86400, // Expires in 24 hours
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

  // Lab Tests - Direct Catalog (no providers)
  app.get("/api/lab-tests", async (req, res) => {
    try {
      const tests = await storage.getActiveLabTests();
      res.json(tests);
    } catch (error) {
      console.error("Error fetching lab tests:", error);
      res.status(500).json({ message: "Failed to fetch lab tests" });
    }
  });

  app.get("/api/lab-tests/all", isAdmin, async (req, res) => {
    try {
      const tests = await storage.getLabTests();
      res.json(tests);
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
      res.json(lab);
    } catch (error) {
      console.error("Error fetching lab:", error);
      res.status(500).json({ message: "Failed to fetch lab" });
    }
  });

  // Consultants (public - only active)
  app.get("/api/consultants", async (req, res) => {
    try {
      const consultants = await storage.getActiveConsultants();
      res.json(consultants);
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
      res.json(consultant);
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
      res.json(bookings);
    } catch (error) {
      console.error("Error fetching bookings:", error);
      res.status(500).json({ message: "Failed to fetch bookings" });
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
      
      const booking = await storage.createBooking(bookingData);
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
      
      const { diagnosis, medications, advice, followUp } = req.body as {
        diagnosis: string;
        medications: string;
        advice: string;
        followUp?: string;
      };
      
      // Validate required fields
      if (!diagnosis || diagnosis.trim().length === 0) {
        return res.status(400).json({ message: "Diagnosis is required" });
      }
      if (!medications || medications.trim().length === 0) {
        return res.status(400).json({ message: "Medications are required" });
      }
      
      const updated = await storage.updateBooking(req.params.id, {
        prescriptionDiagnosis: diagnosis.trim(),
        prescriptionMedications: medications.trim(),
        prescriptionAdvice: advice?.trim() || null,
        prescriptionFollowUp: followUp?.trim() || null,
        prescriptionGeneratedAt: new Date(),
      } as any);
      
      res.json(updated);
    } catch (error) {
      console.error("Error generating prescription:", error);
      res.status(500).json({ message: "Failed to generate prescription" });
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
  app.patch("/api/provider/lab-tests/:id", isAuthenticated, async (req: any, res) => {
    try {
      const updated = await storage.updateProviderLabTest(req.params.id, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating provider lab test:", error);
      res.status(500).json({ message: "Failed to update lab test" });
    }
  });

  // Remove a test from provider's offerings
  app.delete("/api/provider/lab-tests/:id", isAuthenticated, async (req: any, res) => {
    try {
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
      });
      res.status(201).json(assignment);
    } catch (error) {
      console.error("Error adding provider modality:", error);
      res.status(500).json({ message: "Failed to add modality" });
    }
  });

  app.patch("/api/provider/modalities/:id", isAuthenticated, async (req: any, res) => {
    try {
      const updated = await storage.updateProviderModality(req.params.id, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating provider modality:", error);
      res.status(500).json({ message: "Failed to update modality" });
    }
  });

  app.delete("/api/provider/modalities/:id", isAuthenticated, async (req: any, res) => {
    try {
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
      const test = await storage.updateLabTest(req.params.id, req.body);
      if (!test) {
        return res.status(404).json({ message: "Lab test not found" });
      }
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

  // Admin - Consultants CRUD
  app.get("/api/admin/consultants", isAdmin, async (req, res) => {
    try {
      const consultants = await storage.getConsultants();
      res.json(consultants);
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
      const consultant = await storage.updateConsultant(req.params.id, req.body);
      if (!consultant) {
        return res.status(404).json({ message: "Consultant not found" });
      }
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
      
      // Append to existing document URLs array
      const existingDocs = booking.documentUrls || [];
      const newDocUrls = [...existingDocs, documentUrl];
      
      const updated = await storage.updateBooking(req.params.id, { documentUrls: newDocUrls } as any);
      res.json(updated);
    } catch (error) {
      console.error("Error uploading document:", error);
      res.status(500).json({ message: "Failed to upload document" });
    }
  });

  // Serve uploaded report files
  app.use("/uploads/reports", (req, res, next) => {
    const express = require("express");
    express.static(uploadDir)(req, res, next);
  });

  // Serve uploaded registration documents
  app.use("/uploads/documents", (req, res, next) => {
    const express = require("express");
    express.static(docUploadDir)(req, res, next);
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

  return httpServer;
}
