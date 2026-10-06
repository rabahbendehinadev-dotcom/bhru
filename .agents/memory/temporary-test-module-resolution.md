---
name: Temporary test module resolution
description: Caller-relative Pino transport lookup can break scratch server bundles while the running application is healthy.
---

Pino's named development transport resolution depends on the calling bundle's location. Resolving Pino itself through an absolute dependency path does not guarantee that its named transport can be found from a scratch bundle outside the package.

**Why:** A temporary real-handler registration test resolved all external imports but failed before making requests because its bundle could not locate `pino-pretty`. The existing application remained healthy; this was a test-harness resolution problem, not an application regression.

**How to apply:** Keep development transport dependencies resolvable from the temporary bundle's caller location. Do not change application logging, install unnecessary dependencies or mistake scratch-bundle startup errors for application failures. Verification harnesses and their credentials should remain temporary.
