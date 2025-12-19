# Perfusion Healthcare Platform

## Overview

Perfusion is a healthcare operations platform designed to connect resource-limited hospitals with diagnostic labs, specialists, and critical care services. The platform provides two main portals: a User Portal for patients/hospitals to book services, and a Service Provider Portal for labs, consultants, and hospitals to manage their offerings and bookings.

The application follows a functional MVP approach with real authentication, database persistence, and mock payment flows. It prioritizes workflow efficiency, data visibility, and functional clarity over visual complexity.

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