---
name: Call participant labels
description: Product rule for naming the other participant in consultation waiting and call actions.
---

Consultation waiting prompts and call actions should display the opposite participant’s account name. Generic labels such as “Care Seeker” or “Care Provider” are fallbacks only when an account name is unavailable.

**Why:** The product owner explicitly chose participant account names across web, mobile, admin, and provider call surfaces rather than generic role-only wording.

**How to apply:** Resolve the participant role and opposite participant name on the authenticated server response. Do not infer identity from a return URL or expose phone numbers to construct the label.