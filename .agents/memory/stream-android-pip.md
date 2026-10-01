---
name: Stream Android PiP bridge
description: Version-specific gap between the Stream React Native SDK PiP helper and its Android native module.
---

The installed Stream Android SDK can expose `enterPiPAndroid()` in JavaScript without exposing the native `enterPipMode` method that helper invokes. TypeScript passing is not proof that Back-to-PiP works. Confirm the Kotlin bridge exists in the generated Android project after Expo prebuild.

**Why:** A JS helper can compile while its NativeModules target is missing at runtime; the failure appears only on a device when entering PiP.

**How to apply:** Whenever enabling PiP with this SDK, inspect the installed Android module and generated manifest/activity, then run Android prebuild before reporting that native PiP is configured. A prebuild is not device verification.

In-app minimize must not enter Android system PiP: the user explicitly wants normal app navigation with a floating video overlay, while system PiP is reserved for leaving the app.

**Why:** Android system PiP moves the Activity out of normal in-app navigation; it cannot substitute for an overlay within the app.

**How to apply:** Preserve the same mounted media session across in-app navigation, and restore its full view without reconnecting.

The Stream auto-PiP hook alone only covers Android 12+; Android 8–11 requires the Activity's `onUserLeaveHint` implementation, gated by the SDK's joined-call auto-PiP flag.

**Why:** The installed SDK sets native auto-entry parameters only on Android 12+, and delegates older Android Home-to-PiP handling to the host Activity.

**How to apply:** Verify the generated leave-hint override after prebuild and do not infer older-device Home behavior from a successful Android 12+ test.

When `MainActivity` directly calls the SDK's Kotlin PiP singleton, also declare the Stream Android project as an app-level Gradle dependency from the config plugin. The native package may be discovered for React Native package registration without its classes being visible to app-source compilation in a cloud build.

**Why:** An EAS Kotlin compile reported the singleton unresolved even though the locked SDK source defined it and Expo autolinking found its Android package.

**How to apply:** Resolve the autolinked Gradle project name from the package name, inject the direct dependency with `withAppBuildGradle`, and verify it appears after Expo prebuild; do not edit generated Android files alone.