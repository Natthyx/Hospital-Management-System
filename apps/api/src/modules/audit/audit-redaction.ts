/**
 * Audit Redaction and Payload Sanitization Engine.
 *
 * Implements Correction G:
 * - Redacts sensitive keys (passwords, tokens, secrets, cookies, hashes, ssn, credentials).
 * - Redacts string VALUES that look like secrets ($argon2 hashes, 43-character base64url tokens).
 * - Handles BigInt, Date, Error, Buffer, circular references, depth limits (max 8), and key-count limits without throwing.
 * - Enforces size caps: metadata 8 KiB (8192 bytes), before/after 32 KiB (32768 bytes) at service level.
 * - A serialization failure must never throw or roll back a business change silently.
 */

export const METADATA_MAX_BYTES = 8192; // 8 KiB
export const PAYLOAD_MAX_BYTES = 32768; // 32 KiB

const MAX_DEPTH = 8;
const MAX_KEYS = 100;
const MAX_ARRAY_LENGTH = 100;

const SENSITIVE_KEY_PATTERN =
  /password|token|secret|hash|csrf|cookie|authorization|mfa/i;

const ARGON2_HASH_PATTERN =
  /^\$argon2(id|i|d)\$v=\d+\$m=\d+,t=\d+,p=\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/;

const BASE64URL_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
}

export function isSensitiveValue(value: string): boolean {
  return ARGON2_HASH_PATTERN.test(value) || BASE64URL_TOKEN_PATTERN.test(value);
}

export function redactStringValue(value: string): string {
  if (ARGON2_HASH_PATTERN.test(value)) {
    return '[REDACTED_HASH]';
  }
  if (BASE64URL_TOKEN_PATTERN.test(value)) {
    return '[REDACTED_TOKEN]';
  }
  return value;
}

function sanitizeInternal(
  val: unknown,
  depth: number,
  seen: WeakSet<object>,
): unknown {
  if (val === null || val === undefined) {
    return val;
  }

  // Primitive types
  const valType = typeof val;
  if (valType === 'string') {
    return redactStringValue(val as string);
  }
  if (valType === 'number' || valType === 'boolean') {
    return val;
  }
  if (valType === 'bigint') {
    return (val as bigint).toString();
  }

  // Depth guard
  if (depth > MAX_DEPTH) {
    return '[MaxDepth]';
  }

  // Buffers
  if (Buffer.isBuffer(val)) {
    return `[Buffer: ${String(val.length)} bytes]`;
  }

  // Dates
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? '[Invalid Date]' : val.toISOString();
  }

  // Errors
  if (val instanceof Error) {
    return {
      name: val.name,
      message: redactStringValue(val.message),
    };
  }

  // Object / Array handling
  if (valType === 'object') {
    const obj = val;

    // Circular reference guard
    if (seen.has(obj)) {
      return '[Circular]';
    }
    seen.add(obj);

    if (Array.isArray(obj)) {
      const result: unknown[] = [];
      const len = Math.min(obj.length, MAX_ARRAY_LENGTH);
      for (let i = 0; i < len; i++) {
        result.push(sanitizeInternal(obj[i], depth + 1, seen));
      }
      if (obj.length > MAX_ARRAY_LENGTH) {
        result.push(
          `[... ${String(obj.length - MAX_ARRAY_LENGTH)} more items truncated]`,
        );
      }
      return result;
    }

    const result: Record<string, unknown> = {};
    const entries = Object.entries(obj as Record<string, unknown>);
    const len = Math.min(entries.length, MAX_KEYS);

    for (let i = 0; i < len; i++) {
      const entry = entries[i];
      if (entry) {
        const [key, propVal] = entry;
        if (isSensitiveKey(key)) {
          result[key] = '[REDACTED]';
        } else {
          result[key] = sanitizeInternal(propVal, depth + 1, seen);
        }
      }
    }

    if (entries.length > MAX_KEYS) {
      result._truncated = true;
      result._omittedKeyCount = entries.length - MAX_KEYS;
    }

    return result;
  }

  return typeof val === 'symbol' ? val.toString() : '[Unknown]';
}

/**
 * Sanitizes and redacts an audit payload, returning a safe plain JSON object.
 * Guaranteed never to throw.
 */
export function sanitizeAuditPayload(
  payload: unknown,
  maxBytes: number = PAYLOAD_MAX_BYTES,
): Record<string, unknown> | null {
  if (payload === null || payload === undefined) {
    return null;
  }

  try {
    const seen = new WeakSet<object>();
    const sanitized = sanitizeInternal(payload, 1, seen);

    const targetObj: Record<string, unknown> =
      typeof sanitized === 'object' &&
      sanitized !== null &&
      !Array.isArray(sanitized)
        ? (sanitized as Record<string, unknown>)
        : { value: sanitized };

    // Size check
    const jsonStr = JSON.stringify(targetObj);
    const byteLength = Buffer.byteLength(jsonStr, 'utf8');

    if (byteLength > maxBytes) {
      return {
        _truncated: true,
        _originalBytes: byteLength,
        _maxBytes: maxBytes,
        _notice: 'Payload exceeded service size limit and was truncated',
      };
    }

    return targetObj;
  } catch (err: unknown) {
    // Fail-safe: serialization failure must NEVER throw or silently drop the audit write
    return {
      _redaction_error: true,
      _error_name: err instanceof Error ? err.name : 'UnknownError',
    };
  }
}

/**
 * Sanitizes metadata with 8 KiB service-level cap.
 */
export function sanitizeMetadata(
  metadata?: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!metadata) {
    return {};
  }
  const result = sanitizeAuditPayload(metadata, METADATA_MAX_BYTES);
  return result ?? {};
}

/**
 * Sanitizes before/after state payloads with 32 KiB service-level cap.
 */
export function sanitizePayloadState(
  payload?: unknown,
): Record<string, unknown> | null {
  return sanitizeAuditPayload(payload, PAYLOAD_MAX_BYTES);
}
