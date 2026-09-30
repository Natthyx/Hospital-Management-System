#!/usr/bin/env bash
# docker-entrypoint-initdb.d/init-db.sh
#
# Creates the HMS database roles and databases.
# Run once automatically by the postgres container on first start.
#
# Roles:
#   hms_owner — owns schema objects; used only by migrations (DATABASE_MIGRATION_URL)
#   hms_app   — runtime role with CONNECT + USAGE only; table grants are added
#               per-migration so hms_app never gets blanket privileges
#
# Databases: hms_dev, hms_test (both owned by hms_owner)
#
# Passwords come from environment variables set in docker-compose.yml.
set -euo pipefail

echo "=== HMS: Creating roles and databases ==="

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<-EOSQL
  -- Role: hms_owner (schema owner, used for migrations only)
  CREATE ROLE hms_owner WITH LOGIN PASSWORD '${HMS_OWNER_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE;

  -- Role: hms_app (runtime, least-privilege)
  CREATE ROLE hms_app WITH LOGIN PASSWORD '${HMS_APP_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE;

  -- Database: hms_dev
  CREATE DATABASE hms_dev OWNER hms_owner;

  -- Database: hms_test
  CREATE DATABASE hms_test OWNER hms_owner;
EOSQL

# Configure each database: revoke public, grant connect to hms_app,
# set default search path and privileges
for db in hms_dev hms_test; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db" <<-EOSQL
    -- Revoke default public access
    REVOKE ALL ON DATABASE ${db} FROM PUBLIC;
    REVOKE ALL ON SCHEMA public FROM PUBLIC;

    -- hms_owner owns the public schema
    ALTER SCHEMA public OWNER TO hms_owner;

    -- hms_app can connect and use the public schema, nothing more
    GRANT CONNECT ON DATABASE ${db} TO hms_app;
    GRANT USAGE ON SCHEMA public TO hms_app;

    -- Ensure hms_app gets NO default table privileges
    -- (each migration must explicitly GRANT what hms_app needs)
    ALTER DEFAULT PRIVILEGES FOR ROLE hms_owner IN SCHEMA public
      REVOKE ALL ON TABLES FROM hms_app;
    ALTER DEFAULT PRIVILEGES FOR ROLE hms_owner IN SCHEMA public
      REVOKE ALL ON SEQUENCES FROM hms_app;
EOSQL
done

echo "=== HMS: Database initialization complete ==="
