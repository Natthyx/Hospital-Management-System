import fs from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

/**
 * Environment variable schema — validated at boot.
 * Fail-fast: the API refuses to start with invalid configuration.
 *
 * All variables from docs/02-foundation-spec.md are defined here.
 */
const envSchema = z
  .object({
    /** Node environment */
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),

    /** API server port */
    PORT: z.coerce.number().int().positive().default(3000),

    /** Allowed origin for Origin header checks (no CORS) */
    APP_ORIGIN: z.url().default('http://localhost:5173'),

    /** Runtime database URL (least-privilege hms_app role) */
    DATABASE_URL: z.string().min(1),

    /** Migration database URL (hms_owner role) — used only by migration tooling */
    DATABASE_MIGRATION_URL: z.string().min(1),

    /** Prisma shadow database URL for migrate dev */
    SHADOW_DATABASE_URL: z.string().min(1).optional(),

    /** Session idle timeout in minutes */
    SESSION_IDLE_MINUTES: z.coerce.number().int().positive().default(15),

    /** Session absolute timeout in hours */
    SESSION_ABSOLUTE_HOURS: z.coerce.number().int().positive().default(12),

    /** Max consecutive login failures before account lockout */
    LOGIN_MAX_FAILURES: z.coerce.number().int().positive().default(5),

    /** Account lockout duration in minutes */
    LOGIN_LOCK_MINUTES: z.coerce.number().int().positive().default(15),

    /** Whether the session cookie requires HTTPS */
    COOKIE_SECURE: z
      .enum(['true', 'false'])
      .transform((val) => val === 'true')
      .default(false),

    /** Application log level */
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default(process.env.NODE_ENV === 'test' ? 'silent' : 'info'),

    /** IANA timezone name for the hospital */
    HOSPITAL_TIMEZONE: z.string().min(1).default('UTC'),

    /** Default locale for i18n */
    DEFAULT_LOCALE: z.string().min(1).default('en'),

    /** Toggle Swagger UI at /api/docs */
    SWAGGER_ENABLED: z
      .enum(['true', 'false'])
      .transform((val) => val === 'true')
      .default(false),

    /** Rate limiting window in milliseconds */
    THROTTLE_TTL_MS: z.coerce.number().int().positive().default(60_000),

    /** Rate limiting max requests per window */
    THROTTLE_LIMIT: z.coerce.number().int().positive().default(100),

    /** Argon2id memory cost in KiB (default: 65536 = 64 MiB per RFC 9106 second recommended profile) */
    ARGON2_MEMORY: z.coerce.number().int().positive().default(65536),

    /** Argon2id time cost / iterations (default: 3) */
    ARGON2_ITERATIONS: z.coerce.number().int().positive().default(3),

    /** Argon2id parallelism / threads (default: 4) */
    ARGON2_PARALLELISM: z.coerce.number().int().positive().default(4),

    /** Auth rate limiting max requests per window (default: 10 per minute per IP) */
    AUTH_THROTTLE_LIMIT: z.coerce.number().int().positive().default(10),

    /** Auth rate limiting window in milliseconds (default: 60,000ms = 1 minute) */
    AUTH_THROTTLE_TTL_MS: z.coerce.number().int().positive().default(60_000),

    /** Max concurrent Argon2 operations (default: 2 to preserve libuv worker threads) */
    ARGON2_MAX_CONCURRENCY: z.coerce.number().int().min(1).default(2),

    /** Max queued Argon2 operations before immediate 503 fast-fail (default: 50) */
    ARGON2_MAX_QUEUE: z.coerce.number().int().min(1).default(50),

    /** Max wait time in milliseconds for queued Argon2 operations (default: 10,000ms) */
    ARGON2_QUEUE_TIMEOUT_MS: z.coerce.number().int().min(100).default(10_000),

    /** Number of reverse proxy hops to trust (0 = direct connection / off) */
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  })
  .superRefine((data, ctx) => {
    const isTest = data.NODE_ENV === 'test';
    const isProd = data.NODE_ENV === 'production';
    const minMemory = isTest ? 1024 : 19456; // 19 MiB OWASP floor in prod/dev
    const minIterations = isTest ? 1 : 3;
    const minParallelism = 1;

    // Production security safeguards
    if (isProd) {
      if (!data.COOKIE_SECURE) {
        ctx.addIssue({
          code: 'custom',
          message: 'COOKIE_SECURE must be true in production',
          path: ['COOKIE_SECURE'],
        });
      }

      try {
        const originUrl = new URL(data.APP_ORIGIN);
        if (
          originUrl.protocol !== 'https:' ||
          data.APP_ORIGIN === 'http://localhost:5173'
        ) {
          ctx.addIssue({
            code: 'custom',
            message:
              'APP_ORIGIN must use https:// in production and cannot use localhost default',
            path: ['APP_ORIGIN'],
          });
        }
      } catch {
        ctx.addIssue({
          code: 'custom',
          message: 'APP_ORIGIN must be a valid URL',
          path: ['APP_ORIGIN'],
        });
      }
    }

    if (data.ARGON2_MEMORY < minMemory) {
      ctx.addIssue({
        code: 'custom',
        message: `ARGON2_MEMORY must be at least ${String(minMemory)} KiB in ${data.NODE_ENV} environment (got ${String(data.ARGON2_MEMORY)})`,
        path: ['ARGON2_MEMORY'],
      });
    }

    if (data.ARGON2_ITERATIONS < minIterations) {
      ctx.addIssue({
        code: 'custom',
        message: `ARGON2_ITERATIONS must be at least ${String(minIterations)} in ${data.NODE_ENV} environment (got ${String(data.ARGON2_ITERATIONS)})`,
        path: ['ARGON2_ITERATIONS'],
      });
    }

    if (data.ARGON2_PARALLELISM < minParallelism) {
      ctx.addIssue({
        code: 'custom',
        message: `ARGON2_PARALLELISM must be at least ${String(minParallelism)} in ${data.NODE_ENV} environment (got ${String(data.ARGON2_PARALLELISM)})`,
        path: ['ARGON2_PARALLELISM'],
      });
    }
  });

type EnvConfig = z.infer<typeof envSchema>;

/**
 * Parses simple KEY=VALUE lines from a .env file content.
 */
function parseEnvContent(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const eqIdx = line.indexOf('=');
    if (eqIdx <= 0) {
      continue;
    }
    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    result[key] = val;
  }
  return result;
}

/**
 * Loads the repository root .env file into the environment if running locally.
 *
 * Rules:
 * (a) Only runs when NODE_ENV is not 'production'.
 * (b) Loads only the repo-root .env by explicit path.
 * (c) Never overrides variables already set in process.env.
 */
function loadRootEnv(
  options: {
    nodeEnv?: string;
    rootDir?: string;
  } = {},
): boolean {
  const currentEnv = options.nodeEnv ?? process.env.NODE_ENV;
  if (currentEnv === 'production') {
    return false;
  }

  // Explicit repo root: three levels up from src/config or dist/config
  const rootDir = options.rootDir ?? path.resolve(__dirname, '../../..');
  const envPath = path.resolve(rootDir, '.env');

  try {
    const content = fs.readFileSync(envPath, 'utf8');
    const parsed = parseEnvContent(content);
    for (const [key, val] of Object.entries(parsed)) {
      process.env[key] ??= val;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse and validate environment variables.
 * Throws a descriptive ZodError on invalid configuration.
 */
function validateEnv(
  env: Record<string, string | undefined> = process.env,
): EnvConfig {
  if (
    env === process.env &&
    process.env.NODE_ENV !== 'production' &&
    !process.env.DATABASE_URL
  ) {
    loadRootEnv();
  }

  const result = envSchema.safeParse(env);
  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `Invalid environment configuration:\n${formatted}\n\nCheck .env.example for required variables.`,
    );
  }
  return result.data;
}

export { envSchema, validateEnv, loadRootEnv };
export type { EnvConfig };
