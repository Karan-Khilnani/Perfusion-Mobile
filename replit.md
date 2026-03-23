# Perfusion Healthcare Platform

## Overview

Perfusion is a healthcare operations platform designed to connect resource-limited hospitals with diagnostic labs, specialists, and critical care services. It offers three core services: Super Speciality Consultations (video consultations), Lab Tests (diagnostic test catalog with booking), and Teleradiology Reporting (medical imaging interpretation). The platform uses INR (₹) currency, features role-based access (Admin, Provider, Care Seeker), and comprehensive admin controls for managing services. It includes a robust billing and financial system with a pay-per-use model, Razorpay integration for payments, and a B2B registration approval workflow for hospitals. Key features also include Twilio-based voice call and WhatsApp notifications, an emergency teams feature for urgent consultations, and a prescription generation system. Custom booking number format: `PHC/YYYY-YY/MM/X00000` (financial year, financial month, type letter L/C/R + sequence). Generator at `server/services/booking-number.ts`, sequence tracked in `booking_sequences` table. Pricing follows Provider Base Cost → Admin Margin/Price Override → Customer Price. `server/services/pricing.ts` handles price calculation. `customerPrice` and `marginOverride` fields on `lab_tests`, `consultants`, `emergency_teams` allow per-service admin overrides; global `default_margin_percent` in platform_settings is fallback. Seeker catalog only shows tests with active provider assignments. The platform aims to improve healthcare accessibility by leveraging technology to bridge geographical gaps.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript, using Vite.
- **Routing**: Wouter for client-side routing.
- **State Management**: TanStack React Query for server state and caching.
- **UI Components**: shadcn/ui built on Radix UI primitives.
- **Styling**: Tailwind CSS with CSS custom properties for theming (light/dark mode).
- **Design System**: System-based approach following Material Design principles.

### Backend Architecture
- **Runtime**: Node.js with Express.
- **Language**: TypeScript with ES modules.
- **API Pattern**: RESTful JSON API.
- **Authentication**: Replit Auth using OpenID Connect with Passport.js, session-based management.
- **Core Features**: Twilio for voice/WhatsApp notifications, Resend for email verification, Multer for file uploads, Jitsi Meet for video conferencing, Razorpay for payment processing.

### Data Storage
- **Database**: PostgreSQL.
- **ORM**: Drizzle ORM with drizzle-zod for schema validation.
- **Key Entities**: Users, Sessions, Providers, Labs, Lab Tests, Consultants, Hospitals, Critical Care Doctors, Bookings, Emergency Teams, Platform Settings, Audit Logs.

### Project Structure
- `client/`: React frontend.
- `server/`: Express backend.
- `shared/`: Shared types and schemas.
- `migrations/`: Database migrations.

## External Dependencies

### Database
- **PostgreSQL**: Primary database for all application data.

### Authentication
- **Replit Auth**: OpenID Connect provider.
- **Google OAuth 2.0**: For Google Sign-In.

### Communication & Payments
- **Twilio**: For automated voice calls and WhatsApp notifications.
- **Resend**: For email verification services.
- **Razorpay**: For payment gateway integration.
- **Jitsi Meet**: Embedded for video consultations.

### Key NPM Packages
- **UI**: Radix UI, Tailwind CSS, class-variance-authority.
- **Data**: Drizzle ORM, @tanstack/react-query, zod.
- **Auth**: passport, openid-client, express-session, connect-pg-simple.
- **Utilities**: date-fns, lucide-react, wouter.
- **PDF Processing**: pdf-lib (PDF manipulation), qrcode (QR code generation).

## Prescription Medicolegal Safety System

Consultants can create, draft, and permanently confirm prescriptions for consultation bookings:

1. **Draft Mode**: Providers fill diagnosis, physician notes, treatment plan, and follow-up; click "Save Draft" to persist without locking
2. **Confirm & Sign**: One-click confirmation that permanently locks the prescription — writes audit log with IP, timestamp, and consultant identity; generates a server-side frozen PDF
3. **Server-side Frozen PDF**: `server/services/prescription-pdf.ts` uses pdf-lib to generate branded PDFs with QR code linking to public verification URL, approval seal, consultant credentials, legal disclaimer, and page footers; stored in `uploads/prescriptions/`
4. **Public Verification**: `/verify/prescription/:bookingId` — no auth required; shows consultant details, patient name, confirmation timestamp, and download link for the signed PDF
5. **Audit Trail**: `PRESCRIPTION_CONFIRMED` audit log entry with consultant name/reg no, patient name, approver IP, timestamp, and PDF URL
6. **UI States**: BookingRow shows "Signed & Locked" green badge + "Download PDF" when approved; shows "Edit Draft" + "Draft PDF" when unsaved; prescription dialog shows locked read-only view when approved

Key fields on `bookings` table: `prescriptionApprovedAt`, `prescriptionApprovedByUserId`, `prescriptionApproverIp`, `prescriptionOtpVerified`, `prescriptionPdfUrl`

## Report Processing

When a provider lab uploads a report and sets booking status to `report_ready`, the system automatically processes the report:
1. **Cover Page**: A branded Perfusion cover page is prepended with patient info, test details, lab name, QR verification code, and disclaimer
2. **Footer**: A Perfusion-branded footer is added to every page of the original report (logo, tagline, contact, booking ref)
3. **Original Untouched**: The original report body/header/signatures remain completely unchanged
4. **Storage**: Processed PDF saved as `processedReportUrl` on the booking (original preserved as `reportUrl`)
5. **Delivery**: Processed PDF attached to WhatsApp notifications (admin + seeker) via Twilio `mediaUrl`
6. Service: `server/services/report-processor.ts`, uses pdf-lib for PDF creation/manipulation