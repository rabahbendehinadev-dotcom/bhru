---
name: Provider key safety
description: User-required safeguards when replacing an exposed provider encryption key.
---

Before storing real provider credentials after a reported key exposure, verify
the configured Preview database identity and count encrypted provider records.
If none exist, ask the user to supply a newly generated cryptographically secure
32-byte Base64 key through Secrets only. Verify readiness without displaying it.
If encrypted records exist, never overwrite the key; stop and propose a
version-aware re-encryption procedure that preserves every connection.

**Why:** The user explicitly reported a screenshot exposure and required safe
rotation before continuing provider integration.

**How to apply:** Secret existence or a successful encryption round-trip proves
configuration readiness, not that the key differs from an exposed predecessor.
Do not claim independent rotation proof without such evidence. Never retrieve,
print or persist keys in reports/memory. Preview verification says nothing about
VPS or production credentials.
