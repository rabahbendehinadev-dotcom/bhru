-- Existing groups stay available. No financial/account data is modified.
ALTER TABLE manual_service_groups ADD COLUMN enabled boolean NOT NULL DEFAULT true;
