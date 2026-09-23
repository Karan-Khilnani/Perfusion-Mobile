---
name: Mobile Callback Device
description: Distinction between the mobile user's fallback number and clinical or booking contact information
---

The mobile user's Callback Device is an account-level fallback phone, not a patient emergency contact, ward contact, or booking-specific callback number.

**Why:** Those other contact records have different owners and purposes. Reusing them for first-login mobile setup could expose a patient's number or route a call to the wrong person.

**How to apply:** Keep onboarding and profile edits tied to the authenticated account. Only use this number for call fallback after an explicit call-routing integration is designed; saving it alone does not activate a telephone bridge.