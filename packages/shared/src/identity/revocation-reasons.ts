/**
 * Canonical list of session revocation reasons.
 * Stored in `sessions.revoked_reason` in PostgreSQL.
 */
export const REVOKED_REASONS = [
  'logout',
  'session_replaced',
  'password_changed',
  'user_revoked',
  'admin_revoked',
  'admin_recovery_reset',
  'account_disabled',
  'account_locked',
  'session_expired',
] as const;

export type RevokedReason = (typeof REVOKED_REASONS)[number];
