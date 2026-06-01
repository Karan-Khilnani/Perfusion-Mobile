---
name: Click-wrap agreement system
description: Architecture decisions and gotchas for the Perfusion click-wrap agreement system
---

## How it works

- `user_agreements` table created via incremental startup migration in `index.ts` (same pattern as `call_logs`).
- `AGREEMENT_VERSION = "v1.0"` in `agreement-text.ts`. Bump this string to force all users to re-accept.
- API routes: `GET /api/agreements/check` and `POST /api/agreements/sign` both use `isAuthenticated` middleware — they are NOT blocked by a hypothetical agreement middleware so the gate can call them.
- Sign endpoint is idempotent (checks for existing row before inserting).
- PDF is generated asynchronously after the HTTP response is sent (non-blocking). `pdf_url` column is updated once ready.
- `AgreementGate` in frontend wraps the entire Router. It skips for: unauthenticated users, admins (`role === "admin"`), users with `approvalStatus !== "approved"`.

**Why:**
- Courts need the actual document with embedded metadata, not a screenshot.
- Non-blocking PDF generation prevents sign latency (Supabase upload takes ~1-3s).
- Gate in UI (not middleware) avoids chicken-and-egg: the sign endpoint itself must be reachable without agreement.

**How to apply:**
- To update the agreement: change `AGREEMENT_VERSION` in `agreement-text.ts` AND `agreement-pdf.ts` AND the frontend `AGREEMENT_VERSION` constant in `agreement-gate.tsx`. All three must match.
- Admin can view all signed agreements at `/admin/agreements`.
