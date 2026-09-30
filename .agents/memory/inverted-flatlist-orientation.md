---
name: Inverted FlatList orientation
description: React Native inverted FlatList transforms and orientation of header/footer content.
---

React Native's inverted FlatList applies platform-specific inversion to the scroll view and compensating inversion to list, header, and footer wrappers. Do not add manual `scaleY: -1` transforms to header/footer children such as empty states or date dividers; they can become mirrored or upside down.

**Why:** The Case File empty-state copy and date divider were flipped while message rows and the composer remained upright. The extra child transforms caused the mismatch.

**How to apply:** Keep `inverted` when needed for bottom-anchored message ordering, and inspect the list's built-in wrapper transforms before adding any per-child transform.