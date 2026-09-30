---
name: Hospital location labels
description: Choosing location text when a consultation card asks for a city but hospital data is free-form.
---

For provider-facing hospital labels, prefer a structured city when one exists. Otherwise show the saved hospital location as-is rather than extracting a supposed city from its address.

**Why:** A free-form hospital address can contain a street, district, state, or postal code in unpredictable order. Guessing a city from its segments could misidentify the institution.

**How to apply:** When a provider consultation summary needs a hospital-and-city heading, use a city only if the source explicitly supplies one. If not, use the full available hospital location without presenting a parsed fragment as a verified city.