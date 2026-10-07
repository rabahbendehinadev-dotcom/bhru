---
name: BHRU authentication UX boundaries
description: User-requested separation of subscriber and platform administrator sign-in without redesign.
---

Keep subscriber sign-in and administrator sign-in separate. Do not expose the administrator entry in subscriber-facing Login, Register, Panel, Navigation, Footer or HTML links. Subscriber registration creates a real account, never a predefined or demo subscriber. A Platform Admin must NEVER register as a subscriber first; never use the owner's existing subscriber as the administrative solution.

**Why:** The owner explicitly corrected subscriber-backed promotion and requires completely independent administrator authentication. Visual changes must not change these authentication boundaries.

**How to apply:** Keep the private runtime administrator entry and account-creation-free administrative login. Knowing the path never grants access. Bootstrap the first independent administrator through a trusted CLI only; do not copy existing subscriber credentials or rely on subscriber sessions. Never tell the owner to register an administrator through /register.

Do not rename or regenerate the established private administrator URL during subscriber/theme work or a routing repair. Do not add an alternate administrator route. Public `/login` remains the subscriber entry.

**Why:** The owner explicitly requires the existing private entry to survive subscriber refactors, without recreating the administrator account.

**How to apply:** Preserve the owner's established URL in runtime configuration. Correct configuration mismatches rather than introducing a new route or changing account/session logic.

Subscriber presentation-only verification must not create test accounts or insert database sessions.

**Why:** The user excludes account and database changes during subscriber UI and navigation work.

**How to apply:** Use isolated browser-side GET response fixtures for protected presentation, and clearly distinguish those checks from real sign-in verification. Confirm anonymous protection separately without submitting account mutations.

The public subscriber authentication experience is BHRU's primary commercial entrance, not just an isolated sign-in form. Marketing must describe actual product capabilities and licence/add-on conditions honestly; never invent statistics, testimonials, customer endorsements or unsupported account actions.

**Why:** The user explicitly requested an intentional premium BHRU SaaS entrance and rejected generic landing-page claims and fake OAuth/recovery controls.

**How to apply:** Keep subscriber public presentation separate from the private administrator entry and protected panel. Distinguish illustrative product previews from live account data, and do not present scaffold-only modules as working capabilities.

The public Login/Register visual reference is a close composition target, not loose inspiration: marketing left, framed desktop/mobile product showcase center, authentication right, and compact module cards below.

**Why:** The user rejected the earlier flat editor-like previews and loose interpretation of the reference. They want screenshot-quality BHRU product presentation, without changing working authentication.

**How to apply:** Preserve recognizable subscriber/storefront visual language in the showcase. For presentation-only revisions, keep verification short and leave functional/visual acceptance to the user; do not repeat account-creation tests.