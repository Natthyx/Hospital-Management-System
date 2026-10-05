-- Migration: 20261002120000_audit_log
-- Description: Creates the append-only audit_log table, audit_outcome enum,
-- indexes, CHECK constraints, immutability triggers, and hms_app least-privilege grants.

-- 1. Create audit_outcome Enum
CREATE TYPE "audit_outcome" AS ENUM ('success', 'denied', 'failure');

-- 2. Create audit_log Table
-- Uses BIGINT GENERATED ALWAYS AS IDENTITY for strictly ordered sequential IDs.
-- actor_user_id references users(id) with ON DELETE RESTRICT ON UPDATE RESTRICT.
-- actor_username is NOT NULL (reserved system: / cli: identifiers cover non-user actors).
-- patient_id has no FK in Phase 0 (patients table arrives in Phase 1).
-- session_id has no FK (sessions purged after 30 days per ADR-029).
-- metadata is NOT NULL DEFAULT '{}'::jsonb ensuring predictable object shape.
CREATE TABLE "audit_log" (
    "id" BIGINT GENERATED ALWAYS AS IDENTITY,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_user_id" UUID,
    "actor_username" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "outcome" "audit_outcome" NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "patient_id" UUID,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "ip" TEXT,
    "user_agent" TEXT,
    "session_id" UUID,
    "request_id" TEXT,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "audit_log_action_format" CHECK ("action" ~ '^[a-z]+(\.[a-z0-9_]+)+$'),
    CONSTRAINT "audit_log_action_length" CHECK (char_length("action") <= 64),
    CONSTRAINT "audit_log_actor_username_length" CHECK (char_length("actor_username") <= 64),
    CONSTRAINT "audit_log_entity_type_length" CHECK ("entity_type" IS NULL OR char_length("entity_type") <= 64),
    CONSTRAINT "audit_log_entity_id_length" CHECK ("entity_id" IS NULL OR char_length("entity_id") <= 64),
    CONSTRAINT "audit_log_request_id_length" CHECK ("request_id" IS NULL OR char_length("request_id") <= 64),
    CONSTRAINT "audit_log_ip_length" CHECK ("ip" IS NULL OR char_length("ip") <= 45),
    CONSTRAINT "audit_log_user_agent_length" CHECK ("user_agent" IS NULL OR char_length("user_agent") <= 255),
    CONSTRAINT "audit_log_before_size" CHECK ("before" IS NULL OR octet_length("before"::text) <= 32768),
    CONSTRAINT "audit_log_after_size" CHECK ("after" IS NULL OR octet_length("after"::text) <= 32768),
    CONSTRAINT "audit_log_metadata_size" CHECK (octet_length("metadata"::text) <= 32768)
);

-- 3. Add Foreign Key for actor_user_id (ON UPDATE RESTRICT per Correction A)
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- 4. Create Indexes (Justifications per Rule 05 and Milestone Spec)
-- 4.1 Default query sort: index scan without sort step for paginated queries
CREATE INDEX "audit_log_occurred_at_id_idx" ON "audit_log"("occurred_at" DESC, "id" DESC);

-- 4.2 Clinical timeline: "Who accessed this patient?" ordered chronologically
CREATE INDEX "audit_log_patient_id_occurred_at_idx" ON "audit_log"("patient_id", "occurred_at" DESC);

-- 4.3 User activity: "What actions did this user perform?" ordered chronologically
CREATE INDEX "audit_log_actor_user_id_occurred_at_idx" ON "audit_log"("actor_user_id", "occurred_at" DESC);

-- 4.4 Entity history: trace complete audit history of a specific business record
CREATE INDEX "audit_log_entity_idx" ON "audit_log"("entity_type", "entity_id");

-- 4.5 Action audit: action-specific security audits (failed logins, access denials, password resets)
CREATE INDEX "audit_log_action_occurred_at_idx" ON "audit_log"("action", "occurred_at" DESC);

-- 4.6 Request correlation: correlates audit entries with an application request ID
CREATE INDEX "audit_log_request_id_idx" ON "audit_log"("request_id");

-- 5. Immutability Triggers (Defense-in-depth against UPDATE, DELETE, TRUNCATE)
CREATE OR REPLACE FUNCTION audit_log_reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only: % operation is forbidden', TG_OP
    USING ERRCODE = '55000'; -- object_not_in_prerequisite_state
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "audit_log_reject_update_delete"
BEFORE UPDATE OR DELETE ON "audit_log"
FOR EACH ROW EXECUTE FUNCTION audit_log_reject_mutation();

CREATE TRIGGER "audit_log_reject_truncate"
BEFORE TRUNCATE ON "audit_log"
FOR EACH STATEMENT EXECUTE FUNCTION audit_log_reject_mutation();

-- 6. Role Grants for hms_app (Least Privilege per Rule 03 & 05)
-- Explicit SELECT and INSERT only. No UPDATE, DELETE, or TRUNCATE.
-- Zero permissions on PUBLIC. No sequence grants (identity column requires no sequence grant).
GRANT SELECT, INSERT ON "audit_log" TO hms_app;
REVOKE ALL ON "audit_log" FROM PUBLIC;
