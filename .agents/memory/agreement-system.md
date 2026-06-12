---
name: Click-wrap agreement system
description: Durable design decisions and gotchas for the Perfusion click-wrap agreement system
---

## Decisions

- **Server is the single source of truth** for the agreement version and canonical text (returned as `content` field). The frontend never hardcodes either.
  - **Why:** prevents version/text drift between the gate, the rendered page, and the generated PDF.
  - **How to apply:** to publish a new agreement version, bump the version constant and body in the agreement-text service only.

- **Enforcement fails closed.** If the DB check cannot positively confirm a signed row, an approved non-admin user is treated as requiring the agreement. Admins and non-approved users are always exempt.
  - **Why:** a fail-open check let users bypass a legally-required signature on any lookup failure.

- **Login response must mirror /api/auth/user.** The `/api/auth/login` endpoint computes and returns `requiresAgreement` before `req.session.save` so the React Query cache is hydrated with the correct value immediately — preventing gate bypass when staleTime prevents a refetch.
  - **Why:** stale cache from login response was the primary bypass path for email/password logins (flagged in code review).
  - **How to apply:** any POST auth route that calls `queryClient.setQueryData(['/api/auth/user'], ...)` in the frontend must include `requiresAgreement` in the response.

- **Provider org name must come from the provider record** (`registeredOrganization`), not from the user row (`hospitalName`). Both `/api/agreements/current` and `/api/agreements/sign` must use the same resolved value so the displayed agreement and the stored/PDF legal record are consistent.
  - **Why:** legal record inconsistency between displayed and stored org name was flagged as a compliance risk.

- **Idempotency is enforced at the DB layer**: unique index on `(user_id, agreement_version)` + `INSERT ... ON CONFLICT DO NOTHING`. Concurrent double-submits collapse to one row.

- **PDF generation is non-blocking** — the sign response returns immediately; PDF URL filled in afterward.

- **Frontend gate is a redirect guard, not a modal.** Redirects to the dedicated `/agreement` route. The gate and the login onSuccess handler both enforce the redirect.

## Migration gotchas (incremental startup migrations)

- Schema changes are applied as a flat sequence of raw `pool.query` calls at startup. A failing query crashes startup — retrofits for pre-existing installs must be safe: backfill nullable→NOT NULL in two steps, dedupe before adding a unique index, and add/validate a retrofit FK inside a try/catch (`NOT VALID` + `VALIDATE CONSTRAINT`) so a legacy orphan row cannot block boot.
