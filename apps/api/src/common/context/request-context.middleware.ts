import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

import { REQUEST_ID_HEADER, resolveRequestId } from '../utils/request-id.util';

import type { RequestContextStore } from './request-context.interface';
import { RequestContextService } from './request-context.service';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly requestContextService: RequestContextService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const rawId = req.id || req.headers[REQUEST_ID_HEADER];
    const requestId = resolveRequestId(rawId);

    // Keep request and response headers synchronized
    req.id = requestId;
    req.headers[REQUEST_ID_HEADER] = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);

    const rawIp = req.ip ?? req.socket.remoteAddress ?? null;
    const userAgent = req.headers['user-agent'] ?? null;

    const store: RequestContextStore = {
      requestId,
      ip: rawIp ? rawIp.slice(0, 45) : null,
      userAgent: userAgent ? userAgent.slice(0, 255) : null,
      actorUserId: null,
      actorUsername: null,
      sessionId: null,
    };

    this.requestContextService.runWithContext(store, () => {
      next();
    });
  }
}
