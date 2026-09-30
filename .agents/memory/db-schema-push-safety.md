---
name: Development schema push safety
description: Schema push can request unrelated destructive changes when database constraints have drifted.
---

Never force a development schema push that requests truncating an unrelated table. Inspect the proposed operation and preserve the existing rows; apply only safe, additive development changes when needed, then resolve the underlying constraint drift separately before publishing.

**Why:** A harmless nullable-field addition prompted a schema push that wanted to truncate existing case-file data because of an unrelated unique constraint.

**How to apply:** For future database changes, review push prompts rather than accepting them automatically. Do not use this as permission to run DDL on production; production schema changes follow the supported publish flow.