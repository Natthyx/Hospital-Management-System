# Rule 05 — Audit Logging

The audit log answers: **who did what, to which record, when, from where, and was it allowed?** It is a legal and safety record, separate from application logs.

## Audit log vs application log

|             | Audit log                                                        | Application log             |
| ----------- | ---------------------------------------------------------------- | --------------------------- |
| Storage     | `audit_log` table in PostgreSQL                                  | pino JSON to stdout         |
| Purpose     | Accountability                                                   | Debugging and operations    |
| May contain | IDs, action, outcome, field-level before/after of allowed fields | IDs and technical info only |
| Retention   | Never deleted by the application                                 | Managed by deployment       |

Never put patient data in application logs. Patient data lives only in the database, including audit `before`/`after`.

## Table: `audit_log` (append-only)

| Column           | Type            | Notes                                                                                                                                        |
| ---------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`             | bigint identity | Primary key, ordered                                                                                                                         |
| `occurred_at`    | timestamptz     | Default `now()`                                                                                                                              |
| `actor_user_id`  | uuid null       | Null for system actions                                                                                                                      |
| `actor_username` | text            | Snapshot at the time (`system` for automated actions)                                                                                        |
| `action`         | text            | `resource.verb` or `auth.event` (see below)                                                                                                  |
| `outcome`        | enum            | `success`, `denied`, `failure`                                                                                                               |
| `entity_type`    | text null       | For example `patient`, `user`, `prescription`                                                                                                |
| `entity_id`      | text null       | ID of the affected record                                                                                                                    |
| `patient_id`     | uuid null       | Set whenever a patient is involved, so "who accessed this patient?" is one indexed query. Foreign key added when the `patients` table exists |
| `before`         | jsonb null      | Prior values (only for updates), redacted per rules below                                                                                    |
| `after`          | jsonb null      | New values, redacted                                                                                                                         |
| `metadata`       | jsonb null      | Reason text, search terms count, export scope, etc. (no PHI beyond IDs)                                                                      |
| `ip`             | text            | Client IP                                                                                                                                    |
| `user_agent`     | text            | Truncated                                                                                                                                    |
| `session_id`     | uuid null       |                                                                                                                                              |
| `request_id`     | text            | Correlates with application logs                                                                                                             |

Indexes: `occurred_at`; `(patient_id, occurred_at)`; `(actor_user_id, occurred_at)`; `(entity_type, entity_id)`; `action`.

## Database-enforced immutability

- `hms_app` has `INSERT` and `SELECT` only on `audit_log`. No `UPDATE`, `DELETE`, `TRUNCATE` (see rule 03).
- A migration test verifies the grants: attempting `UPDATE`/`DELETE` as `hms_app` must fail.
- Tamper-evidence hash chaining is planned for Phase 8. Do not implement earlier.

## What to audit (mandatory)

- **Auth:** `auth.login_success`, `auth.login_failed`, `auth.account_locked`, `auth.logout`, `auth.password_changed`, `auth.session_revoked`, `auth.session_expired` (idle/absolute)
- **Access denied:** every failed permission check (`outcome = denied`, with the attempted action)
- **Security administration:** every user, role, and permission change (`user.create`, `user.disable`, `user.roles_changed`, `role.permissions_changed`, `user.password_reset`)
- **Clinical and financial writes:** every create, update, void, dispense, payment, and similar (`patient.create`, `patient.update`, `prescription.dispense`), with `before`/`after` for updates
- **Reads of patient data:** viewing a patient record, chart, results, prescriptions, or printing/exporting anything containing patient data. List/search endpoints record one entry per request with the result count in `metadata`, not one per row
- **Reading the audit log itself:** `audit.read` (who looked at the audit trail)
- **Exports and reports** that contain patient-identifiable data

## How to implement

- `AuditService.record(...)` in `modules/audit`, the only writer to `audit_log`.
- An interceptor handles the routine cases (read audits and denied attempts) from route metadata (`@Audit({ action, entityType })`). Services call `AuditService.record` explicitly for writes so `before`/`after` and `patient_id` are exact.
- **Writes are audited inside the same database transaction as the change.** If the audit insert fails, the whole operation rolls back.
- **Reads are fail-closed:** if the audit entry for a patient-data read cannot be written, the read is denied with `INTERNAL_ERROR`. Log the failure at `error` level.
- Every new endpoint's spec lists its audit events. A PR-level checklist item in the Definition of Done enforces this.

## Redaction rules

- Never store in `before`/`after`/`metadata`: password hashes, tokens, session IDs, CSRF tokens, MFA secrets, national ID numbers in full (store last 4 only if needed).
- Store only the **fields that changed** for updates, not the whole record.
- Free-text clinical notes: store the fact of change and a revision reference, not the full note body, when the note is itself a versioned record (the revision table holds the content).

## Viewing the audit log

- Endpoint `GET /api/v1/audit` with filters (date range, actor, action, entity, patient, outcome), paginated, requires `audit.read`.
- The admin UI includes an audit viewer. Export is a later feature and is itself audited.
