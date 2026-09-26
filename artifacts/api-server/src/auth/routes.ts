import type { Express } from "express";
import { createHash, randomBytes } from "node:crypto";
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
  consumePasswordResetCode,
  setPasswordAfterRecovery,
  verifyEmailCode,
  getRawUserById,
  completeUserProfile,
} from "./index";
import { loginSchema, registerSchema, type UserRole } from "@workspace/db";
import { z } from "zod/v4";
import {
  generateVerificationCode,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "../email";
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

const MOBILE_GOOGLE_REDIRECT_URI = "perfusion-mobile://auth/callback";
const PASSWORD_RECOVERY_WINDOW_MS = 15 * 60 * 1000;

const recoveryRateLimits = new Map<string, { count: number; expiresAt: number }>();

function allowRecoveryAttempt(key: string, limit: number): boolean {
  const now = Date.now();
  const existing = recoveryRateLimits.get(key);
  if (!existing || existing.expiresAt <= now) {
    recoveryRateLimits.set(key, {
      count: 1,
      expiresAt: now + PASSWORD_RECOVERY_WINDOW_MS,
    });
  } else if (existing.count >= limit) {
    return false;
  } else {
    existing.count += 1;
  }

  if (recoveryRateLimits.size > 2_000) {
    for (const [entryKey, entry] of recoveryRateLimits) {
      if (entry.expiresAt <= now) recoveryRateLimits.delete(entryKey);
    }
  }
  return true;
}

function saveSession(session: any): Promise<void> {
  return new Promise((resolve, reject) => {
    session.save((error: Error | null) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function getMobileGoogleErrorUrl(error: string): string {
  return `${MOBILE_GOOGLE_REDIRECT_URI}?error=${encodeURIComponent(error)}`;
}

async function getMobileAuthUser(req: any, user: any): Promise<any> {
  if (req.get?.("X-Mobile-Client") !== "1" || user?.role !== "provider") {
    return user;
  }
  try {
    const provider = await storage.getProviderByUserId(user.id);
    const location = provider?.location || provider?.address;
    return location ? { ...user, location } : user;
  } catch (error) {
    console.error("Could not load provider location for mobile auth response:", error);
    return user;
  }
}

async function createMobileGoogleExchangeTicket(
  userId: string,
  codeChallenge: string,
): Promise<string> {
  const ticket = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 2 * 60 * 1000);
  await getPool().query(
    `INSERT INTO "sessions" (sid, sess, expire)
     VALUES ($1, $2::json, $3)`,
    [
      `google-mobile-${ticket}`,
      JSON.stringify({
        authType: "google-mobile-exchange",
        userId,
        codeChallenge,
      }),
      expiresAt,
    ],
  );
  return ticket;
}

async function consumeMobileGoogleExchangeTicket(
  ticket: string,
  codeChallenge: string,
): Promise<string | null> {
  const result = await getPool().query(
    `DELETE FROM "sessions"
     WHERE sid = $1
       AND expire > NOW()
       AND sess->>'codeChallenge' = $2
     RETURNING sess`,
    [`google-mobile-${ticket}`, codeChallenge],
  );
  const payload = result.rows[0]?.sess as
    | { authType?: unknown; userId?: unknown }
    | undefined;
  if (
    payload?.authType !== "google-mobile-exchange" ||
    typeof payload.userId !== "string"
  ) {
    return null;
  }
  return payload.userId;
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
            if (profile._json?.email_verified !== true) {
              return done(new Error("Google account email is not verified"));
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

    app.get("/api/auth/google/mobile", (req: any, res, next) => {
      const codeChallenge = req.query.code_challenge;
      if (
        typeof codeChallenge !== "string" ||
        !/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge)
      ) {
        return res.redirect(getMobileGoogleErrorUrl("invalid_request"));
      }
      const state = `mobile.${randomBytes(32).toString("hex")}`;
      req.session.mobileGoogleOAuthState = state;
      req.session.mobileGoogleCodeChallenge = codeChallenge;
      req.session.save((error: unknown) => {
        if (error) {
          console.error("Mobile Google OAuth state save error:", error);
          return res.redirect(getMobileGoogleErrorUrl("session_failed"));
        }
        passport.authenticate("google", {
          scope: ["profile", "email"],
          state,
          callbackURL: getCallbackURL(req),
          prompt: "select_account",
        } as any)(req, res, next);
      });
    });

    app.get(
      "/api/auth/google/callback",
      (req: any, res, next) => {
        const state = req.query.state;
        if (typeof state !== "string" || !state.startsWith("mobile.")) {
          return next();
        }
        if (req.session.mobileGoogleOAuthState !== state) {
          return res.redirect(getMobileGoogleErrorUrl("invalid_state"));
        }
        res.locals.mobileGoogleOAuth = true;
        next();
      },
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
            if (res.locals.mobileGoogleOAuth) {
              return res.redirect(getMobileGoogleErrorUrl("google_failed"));
            }
            return res.redirect("/login?error=google_failed");
          }
          if (!user) {
            console.error("Google OAuth no user returned. Info:", info);
            if (res.locals.mobileGoogleOAuth) {
              return res.redirect(getMobileGoogleErrorUrl("google_failed"));
            }
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
            if (res.locals.mobileGoogleOAuth) {
              return res.redirect(getMobileGoogleErrorUrl("google_failed"));
            }
            return res.redirect("/login?error=google_failed");
          }

          if (res.locals.mobileGoogleOAuth) {
            const codeChallenge = req.session.mobileGoogleCodeChallenge;
            if (
              typeof codeChallenge !== "string" ||
              !/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge)
            ) {
              return res.redirect(getMobileGoogleErrorUrl("invalid_state"));
            }
            const ticket = await createMobileGoogleExchangeTicket(
              googleUser.id,
              codeChallenge,
            );
            const redirectUrl =
              `${MOBILE_GOOGLE_REDIRECT_URI}?ticket=${encodeURIComponent(ticket)}`;
            return req.session.destroy((error: unknown) => {
              if (error) {
                console.error("Mobile Google OAuth session cleanup error:", error);
              }
              res.redirect(redirectUrl);
            });
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
          if (res.locals.mobileGoogleOAuth) {
            return res.redirect(getMobileGoogleErrorUrl("google_failed"));
          }
          res.redirect("/login?error=google_failed");
        }
      }
    );

    app.post("/api/auth/google/mobile/exchange", async (req: any, res) => {
      try {
        const parsed = z.object({
          ticket: z.string().regex(/^[a-f0-9]{64}$/),
          codeVerifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
        }).safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: "Invalid sign-in ticket." });
        }

        const codeChallenge = createHash("sha256")
          .update(parsed.data.codeVerifier)
          .digest("base64url");
        const userId = await consumeMobileGoogleExchangeTicket(
          parsed.data.ticket,
          codeChallenge,
        );
        if (!userId) {
          return res.status(401).json({
            message: "This Google sign-in expired or was already used. Please try again.",
          });
        }
        const user = await getUserById(userId);
        if (!user || !user.isActive) {
          return res.status(401).json({ message: "This account is unavailable." });
        }

        await new Promise<void>((resolve, reject) => {
          req.session.regenerate((error: unknown) => {
            if (error) reject(error);
            else resolve();
          });
        });
        req.session.userId = user.id;
        await new Promise<void>((resolve, reject) => {
          req.session.save((error: unknown) => {
            if (error) reject(error);
            else resolve();
          });
        });

        let requiresAgreement = false;
        try {
          requiresAgreement = await userRequiresAgreement(user as any);
        } catch {
          requiresAgreement =
            user.role !== "admin" && user.approvalStatus === "approved";
        }
        const mobileUser = await getMobileAuthUser(req, user);
        return res.json({
          ...mobileUser,
          requiresAgreement,
          needsProfile: user.role !== "admin" && !user.hospitalName,
        });
      } catch (error) {
        console.error("Mobile Google sign-in exchange error:", error);
        return res.status(500).json({ message: "Could not complete Google sign-in." });
      }
    });

    console.log("Google OAuth configured successfully");
  } else {
    console.log("Google OAuth not configured (missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET)");
    app.get("/api/auth/google/mobile", (_req, res) => {
      res.redirect(getMobileGoogleErrorUrl("google_unconfigured"));
    });
    app.post("/api/auth/google/mobile/exchange", (_req, res) => {
      res.status(503).json({
        message: "Google sign-in is not configured for this environment. Ask your administrator to enable it, or use email sign-in.",
      });
    });
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

      const {
        password,
        verificationCode,
        verificationCodeExpiresAt,
        ...safeUser
      } = user;
      const mobileUser = await getMobileAuthUser(req, safeUser);
      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ message: "Failed to create session" });
        }
        
        if (!user.emailVerified && !user.googleId) {
          return res.json({ ...mobileUser, needsVerification: true });
        }
        res.json({ ...mobileUser, requiresAgreement });
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

  app.post("/api/auth/password-reset/request", async (req: any, res) => {
    try {
      const { email } = z.object({
        email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
      }).parse(req.body);
      const ip = req.ip || req.socket?.remoteAddress || "unknown";
      if (
        !allowRecoveryAttempt(`reset-request-ip:${ip}`, 10) ||
        !allowRecoveryAttempt(`reset-request-email:${email}`, 3)
      ) {
        return res.status(429).json({ message: "Too many requests. Please try again later." });
      }

      const user = await getUserByEmail(email);
      if (!user) {
        return res.status(404).json({
          message: "This email is not registered. Create an account to continue.",
        });
      }
      if (!user.isActive) {
        return res.status(401).json({ message: "Account is deactivated." });
      }

      const code = generateVerificationCode();
      await setVerificationCode(user.id, code);
      const sent = await sendPasswordResetEmail(
        user.email,
        code,
        user.firstName || undefined,
      );
      if (!sent) {
        req.log?.error("Password recovery email delivery failed");
        return res.status(500).json({
          message: "Could not send the recovery code. Please try again.",
        });
      }
      return res.json({ message: "Recovery code sent to your email." });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Enter a valid email address." });
      }
      req.log?.error("Password recovery request failed");
      return res.status(500).json({ message: "Could not request account recovery." });
    }
  });

  app.post("/api/auth/password-reset/verify", async (req: any, res) => {
    try {
      const { email, code } = z.object({
        email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
        code: z.string().regex(/^\d{6}$/),
      }).parse(req.body);
      const ip = req.ip || req.socket?.remoteAddress || "unknown";
      if (
        !allowRecoveryAttempt(`reset-verify-ip:${ip}`, 20) ||
        !allowRecoveryAttempt(`reset-verify-email:${email}`, 8)
      ) {
        return res.status(429).json({ message: "Too many attempts. Request a new code later." });
      }

      const user = await getUserByEmail(email);
      if (!user) {
        return res.status(400).json({ message: "The code is invalid or expired. Request a new code." });
      }
      if (!user.isActive) {
        return res.status(401).json({ message: "Account is deactivated." });
      }

      const recoveredUser = await consumePasswordResetCode(user.id, code);
      if (!recoveredUser) {
        return res.status(400).json({ message: "The code is invalid or expired. Request a new code." });
      }

      await new Promise<void>((resolve, reject) => {
        req.session.regenerate((error: Error | null) => {
          if (error) reject(error);
          else resolve();
        });
      });
      req.session.userId = recoveredUser.id;
      req.session.passwordRecoveryVerifiedAt = Date.now();

      let requiresAgreement = false;
      try {
        requiresAgreement = await userRequiresAgreement(recoveredUser as any);
      } catch {
        requiresAgreement =
          recoveredUser.role !== "admin" && recoveredUser.approvalStatus === "approved";
      }
      const mobileUser = await getMobileAuthUser(req, recoveredUser);
      await saveSession(req.session);

      return res.json({
        ...mobileUser,
        needsProfile:
          recoveredUser.role !== "admin" && !recoveredUser.hospitalName,
        requiresAgreement,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Enter a valid email address and 6-digit code.",
        });
      }
      req.log?.error("Password recovery verification failed");
      return res.status(500).json({ message: "Could not verify the recovery code." });
    }
  });

  app.post("/api/auth/password-reset/change", async (req: any, res) => {
    try {
      const { password } = z.object({
        password: z.string().min(6).max(128),
      }).parse(req.body);
      const verifiedAt = req.session.passwordRecoveryVerifiedAt;
      if (
        !req.session.userId ||
        typeof verifiedAt !== "number" ||
        Date.now() - verifiedAt > PASSWORD_RECOVERY_WINDOW_MS
      ) {
        return res.status(401).json({ message: "Your recovery session has expired. Please start again." });
      }

      const user = await getRawUserById(req.session.userId);
      if (!user || !user.isActive) {
        return res.status(401).json({ message: "Your recovery session is no longer valid." });
      }
      const changed = await setPasswordAfterRecovery(user.id, password);
      if (!changed) {
        return res.status(401).json({ message: "Your recovery session is no longer valid." });
      }

      delete req.session.passwordRecoveryVerifiedAt;
      await saveSession(req.session);
      return res.json({ message: "Password updated successfully." });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Password must be at least 6 characters." });
      }
      req.log?.error("Password recovery password update failed");
      return res.status(500).json({ message: "Could not update the password." });
    }
  });

  app.post("/api/auth/password-reset/continue", async (req: any, res) => {
    try {
      if (
        !req.session.userId ||
        typeof req.session.passwordRecoveryVerifiedAt !== "number"
      ) {
        return res.status(401).json({ message: "Your recovery session is no longer valid." });
      }
      delete req.session.passwordRecoveryVerifiedAt;
      await saveSession(req.session);
      return res.json({ message: "Account recovery complete." });
    } catch {
      req.log?.error("Password recovery session finalization failed");
      return res.status(500).json({ message: "Could not finish account recovery." });
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
      res.json({ ...(await getMobileAuthUser(req, user)), requiresAgreement });
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

      const profileSchema = z.object({
        role: z.enum(["care_seeker", "provider"]),
        hospitalName: z.string().trim().min(2).max(255),
        hospitalAddress: z.string().trim().min(5).max(500),
        hospitalRegistrationNo: z.string().trim().min(1).max(100),
        hospitalRegisteredOrg: z.string().trim().min(2).max(255),
        registrationDocumentUrl: z.string().trim().max(500).optional().nullable(),
        phone: z.string().trim().max(25).optional(),
        providerType: z.enum(["lab", "consultant", "hospital", "transport", "teleradiology"]).optional(),
        description: z.string().trim().max(1000).optional(),
        location: z.string().trim().max(255).optional(),
      }).superRefine((data, ctx) => {
        if (data.role !== "provider") return;
        if (!data.providerType) {
          ctx.addIssue({
            code: "custom",
            path: ["providerType"],
            message: "Provider type is required",
          });
        }
        if (!data.phone || !/^\+?[\d\s\-().]{7,25}$/.test(data.phone) ||
            data.phone.replace(/\D/g, "").length < 7) {
          ctx.addIssue({
            code: "custom",
            path: ["phone"],
            message: "A valid phone number is required",
          });
        }
        if (!data.location || data.location.length < 2) {
          ctx.addIssue({
            code: "custom",
            path: ["location"],
            message: "Location is required",
          });
        }
      });
      const parsed = profileSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.issues[0]?.message || "Invalid profile details",
          errors: parsed.error.issues,
        });
      }
      const {
        role, hospitalName, hospitalAddress, hospitalRegistrationNo,
        hospitalRegisteredOrg, registrationDocumentUrl, phone, providerType,
        description, location,
      } = parsed.data;

      const updated = await completeUserProfile(req.session.userId, {
        role,
        hospitalName,
        hospitalAddress,
        hospitalRegistrationNo,
        hospitalRegisteredOrg,
        registrationDocumentUrl: registrationDocumentUrl || undefined,
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

      res.json({
        ...(await getMobileAuthUser(req, updated)),
        needsApproval: true,
      });
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
