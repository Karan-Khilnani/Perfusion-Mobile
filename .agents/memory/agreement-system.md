---
name: Click-wrap agreement system
description: Durable design decisions and gotchas for the Perfusion click-wrap agreement system
---

## Decisions

- **Server is the single source of truth** for the agreement version and canonical text. The frontend never hardcodes either — it fetches them and renders whatever the server returns.
  - **Why:** prevents version/text drift between the gate, the rendered page, and the generated PDF. There is exactly one place to edit to roll a new version.
  - **How to apply:** to publish a new agreement version, bump the version constant and body in the agreement-text service only; the startup migration default and all API responses follow automatically.

- **Enforcement fails closed.** If the "has this user signed the current version?" check cannot positively confirm a signed row (e.g. transient DB error), an approved non-admin user is treated as still requiring the agreement. Admins and non-approved users are always exempt.
  - **Why:** a fail-open check let users bypass a legally-required signature on any lookup failure (flagged in code review).

- **Idempotency is enforced at the DB layer**, not just application logic: a unique index on `(user_id, agreement_version)` plus `INSERT ... ON CONFLICT DO NOTHING`. Concurrent double-submits collapse to one row; the loser re-reads the winning row.
  - **Why:** a SELECT-then-INSERT check races under concurrency and produced duplicate signature rows.

- **PDF generation is non-blocking** — the sign response returns immediately and the PDF URL is filled in afterward.
  - **Why:** Supabase upload takes ~1-3s; courts need the actual rendered document (with embedded metadata incl. the device/browser fingerprint), not a screenshot.

- **Frontend gate is a redirect guard, not a modal/middleware.** It reads a `requiresAgreement` flag from the auth endpoint and redirects to a dedicated, route-accessible agreement page. The signing UI lives on that page, never inside the gate.
  - **Why:** keeps the sign/current endpoints reachable before signing (no chicken-and-egg) and gives the agreement its own URL.

## Migration gotchas (incremental startup migrations)

- This project applies schema changes as a flat sequence of raw `pool.query` calls at startup (same pattern as other tables here). A failing query crashes startup, so retrofits for pre-existing installs must be safe: backfill nullable→NOT NULL in two steps, dedupe before adding a unique index, and add/validate a retrofit FK inside a try/catch (use `NOT VALID` + `VALIDATE CONSTRAINT`) so a legacy orphan row cannot block boot.
