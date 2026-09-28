# Perfusion

A live healthcare platform connecting remote patients with labs, consultants, and radiology services across India.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port from env)
- `pnpm --filter @workspace/perfusion-web run dev` — run the frontend (port from env)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Auth: Session-based (express-session + connect-pg-simple) + Google OAuth (passport-google-oauth20)
- Validation: Zod (zod/v4), drizzle-zod
- Frontend: React 18 + Vite + Tailwind CSS v3
- Build: esbuild (CJS bundle for server)

## Where things live

- `artifacts/api-server/` — Express backend (auth, routes, services, storage)
- `artifacts/api-server/src/routes/routes.ts` — all API routes (4000+ lines, `registerRoutes(httpServer, app)`)
- `artifacts/api-server/src/auth/` — session auth + Google OAuth
- `artifacts/api-server/src/services/` — msg91, supabase-storage, push-notifications, pricing, report-processor, prescription-pdf, etc.
- `artifacts/perfusion-web/` — React frontend
- `artifacts/perfusion-web/src/shared/` — type-only schema/models used by frontend
- `lib/db/src/schema/` — Drizzle schema (schema.ts + models/auth.ts)

## Architecture decisions

- Routes are kept as `registerRoutes(httpServer, app)` (not converted to Express Router) due to SSE streaming and complex middleware dependencies.
- Frontend uses existing `apiRequest` fetch layer instead of generated OpenAPI hooks (too many endpoints for safe port).
- `@shared` alias in frontend points to `artifacts/perfusion-web/src/shared/` — type-only copies of the schema, no DB connection.
- Frontend is Tailwind v3 (original used v3 with PostCSS, not v4 plugin).
- Incremental DB migrations run at startup via raw pool queries for columns added after schema creation.

## Product

Full healthcare platform with:
- Care seeker portal: book lab tests, consultations, teleradiology
- Provider portal: manage bookings, services, billing
- Admin portal: users, providers, approvals, analytics, diagnostics
- Google OAuth + email/password registration with admin approval flow
- Real-time consultation video rooms (Stream Video by default; Daily is an explicit rollback option)
- Push notifications, SMS/voice via MSG91/Twilio
- Razorpay payments, PDF reports, prescriptions

## User preferences

- Keep mobile consultation calls and their picture-in-picture view portrait (9:16). Ask the owner before any critical call-layout or orientation change.

## Exotel (phone call masking)

Phone call bridging via Exotel requires these four env vars — all optional; the feature returns HTTP 503 gracefully if unset:

| Variable | Description |
|---|---|
| `EXOTEL_SID` | Your Exotel Account SID |
| `EXOTEL_API_KEY` | Exotel API key |
| `EXOTEL_API_TOKEN` | Exotel API token |
| `EXOTEL_VIRTUAL_NUMBER` | Exotel virtual/caller-ID number |

API endpoint: `POST https://{EXOTEL_API_KEY}:{EXOTEL_API_TOKEN}@api.exotel.com/v1/Accounts/{EXOTEL_SID}/Calls/connect.json`

## Gotchas

- `registerRoutes` must receive the `httpServer` (not just `app`) for SSE connections.
- DB schema has `@shared` alias in frontend pointing to local type-only stubs — do NOT import from `@workspace/db` in frontend code (it imports DB connection code).
- `@tailwindcss/vite` was removed from perfusion-web; uses postcss with tailwindcss@3 + autoprefixer.
- `contact_phone` on consultants and `reminder_fired_at` on bookings are also in the schema; incremental migration at startup is for safety only.
- Always run both workflows: api-server AND perfusion-web.
- `call_logs` table added via incremental startup migration (not in Drizzle push). Schema defined in both `lib/db` and `shared/schema.ts`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
