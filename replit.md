# Perfusion Healthcare Platform

## Overview

Perfusion is a healthcare operations platform designed to connect resource-limited hospitals with diagnostic labs, specialists, and critical care services. The platform offers 3 core services:

1. **Super Speciality Consultation** - Video consultations with specialists via embedded Jitsi Meet integration (iframe with full controls - mute/unmute, hangup, fullscreen, participant count), with comprehensive patient details forms (name, age, gender, clinical summary, diagnosis, document upload)
2. **Lab Tests** - Direct diagnostic test catalog with 64+ tests across 9 categories (Hematology, Biochemistry, Thyroid, etc.) with category filtering and cart-based booking
3. **Teleradiology Reporting** - Medical imaging interpretation service with 28 modalities, priority flags (routine/emergency), mandatory accession number/Hospital ID field, and file upload for DICOM/images

The platform uses INR (₹) currency throughout, features role-based access (Admin, Provider, Care Seeker), Replit Auth for authentication, and comprehensive admin controls to manage consultants, lab tests, and radiology modalities with Add/Pause/Delete functionality.

## Recent Changes

- **New Landing Page**: Premium public-facing landing page at root (/) with animated artery SVG flowing across India map to Perfusion logo. Features hero section with tagline "Connecting Remote Healthcare" and quote "Because geography shouldn't decide survival", services section (consultations, diagnostics, teleradiology), bedside assistance section, clinician-led platform section, call-to-action with demo phone (9244893295), and contact footer. Original login page moved to /home, accessible via "Enter Perfusion" button.
- **Prescription System**: Providers can generate prescriptions for consultation bookings with diagnosis, medications, advice, and follow-up. Care seekers can view and download prescriptions as text files from their orders page.
- **Admin Dashboard Enhanced**: Comprehensive monitoring dashboard with booking stats by type/status, revenue metrics (total/pending), service catalog counts (labs, tests, consultants, modalities), and recent activity feed. Stats endpoint at `/api/admin/stats`
- **Google Sign-In**: Added Google OAuth 2.0 login alongside existing email/password auth. "Sign in with Google" button on login page, dual Google signup buttons (Care Seeker/Provider) on register page. New Google users without a role are redirected to /select-role page. Google-only users attempting email login get a helpful message. Uses GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET secrets. Schema: added googleId column, password now nullable for Google-only accounts.
- **Admin Provider Editing**: Admin can now edit provider details (name, email, phone, location, description) via edit dialog on the providers page
- **Provider Teleradiology Tab**: Provider services page now includes a Teleradiology tab showing available modalities with pricing and link to bookings
- **Report Upload/Download**: Providers can upload report URLs for lab and teleradiology bookings; patients can download reports from their orders page
- **Slot Management**: Admin can edit available appointment slots for consultants via the Admin Consultants page
- **Provider Bookings Enhanced**: Provider bookings page now shows booking type icons (consultation/lab/teleradiology), accession numbers, and upload report button for lab/teleradiology bookings
- **User Orders Enhanced**: Orders page now shows download report button when reports are available with provider notes
- **Light/Dark Theme**: Added proper light theme with clean white backgrounds, dark text, and subtle shadows. Toggle using the sun/moon button in the header. Dark theme retains the cinematic black and crimson aesthetic.
- **Booking Fixes**: Fixed consultation and teleradiology booking forms to send correct field names (bookingType, serviceId, serviceName, amount, patientContact, urgency) matching the database schema
- **Admin Auto-Seed**: Admin account (admin@perfusion.test / Admin@123) is automatically created/reset on server startup
- **Video Conferencing**: Embedded Jitsi Meet video calls with role-aware navigation (returnTo query parameter) - both users and providers return to their respective pages after calls
- **Currency**: Changed from USD ($) to INR (₹) across all monetary displays and form labels
- **Teleradiology**: Added mandatory accession number field for radiologist reference
- **Specialization Filter**: Now dynamically builds filter options from actual consultant data instead of hardcoded list

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript, using Vite as the build tool
- **Routing**: Wouter for client-side routing with nested route layouts
- **State Management**: TanStack React Query for server state and caching
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS custom properties for theming (light/dark mode support)
- **Design System**: System-based approach following Material Design principles for information-dense healthcare interfaces

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript with ES modules
- **API Pattern**: RESTful JSON API with `/api` prefix
- **Authentication**: Replit Auth integration using OpenID Connect with Passport.js
- **Session Management**: Express sessions with PostgreSQL session store (connect-pg-simple)

### Data Storage
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM with drizzle-zod for schema validation
- **Schema Location**: Shared schema in `shared/schema.ts` for type safety across client and server
- **Key Entities**: Users, Sessions, Providers, Labs, Lab Tests, Consultants, Hospitals, Critical Care Doctors, Bookings

### Project Structure
```
├── client/           # React frontend application
│   └── src/
│       ├── components/   # UI components (shadcn/ui + custom)
│       ├── hooks/        # Custom React hooks
│       ├── lib/          # Utilities and query client
│       └── pages/        # Route components (user/, provider/)
├── server/           # Express backend
│   ├── replit_integrations/  # Replit Auth integration
│   └── routes.ts     # API route definitions
├── shared/           # Shared types and schemas
│   ├── schema.ts     # Drizzle database schema
│   └── models/       # Auth-related models
└── migrations/       # Database migrations
```

### Authentication Flow
- Uses Replit Auth (OpenID Connect) for user authentication
- Session-based auth with PostgreSQL session storage
- Protected routes use `isAuthenticated` middleware
- User data stored in `users` table with automatic upsert on login

### Build System
- Development: Vite dev server with HMR, proxying API requests to Express
- Production: Vite builds static assets, esbuild bundles server code
- Single deployment artifact serving both frontend and API

## External Dependencies

### Database
- **PostgreSQL**: Primary database accessed via `DATABASE_URL` environment variable
- Session storage, user data, and all application entities persisted here

### Authentication
- **Replit Auth**: OpenID Connect provider for user authentication
- Requires `REPL_ID`, `ISSUER_URL`, and `SESSION_SECRET` environment variables

### Key NPM Packages
- **UI**: Radix UI primitives, Tailwind CSS, class-variance-authority, cmdk
- **Data**: Drizzle ORM, @tanstack/react-query, zod
- **Auth**: passport, openid-client, express-session, connect-pg-simple
- **Utilities**: date-fns, lucide-react (icons), wouter (routing)

### Development Tools
- Replit-specific Vite plugins for development experience
- TypeScript for type safety across the full stack
- drizzle-kit for database migrations (`npm run db:push`)