---
name: Expo native startup diagnosis
description: Native module initialization can precede JavaScript imports and authentication
---

Do not assume a deferred JavaScript import or an authenticated-only effect prevents an Expo native module from initializing at app startup.

**Why:** During the Android launch investigation, tracing Expo SDK 54's native module registry showed that it dispatches module `OnCreate` callbacks eagerly. The call module's callback performs Firebase token registration without catching a missing-default-FirebaseApp exception. Inspection of the distributed APK confirmed missing Firebase configuration resources. This establishes a concrete startup failure path, but no phone crash log was available to identify the first exception on the user's device.

**How to apply:** Investigate native lifecycle callbacks and the actual APK's resources before attributing a pre-sign-in crash to backend publication order or to JavaScript auth guards. Compilation and a working web preview do not verify native launch. Optional calling/push initialization should not be allowed to abort core application startup.