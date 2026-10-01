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

When the Perfusion PiP config plugin adds a fully-qualified Stream singleton reference before Stream's MainActivity mod runs, Stream's import helper can mistake that reference for an existing import and skip the import needed by its unqualified lifecycle callback.

**Why:** The helper checks whether the source contains the package string rather than checking for an import declaration; clean prebuild then emits an unqualified `StreamVideoReactNative` call with no import.

**How to apply:** Keep the SDK project as an app-level Gradle dependency and make the custom config plugin idempotently add `import com.streamvideo.reactnative.StreamVideoReactNative` after all generated MainActivity mods; verify on clean prebuild.