import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Re-export auth models
export * from "./models/auth";

// Provider types
export type ProviderType = "lab" | "consultant" | "hospital" | "transport" | "teleradiology";

// Slot series — one time window for a set of weekdays
export type SlotSeries = { days: string[]; from: string; to: string };

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
  registeredOrganization: varchar("registered_organization", { length: 255 }),
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
  registrationNumber: varchar("registration_number", { length: 100 }),
  registeredOrganization: varchar("registered_organization", { length: 255 }),
  registrationDocumentUrl: varchar("registration_document_url", { length: 500 }),
  approvalStatus: varchar("approval_status", { length: 20 }).default("pending").$type<SuggestionStatus>(),
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
  customerPrice: decimal("customer_price", { precision: 10, scale: 2 }),
  marginOverride: decimal("margin_override", { precision: 5, scale: 2 }),
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
  followUpFee: decimal("follow_up_fee", { precision: 10, scale: 2 }),
  customerPrice: decimal("customer_price", { precision: 10, scale: 2 }),
  marginOverride: decimal("margin_override", { precision: 5, scale: 2 }),
  availableSlots: text("available_slots").array(),
  availabilityFrom: text("availability_from"),
  availabilityTo: text("availability_to"),
  availableDays: text("available_days").array(),
  slotSeries: jsonb("slot_series").$type<SlotSeries[]>(),
  registrationNumber: varchar("registration_number", { length: 100 }),
  registeredOrganization: varchar("registered_organization", { length: 255 }),
  registrationDocumentUrl: varchar("registration_document_url", { length: 500 }),
  photoUrl: text("photo_url"),
  digitalSignatureUrl: text("digital_signature_url"),
  affiliatedInstitution: varchar("affiliated_institution", { length: 255 }),
  portfolio: text("portfolio"),
  approvalStatus: varchar("approval_status", { length: 20 }).default("pending").$type<SuggestionStatus>(),
  status: varchar("status", { length: 20 }).default("active").$type<ServiceStatus>(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Emergency Teams table
export const emergencyTeams = pgTable("emergency_teams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerId: varchar("provider_id"),
  teamLeadName: varchar("team_lead_name", { length: 255 }).notNull(),
  qualification: varchar("qualification", { length: 255 }).notNull(),
  department: varchar("department", { length: 255 }).notNull(),
  consultationFee: decimal("consultation_fee", { precision: 10, scale: 2 }).notNull(),
  customerPrice: decimal("customer_price", { precision: 10, scale: 2 }),
  marginOverride: decimal("margin_override", { precision: 5, scale: 2 }),
  rating: decimal("rating", { precision: 2, scale: 1 }).default("4.0"),
  registrationNumber: varchar("registration_number", { length: 100 }),
  registeredOrganization: varchar("registered_organization", { length: 255 }),
  registrationDocumentUrl: varchar("registration_document_url", { length: 500 }),
  approvalStatus: varchar("approval_status", { length: 20 }).default("pending").$type<SuggestionStatus>(),
  status: varchar("status", { length: 20 }).default("active").$type<ServiceStatus>(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Radiology Modalities table
export const radiologyModalities = pgTable("radiology_modalities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  category: varchar("category", { length: 100 }),
  cost: decimal("cost", { precision: 10, scale: 2 }),
  turnaroundTime: varchar("turnaround_time", { length: 50 }),
  status: varchar("status", { length: 20 }).default("active").$type<ServiceStatus>(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Provider-LabTest junction table - which provider is enabled for which test
export const providerLabTests = pgTable("provider_lab_tests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerId: varchar("provider_id").notNull(),
  labTestId: varchar("lab_test_id").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  turnaroundTime: varchar("turnaround_time", { length: 50 }),
  registrationNumber: varchar("registration_number", { length: 100 }),
  registeredOrganization: varchar("registered_organization", { length: 255 }),
  registrationDocumentUrl: varchar("registration_document_url", { length: 500 }),
  approvalStatus: varchar("approval_status", { length: 20 }).default("pending").$type<SuggestionStatus>(),
  isActive: boolean("is_active").default(true),
  tatHidden: boolean("tat_hidden").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Suggested Lab Tests - providers suggest new tests for admin approval
export type SuggestionStatus = "pending" | "approved" | "rejected";

export const suggestedLabTests = pgTable("suggested_lab_tests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerId: varchar("provider_id").notNull(),
  testName: varchar("test_name", { length: 255 }).notNull(),
  description: text("description"),
  suggestedPrice: decimal("suggested_price", { precision: 10, scale: 2 }),
  status: varchar("status", { length: 20 }).default("pending").$type<SuggestionStatus>(),
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at").defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
});

// Provider-Modality junction table - which provider is enabled for which modality
export const providerModalities = pgTable("provider_modalities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerId: varchar("provider_id").notNull(),
  modalityId: varchar("modality_id").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  turnaroundTime: varchar("turnaround_time", { length: 50 }),
  registrationNumber: varchar("registration_number", { length: 100 }),
  registeredOrganization: varchar("registered_organization", { length: 255 }),
  registrationDocumentUrl: varchar("registration_document_url", { length: 500 }),
  approvalStatus: varchar("approval_status", { length: 20 }).default("pending").$type<SuggestionStatus>(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Suggested Modalities - providers suggest new modalities for admin approval
export const suggestedModalities = pgTable("suggested_modalities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerId: varchar("provider_id").notNull(),
  modalityName: varchar("modality_name", { length: 255 }).notNull(),
  description: text("description"),
  suggestedPrice: decimal("suggested_price", { precision: 10, scale: 2 }),
  status: varchar("status", { length: 20 }).default("pending").$type<SuggestionStatus>(),
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at").defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
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
export type PaymentStatus = "pending" | "partial" | "paid" | "overdue";

// Bookings table
export const bookings = pgTable("bookings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingNumber: varchar("booking_number", { length: 30 }),
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
  patientWeight: varchar("patient_weight", { length: 20 }),
  patientAllergies: text("patient_allergies"),
  patientAllergyNotSpecified: boolean("patient_allergy_not_specified").default(true),
  uhidIpNumber: varchar("uhid_ip_number", { length: 100 }),
  onCallDoctorName: varchar("on_call_doctor_name", { length: 255 }),
  onCallDoctorDesignation: varchar("on_call_doctor_designation", { length: 255 }),
  referringPhysician: varchar("referring_physician", { length: 255 }),
  clinicalSummary: text("clinical_summary"),
  provisionalDiagnosis: text("provisional_diagnosis"),
  ipdNumber: varchar("ipd_number", { length: 50 }),
  bedNumber: varchar("bed_number", { length: 50 }),
  documentUrls: text("document_urls").array(),
  treatmentChartUrls: text("treatment_chart_urls").array(),
  examination: text("examination"),
  investigations: text("investigations"),
  // Appointment and payment
  appointmentSlot: varchar("appointment_slot", { length: 100 }),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  status: varchar("status", { length: 30 }).notNull().default("booked").$type<BookingStatus>(),
  paymentStatus: varchar("payment_status", { length: 20 }).default("paid").$type<PaymentStatus>(),
  basePrice: decimal("base_price", { precision: 10, scale: 2 }),
  marginPercent: decimal("margin_percent", { precision: 5, scale: 2 }).default("15.00"),
  marginAmount: decimal("margin_amount", { precision: 10, scale: 2 }),
  paymentMethod: varchar("payment_method", { length: 30 }),
  amountPaid: decimal("amount_paid", { precision: 10, scale: 2 }).default("0"),
  dueDate: timestamp("due_date"),
  paidAt: timestamp("paid_at"),
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
  processedReportUrl: varchar("processed_report_url", { length: 500 }),
  reportNotes: text("report_notes"),
  // Prescription fields (for consultation bookings)
  prescriptionDiagnosis: text("prescription_diagnosis"),
  prescriptionMedications: text("prescription_medications"),
  prescriptionAdvice: text("prescription_advice"),
  prescriptionPhysicianNotes: text("prescription_physician_notes"),
  prescriptionFollowUp: varchar("prescription_follow_up", { length: 255 }),
  prescriptionGeneratedAt: timestamp("prescription_generated_at"),
  prescriptionApprovedAt: timestamp("prescription_approved_at"),
  prescriptionApprovedByUserId: varchar("prescription_approved_by_user_id", { length: 255 }),
  prescriptionApproverIp: varchar("prescription_approver_ip", { length: 100 }),
  prescriptionOtpVerified: boolean("prescription_otp_verified").default(false),
  prescriptionPdfUrl: varchar("prescription_pdf_url", { length: 500 }),
  dashboardHiddenAt: timestamp("dashboard_hidden_at"),
  reminderFiredAt: timestamp("reminder_fired_at"),
  callWindowExtendedUntil: timestamp("call_window_extended_until"),
  razorpayOrderId: varchar("razorpay_order_id", { length: 255 }),
  razorpayPaymentId: varchar("razorpay_payment_id", { length: 255 }),
  // Callback contact for cellular calls (ward phone selected at booking time)
  callbackPhone: varchar("callback_phone", { length: 20 }),
  callbackWardName: varchar("callback_ward_name", { length: 100 }),
  // Follow-up consultation tracking
  isFollowUp: boolean("is_follow_up").default(false),
  parentBookingId: varchar("parent_booking_id", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Booking Sequences table (for custom booking number generation)
export const bookingSequences = pgTable("booking_sequences", {
  financialYear: varchar("financial_year", { length: 10 }).primaryKey(),
  sequence: integer("sequence").notNull().default(0),
});

// Platform Settings table
export const platformSettings = pgTable("platform_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  settingKey: varchar("setting_key", { length: 100 }).notNull().unique(),
  settingValue: varchar("setting_value", { length: 255 }).notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Audit Log table
export const auditLog = pgTable("audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  action: varchar("action", { length: 100 }).notNull(),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  entityId: varchar("entity_id", { length: 255 }),
  details: text("details"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Insert schemas
export const insertProviderSchema = createInsertSchema(providers).omit({ id: true, createdAt: true });
export const insertLabSchema = createInsertSchema(labs).omit({ id: true });
export const insertLabTestSchema = createInsertSchema(labTests).omit({ id: true, createdAt: true });
export const insertConsultantSchema = createInsertSchema(consultants).omit({ id: true, createdAt: true });
export const insertEmergencyTeamSchema = createInsertSchema(emergencyTeams).omit({ id: true, createdAt: true });
export const insertRadiologyModalitySchema = createInsertSchema(radiologyModalities).omit({ id: true, createdAt: true });
export const insertProviderLabTestSchema = createInsertSchema(providerLabTests).omit({ id: true, createdAt: true });
export const insertSuggestedLabTestSchema = createInsertSchema(suggestedLabTests).omit({ id: true, createdAt: true, reviewedAt: true });
export const insertProviderModalitySchema = createInsertSchema(providerModalities).omit({ id: true, createdAt: true });
export const insertSuggestedModalitySchema = createInsertSchema(suggestedModalities).omit({ id: true, createdAt: true, reviewedAt: true });
export const insertHospitalSchema = createInsertSchema(hospitals).omit({ id: true });
export const insertCriticalCareDoctorSchema = createInsertSchema(criticalCareDoctors).omit({ id: true });
export const insertReferralHospitalSchema = createInsertSchema(referralHospitals).omit({ id: true });
export const insertTransportServiceSchema = createInsertSchema(transportServices).omit({ id: true });
export const insertBookingSchema = createInsertSchema(bookings).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPlatformSettingSchema = createInsertSchema(platformSettings).omit({ id: true, updatedAt: true });
export const insertAuditLogSchema = createInsertSchema(auditLog).omit({ id: true, createdAt: true });

// Types
export type InsertProvider = z.infer<typeof insertProviderSchema>;
export type Provider = typeof providers.$inferSelect;

export type InsertLab = z.infer<typeof insertLabSchema>;
export type Lab = typeof labs.$inferSelect;

export type InsertLabTest = z.infer<typeof insertLabTestSchema>;
export type LabTest = typeof labTests.$inferSelect;

export type InsertConsultant = z.infer<typeof insertConsultantSchema>;
export type Consultant = typeof consultants.$inferSelect;

export type InsertEmergencyTeam = z.infer<typeof insertEmergencyTeamSchema>;
export type EmergencyTeam = typeof emergencyTeams.$inferSelect;

export type InsertRadiologyModality = z.infer<typeof insertRadiologyModalitySchema>;
export type RadiologyModality = typeof radiologyModalities.$inferSelect;

export type InsertProviderLabTest = z.infer<typeof insertProviderLabTestSchema>;
export type ProviderLabTest = typeof providerLabTests.$inferSelect;

export type InsertSuggestedLabTest = z.infer<typeof insertSuggestedLabTestSchema>;
export type SuggestedLabTest = typeof suggestedLabTests.$inferSelect;

export type InsertProviderModality = z.infer<typeof insertProviderModalitySchema>;
export type ProviderModality = typeof providerModalities.$inferSelect;

export type InsertSuggestedModality = z.infer<typeof insertSuggestedModalitySchema>;
export type SuggestedModality = typeof suggestedModalities.$inferSelect;

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

export type PlatformSetting = typeof platformSettings.$inferSelect;
export type InsertPlatformSetting = z.infer<typeof insertPlatformSettingSchema>;
export type AuditLog = typeof auditLog.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;

// Seeker Ward Contacts — phone numbers per ward/area saved by care seekers
export const seekerWardContacts = pgTable("seeker_ward_contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  wardName: varchar("ward_name", { length: 100 }).notNull(),
  phoneNumber: varchar("phone_number", { length: 20 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSeekerWardContactSchema = createInsertSchema(seekerWardContacts).omit({ id: true, createdAt: true });
export type InsertSeekerWardContact = z.infer<typeof insertSeekerWardContactSchema>;
export type SeekerWardContact = typeof seekerWardContacts.$inferSelect;

// Push subscriptions for PWA notifications
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPushSubscriptionSchema = createInsertSchema(pushSubscriptions).omit({ id: true, createdAt: true });
export type InsertPushSubscription = z.infer<typeof insertPushSubscriptionSchema>;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;

// Consultant Slot Overrides — per-date pauses or custom time windows
export const consultantSlotOverrides = pgTable("consultant_slot_overrides", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  consultantId: varchar("consultant_id").notNull(),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
  isPaused: boolean("is_paused").default(false).notNull(),
  customFrom: text("custom_from"),
  customTo: text("custom_to"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertConsultantSlotOverrideSchema = createInsertSchema(consultantSlotOverrides).omit({ id: true, createdAt: true });
export type InsertConsultantSlotOverride = z.infer<typeof insertConsultantSlotOverrideSchema>;
export type ConsultantSlotOverride = typeof consultantSlotOverrides.$inferSelect;

// Call Sessions — persisted in DB so all autoscale instances share state
export const callSessionsTable = pgTable("call_sessions", {
  bookingId: varchar("booking_id").primaryKey(),
  callerId: varchar("caller_id").notNull(),
  callerName: varchar("caller_name", { length: 255 }).notNull(),
  callerRole: varchar("caller_role", { length: 20 }).notNull(),
  recipientUserId: varchar("recipient_user_id").notNull(),
  videoRoomUrl: text("video_room_url").notNull(),
  serviceName: varchar("service_name", { length: 255 }).notNull().default(""),
  subtitle: varchar("subtitle", { length: 255 }).notNull().default(""),
  status: varchar("status", { length: 20 }).notNull().default("ringing"),
  twilioCallSid: varchar("twilio_call_sid", { length: 100 }),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type DbCallSession = typeof callSessionsTable.$inferSelect;
export type InsertDbCallSession = typeof callSessionsTable.$inferInsert;

// Mobile push tokens for FCM/APNs (Expo push)
export const mobilePushTokens = pgTable("mobile_push_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  token: text("token").notNull(),
  platform: varchar("platform", { length: 10 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertMobilePushTokenSchema = createInsertSchema(mobilePushTokens).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMobilePushToken = z.infer<typeof insertMobilePushTokenSchema>;
export type MobilePushToken = typeof mobilePushTokens.$inferSelect;

// Call Logs — records of Exotel-bridged phone calls per booking
export type CallLogStatus = "initiated" | "completed" | "failed";

export const callLogs = pgTable("call_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingId: varchar("booking_id").notNull(),
  initiatorUserId: varchar("initiator_user_id").notNull(),
  callerRole: varchar("caller_role", { length: 20 }).notNull(),
  exotelCallSid: varchar("exotel_call_sid", { length: 255 }),
  status: varchar("status", { length: 50 }).notNull().default("initiated").$type<CallLogStatus>(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type CallLog = typeof callLogs.$inferSelect;
export type InsertCallLog = typeof callLogs.$inferInsert;

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
