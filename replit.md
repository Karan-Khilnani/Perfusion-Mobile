# Perfusion Healthcare Platform

## Overview

Perfusion is a healthcare operations platform designed to connect resource-limited hospitals with diagnostic labs, specialists, and critical care services. It offers three core services: Super Speciality Consultations (video consultations), Lab Tests (diagnostic test catalog with booking), and Teleradiology Reporting (medical imaging interpretation). The platform uses INR (₹) currency, features role-based access (Admin, Provider, Care Seeker), and comprehensive admin controls for managing services. It includes a robust billing and financial system with a pay-per-use model, Razorpay integration for payments, and a B2B registration approval workflow for hospitals. Key features also include Twilio-based voice call and WhatsApp notifications, an emergency teams feature for urgent consultations, and a prescription generation system. The platform aims to improve healthcare accessibility by leveraging technology to bridge geographical gaps.

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