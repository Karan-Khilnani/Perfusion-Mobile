import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, timestamp, varchar, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User role type - now includes admin
export type UserRole = "care_seeker" | "provider" | "admin";

// Provider verification status
export type ProviderStatus = "pending" | "verified" | "rejected" | "suspended";

// User approval status (for registration approval by admin)
export type UserApprovalStatus = "pending" | "approved" | "rejected";

// Session storage table for express-session with connect-pg-simple
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

// User storage table with password for standalone auth
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique().notNull(),
  password: varchar("password", { length: 255 }),
  googleId: varchar("google_id", { length: 255 }),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role", { length: 20 }).default("care_seeker").$type<UserRole>(),
  isActive: boolean("is_active").default(true),
  emailVerified: boolean("email_verified").default(false),
  verificationCode: varchar("verification_code", { length: 6 }),
  verificationCodeExpiresAt: timestamp("verification_code_expires_at"),
  phone: varchar("phone", { length: 20 }),
  hospitalName: varchar("hospital_name", { length: 255 }),
  hospitalAddress: varchar("hospital_address", { length: 500 }),
  hospitalRegistrationNo: varchar("hospital_registration_no", { length: 100 }),
  hospitalRegisteredOrg: varchar("hospital_registered_org", { length: 255 }),
  registrationDocumentUrl: varchar("registration_document_url", { length: 500 }),
  approvalStatus: varchar("approval_status", { length: 20 }).default("pending").$type<UserApprovalStatus>(),
  approvalNotes: varchar("approval_notes", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Insert schema for registration
export const insertUserSchema = createInsertSchema(users).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
  isActive: true,
  profileImageUrl: true,
});

// Login schema
export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

// Registration schema
export const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  role: z.enum(["care_seeker", "provider"]).default("care_seeker"),
  hospitalName: z.string().min(2, "Hospital name is required"),
  hospitalAddress: z.string().min(5, "Hospital address is required"),
  hospitalRegistrationNo: z.string().min(1, "Registration number is required"),
  hospitalRegisteredOrg: z.string().min(2, "Registered organization is required"),
  registrationDocumentUrl: z.string().optional(),
  // Provider-specific fields (required when role = provider)
  phone: z.string().optional(),
  providerType: z.enum(["lab", "consultant", "hospital", "transport", "teleradiology"]).optional(),
  description: z.string().optional(),
  location: z.string().optional(),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// Safe user type without sensitive fields for client
export type SafeUser = Omit<User, "password" | "verificationCode" | "verificationCodeExpiresAt">;
