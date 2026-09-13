---
name: Shared mobile backend
description: Architecture rule for keeping Perfusion web and mobile data synchronized
---

The website and mobile application must use the same API server, authentication records, provider profiles, bookings, files, and PostgreSQL database. Mobile clients must not connect directly to PostgreSQL or maintain a parallel application database.

**Why:** A single server-owned data source keeps account approval, role authorization, booking ownership, prescriptions, and consultation state consistent across web and mobile while allowing both clients to remain active simultaneously.

**How to apply:** Add mobile behavior through authenticated API endpoints. Select role-authorized endpoints for seekers and providers, keep credentials in secure device storage, and make backend changes backward-compatible with the existing website.