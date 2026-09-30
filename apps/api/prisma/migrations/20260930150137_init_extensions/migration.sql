-- Migration: 20260930150137_init_extensions
-- Purpose: Initialize PostgreSQL extensions and grant public schema usage to hms_app.
--
-- Extensions:
--   pg_trgm: Trigram matching used for fuzzy patient name searching and duplicate detection (Rule 03, ADR-014).
--   unaccent: Text search dictionary for accent-insensitive matching across patient demographics.
--
-- Grants:
--   hms_app: USAGE ON SCHEMA public so runtime queries can execute extension functions and access tables.
--
-- Executed as: hms_owner (DATABASE_MIGRATION_URL)

GRANT USAGE ON SCHEMA public TO hms_app;

CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";