import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Re-export auth models
export * from "./models/auth";

// Provider types
export type ProviderType = "lab" | "consultant" | "hospital";

// Providers table - for service provider accounts
export const providers = pgTable("providers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  type: varchar("type", { length: 20 }).notNull().$type<ProviderType>(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  location: varchar("location", { length: 255 }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
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

// Lab tests offered
export const labTests = pgTable("lab_tests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  labId: varchar("lab_id").notNull(),
  testName: varchar("test_name", { length: 255 }).notNull(),
  cost: decimal("cost", { precision: 10, scale: 2 }).notNull(),
  turnaroundTime: varchar("turnaround_time", { length: 50 }).notNull(),
  accuracyRating: decimal("accuracy_rating", { precision: 2, scale: 1 }).default("4.5"),
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
  isActive: boolean("is_active").default(true),
});

// Hospitals (Critical Care)
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

// Booking status type
export type BookingStatus = "booked" | "sample_collected" | "processing" | "report_ready" | "completed" | "cancelled";
export type BookingType = "lab" | "consultation" | "critical_care";

// Bookings table
export const bookings = pgTable("bookings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  bookingType: varchar("booking_type", { length: 20 }).notNull().$type<BookingType>(),
  serviceId: varchar("service_id").notNull(),
  serviceName: varchar("service_name", { length: 255 }).notNull(),
  providerName: varchar("provider_name", { length: 255 }).notNull(),
  patientName: varchar("patient_name", { length: 255 }).notNull(),
  patientAge: integer("patient_age").notNull(),
  provisionalDiagnosis: text("provisional_diagnosis"),
  orderingPhysician: varchar("ordering_physician", { length: 255 }),
  appointmentSlot: varchar("appointment_slot", { length: 100 }),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  status: varchar("status", { length: 30 }).notNull().default("booked").$type<BookingStatus>(),
  paymentStatus: varchar("payment_status", { length: 20 }).default("paid"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Insert schemas
export const insertProviderSchema = createInsertSchema(providers).omit({ id: true, createdAt: true });
export const insertLabSchema = createInsertSchema(labs).omit({ id: true });
export const insertLabTestSchema = createInsertSchema(labTests).omit({ id: true });
export const insertConsultantSchema = createInsertSchema(consultants).omit({ id: true });
export const insertHospitalSchema = createInsertSchema(hospitals).omit({ id: true });
export const insertCriticalCareDoctorSchema = createInsertSchema(criticalCareDoctors).omit({ id: true });
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

export type InsertHospital = z.infer<typeof insertHospitalSchema>;
export type Hospital = typeof hospitals.$inferSelect;

export type InsertCriticalCareDoctor = z.infer<typeof insertCriticalCareDoctorSchema>;
export type CriticalCareDoctor = typeof criticalCareDoctors.$inferSelect;

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
