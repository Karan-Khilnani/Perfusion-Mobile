---
name: Android APK delivery
description: Provenance of previous installable builds and how to avoid misidentifying their source
---

Previous installable Android APKs for this project were generated through Expo's cloud build service using an Expo credential supplied in the workspace, not through a GitHub-connected build. The user explicitly confirmed this after being incorrectly directed to GitHub.

**Why:** The Expo builds dashboard displays a "Build from GitHub" action regardless of how earlier builds were started. Mistaking that button for proof of GitHub synchronization sent the user toward a stale build path.

**How to apply:** For any new APK request, distinguish an API server build or Expo web preview from an installable native APK. Verify the actual build source and commit before telling the user to install a file. Do not claim a fresh APK exists until the cloud build completes.