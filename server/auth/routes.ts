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
} from "./index";
import { loginSchema, registerSchema, type UserRole } from "@shared/models/auth";
import { z } from "zod";

export function registerAuthRoutes(app: Express): void {
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    const callbackURL = process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}/api/auth/google/callback`
      : process.env.APP_URL
        ? `${process.env.APP_URL}/api/auth/google/callback`
        : "/api/auth/google/callback";

    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          callbackURL,
        },
        async (_accessToken, _refreshToken, profile, done) => {
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
              return done(null, { id: existingUser.id, needsRole: false });
            }

            const existingEmailUser = await getUserByEmail(email);
            if (existingEmailUser) {
              await linkGoogleId(existingEmailUser.id, googleId, profileImageUrl);
              return done(null, { id: existingEmailUser.id, needsRole: false });
            }

            const newUser = await createGoogleUser({
              email,
              googleId,
              firstName,
              lastName,
              profileImageUrl,
            });

            return done(null, { id: newUser.id, needsRole: !newUser.role || newUser.role === "care_seeker" });
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
        passport.authenticate("google", {
          scope: ["profile", "email"],
          state,
        })(req, res, next);
      }
    );

    app.get(
      "/api/auth/google/callback",
      passport.authenticate("google", { failureRedirect: "/login?error=google_failed", session: false }),
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

            if (googleUser.needsRole && !role) {
              return res.redirect("/select-role");
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
      
      const user = await createUser(validatedData);
      
      req.session.userId = user.id;
      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ message: "Failed to create session" });
        }
        res.status(201).json(user);
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

  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      res.json(req.user);
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
}
