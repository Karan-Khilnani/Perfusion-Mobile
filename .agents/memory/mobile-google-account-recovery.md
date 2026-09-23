---
name: Mobile Google-account recovery
description: Safe fallback for mobile users whose accounts were created through Google
---

When the mobile client does not have a native Google OAuth flow, Google-only accounts must use a verified email-code flow to create a password before email/password login is allowed. Never treat an arbitrary password as valid for an account with no stored password.

**Why:** The server can create Google accounts without a password, while the mobile client only had email/password login. The old behavior exposed a dead-end Google-sign-in error.

**How to apply:** Keep the password setup request and completion endpoints limited to accounts with a Google identity and no password, use a short-lived code sent to the account email, then reuse the normal password login path. Keep registration and email verification reachable from the mobile auth stack.