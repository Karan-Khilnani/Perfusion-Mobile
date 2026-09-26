---
name: Mobile password recovery
description: Security and session rules for the Perfusion mobile email recovery flow.
---

Password recovery proves email ownership with a short-lived, one-time six-digit code. Only after consuming a valid code should the server regenerate and persist the normal authenticated session. Password changes are allowed only within the short recovery window; finishing without changing the password clears that recovery-only permission while keeping the authenticated session.

**Why:** Recovery must provide an alternate route into the existing account without creating a parallel identity/session system or allowing an unverified password change.

**How to apply:** Preserve the verify-before-session boundary and reuse existing account/session architecture when changing recovery behavior. Continue through the app's existing role and account-status routing after recovery.