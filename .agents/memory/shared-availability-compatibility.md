---
name: Shared availability compatibility
description: Keeping Mobile weekly availability and Web-written consultant schedules consistent without changing the Web editor
---

Mobile and Web must read and write the same consultant schedule. When Mobile turns a day off, retain its windows for later re-enabling but exclude them from server-computed bookable slots. Do not infer day-off from an empty schedule or erase Web-written windows.

**Why:** The user explicitly considers the Web availability flow correct and wants Mobile connected to it without changing Web behavior. The legacy schedule also has fallbacks; stale fallback windows can resurface after deleting the last Mobile window unless Mobile clears them when it takes ownership of that schedule.

**How to apply:** When adding schedule formats or availability computations, test Web-written weekly series and overrides alongside Mobile on/off and paused windows. Keep Web response behavior unchanged except for the shared schedule's intended availability effects; prefer additive flags over a replacement model.