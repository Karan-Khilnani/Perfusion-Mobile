---
name: Android call ringtone channels
description: Native and in-app ringtone behavior for incoming calls on Android.
---

For app-closed Android calls, rely on the native incoming-call notification channel and its sound. JavaScript audio is only a fallback while the app is running. Treat changing the ringtone as a native-build change; it is not delivered by refreshing the preview.

**Why:** Android retains notification-channel sound settings after creation. Changing the sound of an existing channel does not update devices that already created it; a distinct channel identity is needed. Neither an in-app audio player nor a visual call overlay can ring from a stopped JavaScript process.

**How to apply:** On ringtone changes, ensure the installed native call module is configured to create a new incoming-call channel, bundle the sound resource in the Android build, and check actual ringtone behavior on a physical phone. Respect the device's silent, volume, and Do Not Disturb settings.