import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { IS_AUTHENTICATED_KEY } from '../decorators/authenticated.decorator';
import type { RequestUser } from '../decorators/current-user.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PERMISSIONS_KEY } from '../decorators/require-permission.decorator';

interface MaybeUserRequest {
  user?: RequestUser;
}

/**
 * PermissionGuard enforces RBAC permissions and default-deny access controls.
 *
 * Rules:
 * 1. If @Public() is set, allow access.
 * 2. If @Authenticated() is set, allow if user is authenticated (no permission required).
 * 3. If @RequirePermission(...) is set, require that user has all specified permissions.
 * 4. Otherwise: fail-closed with 403 FORBIDDEN.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (isPublic === true) {
      return true;
    }

    const request = context.switchToHttp().getRequest<MaybeUserRequest>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    // 2. Pure authentication check (@Authenticated())
    const isAuthenticatedOnly = this.reflector.getAllAndOverride<
      boolean | undefined
    >(IS_AUTHENTICATED_KEY, [context.getHandler(), context.getClass()]);

    if (isAuthenticatedOnly === true) {
      return true;
    }

    // 3. Permission declaration check (@RequirePermission(...))
    const permissions = this.reflector.getAllAndOverride<string[] | undefined>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (permissions && permissions.length > 0) {
      const userPermissions = user.permissions;
      const hasAll = permissions.every((p) => userPermissions.includes(p));
      if (!hasAll) {
        throw new ForbiddenException('Insufficient permissions');
      }
      return true;
    }

    // 4. Default is deny: endpoint lacks access declaration
    throw new ForbiddenException(
      'Access denied: endpoint has no public or permission declaration',
    );
  }
}
