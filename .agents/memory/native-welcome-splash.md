---
name: Native welcome splash limits
description: How to preserve a consistent branded launch across Android's native splash and the in-app welcome view.
---

Android's system splash shows a centered icon over a solid background; the Expo splash configuration cannot place a tagline at the bottom or reproduce a full-height gradient there. Keep the native logo within generous transparent padding and make its solid background match the top of the approved welcome gradient. Show the responsive gradient, centered logo, and bottom tagline in the in-app loading view as soon as it can render.

**Why:** A logo touching the edge of a wide native splash image can be clipped by the system, while holding the native splash through network loading leaves the bottom tagline invisible.

**How to apply:** When changing the welcome design, align native and in-app colors and logo proportions together. Native asset changes require a new native build; JavaScript changes alone do not replace an installed app's system splash.