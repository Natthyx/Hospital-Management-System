import { randomUUID } from 'node:crypto';

export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Valid format for incoming X-Request-Id header:
 * 1 to 64 alphanumeric characters, underscores, or hyphens.
 */
export const REQUEST_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

/**
 * Validates and resolves a request ID.
 * If incoming is valid according to REQUEST_ID_REGEX, it is returned trimmed.
 * Otherwise, generates a new cryptographically secure UUID v4.
 *
 * @param incoming Value from client header or request object
 * @returns Validated request ID
 */
export function resolveRequestId(incoming?: unknown): string {
  if (typeof incoming === 'string') {
    const trimmed = incoming.trim();
    if (REQUEST_ID_REGEX.test(trimmed)) {
      return trimmed;
    }
  }
  return randomUUID();
}
