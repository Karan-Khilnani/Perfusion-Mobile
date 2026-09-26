import { boolean, integer, pgTable, text, timestamp, varchar, uniqueIndex, index, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const caseFileProfiles = pgTable("case_file_profiles", {
  id: varchar("id").primaryKey(),
  patientUserId: varchar("patient_user_id").notNull().unique(),
  allergies: text("allergies"),
  comorbidities: text("comorbidities"),
  baselineMedications: text("baseline_medications"),
  baselineParameters: text("baseline_parameters"),
  pastAdmissions: text("past_admissions"),
  emergencyContact: text("emergency_contact"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const caseFileSummaries = pgTable("case_file_summaries", {
  id: varchar("id").primaryKey(),
  bookingId: varchar("booking_id").notNull().unique(),
  allergies: text("allergies"),
  comorbidities: text("comorbidities"),
  presentingComplaint: text("presenting_complaint"),
  presentIllness: text("present_illness"),
  workingDiagnosis: text("working_diagnosis"),
  clinicalHistory: text("clinical_history"),
  submittedByUserId: varchar("submitted_by_user_id"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const caseFileMessages = pgTable("case_file_messages", {
  id: varchar("id").primaryKey(),
  bookingId: varchar("booking_id").notNull(),
  senderUserId: varchar("sender_user_id").notNull(),
  senderRole: varchar("sender_role", { length: 30 }).notNull(),
  kind: varchar("kind", { length: 40 }).notNull().default("text"),
  body: text("body"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  bookingCreatedIdx: index("case_file_messages_booking_created_idx").on(table.bookingId, table.createdAt),
}));

export const caseFileAttachments = pgTable("case_file_attachments", {
  id: varchar("id").primaryKey(),
  bookingId: varchar("booking_id").notNull(),
  messageId: varchar("message_id"),
  uploaderUserId: varchar("uploader_user_id").notNull(),
  uploaderRole: varchar("uploader_role", { length: 30 }).notNull(),
  originalFilename: varchar("original_filename", { length: 255 }),
  mimeType: varchar("mime_type", { length: 150 }),
  byteSize: integer("byte_size"),
  objectPath: text("object_path"),
  legacyUrl: text("legacy_url"),
  source: varchar("source", { length: 40 }).notNull().default("document"),
  category: varchar("category", { length: 40 }).notNull().default("uncategorized"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  bookingCreatedIdx: index("case_file_attachments_booking_created_idx").on(table.bookingId, table.createdAt),
}));

export const caseFileVitals = pgTable("case_file_vitals", {
  id: varchar("id").primaryKey(),
  bookingId: varchar("booking_id").notNull(),
  recordedByUserId: varchar("recorded_by_user_id").notNull(),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  systolicBp: integer("systolic_bp"),
  diastolicBp: integer("diastolic_bp"),
  heartRate: integer("heart_rate"),
  respiratoryRate: integer("respiratory_rate"),
  intake: doublePrecision("intake"),
  output: doublePrecision("output"),
  hourlyUrineOutput: doublePrecision("hourly_urine_output"),
  gcs: integer("gcs"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  bookingObservedIdx: index("case_file_vitals_booking_observed_idx").on(table.bookingId, table.observedAt),
}));

export const caseFileAdvisories = pgTable("case_file_advisories", {
  id: varchar("id").primaryKey(),
  bookingId: varchar("booking_id").notNull(),
  authorUserId: varchar("author_user_id").notNull(),
  narrative: text("narrative").notNull(),
  attachmentIds: text("attachment_ids").array(),
  authoredAt: timestamp("authored_at", { withTimezone: true }).defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  bookingAuthoredIdx: index("case_file_advisories_booking_authored_idx").on(table.bookingId, table.authoredAt),
}));

export const insertCaseFileProfileSchema = createInsertSchema(caseFileProfiles).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCaseFileSummarySchema = createInsertSchema(caseFileSummaries).omit({ id: true, createdAt: true });
export const insertCaseFileMessageSchema = createInsertSchema(caseFileMessages).omit({ id: true, createdAt: true });
export const insertCaseFileAttachmentSchema = createInsertSchema(caseFileAttachments).omit({ id: true, createdAt: true });
export const insertCaseFileVitalSchema = createInsertSchema(caseFileVitals).omit({ id: true, createdAt: true });
export const insertCaseFileAdvisorySchema = createInsertSchema(caseFileAdvisories).omit({ id: true, createdAt: true });

export type CaseFileProfile = typeof caseFileProfiles.$inferSelect;
export type CaseFileSummary = typeof caseFileSummaries.$inferSelect;
export type CaseFileMessage = typeof caseFileMessages.$inferSelect;
export type CaseFileAttachment = typeof caseFileAttachments.$inferSelect;
export type CaseFileVital = typeof caseFileVitals.$inferSelect;
export type CaseFileAdvisory = typeof caseFileAdvisories.$inferSelect;
export type InsertCaseFileProfile = z.infer<typeof insertCaseFileProfileSchema>;
export type InsertCaseFileSummary = z.infer<typeof insertCaseFileSummarySchema>;
export type InsertCaseFileMessage = z.infer<typeof insertCaseFileMessageSchema>;
export type InsertCaseFileAttachment = z.infer<typeof insertCaseFileAttachmentSchema>;
export type InsertCaseFileVital = z.infer<typeof insertCaseFileVitalSchema>;
export type InsertCaseFileAdvisory = z.infer<typeof insertCaseFileAdvisorySchema>;