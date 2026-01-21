import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, isAdmin, isProvider, updateUserRole } from "./auth";
import { registerAuthRoutes } from "./auth/routes";
import type { BookingStatus, UserRole, ProviderType, ProviderStatus } from "@shared/schema";

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
      
      const labData = { ...req.body, providerId: provider.id };
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
      
      const consultantData = { ...req.body, providerId: provider.id };
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

  // Labs
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

  // Lab Tests
  app.post("/api/lab-tests", isAuthenticated, async (req, res) => {
    try {
      const test = await storage.createLabTest(req.body);
      res.status(201).json(test);
    } catch (error) {
      console.error("Error creating lab test:", error);
      res.status(500).json({ message: "Failed to create lab test" });
    }
  });

  // Consultants
  app.get("/api/consultants", async (req, res) => {
    try {
      const consultants = await storage.getConsultants();
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
      
      const booking = await storage.createBooking(bookingData);
      res.status(201).json(booking);
    } catch (error) {
      console.error("Error creating booking:", error);
      res.status(500).json({ message: "Failed to create booking" });
    }
  });

  app.patch("/api/bookings/:id/status", isAuthenticated, async (req, res) => {
    try {
      const { status } = req.body as { status: BookingStatus };
      const booking = await storage.updateBookingStatus(req.params.id, status);
      
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }
      
      res.json(booking);
    } catch (error) {
      console.error("Error updating booking status:", error);
      res.status(500).json({ message: "Failed to update booking status" });
    }
  });

  // Provider endpoints
  app.get("/api/provider/bookings", isAuthenticated, async (req: any, res) => {
    try {
      const bookings = await storage.getAllBookings();
      res.json(bookings);
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

  return httpServer;
}
