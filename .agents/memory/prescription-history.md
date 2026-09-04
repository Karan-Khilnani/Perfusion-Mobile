---
name: Prescription history
description: Product and integrity rules for consultation summaries and follow-up prescription reviews.
---

Keep the initial signed consultation summary and every follow-up review as separate immutable records. Seeker-facing summary views must present them as one chronological trail, and the complete-summary PDF must include every record through the latest review.

**Why:** Overwriting booking-level prescription fields hides follow-up care and breaks the medicolegal history. Individual review PDFs may still be needed, so cumulative PDFs must be stored separately rather than replacing them.

**How to apply:** Serialize review numbering per booking, preserve individual PDF URLs, invalidate cumulative snapshots whenever the ordered trail changes, and provide a freshness path for seeker sessions.