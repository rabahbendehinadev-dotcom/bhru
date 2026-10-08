---
name: Git authentication recovery
description: Distinguish GitHub App access from workspace source-control authentication.
---

Workspace Git pushes use the GitHub source-control connection, not merely the
installed GitHub App integration. A connection reporting healthy does not prove
that a Git push can authenticate.

**Why:** Pushes were rejected with invalid credentials even when the
source-control connection reported healthy and was already active.

**How to apply:** Use the existing source-control connection's reauthorization
flow after a credential rejection. Keep the completed clean feature commit;
retry it without rewriting history, creating another commit, or exposing tokens.
If the generic integration reconnect card rejects the source-control connection,
consult current Replit docs and use Account settings → Git Providers to reconnect,
not Connected Services. The generic card rejected this connection despite its
healthy status.
