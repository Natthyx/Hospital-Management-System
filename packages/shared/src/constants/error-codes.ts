/**
 * Standard error codes for the HMS API.
 * Used in the `error.code` field of all API error responses.
 *
 * Format: UPPER_SNAKE_CASE matching HTTP semantics.
 * See rule 01 (API conventions) for the full error response shape.
 */

/** 400 — Zod validation failure or malformed input */
export const VALIDATION_FAILED = 'VALIDATION_FAILED' as const;

/** 401 — Missing or invalid authentication */
export const UNAUTHENTICATED = 'UNAUTHENTICATED' as const;

/** 403 — Authenticated but lacking required permission */
export const FORBIDDEN = 'FORBIDDEN' as const;

/** 404 — Resource does not exist */
export const NOT_FOUND = 'NOT_FOUND' as const;

/** 409 — Generic conflict (duplicate, constraint violation) */
export const CONFLICT = 'CONFLICT' as const;

/** 409 — Stale optimistic lock version */
export const VERSION_CONFLICT = 'VERSION_CONFLICT' as const;

/** 429 — Rate limit exceeded */
export const RATE_LIMITED = 'RATE_LIMITED' as const;

/** 500 — Unexpected server error */
export const INTERNAL_ERROR = 'INTERNAL_ERROR' as const;

/** 503 — Service unavailable (e.g. database unreachable) */
export const SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE' as const;

/**
 * All error codes as a union type for compile-time checking.
 */
export type ErrorCode =
  | typeof VALIDATION_FAILED
  | typeof UNAUTHENTICATED
  | typeof FORBIDDEN
  | typeof NOT_FOUND
  | typeof CONFLICT
  | typeof VERSION_CONFLICT
  | typeof RATE_LIMITED
  | typeof INTERNAL_ERROR
  | typeof SERVICE_UNAVAILABLE;
