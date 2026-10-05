---
name: Frontend cascade
description: Why the subscriber component stylesheet explicitly declares Tailwind layer order.
---

Declare `theme, base, components, utilities` in that order before component-imported layered styles. Put component display/padding/border defaults in the components layer, not unlayered CSS.

**Why:** Component styles can load before the main global stylesheet. Unlayered display defaults override responsive `hidden` utilities, causing duplicated controls and mobile overflow. Merely moving those defaults into a components layer can establish that layer before base; the later preflight reset then overrides component padding and borders. The explicit early order prevents both failures.

**How to apply:** Preserve the early order declaration even if the main Tailwind import declares the same layers later. Check responsive visibility as well as component padding when changing CSS import order or cascade layers.