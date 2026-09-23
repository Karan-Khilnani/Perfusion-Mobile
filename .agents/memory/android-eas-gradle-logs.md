---
name: Android EAS Gradle logs
description: How to diagnose native APK build failures when EAS reports an unknown Gradle error
---

EAS may return a build log URL ending in `.txt` whose response has `Content-Encoding: br`. A raw downloaded copy looks like binary data; Brotli-decompress it before searching for `FAILURE` or `What went wrong`.

**Why:** An earlier Android build's generic `EAS_BUILD_UNKNOWN_GRADLE_ERROR` obscured a precise Gradle assertion: Reanimated 4 required New Architecture, while the app config had disabled it. Re-fetching the short-lived log URL and decoding the log exposed the cause; enabling New Architecture allowed the next Gradle build to finish.

**How to apply:** For future EAS build failures, get a fresh log URL from the build details, inspect HTTP content encoding, decode the log, and use the specific failed task rather than guessing from the generic build error. In this Expo SDK 54 app, do not disable New Architecture while Reanimated 4 is installed.