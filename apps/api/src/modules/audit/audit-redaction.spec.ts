import {
  sanitizeAuditPayload,
  sanitizeMetadata,
  sanitizePayloadState,
  isSensitiveKey,
  isSensitiveValue,
  METADATA_MAX_BYTES,
  PAYLOAD_MAX_BYTES,
} from './audit-redaction';

describe('Audit Redaction Engine (Correction G)', () => {
  describe('Key Detection & Value Redaction', () => {
    it('detects sensitive keys case-insensitively', () => {
      expect(isSensitiveKey('password')).toBe(true);
      expect(isSensitiveKey('currentPassword')).toBe(true);
      expect(isSensitiveKey('SECRET_KEY')).toBe(true);
      expect(isSensitiveKey('authToken')).toBe(true);
      expect(isSensitiveKey('csrfToken')).toBe(true);
      expect(isSensitiveKey('authorization')).toBe(true);
      expect(isSensitiveKey('set-cookie')).toBe(true);
      expect(isSensitiveKey('mfaCode')).toBe(true);
      expect(isSensitiveKey('user_mfa_secret')).toBe(true);
      expect(isSensitiveKey('passwordHash')).toBe(true);

      // Safe keys: sessionId is an entity UUID column, not a secret
      expect(isSensitiveKey('sessionId')).toBe(false);
      expect(isSensitiveKey('session_id')).toBe(false);
      expect(isSensitiveKey('username')).toBe(false);
      expect(isSensitiveKey('action')).toBe(false);
      expect(isSensitiveKey('reason')).toBe(false);
    });

    it('redacts sensitive keys regardless of value', () => {
      const input = {
        username: 'alice',
        password: 'plain-password-123',
        nested: {
          secretToken: 'secret-token-value',
          normalData: 'visible',
        },
      };

      const result = sanitizeAuditPayload(input);
      expect(result).toEqual({
        username: 'alice',
        password: '[REDACTED]',
        nested: {
          secretToken: '[REDACTED]',
          normalData: 'visible',
        },
      });
    });

    it('redacts string VALUES matching Argon2 hash even under non-sensitive keys', () => {
      const sampleArgon2 =
        '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$abcdefghijklmnopqrstuvwxyz0123456789+/=';
      expect(isSensitiveValue(sampleArgon2)).toBe(true);

      const input = {
        data: sampleArgon2,
        history: [sampleArgon2, 'regular text'],
      };

      const result = sanitizeAuditPayload(input);
      expect(result).toEqual({
        data: '[REDACTED_HASH]',
        history: ['[REDACTED_HASH]', 'regular text'],
      });
    });

    it('redacts string VALUES matching 43-character base64url tokens even under non-sensitive keys', () => {
      // 43-character base64url token (32 random bytes in base64url)
      const sampleToken = 'E90pQp-F-94gJtS2uT6m1b7v8x2z3a4c5d6e7f8g9h0';
      expect(sampleToken.length).toBe(43);
      expect(isSensitiveValue(sampleToken)).toBe(true);

      const input = {
        customField: sampleToken,
      };

      const result = sanitizeAuditPayload(input);
      expect(result).toEqual({
        customField: '[REDACTED_TOKEN]',
      });
    });
  });

  describe('Special Data Types', () => {
    it('handles BigInt safely by converting to string', () => {
      const bigVal = 9007199254740991000n;
      const result = sanitizeAuditPayload({ id: bigVal });
      expect(result).toEqual({ id: '9007199254740991000' });
    });

    it('handles Date safely by converting to ISO string', () => {
      const date = new Date('2026-10-05T12:00:00.000Z');
      const result = sanitizeAuditPayload({ timestamp: date });
      expect(result).toEqual({ timestamp: '2026-10-05T12:00:00.000Z' });
    });

    it('handles Error objects by preserving name and message', () => {
      const err = new Error('Database connection reset');
      const result = sanitizeAuditPayload({ failure: err });
      expect(result).toEqual({
        failure: {
          name: 'Error',
          message: 'Database connection reset',
        },
      });
    });

    it('handles Buffer objects by converting to descriptor', () => {
      const buf = Buffer.from('hello world binary');
      const result = sanitizeAuditPayload({ payload: buf });
      expect(result).toEqual({
        payload: `[Buffer: ${String(buf.length)} bytes]`,
      });
    });
  });

  describe('Guards: Circular References, Depth, and Limits', () => {
    it('guards against circular references without throwing', () => {
      interface CircularNode {
        name: string;
        self?: CircularNode;
      }
      const node: CircularNode = { name: 'cyclic' };
      node.self = node;

      const result = sanitizeAuditPayload(node);
      expect(result).toEqual({
        name: 'cyclic',
        self: '[Circular]',
      });
    });

    it('caps recursion depth at max 8 levels', () => {
      let current: Record<string, unknown> = { level: 10 };
      for (let i = 9; i >= 1; i--) {
        current = { level: i, next: current };
      }

      const result = sanitizeAuditPayload(current);
      expect(result).toBeDefined();

      // Traverse down 8 levels
      let pointer = result ?? {};
      for (let i = 1; i < 8; i++) {
        pointer = pointer.next as Record<string, unknown>;
        expect(pointer).toBeDefined();
      }
      // At level 9, deeper object is capped
      expect(pointer.next).toBe('[MaxDepth]');
    });

    it('caps object keys at 100 entries', () => {
      const wideObject: Record<string, number> = {};
      for (let i = 0; i < 120; i++) {
        wideObject[`key_${String(i)}`] = i;
      }

      const result = sanitizeAuditPayload(wideObject);
      expect(result).toBeDefined();
      expect(result?._truncated).toBe(true);
      expect(result?._omittedKeyCount).toBe(20);
    });

    it('caps array length at 100 items', () => {
      const largeArray = Array.from({ length: 150 }, (_, i) => i);
      const result = sanitizeAuditPayload({ items: largeArray });
      const items = result?.items as unknown[];
      expect(items.length).toBe(101); // 100 items + 1 truncation notice
      expect(items[100]).toContain('50 more items truncated');
    });
  });

  describe('Size Caps (Correction G)', () => {
    it('enforces 8 KiB size cap on metadata', () => {
      // Small metadata under 8 KiB passes untouched
      const smallMeta = { action: 'test', details: 'small' };
      const smallResult = sanitizeMetadata(smallMeta);
      expect(smallResult).toEqual(smallMeta);

      // Oversized metadata exceeding 8 KiB (8192 bytes) is truncated safely
      const largeMeta = {
        data: 'a'.repeat(9000),
      };
      const largeResult = sanitizeMetadata(largeMeta);
      expect(largeResult._truncated).toBe(true);
      expect(typeof largeResult._originalBytes).toBe('number');
      expect(largeResult._originalBytes as number).toBeGreaterThan(
        METADATA_MAX_BYTES,
      );
    });

    it('enforces 32 KiB size cap on before/after states', () => {
      // Payload under 32 KiB passes untouched
      const normalPayload = { diff: 'change' };
      const normalResult = sanitizePayloadState(normalPayload);
      expect(normalResult).toEqual(normalPayload);

      // Oversized payload exceeding 32 KiB (32768 bytes) is truncated safely
      const oversizedPayload = {
        content: 'x'.repeat(35000),
      };
      const oversizedResult = sanitizePayloadState(oversizedPayload);
      expect(oversizedResult?._truncated).toBe(true);
      expect(typeof oversizedResult?._originalBytes).toBe('number');
      expect(oversizedResult?._originalBytes as number).toBeGreaterThan(
        PAYLOAD_MAX_BYTES,
      );
    });

    it('returns empty object when metadata is null or undefined', () => {
      expect(sanitizeMetadata(null)).toEqual({});
      expect(sanitizeMetadata(undefined)).toEqual({});
    });
  });
});
