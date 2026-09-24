---
name: Consultation call routing
description: Product decision for active consultation calling versus preserved cellular fallback capability.
---

Web and mobile consultation voice and video actions must use the ring/accept/decline/cancel flow and the shared Daily room. Both sides enter media only after the recipient accepts; enforce that boundary when issuing Daily tokens, not only in the client UI. On mobile, open the room inside the app with automatic prejoin bypass; voice mode starts with video off. Ward Contacts, callback fields, and the Twilio cellular bridge remain preserved but are not part of normal seeker/provider booking or calling UI.

**Why:** Cellular callback calling was intentionally paused without dismantling the stored data or backend capability, so it can be re-enabled later as an explicit fallback. A room token issued while ringing bypasses the recipient's answer, even if the screen itself appears to wait.

**How to apply:** New seeker/provider call controls must ring the other participant before entering the room, must not invoke the legacy booking cellular-call endpoint, and must not depend on a callback number. Keep call transitions and delayed cleanup tied to the specific call generation so a stale accept or timer cannot affect a redial. Mobile call screens need explicit camera/microphone permission handling and an in-app leave path.