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
  verifyEmailCode,
  getRawUserById,
} from "./index";
import { loginSchema, registerSchema, type UserRole } from "@shared/models/auth";
import { z } from "zod";
import { generateVerificationCode, sendVerificationEmail } from "../email";

function getCallbackURL(req: any): string {
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  if (!host) {
    const fallback = process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : process.env.APP_URL || "http://localhost:5000";
    return `${fallback}/api/auth/google/callback`;
  }
  return `${protocol}://${host}/api/auth/google/callback`;
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
        passport.authenticate("google", {
          scope: ["profile", "email"],
          state,
          callbackURL,
        } as any)(req, res, next);
      }
    );

    app.get(
      "/api/auth/google/callback",
      (req, res, next) => {
        const callbackURL = getCallbackURL(req);
        console.log("Google OAuth callback with callbackURL:", callbackURL);
        passport.authenticate("google", {
          failureRedirect: "/login?error=google_failed",
          session: false,
          callbackURL,
        } as any)(req, res, next);
      },
      async (req: any, res) => {
        try {
          const googleUser = req.user;
          if (!googleUser || !googleUser.id) {
            return res.redirect("/login?error=google_failed");
          }

          let role: string | undefined;
          if (req.query.state) {
            try {
              const stateData = JSON.parse(Buffer.from(req.query.state as string, "base64").toString());
              role = stateData.role;
            } catch {}
          }

          if (role && ["care_seeker", "provider"].includes(role)) {
            await updateUserRole(googleUser.id, role as UserRole);
          }

          req.session.userId = googleUser.id;
          req.session.save((err: any) => {
            if (err) {
              console.error("Session save error after Google auth:", err);
              return res.redirect("/login?error=session_failed");
            }

            if (googleUser.isNew && !role) {
              return res.redirect("/complete-profile");
            }

            if (googleUser.isNew && role === "provider") {
              return res.redirect("/complete-profile?role=provider");
            }

            if (role === "provider") {
              return res.redirect("/provider/onboarding");
            }

            res.redirect("/home");
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
        verificationCode: code,
        verificationCodeExpiresAt: expiresAt,
      });

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
        return res.status(401).json({ message: "This account uses Google sign-in. Please use the Google button to log in." });
      }
      
      const isValid = await verifyPassword(validatedData.password, user.password);
      if (!isValid) {
        return res.status(401).json({ message: "Invalid email or password" });
      }
      
      req.session.userId = user.id;
      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ message: "Failed to create session" });
        }
        
        const { password, ...safeUser } = user;
        if (!user.emailVerified && !user.googleId) {
          return res.json({ ...safeUser, needsVerification: true });
        }
        res.json(safeUser);
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

  app.post("/api/auth/logout", (req, res) => {
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
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
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
