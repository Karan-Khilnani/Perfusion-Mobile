---
name: Mobile Google OAuth handoff
description: Security and account-lifecycle rules for Google Sign-In in the native mobile app.
---

Use the existing server-side Google OAuth account-linking flow for mobile. Return to the app with an opaque, short-lived, database-backed ticket that is single-use and bound to an app-generated PKCE verifier. Never place Google access tokens or the normal application session identifier in a deep link.

**Why:** The configured web OAuth client can serve Android and iOS without adding native Google SDK credentials. Custom URL schemes can be intercepted by another app, so the callback ticket alone must not be sufficient to create a session.

**How to apply:** Preserve OAuth state validation in the browser session, atomic ticket consumption, PKCE verification, normal approval rules, and in-app profile completion for first-time Google users. Expo Go cannot verify delivery of the app-specific `perfusion-mobile://` callback; use an installed development or preview build with a real Google account before release.