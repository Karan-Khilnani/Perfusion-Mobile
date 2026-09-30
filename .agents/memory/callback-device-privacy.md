---
name: Callback-device privacy
description: Privacy boundary for personal numbers associated with consultation callback devices.
---

Personal callback-device numbers are visible to the account owner for directory management. They must not appear in provider views, ordinary Case File responses, reminder payloads, or booking lists. An admin may reveal the number only on deliberate request for an active consultation; the response is no-store and the access is audited without recording the number.

**Why:** The personal number is an emergency fallback contact, not the normal consultation call route. Broadly returning it would expose contact information to providers, cached clients, and push systems.

**How to apply:** Keep numbers out of aggregated booking APIs and notifications. Use a dedicated admin-only reveal path, check consultation state and device ownership, and audit access without copying the number into logs.