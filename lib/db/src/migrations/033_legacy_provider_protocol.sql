-- Additive protocol/health expansion only. Preserve all existing encrypted connections.
ALTER TABLE external_providers DROP CONSTRAINT external_providers_protocol_check;
ALTER TABLE external_providers ADD CONSTRAINT external_providers_protocol_check
 CHECK(protocol IN ('fusion_rest','DHRU_FUSION_LEGACY_V61'));
ALTER TABLE external_providers DROP CONSTRAINT external_providers_health_check;
ALTER TABLE external_providers ADD CONSTRAINT external_providers_health_check
 CHECK(health IN ('NOT_TESTED','CONNECTED','AUTH_FAILED','AUTHENTICATION_FAILED',
 'UNREACHABLE','INVALID_RESPONSE','UNSUPPORTED_PROVIDER','DISABLED','SYNC_FAILED'));
