---
name: Responsive viewport gutters
description: Why mobile overlay bounds need layout-viewport checks, not just document scroll width.
---

Size fixed mobile popovers against their containing block, with left/right safe-area insets, instead of computing their width from `100vw`.

**Why:** Phone-sized browser tests can retain classic scrollbar gutters. Viewport units include that gutter while the layout width excludes it, causing negative left-edge overflow even when document scroll width passes.

**How to apply:** Check both edges of overlays against the document's client width. A passing no-horizontal-scroll assertion alone does not prove a popup is inside the screen.