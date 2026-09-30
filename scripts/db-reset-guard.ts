/**
 * db-reset-guard.ts
 *
 * Safety validator for database reset operations.
 * Refuses to allow reset unless all safety conditions are met:
 * 1. NODE_ENV === 'development'
 * 2. DATABASE_MIGRATION_URL host is localhost, 127.0.0.1, or ::1
 * 3. Database name is in explicit allow-list ('hms_dev', 'hms_test')
 * 4. SHADOW_DATABASE_URL host (if present) is localhost, 127.0.0.1, or ::1
 */

export const ALLOWED_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
]);
export const ALLOWED_DATABASES = new Set(['hms_dev', 'hms_test']);

export interface DbResetGuardResult {
  ok: boolean;
  error?: string;
}

/**
 * Validates environment variables before allowing database reset.
 */
export function validateDbResetEnv(
  env: Record<string, string | undefined> = process.env,
): DbResetGuardResult {
  const nodeEnv = env.NODE_ENV;
  if (nodeEnv !== 'development') {
    return {
      ok: false,
      error: `db:reset is only allowed in development (current NODE_ENV=${nodeEnv ?? 'undefined'})`,
    };
  }

  const migrationUrl = env.DATABASE_MIGRATION_URL;
  if (!migrationUrl) {
    return {
      ok: false,
      error: 'DATABASE_MIGRATION_URL is required for db:reset',
    };
  }

  let parsedMigrationUrl: URL;
  try {
    parsedMigrationUrl = new URL(migrationUrl);
  } catch {
    return {
      ok: false,
      error: 'DATABASE_MIGRATION_URL is malformed',
    };
  }

  const migrationHost = parsedMigrationUrl.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(migrationHost)) {
    return {
      ok: false,
      error: `db:reset rejected: DATABASE_MIGRATION_URL host '${migrationHost}' is not local (must be localhost, 127.0.0.1, or ::1)`,
    };
  }

  const dbName = parsedMigrationUrl.pathname.replace(/^\//, '');
  if (!ALLOWED_DATABASES.has(dbName)) {
    return {
      ok: false,
      error: `db:reset rejected: database '${dbName}' is not in allowed list (hms_dev, hms_test)`,
    };
  }

  const shadowUrl = env.SHADOW_DATABASE_URL;
  if (shadowUrl) {
    let parsedShadowUrl: URL;
    try {
      parsedShadowUrl = new URL(shadowUrl);
    } catch {
      return {
        ok: false,
        error: 'SHADOW_DATABASE_URL is malformed',
      };
    }

    const shadowHost = parsedShadowUrl.hostname.toLowerCase();
    if (!ALLOWED_HOSTS.has(shadowHost)) {
      return {
        ok: false,
        error: `db:reset rejected: SHADOW_DATABASE_URL host '${shadowHost}' is not local (must be localhost, 127.0.0.1, or ::1)`,
      };
    }
  }

  return { ok: true };
}
