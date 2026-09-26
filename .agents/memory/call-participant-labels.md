---
name: Call participant labels
description: Product rule for naming the other participant in consultation waiting and call actions.
---

Consultation labels should identify the other side, not the viewer. For a provider doctor, show the seeker's hospital name as the call title and the booked patient's name beneath it, whether placing or receiving a call. Seekers continue to see the consultant/provider identity. Generic role labels are fallbacks only when the relevant name is unavailable.

**Why:** The product owner first chose participant names rather than generic role labels, then clarified that doctors need the referring hospital and patient, not their own name or only the seeker account holder's name, on both call directions.

**How to apply:** Resolve role, hospital, and patient from the authenticated booking on the server. The doctor-facing native Android call alert must carry these labels in its push payload, because JavaScript may be closed. Do not infer identity from a return URL or expose phone numbers to construct the label.