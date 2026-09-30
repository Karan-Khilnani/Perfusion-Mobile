---
name: Consultation call routing
description: Product decision for active consultation calling versus preserved cellular fallback capability.
---

Web and mobile consultation voice and video actions must use the ring/accept/decline/cancel flow. Stream Video is the default; Daily is available only as an explicit rollback option. Both sides enter media only after the recipient accepts; enforce that boundary when issuing Stream credentials or Daily tokens, not only in the client UI. On mobile, open media inside the app; voice mode starts with video off. Ward Contacts, callback fields, and the Twilio cellular bridge remain preserved but are not part of normal seeker/provider booking or calling UI.

**Why:** Cellular callback calling was intentionally paused without dismantling the stored data or backend capability, so it can be re-enabled later as an explicit fallback. Media credentials issued while ringing bypass the recipient's answer, even if the screen itself appears to wait. Earlier project notes described Daily as the default, but the current server defaults to Stream.

**How to apply:** New seeker/provider call controls must ring the other participant before entering media, must not invoke the legacy booking cellular-call endpoint, and must not depend on a callback number. Keep call transitions and delayed cleanup tied to the specific call generation so a stale accept or timer cannot affect a redial. Mobile call screens need explicit camera/microphone permission handling and an in-app leave path.

Selected-installation identifiers are routing labels, not proof that an authenticated request came from a specific physical device. Provider-to-seeker incoming delivery should fail closed when the chosen installation is unavailable, but this shared-login design is not tamper-proof per-device authentication.

**Why:** Everyone uses the same seeker account; a client with that account can submit an installation identifier belonging to another registered staff device. Preventing accidental account-wide ringing and preventing deliberate device impersonation are different guarantees.

**How to apply:** Keep provider-to-seeker incoming events and push scoped to the booking's chosen installation while preserving provider-side call behavior. Do not claim physical-device identity verification without adding a separate enrollment proof and server-side binding.