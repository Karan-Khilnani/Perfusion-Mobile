---
name: Consultation callback devices
description: Account-level device directory and per-consultation assignment remain separate from ward and patient contacts
---

Maintain an account-level directory of staff/device pairs, but assign one pair to each consultation. The registered contact number is currently available only for audited admin emergency use; the planned appointment reminder is separate from the booking's cellular callback number. It is not a patient emergency contact or ward contact.

**Why:** One hospital account can have simultaneous consultations in different locations. A global active device would send callbacks to the wrong location, and reusing ward or patient numbers can expose the wrong person's contact details.

**How to apply:** Register and manage staff/device pairs at the account level; allow a seeker to assign any linked pair on that shared account, not just the installation they are currently using. A shift handoff changes one booking's pair in its Case File rather than relinking another staff member's installation. The four-hour due state belongs to that booking and clears only for it. Surface existing confirmation reminders in the Dashboard bell and push notifications, never a second blinking Dashboard body card. Do not repurpose the existing ward/cellular callback number; saving a contact number alone does not activate a telephone bridge or Twilio reminder.