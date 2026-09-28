---
name: Case File video originals
description: Why playback conversion must not replace the uploaded clinical video.
---

Keep original Case File videos private and downloadable unchanged; if a device produces MOV or WebM (or a browser-incompatible codec), create a separate private MP4 playback copy. Signed inline access may use the copy, but explicit downloads must always resolve to the original.

**Why:** Cross-platform playback needs a compatible stream, while clinicians must be able to retrieve exactly the video they uploaded. Publishing either copy to make playback work would bypass Case File participant authorization.

**How to apply:** When adding viewers, exports, cleanup, or storage migrations for Case File video attachments, maintain this distinction and keep both objects behind participant-checked short-lived URLs.