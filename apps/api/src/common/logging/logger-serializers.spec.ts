import type { IncomingMessage } from 'node:http';

import {
  serializeRequest,
  serializeResponse,
  type ResWithOptionalHeaders,
} from './logger-serializers';

describe('logger-serializers', () => {
  describe('serializeRequest', () => {
    it('enforces strict header allowlist: only host, user-agent, and x-request-id', () => {
      const mockReq = {
        id: 'test-req-uuid-123',
        method: 'POST',
        url: '/api/v1/patients?token=secret123&phi=patient_data',
        headers: {
          host: '127.0.0.1:3000',
          'user-agent': 'TestAgent/2.0',
          cookie: 'session=sensitive_cookie_value',
          authorization: 'Bearer sensitive_token_value',
          'x-csrf-token': 'csrf_token_secret',
          'set-cookie': ['cookie1=val1', 'cookie2=val2'],
          'x-custom-leak': 'should_never_be_logged',
          'x-forwarded-for': '10.0.0.1',
        },
      } as unknown as IncomingMessage;

      const serialized = serializeRequest(mockReq);

      // (a) URL must not contain query string
      expect(serialized.url).toBe('/api/v1/patients');
      expect(serialized.url).not.toContain('?');
      expect(serialized.url).not.toContain('token=secret123');
      expect(serialized.url).not.toContain('patient_data');

      // (b) query must be strictly empty object
      expect(serialized.query).toEqual({});
      expect(Object.keys(serialized.query)).toHaveLength(0);

      // (c) headers must contain ONLY host, user-agent, and x-request-id
      expect(Object.keys(serialized.headers).sort()).toEqual([
        'host',
        'user-agent',
        'x-request-id',
      ]);
      expect(serialized.headers).toEqual({
        host: '127.0.0.1:3000',
        'user-agent': 'TestAgent/2.0',
        'x-request-id': 'test-req-uuid-123',
      });

      // (d) sensitive headers must be undefined / absent
      const headersRecord = serialized.headers as Record<string, unknown>;
      expect(headersRecord.cookie).toBeUndefined();
      expect(headersRecord.authorization).toBeUndefined();
      expect(headersRecord['x-csrf-token']).toBeUndefined();
      expect(headersRecord['set-cookie']).toBeUndefined();
      expect(headersRecord['x-custom-leak']).toBeUndefined();

      // (e) method and id preserved
      expect(serialized.method).toBe('POST');
      expect(serialized.id).toBe('test-req-uuid-123');
    });

    it('resolves request id from header if req.id is not populated', () => {
      const mockReq = {
        method: 'GET',
        url: '/api/v1/health',
        headers: {
          host: 'localhost:3000',
          'x-request-id': 'header-provided-id-456',
        },
      } as unknown as IncomingMessage;

      const serialized = serializeRequest(mockReq);

      expect(serialized.id).toBe('header-provided-id-456');
      expect(serialized.headers['x-request-id']).toBe('header-provided-id-456');
    });

    it('handles requests with no url, no headers, or undefined values gracefully', () => {
      const mockReq = {
        headers: {},
      } as unknown as IncomingMessage;

      const serialized = serializeRequest(mockReq);

      expect(serialized.url).toBe('');
      expect(serialized.query).toEqual({});
      expect(serialized.method).toBe('');
      expect(serialized.id).toBe('');
      expect(serialized.headers).toEqual({
        host: undefined,
        'user-agent': undefined,
        'x-request-id': '',
      });
    });
  });

  describe('serializeResponse', () => {
    it('enforces strict header allowlist: only content-type and x-request-id', () => {
      const mockRes = {
        statusCode: 201,
        getHeader(name: string) {
          const map: Record<string, unknown> = {
            'content-type': 'application/json',
            'x-request-id': 'resp-req-id-789',
            'set-cookie': 'secret_session=leak',
          };
          return map[name];
        },
      } as unknown as ResWithOptionalHeaders;

      const serialized = serializeResponse(mockRes);

      expect(serialized.statusCode).toBe(201);
      expect(Object.keys(serialized.headers).sort()).toEqual([
        'content-type',
        'x-request-id',
      ]);
      expect(serialized.headers).toEqual({
        'content-type': 'application/json',
        'x-request-id': 'resp-req-id-789',
      });
    });
  });
});
