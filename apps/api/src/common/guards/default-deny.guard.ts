import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PERMISSIONS_KEY } from '../decorators/require-permission.decorator';

/**
 * DefaultDenyGuard enforces the "default is deny" rule (Rule 04 & Rule 01).
 *
 * Behavior:
 * 1. If an endpoint (or controller) is marked @Public(), allow access.
 * 2. If the request lacks an authenticated user, reject with 401 UNAUTHENTICATED.
 * 3. If the endpoint lacks @RequirePermission(...) or user lacks required permissions,
 *    reject with 403 FORBIDDEN.
 */
@Injectable()
export class DefaultDenyGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (isPublic === true) {
      return true;
    }

    // Default is deny: unauthenticated requests to non-public endpoints return 401
    const request = context
      .switchToHttp()
      .getRequest<{ user?: { permissions?: string[] } }>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    const permissions = this.reflector.getAllAndOverride<string[] | undefined>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Fail-closed: endpoint must declare @RequirePermission()
    if (!permissions || permissions.length === 0) {
      throw new ForbiddenException(
        'Access denied: endpoint has no public or permission declaration',
      );
    }

    const userPermissions = user.permissions ?? [];
    const hasAll = permissions.every((p) => userPermissions.includes(p));
    if (!hasAll) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
