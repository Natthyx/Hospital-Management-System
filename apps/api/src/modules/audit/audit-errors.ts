/**
 * Sanitized error representation for audit log database operations.
 *
 * Patient safety and data integrity rule:
 * If an audit write fails, the operation must fail.
 *
 * Security rule:
 * Prisma error text embeds the failing row (which may contain PHI, passwords, or tokens).
 * Any log line or error response produced when an audit write fails MUST contain only
 * the error class and SQLSTATE code, never the original error message, stack with row values, or row detail.
 */

export function extractSqlState(cause: unknown): string | undefined {
  if (typeof cause !== 'object' || cause === null) {
    return undefined;
  }

  const record = cause as Record<string, unknown>;

  // PrismaClientKnownRequestError meta.code (e.g. { code: '23502' })
  const meta = record.meta as Record<string, unknown> | undefined;
  if (typeof meta?.code === 'string' && /^\d{5}$/.test(meta.code)) {
    return meta.code;
  }

  // Top-level 5-character SQLSTATE code or Prisma error code (e.g. P2003, 23502)
  if (
    typeof record.code === 'string' &&
    (/^\d{5}$/.test(record.code) || /^P\d{4}$/.test(record.code))
  ) {
    return record.code;
  }

  // Parse SQLSTATE from message string if embedded (e.g. "Code: `23502`" or "code: \"23514\"")
  if (typeof record.message === 'string') {
    const match =
      /\bCode:\s*`?([0-9]{5}|P[0-9]{4})`?\b/.exec(record.message) ??
      /code:\s*"([0-9]{5}|P[0-9]{4})"/i.exec(record.message);
    if (match?.[1]) {
      return match[1];
    }
  }

  return undefined;
}

export class AuditWriteError extends Error {
  readonly errorClass: string;
  readonly sqlState: string | undefined;

  constructor(cause: unknown) {
    const errorClass =
      cause instanceof Error ? cause.constructor.name : typeof cause;
    const sqlState = extractSqlState(cause);

    const summary = sqlState
      ? `Audit write failed: ${errorClass} (SQLSTATE ${sqlState})`
      : `Audit write failed: ${errorClass}`;

    super(summary);
    this.name = 'AuditWriteError';
    this.errorClass = errorClass;
    this.sqlState = sqlState;

    // Do NOT capture or chain cause.stack or cause.message because Prisma embeds
    // the failing row (including cleartext payload/metadata) into error messages and stacks.
    Error.captureStackTrace(this, AuditWriteError);
  }
}
