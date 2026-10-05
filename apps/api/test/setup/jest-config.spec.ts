import { spawnSync } from 'node:child_process';
import path from 'node:path';

describe('Jest Configuration Test Database Safeguards', () => {
  const jestConfigPath = path.resolve(__dirname, '../../jest.config.js');

  function evaluateJestConfig(
    envOverrides: Record<string, string | undefined>,
  ) {
    const cleanEnv: Record<string, string> = {
      PATH: process.env.PATH ?? '',
      NODE_ENV: 'test',
      HMS_ENV_PATH: '/dev/null', // Isolate from repo-root .env
    };
    for (const [key, value] of Object.entries(envOverrides)) {
      if (value !== undefined) {
        cleanEnv[key] = value;
      }
    }

    return spawnSync(
      'node',
      ['-e', `require(${JSON.stringify(jestConfigPath)})`],
      {
        env: cleanEnv,
        encoding: 'utf8',
      },
    );
  }

  it('fails loudly when TEST_DATABASE_URL is missing', () => {
    const res = evaluateJestConfig({
      TEST_DATABASE_MIGRATION_URL:
        'postgresql://hms_owner:pass@localhost:5432/hms_test',
    });
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain(
      'Jest safety check failed: TEST_DATABASE_URL is required to run tests. Set it to a postgresql connection string for database hms_test.',
    );
  });

  it('fails loudly when TEST_DATABASE_MIGRATION_URL is missing', () => {
    const res = evaluateJestConfig({
      TEST_DATABASE_URL: 'postgresql://hms_app:pass@localhost:5432/hms_test',
    });
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain(
      'Jest safety check failed: TEST_DATABASE_MIGRATION_URL is required to run tests. Set it to a postgresql connection string for database hms_test.',
    );
  });

  it('fails loudly when TEST_DATABASE_URL is malformed', () => {
    const res = evaluateJestConfig({
      TEST_DATABASE_URL: 'not-a-valid-url',
      TEST_DATABASE_MIGRATION_URL:
        'postgresql://hms_owner:pass@localhost:5432/hms_test',
    });
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain(
      'Jest safety check failed: TEST_DATABASE_URL is malformed: not-a-valid-url',
    );
  });

  it('fails loudly when TEST_DATABASE_MIGRATION_URL is malformed', () => {
    const res = evaluateJestConfig({
      TEST_DATABASE_URL: 'postgresql://hms_app:pass@localhost:5432/hms_test',
      TEST_DATABASE_MIGRATION_URL: 'not-a-valid-url',
    });
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain(
      'Jest safety check failed: TEST_DATABASE_MIGRATION_URL is malformed: not-a-valid-url',
    );
  });

  it('fails loudly when TEST_DATABASE_URL does not point to hms_test', () => {
    const res = evaluateJestConfig({
      TEST_DATABASE_URL: 'postgresql://hms_app:pass@localhost:5432/hms_dev',
      TEST_DATABASE_MIGRATION_URL:
        'postgresql://hms_owner:pass@localhost:5432/hms_test',
    });
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain(
      "Jest safety check failed: TEST_DATABASE_URL must point to database 'hms_test', got 'hms_dev'",
    );
  });

  it('fails loudly when TEST_DATABASE_MIGRATION_URL does not point to hms_test', () => {
    const res = evaluateJestConfig({
      TEST_DATABASE_URL: 'postgresql://hms_app:pass@localhost:5432/hms_test',
      TEST_DATABASE_MIGRATION_URL:
        'postgresql://hms_owner:pass@localhost:5432/hms_dev',
    });
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain(
      "Jest safety check failed: TEST_DATABASE_MIGRATION_URL must point to database 'hms_test', got 'hms_dev'",
    );
  });

  it('succeeds and maps URLs when both variables point to hms_test', () => {
    const res = evaluateJestConfig({
      TEST_DATABASE_URL: 'postgresql://hms_app:pass@localhost:5432/hms_test',
      TEST_DATABASE_MIGRATION_URL:
        'postgresql://hms_owner:pass@localhost:5432/hms_test',
    });
    expect(res.status).toBe(0);
    expect(res.stderr).toBe('');
  });

  it('forces NODE_ENV=test and overrides leaked dev variables even when parent shell exports NODE_ENV=development / LOG_LEVEL=debug', () => {
    const res = spawnSync(
      'node',
      [
        '-e',
        `require(${JSON.stringify(jestConfigPath)});
         console.log(JSON.stringify({
           NODE_ENV: process.env.NODE_ENV,
           LOG_LEVEL: process.env.LOG_LEVEL,
           SWAGGER_ENABLED: process.env.SWAGGER_ENABLED,
           COOKIE_SECURE: process.env.COOKIE_SECURE,
           TRUST_PROXY: process.env.TRUST_PROXY,
           THROTTLE_LIMIT: process.env.THROTTLE_LIMIT,
           AUTH_THROTTLE_LIMIT: process.env.AUTH_THROTTLE_LIMIT,
           ARGON2_MEMORY: process.env.ARGON2_MEMORY,
         }));`,
      ],
      {
        env: {
          PATH: process.env.PATH ?? '',
          NODE_ENV: 'development',
          LOG_LEVEL: 'debug',
          SWAGGER_ENABLED: 'true',
          COOKIE_SECURE: 'true',
          TRUST_PROXY: '1',
          THROTTLE_LIMIT: '5',
          AUTH_THROTTLE_LIMIT: '2',
          ARGON2_MEMORY: '65536',
          TEST_DATABASE_URL:
            'postgresql://hms_app:pass@localhost:5432/hms_test',
          TEST_DATABASE_MIGRATION_URL:
            'postgresql://hms_owner:pass@localhost:5432/hms_test',
          HMS_ENV_PATH: '/dev/null',
        },
        encoding: 'utf8',
      },
    );

    expect(res.status).toBe(0);
    const parsed = JSON.parse(res.stdout) as Record<string, string>;
    expect(parsed.NODE_ENV).toBe('test');
    expect(parsed.LOG_LEVEL).toBe('silent');
    expect(parsed.SWAGGER_ENABLED).toBe('false');
    expect(parsed.COOKIE_SECURE).toBe('false');
    expect(parsed.TRUST_PROXY).toBe('0');
    expect(parsed.THROTTLE_LIMIT).toBe('1000');
    expect(parsed.AUTH_THROTTLE_LIMIT).toBe('1000');
    expect(parsed.ARGON2_MEMORY).toBe('1024');
  });
});
