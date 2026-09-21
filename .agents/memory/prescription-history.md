---
name: Clinical Advisory history
description: Product terminology and integrity rules for signed Clinical Advisories and follow-up reviews.
---

Use “Clinical Advisory” or “Advisory” everywhere users or the public can see the platform’s specialist opinion. Preserve existing prescription-named routes, database fields, and other internal identifiers for backward compatibility. Keep the initial signed Clinical Advisory and every follow-up review as separate immutable records. Seeker-facing views must present them as one chronological trail, and the cumulative PDF must include every record through the latest review.

**Why:** Perfusion provides clinical opinions to the treating team rather than acting as prescriber of record. Internal renaming would risk breaking historical links and integrations. Overwriting records would hide follow-up care and break the permanent history.

**How to apply:** Avoid user-facing “Prescription,” “Rx,” or prescribing language except when explicitly saying an advisory is not a prescription. Keep draft → sign/lock, timestamps, verification, individual PDFs, and the complete ordered trail intact.