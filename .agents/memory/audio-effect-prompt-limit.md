---
name: Audio effect prompt limit
description: Provider text limit for generated sound effects in this project.
---

Keep sound-effect generation prompts under 450 characters.

**Why:** The provider rejected a longer otherwise-valid sound prompt with a 400 validation error and reported a 450-character maximum that was not clear from the generation interface.

**How to apply:** For future app sounds, use a concise prompt focused on timbre, cadence, duration, and exclusions; check character count before dispatching a generation job.