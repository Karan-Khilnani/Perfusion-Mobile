# Perfusion Mobile API Inventory

Read-only inventory of the existing Perfusion API for mobile planning.  
Source of truth: `artifacts/api-server/src/auth/routes.ts` and `artifacts/api-server/src/routes/routes.ts`.

## Boundary

The mobile app is a client of the existing API. It must not connect directly to PostgreSQL, create a second user/booking database, or duplicate business rules. Mobile-only UI work belongs under `artifacts/perfusion-mobile/`. API, schema, auth, storage, call, and payment changes are shared-risk changes that can affect the website.

There is currently no OpenAPI contract that fully describes the registered Express routes. The route registrations and handlers are the operative contract.

## Authentication and account

| Method | Endpoint | Purpose | Access |
|---|---|---|---|
| GET | `/api/auth/google` | Start Google sign-in | Public |
| GET | `/api/auth/google/callback` | Complete Google sign-in | OAuth callback |
| POST | `/api/auth/register` | Create account | Public |
| POST | `/api/auth/login` | Create email/password session | Public |
| POST | `/api/auth/logout` | End session | Authenticated |
| GET | `/api/auth/user` | Get current user and account state | Authenticated/session |
| POST | `/api/auth/complete-profile` | Complete registration profile | Authenticated |
| PATCH | `/api/auth/user/role` | Set account role | Authenticated |
| PATCH | `/api/users/me/role` | Duplicate role-selection path | Authenticated |
| POST | `/api/auth/verify-email` | Verify email | Auth/verification flow |
| POST | `/api/auth/resend-verification` | Resend verification code | Auth/verification flow |
| PATCH | `/api/profile` | Update current profile | Authenticated |
| POST | `/api/profile/change-password` | Change password | Authenticated |
| GET/POST/PATCH/DELETE | `/api/profile/ward-contacts[/:id]` | Manage ward contacts | Authenticated |
| GET | `/api/agreements/check` | Check agreement requirement | Authenticated |
| GET | `/api/agreements/current` | Fetch current agreement | Authenticated |
| POST | `/api/agreements/sign` | Record agreement acceptance | Authenticated |

## Public catalog and seeker booking

| Method | Endpoint | Purpose | Access |
|---|---|---|---|
| GET | `/api/consultants` | Browse consultants | Public |
| GET | `/api/consultants/:id` | Get consultant detail | Public |
| GET | `/api/emergency-teams` | Get emergency team catalog | Public |
| GET | `/api/lab-tests` | Browse lab tests | Public |
| GET | `/api/lab-tests/:id` | Get lab test detail | Public/handler-dependent |
| GET | `/api/modalities` | Browse radiology modalities | Public |
| GET | `/api/hospitals` | Browse hospitals | Public |
| GET | `/api/critical-care-doctors` | Browse critical-care doctors | Public |
| GET | `/api/bookings` | List current seeker bookings | Authenticated seeker |
| GET | `/api/user/dashboard` | Load seeker dashboard | Authenticated seeker |
| POST | `/api/user/dashboard/hide` | Hide dashboard item | Authenticated seeker |
| GET | `/api/bookings/:id` | Get booking detail | Participant/admin |
| POST | `/api/bookings` | Create consultation, lab, or teleradiology booking | Authenticated |
| PATCH | `/api/bookings/:id` | Update booking/patient/clinical data | Authenticated/ownership |
| PATCH | `/api/bookings/:id/status` | Update booking status | Provider/admin restrictions |
| PATCH | `/api/bookings/:id/on-call-doctor` | Update on-call doctor information | Participant/provider ownership |

## Booking files, reports, prescriptions, and reviews

| Method | Endpoint | Purpose | Access |
|---|---|---|---|
| POST | `/api/bookings/:id/call-document` | Attach a document during a call | Participant/ownership |
| PATCH | `/api/bookings/:id/documents` | Update consultation documents | Seeker owner/time-window gates |
| PATCH | `/api/bookings/:id/treatment-charts` | Update treatment charts | Seeker owner/time-window gates |
| PATCH | `/api/bookings/:id/prescription` | Create/update provider prescription draft | Provider/admin |
| GET | `/api/bookings/:id/prescription-pdf` | Generate/read prescription PDF | Booking owner/provider/admin |
| POST | `/api/bookings/:id/prescription/confirm` | Sign and lock prescription | Assigned provider |
| GET | `/api/bookings/:id/prescription/download` | Download prescription | Booking owner/provider/admin |
| POST/GET | `/api/bookings/:id/prescription-reviews` | Create/list follow-up reviews | Provider create; owner/provider/admin read |
| GET | `/api/bookings/:id/prescription-trail/download` | Download cumulative review trail | Owner/provider/admin |
| GET | `/api/prescription-reviews/:reviewId/download` | Download one review | Ownership-authorized |
| GET | `/api/verify/prescription/:bookingId` | Public prescription verification | Public |
| POST | `/api/upload/report` | Upload provider/admin report | Provider/admin |

There is no separate report-read endpoint; report URLs are returned through booking data. There is no generic file-delete/download API registered; consumers receive authorized URLs.

## Provider dashboard, services, availability, and billing

| Method | Endpoint | Purpose | Access |
|---|---|---|---|
| GET | `/api/providers/me` | Get current provider profile | Authenticated provider |
| POST | `/api/providers/auto-create` | Create provider record when applicable | Authenticated |
| POST | `/api/providers` | Create provider profile/onboarding | Authenticated |
| PATCH | `/api/providers/me` | Update provider profile | Authenticated provider |
| GET | `/api/provider/bookings` | List provider bookings | Authenticated provider |
| GET | `/api/provider/dashboard` | Load provider dashboard | Authenticated provider |
| GET/POST/PATCH/DELETE | `/api/provider/my-labs[/:id]` | Manage provider lab services | Provider |
| GET/POST/PATCH/DELETE | `/api/provider/my-consultants[/:id]` | Manage provider consultants | Provider |
| GET/POST/PATCH | `/api/provider/my-emergency-teams[/:id]` | Manage emergency teams | Provider |
| GET/POST/PATCH/DELETE | `/api/provider/labs[/:id]` | Lab/service CRUD | Provider |
| GET/POST/PATCH/DELETE | `/api/provider/consultants[/:id]` | Consultant/service CRUD | Provider |
| GET/POST/PATCH/DELETE | `/api/provider/emergency-teams[/:id]` | Emergency-team CRUD | Provider |
| GET/POST/PATCH | `/api/provider/modalities[/:id]` | Modality management | Provider |
| GET/POST/PATCH | `/api/consultants/:id/slots` | Manage consultant availability slots | Authenticated/ownership |
| GET/POST/DELETE | `/api/consultants/:id/slot-overrides[/:date]` | Manage date-specific overrides | Authenticated/ownership |
| GET | `/api/consultants/:id/public-slot-overrides` | Read public slot overrides | Authenticated/handler-dependent |
| GET | `/api/billing/provider-earnings` | Load provider earnings | Authenticated provider |

There is no dedicated availability-search endpoint. Consultant discovery currently uses the consultant catalog and handler query behavior.

## Calls and communication

| Method | Endpoint | Purpose | Access |
|---|---|---|---|
| GET | `/api/bookings/room/:roomUrl` | Get authorized room information | Authenticated participant |
| GET | `/api/bookings/room/:roomUrl/daily-token` | Get Daily video token | Authenticated participant |
| GET | `/api/call/incoming` | Poll incoming calls | Authenticated |
| GET | `/api/call-events` | Receive call events/SSE where configured | Authenticated |
| POST | `/api/call/ring/:bookingId` | Ring participant | Authenticated/ownership |
| POST | `/api/call/accept/:bookingId` | Accept call | Authenticated/ownership |
| POST | `/api/call/decline/:bookingId` | Decline call | Authenticated/ownership |
| POST | `/api/call/cancel/:bookingId` | Cancel call | Authenticated/ownership |
| GET | `/api/call/status/:bookingId` | Read call state | Authenticated participant |
| GET | `/api/bookings/:id/call-window` | Read call-window state | Authenticated participant |
| PATCH | `/api/bookings/:id/call-window/extend` | Extend call window | Admin |
| POST | `/api/bookings/:id/call` | Start masked voice call | Authenticated |
| GET | `/api/admin/bookings/:id/call-logs` | Read call logs | Admin |

**Confirmed gaps:** No `/api/chat`, message, conversation, websocket, or chat-history endpoint is registered. No notification inbox/list/read-state API is registered; push/voice/SMS are currently side effects.

## Push notifications and storage

| Method | Endpoint | Purpose | Access |
|---|---|---|---|
| GET | `/api/push/vapid-public-key` | Get push public key | Public |
| POST/DELETE | `/api/push/subscribe` | Register/remove web push subscription | Authenticated |
| POST/DELETE | `/api/push/mobile-token` | Register/remove mobile push token | Authenticated |
| POST | `/api/upload/document` | Upload document | Authenticated |
| POST | `/api/upload/registration-document` | Upload registration document during signup | Registration flow |
| PATCH | `/api/consultants/:id/photo` | Update consultant photo | Authenticated/ownership |
| POST | `/api/consultants/:id/upload-photo` | Upload consultant photo | Authenticated/ownership |
| POST | `/api/consultants/:id/upload-signature` | Upload consultant signature | Authenticated/ownership |

No generic authorized file deletion endpoint is registered.

## Payments and billing

| Method | Endpoint | Purpose | Access |
|---|---|---|---|
| POST | `/api/payments/create-order` | Create Razorpay order | Authenticated booking owner |
| POST | `/api/payments/create-bulk-order` | Create combined order | Authenticated booking owner |
| POST | `/api/payments/verify` | Verify payment and record result | Authenticated/HMAC |
| GET | `/api/billing/my-invoices` | Read seeker invoices | Authenticated |
| GET | `/api/bookings/:id/receipt` | Generate/download receipt | Owner/provider/admin |
| POST | `/api/admin/bookings/:id/payment` | Record manual payment | Admin |
| GET | `/api/admin/billing/invoices` | List admin invoices | Admin |
| GET | `/api/admin/billing/overdue` | List overdue invoices | Admin |

There is no registered payment webhook; payment verification is client-initiated.

## Admin

Admin routes include dashboard stats, bookings, pending registrations, provider approval, user role/profile/account status, consultants, lab tests, radiology modalities, provider service assignments, suggestions, margin settings, due dates, invoices, audit log, revenue analytics, agreements, reminders, Twilio/Exotel diagnostics, and booking call logs. All admin routes are protected by the admin guard in the route registration.

## Mobile planning consequences

1. Use existing routes for authentication, bookings, provider operations, files, prescriptions, calls, push registration, and billing.
2. Treat chat/history and notification inbox/read state as explicit backend gaps; do not fake them in mobile UI.
3. Treat agreement, approval, ownership, follow-up call/video permission, and suspension as server-authoritative.
4. Any missing capability should be added once to the shared API and kept backward-compatible with the website.