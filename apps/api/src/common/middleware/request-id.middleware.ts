import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

import { REQUEST_ID_HEADER, resolveRequestId } from '../utils/request-id.util';

export { REQUEST_ID_HEADER };

/**
 * RequestIdMiddleware ensures that both req and res carry a validated request ID.
 * If pino-http already set req.id or req.headers['x-request-id'], it preserves it;
 * otherwise it resolves and sets the ID on both.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const rawId = req.id || req.headers[REQUEST_ID_HEADER];
    const requestId = resolveRequestId(rawId);

    req.id = requestId;
    req.headers[REQUEST_ID_HEADER] = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);

    next();
  }
}
