---
name: Persistent upload fallback
description: Why deployed user uploads must never be reported successful when only written to local disk.
---

Uploads intended to survive deployment must either reach durable object storage or fail explicitly. Do not return a successful local `/uploads/...` URL when durable storage is unavailable.

**Why:** Deployed filesystem files are ephemeral. A previous storage outage caused uploads to appear successful, while the saved local URLs later returned 404 after a restart.

**How to apply:** For user-visible persistent uploads, return a safe availability error when object storage fails. Local-disk fallback is acceptable only for clearly temporary development-only behavior and must never be persisted as a production URL.