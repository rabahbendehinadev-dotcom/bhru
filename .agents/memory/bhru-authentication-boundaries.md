---
name: BHRU authentication UX boundaries
description: User-requested separation of subscriber and platform administrator sign-in without redesign.
---

Keep subscriber sign-in and administrator sign-in separate. Do not expose the administrator entry in subscriber-facing Login, Register, Panel, Navigation, Footer or HTML links. Subscriber registration creates a real account, never a predefined or demo subscriber.

**Why:** The owner explicitly requested this separation while retaining the existing dark login design and all dashboard/sidebar/panel designs.

**How to apply:** Make the administrator entry configurable via PLATFORM_ADMIN_PATH at runtime, not a hardcoded frontend path. Keep administrator login free of account-creation UI. Knowing the path is not authorization: require real password authentication, enabled administrative membership and server-side authorization. Administrator promotion remains a trusted administrative operation only.