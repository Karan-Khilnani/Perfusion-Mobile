---
name: Bundled API imports
description: Why internal runtime imports can pass in development but fail in the published API bundle.
---

Use static imports for internal API modules that must be bundled into the single-file server output. Do not assume a runtime-relative dynamic import resolves beside that output.

**Why:** A mobile push-registration route worked in source but returned server errors in the published build because its dynamic relative import looked for a sibling module that had not been emitted. The registration error was silent on the client, which made background calling appear to fail only when the app was closed.

**How to apply:** When changing backend routes that run in the bundled server, inspect the built output for unresolved internal relative imports and verify the published route, not only source compilation. Treat registration failures as delivery blockers.