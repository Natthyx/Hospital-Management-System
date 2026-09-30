import type { IncomingMessage, ServerResponse } from 'node:http';

import { REQUEST_ID_HEADER } from '../utils/request-id.util';

export type ResWithOptionalHeaders = ServerResponse & {
  headers?: Record<string, unknown>;
};

export interface SerializedRequest {
  id: string;
  method: string;
  url: string;
  query: Record<string, never>;
  headers: {
    host?: string | undefined;
    'user-agent'?: string | undefined;
    'x-request-id': string;
  };
}

export interface SerializedResponse {
  statusCode: number;
  headers: {
    'content-type': unknown;
    'x-request-id': unknown;
  };
}

/**
 * Custom Pino request serializer enforcing an explicit allowlist.
 *
 * Primary security control preventing PHI, secrets, cookies, or
 * arbitrary client headers from ever entering log streams.
 */
export function serializeRequest(req: IncomingMessage): SerializedRequest {
  const rawUrl = req.url ?? '';
  const url = rawUrl.split('?')[0] ?? '';
  const headerReqId = req.headers[REQUEST_ID_HEADER];
  const rawId = (req as unknown as { id?: string }).id;
  const id =
    typeof rawId === 'string' && rawId.length > 0
      ? rawId
      : typeof headerReqId === 'string'
        ? headerReqId
        : '';

  return {
    id,
    method: req.method ?? '',
    url,
    query: {},
    headers: {
      host: req.headers.host,
      'user-agent': req.headers['user-agent'],
      'x-request-id': id,
    },
  };
}

/**
 * Custom Pino response serializer enforcing an explicit allowlist.
 */
export function serializeResponse(
  res: ResWithOptionalHeaders,
): SerializedResponse {
  const getHeader = (name: string): unknown => {
    if (typeof res.getHeader === 'function') {
      return res.getHeader(name);
    }
    if (res.headers && typeof res.headers === 'object') {
      return res.headers[name];
    }
    return undefined;
  };

  return {
    statusCode: res.statusCode,
    headers: {
      'content-type': getHeader('content-type'),
      'x-request-id': getHeader(REQUEST_ID_HEADER),
    },
  };
}
