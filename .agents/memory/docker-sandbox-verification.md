---
name: Docker sandbox verification
description: Distinguish container runtime sandbox limits from application or image failures.
---

In this environment Docker builds and initial container processes can succeed while `docker exec` and exec-based Docker health checks fail with an OCI `setns` sandbox error.

**Why:** A built image started its HTTP server successfully, but the environment rejected secondary exec processes. Running the same server and HTTP assertions as the initial container process succeeded.

**How to apply:** Do not diagnose an exec sandbox failure as a broken application image. Verify the application independently, report the health-check verification limitation explicitly, and require confirmation of Docker health status on the target host.