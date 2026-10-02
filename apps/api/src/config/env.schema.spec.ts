import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { loadRootEnv, validateEnv } from './env.schema';

describe('validateEnv', () => {
  const validBaseEnv = {
    DATABASE_URL: 'postgresql://hms_app:pass@localhost:5432/hms_dev',
    DATABASE_MIGRATION_URL:
      'postgresql://hms_owner:pass@localhost:5432/hms_dev',
  };

  it('validates a complete valid environment with defaults', () => {
    const config = validateEnv({
      ...validBaseEnv,
    });

    expect(config.NODE_ENV).toBe('development');
    expect(config.PORT).toBe(3000);
    expect(config.DATABASE_URL).toBe(validBaseEnv.DATABASE_URL);
    expect(config.DATABASE_MIGRATION_URL).toBe(
      validBaseEnv.DATABASE_MIGRATION_URL,
    );
    expect(config.COOKIE_SECURE).toBe(false);
    expect(config.SWAGGER_ENABLED).toBe(false);
    expect(config.DEFAULT_LOCALE).toBe('en');
    expect(config.HOSPITAL_TIMEZONE).toBe('UTC');
    expect(config.SESSION_IDLE_MINUTES).toBe(15);
    expect(config.SESSION_ABSOLUTE_HOURS).toBe(12);
  });

  it('throws descriptive error when required DATABASE_URL is missing', () => {
    expect(() =>
      validateEnv({
        DATABASE_MIGRATION_URL:
          'postgresql://hms_owner:pass@localhost:5432/hms_dev',
      }),
    ).toThrow('Invalid environment configuration');
  });

  it('throws descriptive error when required DATABASE_MIGRATION_URL is missing', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL: 'postgresql://hms_app:pass@localhost:5432/hms_dev',
      }),
    ).toThrow('Invalid environment configuration');
  });

  it('transforms string boolean flags correctly', () => {
    const config = validateEnv({
      ...validBaseEnv,
      COOKIE_SECURE: 'true',
      SWAGGER_ENABLED: 'true',
    });

    expect(config.COOKIE_SECURE).toBe(true);
    expect(config.SWAGGER_ENABLED).toBe(true);
  });

  it('coerces numeric values from strings', () => {
    const config = validateEnv({
      ...validBaseEnv,
      PORT: '8080',
      THROTTLE_LIMIT: '50',
    });

    expect(config.PORT).toBe(8080);
    expect(config.THROTTLE_LIMIT).toBe(50);
  });

  it('validates default Argon2id parameters matching RFC 9106 second recommended profile', () => {
    const config = validateEnv({
      ...validBaseEnv,
    });

    expect(config.ARGON2_MEMORY).toBe(65536);
    expect(config.ARGON2_ITERATIONS).toBe(3);
    expect(config.ARGON2_PARALLELISM).toBe(4);
  });

  it('enforces OWASP floor of 19456 KiB and 3 iterations in development and production', () => {
    // Memory below floor
    expect(() =>
      validateEnv({
        ...validBaseEnv,
        NODE_ENV: 'development',
        ARGON2_MEMORY: '19455',
      }),
    ).toThrow('ARGON2_MEMORY must be at least 19456 KiB');

    // Iterations below floor
    expect(() =>
      validateEnv({
        ...validBaseEnv,
        NODE_ENV: 'production',
        ARGON2_ITERATIONS: '2',
      }),
    ).toThrow('ARGON2_ITERATIONS must be at least 3');
  });

  it('allows relaxed Argon2id parameters in test environment for fast execution', () => {
    const config = validateEnv({
      ...validBaseEnv,
      NODE_ENV: 'test',
      ARGON2_MEMORY: '1024',
      ARGON2_ITERATIONS: '1',
      ARGON2_PARALLELISM: '1',
    });

    expect(config.AUTH_THROTTLE_LIMIT).toBe(10);
    expect(config.AUTH_THROTTLE_TTL_MS).toBe(60000);
    expect(config.ARGON2_MAX_CONCURRENCY).toBe(2);
    expect(config.ARGON2_MAX_QUEUE).toBe(50);
    expect(config.ARGON2_QUEUE_TIMEOUT_MS).toBe(10000);
    expect(config.TRUST_PROXY).toBe(0);
  });

  describe('Production security safeguards (Condition 10)', () => {
    const validProdEnv = {
      ...validBaseEnv,
      NODE_ENV: 'production',
      COOKIE_SECURE: 'true',
      APP_ORIGIN: 'https://hms.hospital.org',
    };

    it('accepts valid production configuration', () => {
      const config = validateEnv(validProdEnv);
      expect(config.COOKIE_SECURE).toBe(true);
      expect(config.APP_ORIGIN).toBe('https://hms.hospital.org');
    });

    it('fails boot in production if COOKIE_SECURE is false', () => {
      expect(() =>
        validateEnv({
          ...validProdEnv,
          COOKIE_SECURE: 'false',
        }),
      ).toThrow('COOKIE_SECURE must be true in production');
    });

    it('fails boot in production if APP_ORIGIN uses default localhost or non-https', () => {
      expect(() =>
        validateEnv({
          ...validProdEnv,
          APP_ORIGIN: 'http://localhost:5173',
        }),
      ).toThrow('APP_ORIGIN must use https:// in production');

      expect(() =>
        validateEnv({
          ...validProdEnv,
          APP_ORIGIN: 'http://hms.hospital.org',
        }),
      ).toThrow('APP_ORIGIN must use https:// in production');
    });
  });
});

describe('loadRootEnv', () => {
  it('refuses to load .env when NODE_ENV is production', () => {
    const loaded = loadRootEnv({ nodeEnv: 'production' });
    expect(loaded).toBe(false);
  });

  it('loads .env from explicit root path when not production', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hms-env-test-'));
    try {
      fs.writeFileSync(path.join(tempDir, '.env'), 'TEST_LOAD_VAR=from_file\n');
      const loaded = loadRootEnv({ nodeEnv: 'development', rootDir: tempDir });
      expect(loaded).toBe(true);
      expect(process.env.TEST_LOAD_VAR).toBe('from_file');
    } finally {
      delete process.env.TEST_LOAD_VAR;
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('never overrides variables already set in the environment', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hms-env-test-'));
    try {
      process.env.TEST_EXISTING_VAR = 'pre_existing';
      fs.writeFileSync(
        path.join(tempDir, '.env'),
        'TEST_EXISTING_VAR=from_file_override_attempt\n',
      );
      loadRootEnv({ nodeEnv: 'development', rootDir: tempDir });
      expect(process.env.TEST_EXISTING_VAR).toBe('pre_existing');
    } finally {
      delete process.env.TEST_EXISTING_VAR;
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('returns false gracefully when .env does not exist at root path', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hms-env-test-'));
    try {
      const loaded = loadRootEnv({ nodeEnv: 'development', rootDir: tempDir });
      expect(loaded).toBe(false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
