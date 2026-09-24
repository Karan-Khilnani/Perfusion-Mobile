---
name: Android APK delivery
description: Provenance of previous installable builds and how to avoid misidentifying their source
---

Previous installable Android APKs for this project were generated through Expo's cloud build service using an Expo credential supplied in the workspace, not through a GitHub-connected build. The user explicitly confirmed this after being incorrectly directed to GitHub. Current Replit Expo guidance supports Android testing through Expo Go but does not provide native Android APK builds; do not treat the historical route as authorization to use EAS CLI.

**Why:** The Expo builds dashboard displays a "Build from GitHub" action regardless of how earlier builds were started. Mistaking that button for proof of GitHub synchronization sent the user toward a stale build path.

**How to apply:** For any new APK request, check current Replit Expo capabilities first, distinguish API/web builds from native APKs, and offer Expo Go when APK export is unsupported. Verify the actual build source and commit before telling the user to install a file; never claim a fresh APK exists until a supported build completes.