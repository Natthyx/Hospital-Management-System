import type { EnvConfig } from '../../src/config/env.schema';
import { Argon2LimiterService } from '../../src/modules/auth/argon2-limiter.service';

describe('Argon2LimiterService (ADR-029 & Conditions 4, 7, 11)', () => {
  let limiter: Argon2LimiterService;

  const mockEnv: EnvConfig = {
    NODE_ENV: 'test',
    PORT: 3000,
    APP_ORIGIN: 'http://localhost:5173',
    DATABASE_URL: 'postgresql://hms_app:dev_app_pass@localhost:5432/hms_test',
    DATABASE_MIGRATION_URL:
      'postgresql://hms_owner:dev_owner_pass@localhost:5432/hms_test',
    SESSION_IDLE_MINUTES: 15,
    SESSION_ABSOLUTE_HOURS: 12,
    LOGIN_MAX_FAILURES: 5,
    LOGIN_LOCK_MINUTES: 15,
    COOKIE_SECURE: false,
    LOG_LEVEL: 'silent',
    HOSPITAL_TIMEZONE: 'UTC',
    DEFAULT_LOCALE: 'en',
    SWAGGER_ENABLED: false,
    THROTTLE_TTL_MS: 60000,
    THROTTLE_LIMIT: 100,
    AUTH_THROTTLE_LIMIT: 10,
    AUTH_THROTTLE_TTL_MS: 60000,
    ARGON2_MEMORY: 1024, // test floor
    ARGON2_ITERATIONS: 1, // test floor
    ARGON2_PARALLELISM: 1,
    ARGON2_MAX_CONCURRENCY: 2,
    ARGON2_MAX_QUEUE: 5,
    ARGON2_QUEUE_TIMEOUT_MS: 200,
    TRUST_PROXY: 0,
  };

  beforeAll(async () => {
    limiter = new Argon2LimiterService(mockEnv);
    await limiter.onModuleInit();
  });

  it('hashes and verifies a password successfully with NFKC normalization', async () => {
    // Accented decomposed vs composed
    const decomposed = 'Caf\u0065\u0301-Hospital-2026!';
    const composed = 'Café-Hospital-2026!';

    const hash = await limiter.hash(decomposed);
    expect(hash).toMatch(/^\$argon2id\$/);

    const match = await limiter.verify(hash, composed);
    expect(match).toBe(true);

    const mismatch = await limiter.verify(hash, 'WrongPassword123!');
    expect(mismatch).toBe(false);
  });

  it('verifies Amharic characters consistently', async () => {
    const amharicPass = 'ሆስፒታል_አስተዳዳሪ_2026!';
    const hash = await limiter.hash(amharicPass);
    expect(hash).toMatch(/^\$argon2id\$/);

    const match = await limiter.verify(hash, amharicPass);
    expect(match).toBe(true);
  });

  it('verifyDummy returns false after consuming hashing work', async () => {
    const res = await limiter.verifyDummy('randomPasswordAttempt');
    expect(res).toBe(false);
  });

  it('fast-fails with 503 SERVICE_UNAVAILABLE when queue depth exceeds ARGON2_MAX_QUEUE', async () => {
    // Configure small queue limiter: concurrency 1, maxQueue 2
    const smallLimiter = new Argon2LimiterService({
      ...mockEnv,
      ARGON2_MAX_CONCURRENCY: 1,
      ARGON2_MAX_QUEUE: 2,
      ARGON2_QUEUE_TIMEOUT_MS: 2000,
    });
    await smallLimiter.onModuleInit();

    // Launch task 1 (active), task 2 (queued), task 3 (queued), task 4 (overflow -> 503)
    const task1 = smallLimiter.hash('Pass1_LongerThan10!');
    const task2 = smallLimiter.hash('Pass2_LongerThan10!');
    const task3 = smallLimiter.hash('Pass3_LongerThan10!');

    // Task 4 exceeds maxQueue of 2
    await expect(smallLimiter.hash('Pass4_LongerThan10!')).rejects.toThrow(
      'Authentication service is busy, please retry',
    );

    await Promise.all([task1, task2, task3]);
  });

  it('rejects with 503 when task wait time exceeds ARGON2_QUEUE_TIMEOUT_MS', async () => {
    // Configure limiter with single concurrency slot and slow hashing work
    const timeoutLimiter = new Argon2LimiterService({
      ...mockEnv,
      ARGON2_MEMORY: 65536,
      ARGON2_ITERATIONS: 5,
      ARGON2_PARALLELISM: 1,
      ARGON2_MAX_CONCURRENCY: 1,
      ARGON2_MAX_QUEUE: 10,
      ARGON2_QUEUE_TIMEOUT_MS: 10, // 10ms timeout while p1 takes ~80ms
    });
    await timeoutLimiter.onModuleInit();

    // Start a task to occupy the single worker slot
    const p1 = timeoutLimiter.hash('PasswordOccupyingSlot1!');
    // Second task enters queue and will time out before p1 finishes
    const p2 = timeoutLimiter.hash('PasswordWaitingInQueue!');

    await expect(p2).rejects.toThrow(
      'Authentication service is busy, please retry',
    );
    await p1;
  });
});
