// Compatibility entry point for the focused customer-auth checks.
// Migration 020 extends registration beyond the original Phase 1 form.
// Keep hash/session/realm/tenant coverage alongside the current onboarding
// contract rather than validating an obsolete, CAPTCHA-free registration API.
// Requires PostgreSQL CLI tools and a current api-server build.
import './test-public-customer-onboarding.mjs';
