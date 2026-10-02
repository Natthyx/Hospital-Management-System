import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import type { Request } from 'express';

import { ENV_CONFIG, type EnvConfig } from '../../config';

/**
 * OriginGuard verifies the Origin or Referer header on all state-changing requests
 * (POST, PUT, PATCH, DELETE) to protect against Cross-Site Request Forgery (CSRF).
 *
 * Runs before AuthGuard and applies to ALL routes, including @Public() endpoints like login.
 * See ADR-030 & Spec Milestone F4.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  constructor(
    @Inject(ENV_CONFIG)
    private readonly envConfig: EnvConfig,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method.toUpperCase();

    // Safe methods never perform state changes
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      return true;
    }

    const appOrigin = this.envConfig.APP_ORIGIN;
    const rawOrigin = request.headers.origin;

    // 1. Direct Origin header check
    if (
      typeof rawOrigin === 'string' &&
      rawOrigin.trim().length > 0 &&
      rawOrigin !== 'null'
    ) {
      if (rawOrigin === appOrigin) {
        return true;
      }
      throw new ForbiddenException('Invalid or missing origin header');
    }

    // 2. Fallback to Referer header if Origin is missing or literal "null"
    const rawReferer = request.headers.referer;
    if (typeof rawReferer === 'string' && rawReferer.trim().length > 0) {
      try {
        const refererUrl = new URL(rawReferer);
        if (refererUrl.origin === appOrigin) {
          return true;
        }
      } catch {
        // Invalid URL format in Referer
      }
    }

    // Both missing or failed to match APP_ORIGIN
    throw new ForbiddenException('Invalid or missing origin header');
  }
}
