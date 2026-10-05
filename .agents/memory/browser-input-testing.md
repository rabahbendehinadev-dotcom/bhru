---
name: Browser input capability testing
description: Desktop viewport size does not imply hover support in the remote test browser.
---

The remote test browser can report no hover even at desktop viewport widths. Width alone is not evidence of a fine-pointer desktop context.

**Why:** Subscriber flyout checks required a narrowly scoped browser-only input-media shim, while real touch-enabled contexts correctly exercised tablet drawers.

**How to apply:** Inspect hover and pointer media capabilities before diagnosing navigation failures. Prefer real input emulation; disclose any page-only shim and never change application behavior merely to accommodate the test browser.
