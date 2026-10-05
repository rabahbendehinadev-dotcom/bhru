---
name: PWA offline testing
description: Browser network emulation can report offline while service-worker fetch still reaches the development server.
---

Do not diagnose an offline-fallback bug solely from browser offline emulation or `navigator.onLine`.

**Why:** In this workspace's Chromium testing environment, CDP offline emulation made both the page and worker report offline, yet a no-store worker fetch still returned live Vite HTML. The uncached development modules then failed on the page, producing a misleading blank screen. A controlled navigation-fetch failure correctly rendered the cached offline notice.

**How to apply:** Verify that the worker's actual network request fails and inspect its active version and cached fallback body. If network emulation does not reach the worker fetch path, use a disposable browser context with a temporary navigation-only worker fetch failure, restore it afterward, and describe that testing limitation honestly. Never modify application fallback logic merely to accommodate this emulation mismatch.