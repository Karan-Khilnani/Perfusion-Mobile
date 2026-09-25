---
name: Clinical Advisory PDF privacy
description: Storage and verification boundaries for Clinical Advisory PDFs generated in a Case File.
---

Store Case File Clinical Advisory PDFs only in the existing private Case File bucket and expose them through participant-authorized, short-lived signed URLs. Do not use the legacy public prescription PDF bucket. Public verification may return limited provenance metadata, never clinical details.

**Why:** Clinical Advisory PDFs contain patient information; the legacy public storage path is unsuitable, while the existing private Case File attachment system already enforces participant access.

**How to apply:** When generating or expanding access to Case File Advisory documents, reuse private attachment storage and keep public verification responses limited to non-clinical metadata.