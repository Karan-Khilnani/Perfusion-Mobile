import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Re-export auth models
export * from "./models/auth";

// Provider types
export type ProviderType = "lab" | "consultant" | "hospital" | "transport";

// Import ProviderStatus from auth
import { ProviderStatus } from "./models/auth";

// Providers table - for service provider accounts
export const providers = pgTable("providers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  type: varchar("type", { length: 20 }).notNull().$type<ProviderType>(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  location: varchar("location", { length: 255 }),
  address: text("address"),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 255 }),
  licenseNumber: varchar("license_number", { length: 100 }),
  verificationStatus: varchar("verification_status", { length: 20 }).default("pending").$type<ProviderStatus>(),
  verificationNotes: text("verification_notes"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Labs table
export const labs = pgTable("labs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerId: varchar("provider_id"),
  name: varchar("name", { length: 255 }).notNull(),
  location: varchar("location", { length: 255 }).notNull(),
  description: text("description"),
  rating: decimal("rating", { precision: 2, scale: 1 }).default("4.0"),
  isActive: boolean("is_active").default(true),
});

// Service status type for items that can be paused/deleted
export type ServiceStatus = "active" | "paused" | "deleted";

// Lab tests offered - direct catalog (no provider dependency)
export const labTests = pgTable("lab_tests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  labId: varchar("lab_id"),
  testName: varchar("test_name", { length: 255 }).notNull(),
  category: varchar("category", { length: 100 }),
  cost: decimal("cost", { precision: 10, scale: 2 }).notNull(),
  turnaroundTime: varchar("turnaround_time", { length: 50 }).notNull(),
  accuracyRating: decimal("accuracy_rating", { precision: 3, scale: 2 }),
  status: varchar("status", { length: 20 }).default("active").$type<ServiceStatus>(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Consultants table
export const consultants = pgTable("consultants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerId: varchar("provider_id"),
  name: varchar("name", { length: 255 }).notNull(),
  qualification: varchar("qualification", { length: 255 }).notNull(),
  specialization: varchar("specialization", { length: 255 }),
  yearsExperience: integer("years_experience").notNull(),
  rating: decimal("rating", { precision: 2, scale: 1 }).default("4.0"),
  consultationFee: decimal("consultation_fee", { precision: 10, scale: 2 }).notNull(),
  availableSlots: text("available_slots").array(),
  status: varchar("status", { length: 20 }).default("active").$type<ServiceStatus>(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Radiology Modalities table
export const radiologyModalities = pgTable("radiology_modalities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  category: varchar("category", { length: 100 }),
  status: varchar("status", { length: 20 }).default("active").$type<ServiceStatus>(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Hospitals (Emergency & Critical Care)
export const hospitals = pgTable("hospitals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerId: varchar("provider_id"),
  name: varchar("name", { length: 255 }).notNull(),
  location: varchar("location", { length: 255 }).notNull(),
  teamStrength: integer("team_strength").notNull(),
  emergencyResponseTime: varchar("emergency_response_time", { length: 50 }).notNull(),
  rating: decimal("rating", { precision: 2, scale: 1 }).default("4.0"),
  icuCapability: boolean("icu_capability").default(true),
  isActive: boolean("is_active").default(true),
});

// Critical Care Doctors
export const criticalCareDoctors = pgTable("critical_care_doctors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id"),
  name: varchar("name", { length: 255 }).notNull(),
  qualification: varchar("qualification", { length: 255 }).notNull(),
  yearsExperience: integer("years_experience").notNull(),
  responseTime: varchar("response_time", { length: 50 }).notNull(),
  rating: decimal("rating", { precision: 2, scale: 1 }).default("4.0"),
  isActive: boolean("is_active").default(true),
});

// Referral Hospitals - hospitals that accept referrals
export const referralHospitals = pgTable("referral_hospitals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  location: varchar("location", { length: 255 }).notNull(),
  departments: text("departments").array(),
  diagnoses: text("diagnoses").array(),
  supportMechanicalVentilation: boolean("support_mechanical_ventilation").default(false),
  supportEcmo: boolean("support_ecmo").default(false),
  supportCrrt: boolean("support_crrt").default(false),
  rating: decimal("rating", { precision: 2, scale: 1 }).default("4.0"),
  contactPhone: varchar("contact_phone", { length: 20 }),
  isActive: boolean("is_active").default(true),
});

// Transport Services - ambulance providers
export const transportServices = pgTable("transport_services", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerId: varchar("provider_id"),
  name: varchar("name", { length: 255 }).notNull(),
  location: varchar("location", { length: 255 }).notNull(),
  serviceType: varchar("service_type", { length: 50 }).notNull(), // BLS, ALS
  transportMode: varchar("transport_mode", { length: 50 }).notNull(), // road, air
  hasCloudPhysician: boolean("has_cloud_physician").default(false),
  rating: decimal("rating", { precision: 2, scale: 1 }).default("4.0"),
  baseCost: decimal("base_cost", { precision: 10, scale: 2 }).notNull(),
  isActive: boolean("is_active").default(true),
});

// Booking status type
export type BookingStatus = "booked" | "sample_collected" | "processing" | "report_ready" | "completed" | "cancelled" | "in_transit" | "arrived";
export type BookingType = "lab" | "consultation" | "teleradiology";
export type PatientGender = "male" | "female" | "other";
export type UrgencyType = "routine" | "emergency";

// Bookings table
export const bookings = pgTable("bookings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  bookingType: varchar("booking_type", { length: 20 }).notNull().$type<BookingType>(),
  serviceId: varchar("service_id").notNull(),
  serviceName: varchar("service_name", { length: 255 }).notNull(),
  providerId: varchar("provider_id"),
  providerName: varchar("provider_name", { length: 255 }),
  // Patient details
  patientName: varchar("patient_name", { length: 255 }).notNull(),
  patientAge: integer("patient_age").notNull(),
  patientGender: varchar("patient_gender", { length: 10 }).$type<PatientGender>(),
  patientContact: varchar("patient_contact", { length: 20 }),
  clinicalSummary: text("clinical_summary"),
  provisionalDiagnosis: text("provisional_diagnosis"),
  documentUrls: text("document_urls").array(),
  // Appointment and payment
  appointmentSlot: varchar("appointment_slot", { length: 100 }),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  status: varchar("status", { length: 30 }).notNull().default("booked").$type<BookingStatus>(),
  paymentStatus: varchar("payment_status", { length: 20 }).default("paid"),
  // Consultation-specific: video room
  videoRoomId: varchar("video_room_id", { length: 255 }),
  // Teleradiology-specific fields
  modalityId: varchar("modality_id"),
  modalityName: varchar("modality_name", { length: 255 }),
  accessionNumber: varchar("accession_number", { length: 100 }),
  urgency: varchar("urgency", { length: 20 }).$type<UrgencyType>(),
  imageUrls: text("image_urls").array(),
  // Report fields (for providers to upload, seekers to download)
  reportUrl: varchar("report_url", { length: 500 }),
  reportNotes: text("report_notes"),
  // Prescription fields (for consultation bookings)
  prescriptionDiagnosis: text("prescription_diagnosis"),
  prescriptionMedications: text("prescription_medications"),
  prescriptionAdvice: text("prescription_advice"),
  prescriptionFollowUp: varchar("prescription_follow_up", { length: 255 }),
  prescriptionGeneratedAt: timestamp("prescription_generated_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Insert schemas
export const insertProviderSchema = createInsertSchema(providers).omit({ id: true, createdAt: true });
export const insertLabSchema = createInsertSchema(labs).omit({ id: true });
export const insertLabTestSchema = createInsertSchema(labTests).omit({ id: true, createdAt: true });
export const insertConsultantSchema = createInsertSchema(consultants).omit({ id: true, createdAt: true });
export const insertRadiologyModalitySchema = createInsertSchema(radiologyModalities).omit({ id: true, createdAt: true });
export const insertHospitalSchema = createInsertSchema(hospitals).omit({ id: true });
export const insertCriticalCareDoctorSchema = createInsertSchema(criticalCareDoctors).omit({ id: true });
export const insertReferralHospitalSchema = createInsertSchema(referralHospitals).omit({ id: true });
export const insertTransportServiceSchema = createInsertSchema(transportServices).omit({ id: true });
export const insertBookingSchema = createInsertSchema(bookings).omit({ id: true, createdAt: true, updatedAt: true });

// Types
export type InsertProvider = z.infer<typeof insertProviderSchema>;
export type Provider = typeof providers.$inferSelect;

export type InsertLab = z.infer<typeof insertLabSchema>;
export type Lab = typeof labs.$inferSelect;

export type InsertLabTest = z.infer<typeof insertLabTestSchema>;
export type LabTest = typeof labTests.$inferSelect;

export type InsertConsultant = z.infer<typeof insertConsultantSchema>;
export type Consultant = typeof consultants.$inferSelect;

export type InsertRadiologyModality = z.infer<typeof insertRadiologyModalitySchema>;
export type RadiologyModality = typeof radiologyModalities.$inferSelect;

export type InsertHospital = z.infer<typeof insertHospitalSchema>;
export type Hospital = typeof hospitals.$inferSelect;

export type InsertCriticalCareDoctor = z.infer<typeof insertCriticalCareDoctorSchema>;
export type CriticalCareDoctor = typeof criticalCareDoctors.$inferSelect;

export type InsertReferralHospital = z.infer<typeof insertReferralHospitalSchema>;
export type ReferralHospital = typeof referralHospitals.$inferSelect;

export type InsertTransportService = z.infer<typeof insertTransportServiceSchema>;
export type TransportService = typeof transportServices.$inferSelect;

export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type Booking = typeof bookings.$inferSelect;

// Search/filter types
export interface LabSearchParams {
  location?: string;
  testName?: string;
  sortBy?: "cost" | "turnaroundTime" | "accuracyRating";
  sortOrder?: "asc" | "desc";
}

export interface ConsultantSearchParams {
  specialization?: string;
  sortBy?: "rating" | "cost" | "availability";
  sortOrder?: "asc" | "desc";
}

export interface HospitalSearchParams {
  location?: string;
  sortBy?: "rating" | "responseTime" | "teamStrength";
  sortOrder?: "asc" | "desc";
}

export interface ReferralHospitalSearchParams {
  location?: string;
  department?: string;
  diagnosis?: string;
  supportMechanicalVentilation?: boolean;
  supportEcmo?: boolean;
  supportCrrt?: boolean;
}
