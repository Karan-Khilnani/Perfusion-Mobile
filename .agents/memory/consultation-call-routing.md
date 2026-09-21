---
name: Consultation call routing
description: Product decision for active consultation calling versus preserved cellular fallback capability.
---

Web consultation voice and video actions must use the in-app ring/accept/decline/cancel flow and the shared Daily room. Ward Contacts, callback fields, and the Twilio cellular bridge remain preserved but are not part of normal seeker/provider booking or calling UI.

**Why:** Cellular callback calling was intentionally paused without dismantling the stored data or backend capability, so it can be re-enabled later as an explicit fallback.

**How to apply:** New seeker/provider call controls must not invoke the legacy booking cellular-call endpoint or depend on a callback number. Keep mobile work separate unless the user explicitly resumes it.