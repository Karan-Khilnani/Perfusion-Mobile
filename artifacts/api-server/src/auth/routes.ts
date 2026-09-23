import type { Express } from "express";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { 
  isAuthenticated, 
  getUserByEmail, 
  createUser, 
  verifyPassword, 
  getUserById,
  updateUserRole,
  getUserByGoogleId,
  createGoogleUser,
  linkGoogleId,
  setVerificationCode,
  setGooglePasswordSetupCode,
  setGoogleAccountPassword,
  verifyEmailCode,
  getRawUserById,
  completeUserProfile,
} from "./index";
import { loginSchema, registerSchema, type UserRole } from "@workspace/db";
import { z } from "zod/v4";
import { generateVerificationCode, sendVerificationEmail } from "../email";
import { storage } from "../storage";
import { getPool } from "../db";
import { AGREEMENT_VERSION } from "../services/agreement-text";

async function userRequiresAgreement(user: { id: string; role?: string | null; approvalStatus?: string | null }): Promise<boolean> {
  if (!user || user.role === "admin") return false;
  if (user.approvalStatus !== "approved") return false;
  const pool = getPool();
  // If enforcement is paused by admin, no user needs to sign (signed records
  // are kept — this only affects whether unsigned users are prompted).
  const enforcementRow = await pool.query(
    `SELECT setting_value FROM platform_settings WHERE setting_key = 'agreement_enforcement_enabled' LIMIT 1`
  );
  if (enforcementRow.rows.length > 0 && enforcementRow.rows[0].setting_value === "false") {
    return false;
  }
  const result = await pool.query(
    `SELECT 1 FROM user_agreements WHERE user_id = $1 AND agreement_version = $2 LIMIT 1`,
    [user.id, AGREEMENT_VERSION]
  );
  // Fail closed: an approved non-admin user is treated as requiring the
  // agreement unless we can positively confirm a signed row for this version.
  return result.rows.length === 0;
}

function getCallbackURL(req: any): string {
  let protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
  if (protocol.includes(",")) {
    protocol = protocol.split(",")[0].trim();
  }
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  if (!host) {
    const fallback = process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : process.env.APP_URL || "http://localhost:5000";
    return `${fallback}/api/auth/google/callback`;
  }
  const hostClean = host.split(",")[0].trim();
  return `${protocol}://${hostClean}/api/auth/google/callback`;
}

export function registerAuthRoutes(app: Express): void {
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          callbackURL: "/api/auth/google/callback",
          passReqToCallback: true,
        },
        async (req: any, _accessToken: string, _refreshToken: string, profile: any, done: any) => {
          try {
            const email = profile.emails?.[0]?.value;
            if (!email) {
              return done(new Error("No email found in Google profile"));
            }

            const googleId = profile.id;
            const firstName = profile.name?.givenName || profile.displayName?.split(" ")[0] || "";
            const lastName = profile.name?.familyName || profile.displayName?.split(" ").slice(1).join(" ") || "";
            const profileImageUrl = profile.photos?.[0]?.value;

            let existingUser = await getUserByGoogleId(googleId);
            if (existingUser) {
              return done(null, { id: existingUser.id, isNew: false });
            }

            const existingEmailUser = await getUserByEmail(email);
            if (existingEmailUser) {
              await linkGoogleId(existingEmailUser.id, googleId, profileImageUrl);
              return done(null, { id: existingEmailUser.id, isNew: false });
            }

            const newUser = await createGoogleUser({
              email,
              googleId,
              firstName,
              lastName,
              profileImageUrl,
            });

            return done(null, { id: newUser.id, isNew: true });
          } catch (error) {
            return done(error as Error);
          }
        }
      )
    );

    passport.serializeUser((user: any, done) => {
      done(null, user);
    });

    passport.deserializeUser((user: any, done) => {
      done(null, user);
    });

    app.use(passport.initialize());

    app.get(
      "/api/auth/google",
      (req, res, next) => {
        const role = req.query.role as string;
        const state = role ? Buffer.from(JSON.stringify({ role })).toString("base64") : undefined;
        const callbackURL = getCallbackURL(req);
        console.log("Google OAuth redirect with callbackURL:", callbackURL);
        console.log("IMPORTANT: Make sure this callback URL is registered in Google Cloud Console under Authorized redirect URIs:", callbackURL);
        passport.authenticate("google", {
          scope: ["profile", "email"],
          state,
          callbackURL,
          prompt: "select_account",
        } as any)(req, res, next);
      }
    );

    app.get(
      "/api/auth/google/callback",
      (req, res, next) => {
        const callbackURL = getCallbackURL(req);
        console.log("Google OAuth callback with callbackURL:", callbackURL);
        console.log("Google OAuth callback query params:", req.query);
        passport.authenticate("google", {
          session: false,
          callbackURL,
        } as any, (err: any, user: any, info: any) => {
          if (err) {
            console.error("Google OAuth authenticate error:", err);
            return res.redirect("/login?error=google_failed");
          }
          if (!user) {
            console.error("Google OAuth no user returned. Info:", info);
            return res.redirect("/login?error=google_failed");
          }
          req.user = user;
          next();
        })(req, res, next);
      },
      async (req: any, res) => {
        try {
          const googleUser = req.user;
          console.log("Google callback processing user:", { id: googleUser?.id, isNew: googleUser?.isNew });
          if (!googleUser || !googleUser.id) {
            console.error("Google callback: no user id");
            return res.redirect("/login?error=google_failed");
          }

          let role: string | undefined;
          if (req.query.state) {
            try {
              const stateData = JSON.parse(Buffer.from(req.query.state as string, "base64").toString());
              role = stateData.role;
            } catch {}
          }

          req.session.userId = googleUser.id;
          req.session.save(async (err: any) => {
            if (err) {
              console.error("Session save error after Google auth:", err);
              return res.redirect("/login?error=session_failed");
            }

            try {
              if (googleUser.isNew) {
                const roleParam = role ? `?role=${role}` : "";
                console.log("Google callback: new user, redirecting to complete-profile");
                return res.redirect(`/complete-profile${roleParam}`);
              }

              const u = await getUserById(googleUser.id);
              console.log("Google callback: existing user lookup:", { role: u?.role, approvalStatus: u?.approvalStatus, hospitalName: u?.hospitalName });

              if (u && !u.hospitalName && u.approvalStatus === "pending") {
                console.log("Google callback: user has no hospital details, redirecting to complete-profile");
                return res.redirect("/complete-profile");
              }

              if (u && u.approvalStatus === "pending") {
                console.log("Google callback: user pending approval");
                return res.redirect("/pending-approval");
              }

              if (u && u.approvalStatus === "rejected") {
                console.log("Google callback: user rejected");
                return res.redirect("/pending-approval");
              }

              if (u?.role === "provider") {
                return res.redirect("/provider");
              }
              if (u?.role === "care_seeker") {
                return res.redirect("/user");
              }
              res.redirect("/home");
            } catch (innerErr) {
              console.error("Google callback inner error:", innerErr);
              res.redirect("/home");
            }
          });
        } catch (error) {
          console.error("Google callback error:", error);
          res.redirect("/login?error=google_failed");
        }
      }
    );

    console.log("Google OAuth configured successfully");
  } else {
    console.log("Google OAuth not configured (missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET)");
  }

  app.post("/api/auth/register", async (req, res) => {
    try {
      const validatedData = registerSchema.parse(req.body);
      
      const existingUser = await getUserByEmail(validatedData.email);
      if (existingUser) {
        return res.status(400).json({ message: "Email already registered" });
      }

      const code = generateVerificationCode();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      
      const user = await createUser({
        ...validatedData,
        phone: validatedData.phone,
        verificationCode: code,
        verificationCodeExpiresAt: expiresAt,
      });

      // Auto-create provider record if registering as provider
      if (validatedData.role === "provider" && validatedData.providerType) {
        try {
          await storage.createProvider({
            userId: user.id,
            name: validatedData.hospitalName,
            type: validatedData.providerType,
            description: validatedData.description || "",
            location: validatedData.location || "",
            address: validatedData.hospitalAddress,
            phone: validatedData.phone || "",
            email: validatedData.email,
            licenseNumber: validatedData.hospitalRegistrationNo,
            registeredOrganization: validatedData.hospitalRegisteredOrg,
            verificationStatus: "pending",
          } as any);
        } catch (providerErr) {
          console.error("Provider auto-create error:", providerErr);
        }
      }

      const emailSent = await sendVerificationEmail(validatedData.email, code, validatedData.firstName);
      
      req.session.userId = user.id;
      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ message: "Failed to create session" });
        }
        res.status(201).json({ ...user, needsVerification: true, emailSent });
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: error.errors 
        });
      }
      console.error("Registration error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const validatedData = loginSchema.parse(req.body);
      
      const user = await getUserByEmail(validatedData.email);
      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }
      
      if (!user.isActive) {
        return res.status(401).json({ message: "Account is deactivated" });
      }

      if (!user.password) {
        return res.status(401).json({
          message: "This account was created with Google. Set a password below to sign in with email and password.",
          googleAccount: true,
        });
      }
      
      const isValid = await verifyPassword(validatedData.password, user.password);
      if (!isValid) {
        return res.status(401).json({ message: "Invalid email or password" });
      }
      
      req.session.userId = user.id;

      // Compute requiresAgreement before session.save so the login response
      // mirrors /api/auth/user — without this, the gate can be bypassed on
      // the first post-login navigation (React Query staleTime prevents refetch).
      let requiresAgreement = false;
      try {
        requiresAgreement = await userRequiresAgreement(user as any);
      } catch {
        // Fail closed for approved non-admin users.
        requiresAgreement = user.role !== "admin" && user.approvalStatus === "approved";
      }

      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ message: "Failed to create session" });
        }
        
        const { password, ...safeUser } = user;
        if (!user.emailVerified && !user.googleId) {
          return res.json({ ...safeUser, needsVerification: true });
        }
        res.json({ ...safeUser, requiresAgreement });
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: error.errors 
        });
      }
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post("/api/auth/google-password/request", async (req, res) => {
    try {
      const email = z.string().email().parse(req.body?.email).toLowerCase();
      const user = await getUserByEmail(email);
      if (!user || !user.googleId || user.password) {
        return res.json({ message: "If this account can use a password, a verification code has been sent." });
      }

      const code = generateVerificationCode();
      await setGooglePasswordSetupCode(user.id, code);
      const sent = await sendVerificationEmail(user.email, code, user.firstName || undefined);
      if (!sent) {
        return res.status(500).json({ message: "Could not send the verification code. Please try again." });
      }
      return res.json({ message: "Verification code sent to your email." });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Enter a valid email address." });
      }
      console.error("Google password request error:", error);
      return res.status(500).json({ message: "Could not request a password." });
    }
  });

  app.post("/api/auth/google-password/complete", async (req, res) => {
    try {
      const data = z.object({
        email: z.string().email(),
        code: z.string().length(6),
        password: z.string().min(6),
      }).parse(req.body);
      const user = await getUserByEmail(data.email);
      if (!user) {
        return res.status(400).json({ message: "Invalid verification details." });
      }

      const result = await setGoogleAccountPassword(user.id, data.code, data.password);
      if (!result.success) {
        return res.status(400).json({ message: result.message });
      }
      return res.json({ message: result.message });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Enter a valid email, 6-digit code, and password." });
      }
      console.error("Google password completion error:", error);
      return res.status(500).json({ message: "Could not create the password." });
    }
  });

  app.post("/api/auth/logout", async (req: any, res) => {
    const userId = req.session?.userId as string | undefined;
    if (userId) {
      try {
        await storage.deleteAllPushSubscriptionsForUser(userId);
      } catch (e) {
        console.error("[Logout] Failed to delete push subscriptions:", e);
      }
    }
    req.session.destroy((err) => {
      if (err) {
        console.error("Logout error:", err);
        return res.status(500).json({ message: "Logout failed" });
      }
      res.clearCookie("connect.sid");
      res.json({ message: "Logged out successfully" });
    });
  });

  app.get("/api/auth/user", async (req: any, res) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const user = await getUserById(req.session.userId);
      if (!user || !user.isActive) {
        req.session.destroy(() => {});
        return res.status(401).json({ message: "Unauthorized" });
      }
      let requiresAgreement = false;
      try {
        requiresAgreement = await userRequiresAgreement(user as any);
      } catch (agreementErr) {
        // Fail closed: if we cannot confirm a signed agreement, require it
        // (admins / non-approved users were already excluded above).
        requiresAgreement =
          (user as any).role !== "admin" &&
          (user as any).approvalStatus === "approved";
      }
      res.json({ ...user, requiresAgreement });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.post("/api/auth/complete-profile", async (req: any, res) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ message: "Not logged in" });
      }
      const user = await getUserById(req.session.userId);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const { role, hospitalName, hospitalAddress, hospitalRegistrationNo, hospitalRegisteredOrg, registrationDocumentUrl, phone, providerType, description, location } = req.body;
      if (!role || !["care_seeker", "provider"].includes(role)) {
        return res.status(400).json({ message: "Valid role is required" });
      }
      if (!hospitalName || !hospitalAddress || !hospitalRegistrationNo) {
        return res.status(400).json({ message: "Hospital name, address, and registration number are required" });
      }

      const updated = await completeUserProfile(req.session.userId, {
        role,
        hospitalName,
        hospitalAddress,
        hospitalRegistrationNo,
        hospitalRegisteredOrg,
        registrationDocumentUrl,
        phone,
      });

      if (!updated) {
        return res.status(500).json({ message: "Failed to update profile" });
      }

      // Auto-create provider record if registering as provider
      if (role === "provider" && providerType) {
        try {
          const existing = await storage.getProviderByUserId(req.session.userId);
          if (!existing) {
            await storage.createProvider({
              userId: req.session.userId,
              name: hospitalName,
              type: providerType,
              description: description || "",
              location: location || "",
              address: hospitalAddress,
              phone: phone || "",
              email: user.email,
              licenseNumber: hospitalRegistrationNo,
              registeredOrganization: hospitalRegisteredOrg || "",
              verificationStatus: "pending",
            } as any);
          }
        } catch (providerErr) {
          console.error("Provider auto-create error:", providerErr);
        }
      }

      res.json({ ...updated, needsApproval: true });
    } catch (error) {
      console.error("Complete profile error:", error);
      res.status(500).json({ message: "Failed to complete profile" });
    }
  });

  app.patch("/api/auth/user/role", isAuthenticated, async (req: any, res) => {
    try {
      const { role } = req.body as { role: UserRole };
      if (!["care_seeker", "provider"].includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }
      
      const user = await updateUserRole(req.user.id, role);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json(user);
    } catch (error) {
      console.error("Error updating role:", error);
      res.status(500).json({ message: "Failed to update role" });
    }
  });

  app.post("/api/auth/verify-email", async (req, res) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ message: "Not logged in" });
      }
      const { code } = req.body as { code: string };
      if (!code || code.length !== 6) {
        return res.status(400).json({ message: "Please enter a 6-digit code" });
      }
      const result = await verifyEmailCode(req.session.userId, code);
      if (!result.success) {
        return res.status(400).json({ message: result.message });
      }
      const user = await getUserById(req.session.userId);
      res.json(user);
    } catch (error) {
      console.error("Verification error:", error);
      res.status(500).json({ message: "Verification failed" });
    }
  });

  app.post("/api/auth/resend-verification", async (req, res) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ message: "Not logged in" });
      }
      const rawUser = await getRawUserById(req.session.userId);
      if (!rawUser) {
        return res.status(404).json({ message: "User not found" });
      }
      if (rawUser.emailVerified) {
        return res.status(400).json({ message: "Email is already verified" });
      }
      const code = generateVerificationCode();
      await setVerificationCode(rawUser.id, code);
      const sent = await sendVerificationEmail(rawUser.email, code, rawUser.firstName || undefined);
      if (!sent) {
        return res.status(500).json({ message: "Failed to send verification email. Please try again." });
      }
      res.json({ message: "Verification code sent to your email" });
    } catch (error) {
      console.error("Resend verification error:", error);
      res.status(500).json({ message: "Failed to resend verification code" });
    }
  });
}
