import path from 'node:path';

import { z } from 'zod';

/**
 * Environment variable schema — validated at boot.
 * Fail-fast: the API refuses to start with invalid configuration.
 *
 * All variables from docs/02-foundation-spec.md are defined here.
 */
const envSchema = z.object({
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
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),

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
});

type EnvConfig = z.infer<typeof envSchema>;

/**
 * Parse and validate environment variables.
 * Throws a descriptive ZodError on invalid configuration.
 */
function validateEnv(
  env: Record<string, string | undefined> = process.env,
): EnvConfig {
  if (
    env === process.env &&
    !process.env.DATABASE_URL &&
    typeof process.loadEnvFile === 'function'
  ) {
    const candidatePaths = [
      path.resolve(process.cwd(), '.env'),
      path.resolve(process.cwd(), '../../.env'),
      path.resolve(__dirname, '../../.env'),
      path.resolve(__dirname, '../../../.env'),
      path.resolve(__dirname, '../../../../.env'),
    ];
    for (const candidate of candidatePaths) {
      try {
        process.loadEnvFile(candidate);
        break;
      } catch {
        // Try next candidate
      }
    }
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

export { envSchema, validateEnv };
export type { EnvConfig };
