---
name: Workspace package installation
description: Installing a dependency into one artifact of a pnpm monorepo.
---

The generic language-package installation callback may attempt a workspace-root `pnpm add` and fail the workspace-root guard when a dependency belongs to a single artifact.

**Why:** The callback does not take a working-directory or workspace-filter parameter. Installing at the root would not correctly express which artifact owns a native package.

**How to apply:** First use the package-management guidance. If the callback hits the workspace-root guard, use pnpm's artifact filter for the package install rather than bypassing the guard with a root install.