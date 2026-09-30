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
