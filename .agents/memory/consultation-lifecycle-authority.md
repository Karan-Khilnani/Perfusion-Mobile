---
name: Consultation lifecycle authority
description: Server-owned schedule timing and persisted pause semantics for consultations.
---

Consultation availability is derived on the server from the explicit appointment date/time in IST: Scheduled becomes Ongoing at the saved start, and Completed at start plus 24 hours. Persist provider pause/resume in the existing booking status; do not add a second lifecycle flag or trust client timers. Weekday-only, emergency, or otherwise unresolvable slots fail closed rather than inventing a start time. Legacy call/video flags must not become a competing authority; keep upload and Clinical Advisory behavior separate.

Availability windows are not reservations. The existing consultation flow does not define which booking states or overlapping appointment windows block another booking. Do not add booked-slot exclusion or conflict rejection until that policy is explicit and enforced server-side, including concurrent booking attempts.

**Why:** The shared web/mobile API and call gates must agree on the same server-clock lifecycle, and guessing a date could expose calls or writable records at an unsafe time.

**How to apply:** Keep lifecycle derivation in the API. Any compatibility responses or controls that still use legacy call/video fields should reflect or transition the same status, while preserving existing ring/accept routing and unrelated upload/advisory data. Before implementing slot conflicts, agree on blocking statuses, time-window overlap rules, legacy schedule parsing, and race-safe booking enforcement.