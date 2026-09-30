---
name: Expo browser route imports
description: Why native-only imports can break the Expo browser preview even on screens that never use them.
---

Expo Router loads route modules eagerly for web. A native-only SDK imported by a call route can crash the entire browser preview with `requireNativeComponent is not a function` even on a sign-in screen. Keep native call behavior, but isolate native-only imports behind platform-specific modules; web implementations should explain unsupported call functionality rather than pretending it works.

**Why:** The browser lacks native RTC view components, but installed Android/iOS builds need the real native call code. A runtime platform guard inside a route is too late if its top-level imports already evaluated.

**How to apply:** When native-only modules are introduced in routes, split their imports into native and web files at the module boundary. Verify both web preview and an Android bundle; this is for design preview, not a substitute for device testing of native calls.