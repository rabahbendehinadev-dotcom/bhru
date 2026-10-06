---
name: Browser input capability testing
description: Remote browser input capabilities and locator auto-scrolling can misrepresent real navigation behavior.
---

The remote test browser can report no hover even at desktop viewport widths. Width alone is not evidence of a fine-pointer desktop context.

**Why:** Subscriber flyout checks required a narrowly scoped browser-only input-media shim, while real touch-enabled contexts correctly exercised tablet drawers.

**How to apply:** Inspect hover and pointer media capabilities before diagnosing navigation failures. Prefer real input emulation; disclose any page-only shim and never change application behavior merely to accommodate the test browser.

For sticky-control scroll-preservation tests, measure the viewport at pointerdown and activate an already-visible control using viewport coordinates. A locator click can auto-scroll before activation and invalidate the intended baseline.

**Why:** Menu restoration checks reported a jump from a pre-test scroll position, but the locator had already moved the viewport before the actual pointer event; coordinate activation verified the intended baseline.

**How to apply:** Separate automation-induced scrolling from application scrolling before changing code. Check pre-activation position, locked background offset and post-dismissal position independently.
