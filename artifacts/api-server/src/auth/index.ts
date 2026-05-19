import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import bcrypt from "bcryptjs";
import { db } from "../db";
import { users, type User, type SafeUser, type UserRole } from "@workspace/db";
import { eq } from "drizzle-orm";

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

export function getSession(): RequestHandler {
  const sessionTtl = 30 * 24 * 60 * 60 * 1000; // 30 days
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: true,
    ttl: sessionTtl,
    tableName: "sessions",
  });

  const isProduction = process.env.NODE_ENV === "production";

  return session({
    secret: process.env.SESSION_SECRET || "development-secret-change-in-production",
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    proxy: true,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      maxAge: sessionTtl,
      sameSite: "lax",
    },
  });
}

export async function setupAuth(app: Express): Promise<void> {
  app.set("trust proxy", 1);
  app.use(getSession());
}

function excludePassword(user: User): SafeUser {
  const { password, verificationCode, verificationCodeExpiresAt, ...safeUser } = user;
  return safeUser as SafeUser;
}

export async function getUserById(id: string): Promise<SafeUser | null> {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user ? excludePassword(user) : null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
  return user || null;
}

export async function createUser(data: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role?: UserRole;
  verificationCode?: string;
  verificationCodeExpiresAt?: Date;
  hospitalName?: string;
  hospitalAddress?: string;
  hospitalRegistrationNo?: string;
  hospitalRegisteredOrg?: string;
  registrationDocumentUrl?: string;
}): Promise<SafeUser> {
  const hashedPassword = await bcrypt.hash(data.password, 10);
  
  const [user] = await db
    .insert(users)
    .values({
      email: data.email.toLowerCase(),
      password: hashedPassword,
      firstName: data.firstName,
      lastName: data.lastName,
      role: data.role || "care_seeker",
      emailVerified: false,
      verificationCode: data.verificationCode,
      verificationCodeExpiresAt: data.verificationCodeExpiresAt,
      hospitalName: data.hospitalName,
      hospitalAddress: data.hospitalAddress,
      hospitalRegistrationNo: data.hospitalRegistrationNo,
      hospitalRegisteredOrg: data.hospitalRegisteredOrg,
      registrationDocumentUrl: data.registrationDocumentUrl,
      approvalStatus: "pending",
    })
    .returning();
  
  return excludePassword(user);
}

export async function setVerificationCode(userId: string, code: string): Promise<void> {
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await db
    .update(users)
    .set({ verificationCode: code, verificationCodeExpiresAt: expiresAt, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

export async function verifyEmailCode(userId: string, code: string): Promise<{ success: boolean; message: string }> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) return { success: false, message: "User not found" };
  if (user.emailVerified) return { success: true, message: "Already verified" };
  if (!user.verificationCode) return { success: false, message: "No verification code found. Please request a new one." };
  if (user.verificationCodeExpiresAt && user.verificationCodeExpiresAt < new Date()) {
    return { success: false, message: "Verification code has expired. Please request a new one." };
  }
  if (user.verificationCode !== code) {
    return { success: false, message: "Invalid verification code" };
  }
  await db
    .update(users)
    .set({ emailVerified: true, verificationCode: null, verificationCodeExpiresAt: null, updatedAt: new Date() })
    .where(eq(users.id, userId));
  return { success: true, message: "Email verified successfully" };
}

export async function getRawUserById(id: string): Promise<User | null> {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user || null;
}

export async function getUserByGoogleId(googleId: string): Promise<User | null> {
  const [user] = await db.select().from(users).where(eq(users.googleId, googleId));
  return user || null;
}

export async function createGoogleUser(data: {
  email: string;
  googleId: string;
  firstName: string;
  lastName: string;
  profileImageUrl?: string;
  role?: UserRole;
}): Promise<SafeUser> {
  const [user] = await db
    .insert(users)
    .values({
      email: data.email.toLowerCase(),
      googleId: data.googleId,
      firstName: data.firstName,
      lastName: data.lastName,
      profileImageUrl: data.profileImageUrl,
      role: data.role,
      emailVerified: true,
      approvalStatus: "pending",
    })
    .returning();
  
  return excludePassword(user);
}

export async function completeUserProfile(userId: string, data: {
  role: UserRole;
  hospitalName: string;
  hospitalAddress: string;
  hospitalRegistrationNo: string;
  hospitalRegisteredOrg?: string;
  registrationDocumentUrl?: string;
  phone?: string;
}): Promise<SafeUser | null> {
  const [user] = await db
    .update(users)
    .set({
      role: data.role,
      hospitalName: data.hospitalName,
      hospitalAddress: data.hospitalAddress,
      hospitalRegistrationNo: data.hospitalRegistrationNo,
      hospitalRegisteredOrg: data.hospitalRegisteredOrg,
      registrationDocumentUrl: data.registrationDocumentUrl,
      phone: data.phone,
      approvalStatus: "pending",
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning();
  return user ? excludePassword(user) : null;
}

export async function linkGoogleId(userId: string, googleId: string, profileImageUrl?: string): Promise<SafeUser | null> {
  const updates: any = { googleId, emailVerified: true, updatedAt: new Date() };
  if (profileImageUrl) updates.profileImageUrl = profileImageUrl;
  const [user] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, userId))
    .returning();
  return user ? excludePassword(user) : null;
}

export async function verifyPassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(plainPassword, hashedPassword);
}

export async function updateUserRole(userId: string, role: UserRole): Promise<SafeUser | null> {
  const [user] = await db
    .update(users)
    .set({ role, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  
  return user ? excludePassword(user) : null;
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  
  const user = await getUserById(req.session.userId);
  if (!user || !user.isActive) {
    req.session.destroy(() => {});
    return res.status(401).json({ message: "Unauthorized" });
  }

  if (!user.emailVerified && !user.googleId) {
    return res.status(403).json({ message: "Email not verified", needsVerification: true });
  }

  if (user.approvalStatus === "pending" && user.role !== "admin") {
    return res.status(403).json({ message: "Your registration is pending admin approval", needsApproval: true });
  }

  if (user.approvalStatus === "rejected" && user.role !== "admin") {
    return res.status(403).json({ message: "Your registration has been rejected. Please contact support.", registrationRejected: true });
  }
  
  (req as any).user = user;
  next();
};

export const isAdmin: RequestHandler = async (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  
  const user = await getUserById(req.session.userId);
  if (!user || !user.isActive) {
    req.session.destroy(() => {});
    return res.status(401).json({ message: "Unauthorized" });
  }
  
  if (user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  
  (req as any).user = user;
  next();
};

export const isProvider: RequestHandler = async (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  
  const user = await getUserById(req.session.userId);
  if (!user || !user.isActive) {
    req.session.destroy(() => {});
    return res.status(401).json({ message: "Unauthorized" });
  }
  
  if (user.role !== "provider" && user.role !== "admin") {
    return res.status(403).json({ message: "Provider access required" });
  }
  
  (req as any).user = user;
  next();
};

export const isUser: RequestHandler = async (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  
  const user = await getUserById(req.session.userId);
  if (!user || !user.isActive) {
    req.session.destroy(() => {});
    return res.status(401).json({ message: "Unauthorized" });
  }
  
  if (user.role !== "care_seeker" && user.role !== "admin") {
    return res.status(403).json({ message: "User access required" });
  }
  
  (req as any).user = user;
  next();
};

export { excludePassword };
