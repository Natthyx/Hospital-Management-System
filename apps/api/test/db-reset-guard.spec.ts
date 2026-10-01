import { validateDbResetEnv } from '../../../scripts/db-reset-guard.mjs';

describe('db-reset-guard', () => {
  const validBaseEnv = {
    NODE_ENV: 'development',
    DATABASE_MIGRATION_URL:
      'postgresql://hms_owner:secret@localhost:5432/hms_dev',
  };

  it('rejects execution when NODE_ENV is production', () => {
    const result = validateDbResetEnv({
      ...validBaseEnv,
      NODE_ENV: 'production',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('only allowed in development');
  });

  it('rejects execution when NODE_ENV is test or missing', () => {
    const testResult = validateDbResetEnv({
      ...validBaseEnv,
      NODE_ENV: 'test',
    });
    expect(testResult.ok).toBe(false);

    const missingResult = validateDbResetEnv({
      ...validBaseEnv,
      NODE_ENV: undefined,
    });
    expect(missingResult.ok).toBe(false);
  });

  it('rejects execution when DATABASE_MIGRATION_URL is missing', () => {
    const result = validateDbResetEnv({
      NODE_ENV: 'development',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('DATABASE_MIGRATION_URL is required');
  });

  it('rejects execution when DATABASE_MIGRATION_URL is malformed', () => {
    const result = validateDbResetEnv({
      NODE_ENV: 'development',
      DATABASE_MIGRATION_URL: 'not-a-valid-url-format',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('malformed');
  });

  it('rejects execution when DATABASE_MIGRATION_URL points to a remote host', () => {
    const remoteHosts = [
      'postgresql://hms_owner:secret@db.invalid:5432/hms_dev',
      'postgresql://hms_owner:secret@192.168.1.50:5432/hms_dev',
      'postgresql://hms_owner:secret@remote-postgres.cloud:5432/hms_dev',
    ];

    for (const url of remoteHosts) {
      const result = validateDbResetEnv({
        NODE_ENV: 'development',
        DATABASE_MIGRATION_URL: url,
      });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('not local');
    }
  });

  it('rejects execution when database name is not in the allow-list', () => {
    const disallowedDbs = [
      'postgresql://hms_owner:secret@localhost:5432/hms_prod',
      'postgresql://hms_owner:secret@localhost:5432/postgres',
      'postgresql://hms_owner:secret@localhost:5432/production',
    ];

    for (const url of disallowedDbs) {
      const result = validateDbResetEnv({
        NODE_ENV: 'development',
        DATABASE_MIGRATION_URL: url,
      });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('not in allowed list');
    }
  });

  it('rejects execution when SHADOW_DATABASE_URL is malformed', () => {
    const result = validateDbResetEnv({
      ...validBaseEnv,
      SHADOW_DATABASE_URL: 'invalid-shadow-url',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('SHADOW_DATABASE_URL is malformed');
  });

  it('rejects execution when SHADOW_DATABASE_URL points to a remote host', () => {
    const result = validateDbResetEnv({
      ...validBaseEnv,
      SHADOW_DATABASE_URL:
        'postgresql://hms_owner:secret@remote-db.com:5432/hms_shadow',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('SHADOW_DATABASE_URL host');
    expect(result.error).toContain('not local');
  });

  it('allows execution when all conditions are satisfied with localhost', () => {
    const result = validateDbResetEnv({
      NODE_ENV: 'development',
      DATABASE_MIGRATION_URL:
        'postgresql://hms_owner:secret@localhost:5432/hms_dev',
      SHADOW_DATABASE_URL:
        'postgresql://hms_owner:secret@localhost:5432/hms_shadow',
    });
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('allows execution with 127.0.0.1 and hms_test', () => {
    const result = validateDbResetEnv({
      NODE_ENV: 'development',
      DATABASE_MIGRATION_URL:
        'postgresql://hms_owner:secret@127.0.0.1:5432/hms_test',
    });
    expect(result.ok).toBe(true);
  });

  it('allows execution with IPv6 loopback ::1', () => {
    const result = validateDbResetEnv({
      NODE_ENV: 'development',
      DATABASE_MIGRATION_URL:
        'postgresql://hms_owner:secret@[::1]:5432/hms_dev',
    });
    expect(result.ok).toBe(true);
  });
});
