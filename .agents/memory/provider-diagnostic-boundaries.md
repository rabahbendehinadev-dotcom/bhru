---
name: Supplier diagnostics boundaries
description: User requirements for preserving working suppliers and keeping diagnostic observations separate from compatibility approvals.
---

BHRU supports multiple independent DHRU suppliers per reseller. The user states that iFree is working and must remain functional; Unlock OK investigations must remain supplier-independent.

**Why:** The user explicitly identified multi-supplier compatibility as a critical business requirement, including future suppliers.

**How to apply:** Never introduce supplier-name exceptions or relax shared validation merely to make a target supplier pass.

Diagnostic classifications do not authorize accepting additional API versions. The user has not approved accepting version 2023.21. Operator diagnostic execution must not require pausing or restarting the shared production worker.

**Why:** The user explicitly separated investigation from compatibility approval and rejected worker-pause/environment-update races.

**How to apply:** Keep observation and parser acceptance separate, and require a new explicit approval before broadening protocol support.
