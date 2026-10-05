/**
 * audit/index.ts
 *
 * Single source of truth for audit actions, outcomes, categories,
 * reserved actor usernames, and regex validation patterns.
 */

export const AUDIT_ACTIONS = [
  // Auth events
  'auth.login_success',
  'auth.login_failed',
  'auth.account_locked',
  'auth.logout',
  'auth.password_changed',
  'auth.session_revoked',
  'auth.session_replaced',
  'auth.session_expired',

  // Access events
  'access.denied',

  // User security administration events
  'user.create',
  'user.disable',
  'user.roles_changed',
  'user.password_reset',

  // Role security administration events
  'role.permissions_changed',

  // System events
  'system.seed_required',
  'system.session_cleanup',

  // Audit viewing events
  'audit.read',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_OUTCOMES = ['success', 'denied', 'failure'] as const;
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];

export const AUDIT_CATEGORIES = [
  'auth',
  'access',
  'user',
  'role',
  'system',
  'audit',
] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

export const AUDIT_ACTION_PATTERN = '^[a-z]+(\\.[a-z0-9_]+)+$';
export const AUDIT_ACTION_REGEX = new RegExp(AUDIT_ACTION_PATTERN);

export const RESERVED_ACTOR_USERNAMES = [
  'system:unknown',
  'system:scheduler',
  'system:seed',
  'cli:recovery',
] as const;
export type ReservedActorUsername = (typeof RESERVED_ACTOR_USERNAMES)[number];

/**
 * Checks whether an actor username is a reserved system/CLI identifier.
 * Real usernames only allow [a-z0-9._-], so any username containing a colon is reserved.
 */
export function isReservedActorUsername(username: string): boolean {
  return username.includes(':');
}
