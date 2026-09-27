---
name: Stream Android PiP bridge
description: Version-specific gap between the Stream React Native SDK PiP helper and its Android native module.
---

The installed Stream Android SDK can expose `enterPiPAndroid()` in JavaScript without exposing the native `enterPipMode` method that helper invokes. TypeScript passing is not proof that Back-to-PiP works. Confirm the Kotlin bridge exists in the generated Android project after Expo prebuild.

**Why:** A JS helper can compile while its NativeModules target is missing at runtime; the failure appears only on a device when entering PiP.

**How to apply:** Whenever enabling PiP with this SDK, inspect the installed Android module and generated manifest/activity, then run Android prebuild before telling the user Back-to-PiP is ready.