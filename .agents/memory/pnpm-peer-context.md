---
name: pnpm peer-context type errors
description: Diagnosing duplicate-library type identity errors after workspace dependency changes
---

After dependency changes, if many TypeScript errors suddenly report that classes from the same library are incompatible because a protected member belongs to a different declaration, check whether workspace packages resolve that library to different pnpm optional-peer instances. A frozen workspace install can realign their links before analyzing application code.

**Why:** A package addition left the server and a shared library linked to two instances of the same ORM version with different optional-peer contexts. Realigning the workspace links removed hundreds of spurious cross-package identity errors; pre-existing, unrelated errors still remained.

**How to apply:** Inspect actual resolved links and the lockfile's expected peer context. Reinstall from the existing lockfile if they disagree, then rerun the check. Do not assume remaining errors are caused by the same issue.