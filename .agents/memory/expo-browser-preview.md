---
name: Expo browser preview limitation
description: Expo web preview can fail when the app imports native Stream WebRTC views.
---

The mobile app's Expo browser preview can fail with `requireNativeComponent is not a function` from Stream WebRTC's native camera preview. An Android Expo export can still bundle successfully.

**Why:** The browser runtime does not provide native RTC view components. Changing call routing or removing native call UI just to make the browser preview render can regress the supported mobile call flow.

**How to apply:** When this preview error appears, verify mobile code with typechecking and an Android bundle. Only change RTC routing or add a web-specific call implementation if mobile-web support is explicitly in scope.