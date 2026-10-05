---
name: BHRU authentication UX boundaries
description: User-requested separation of subscriber and platform administrator sign-in without redesign.
---

Keep subscriber sign-in and administrator sign-in separate. Do not expose the administrator entry in subscriber-facing Login, Register, Panel, Navigation, Footer or HTML links. Subscriber registration creates a real account, never a predefined or demo subscriber. A Platform Admin must NEVER register as a subscriber first; never use the owner's existing subscriber as the administrative solution.

**Why:** The owner explicitly corrected subscriber-backed promotion and requires completely independent administrator authentication while retaining the existing dark design.

**How to apply:** Keep the private runtime administrator entry and account-creation-free administrative login. Knowing the path never grants access. Bootstrap the first independent administrator through a trusted CLI only; do not copy existing subscriber credentials or rely on subscriber sessions. Never tell the owner to register an administrator through /register.