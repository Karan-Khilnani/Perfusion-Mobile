---
name: Code backup scope
description: Safe boundaries for downloadable code snapshots in this workspace
---

Code-only snapshots should include the checked-in source and project assets, with a manifest and checksum, but must exclude runtime uploads, historical migration backups, dependency folders, live secrets, and Git metadata.

**Why:** Runtime files may contain user documents or sensitive data, and nesting an older backup makes a new snapshot larger and harder to trust. Database and uploaded-file recovery belongs in the separate one-way disaster-recovery process.

**How to apply:** Filter tracked paths before archiving, verify the archive contents, and present the archive separately from any database or storage backup. In this workspace, pass the filtered path list explicitly to Git archive rather than relying on an unsupported file-list option.