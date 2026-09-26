---
name: Clinical field separation
description: Durable semantics for structured consultation fields and legacy Case File summaries.
---

Do not use a generic clinical summary as a substitute for Presenting Complaint or Present Illness. New consultation inputs must map to their own fields; Examination and Investigations remain separate; do not synthesize a Clinical Summary without an explicit product rule. Preserve legacy summaries as summaries, and only remove a known duplicate complaint when the original summary remains accessible.

**Why:** Older records may contain the same generic summary in both complaint and history fields. Treating that text as verified complaint or illness detail invents clinical meaning and makes the Case File misleading.

**How to apply:** Keep new booking fields independent across Web and Mobile. For legacy records, retain the old summary under Clinical Summary, avoid complaint/illness fallbacks, and preserve any complaint that does not exactly match the known duplicated source.