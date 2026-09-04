---
name: Admin credential sharing
description: Approved security policy for participant access details in admin booking workflows.
---

Admin booking details and participant messages may include the relevant account login ID plus existing-password, password-reset, or Google sign-in guidance. They must never expose plaintext passwords, password hashes, or verification codes.

**Why:** Participant passwords use one-way hashing and cannot safely be retrieved. The product owner approved login IDs with access guidance instead of weakening authentication or placing reusable passwords on the clipboard.

**How to apply:** Resolve participant accounts on the server from the booking, sanitize user responses before they leave the API, and audit admin copy/share actions that contain login details.