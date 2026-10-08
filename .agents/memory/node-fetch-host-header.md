---
name: Node Host-header forwarding
description: Built-in fetch can discard Host overrides and invalidate tenant-routing tests or development forwarding.
---

In this Node 24 environment, built-in fetch silently ignored an explicit Host header override and sent the URL's localhost host instead.

**Why:** A local HTTP echo confirmed the incoming Host was localhost despite specifying bhru.net. This incorrectly exercised unknown-host rejection instead of public tenant routing.

**How to apply:** Use node:http request when a local test or development bridge must preserve the original Host. Confirm the server's actual received Host, not just the outgoing options. Never weaken production host validation to accommodate a test client's behavior.
