---
name: Subscriber workspace state
description: User expectations for persistent subscriber workspaces and limits on browser persistence.
---

Switching subscriber workspace tabs must preserve practical page state, especially future forms, filters and searches. Opening or switching modules must not replace the application shell.

**Why:** The user explicitly wants opened pages to remain the same workspace rather than behaving like new application loads.

**How to apply:** Keep page instances and their own route context while tabs are open. Future modules should participate in the shared workspace rather than introduce their own application shells or reset on activation.

Closing a tab removes its opened page instance, not its URL from browser history. Visiting a closed page through Back/Forward must reopen it without duplicating tabs.

**Why:** The user requires genuine URL-linked workspaces with correct browser navigation; deleting the active history target prevents returning to that page.

**How to apply:** Preserve the closed URL's history entry when navigating to the fallback page, and treat subsequent history visits as normal page activation/opening.

Workspace state is in-memory and scoped to the current subscriber session. Closing a page discards its local state; refreshing reconstructs Dashboard and the current URL. Do not silently persist business form data in browser storage.

**Why:** This phase adds navigation architecture, not draft-saving functionality, and the existing PWA boundary prohibits caching private account/business data.

**How to apply:** Implement any future cross-refresh draft persistence only as an explicitly scoped feature with appropriate privacy and account isolation.
