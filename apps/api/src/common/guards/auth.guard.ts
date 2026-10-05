import crypto from 'node:crypto';

import { PASSWORD_CHANGE_REQUIRED } from '@hms/shared';
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as cookie from 'cookie';
import type { Request } from 'express';

import { ENV_CONFIG, type EnvConfig } from '../../config';
import { PrismaService } from '../../database/prisma.service';
import { RequestContextService } from '../context/request-context.service';
import { ALLOW_PASSWORD_CHANGE_KEY } from '../decorators/allow-password-change.decorator';
import type { RequestUser } from '../decorators/current-user.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { CLOCK, type Clock } from '../time/clock';

interface AuthenticatedRequest extends Request {
  user?: RequestUser;
}

/**
 * AuthGuard validates session credentials and enforces CSRF and password change rules.
 *
 * Execution order:
 * 1. OriginGuard (global)
 * 2. AuthGuard (global) -> verifies cookie, idle/absolute expiry, CSRF, and user active status
 * 3. PermissionGuard (global) -> verifies permissions or @Authenticated()
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    @Inject(CLOCK)
    private readonly clock: Clock,
    @Inject(ENV_CONFIG)
    private readonly envConfig: EnvConfig,
    private readonly requestContextService: RequestContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (isPublic === true) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const rawCookieHeader = request.headers.cookie ?? '';

    // Condition 5: Detect duplicate hms_session cookies to prevent cookie tossing/ambiguity
    const duplicateMatches = rawCookieHeader.match(/(?:^|;\s*)hms_session=/gu);
    if (duplicateMatches && duplicateMatches.length > 1) {
      throw new UnauthorizedException('Ambiguous session credentials');
    }

    const parsedCookies = cookie.parse(rawCookieHeader);
    const sessionToken = parsedCookies.hms_session;

    if (!sessionToken || sessionToken.trim().length === 0) {
      throw new UnauthorizedException('Authentication required');
    }

    const tokenHash = crypto
      .createHash('sha256')
      .update(sessionToken)
      .digest('hex');

    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: {
            userRoles: {
              include: {
                role: {
                  include: {
                    rolePermissions: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!session) {
      throw new UnauthorizedException('Authentication required');
    }

    if (session.revokedAt !== null) {
      throw new UnauthorizedException('Session has been revoked');
    }

    const now = this.clock.now();

    // Absolute timeout check
    if (now > session.expiresAt) {
      throw new UnauthorizedException('Session expired');
    }

    // Idle timeout check
    const idleLimitMs = this.envConfig.SESSION_IDLE_MINUTES * 60 * 1000;
    const idleExpiration = new Date(session.lastSeenAt.getTime() + idleLimitMs);
    if (now > idleExpiration) {
      throw new UnauthorizedException('Session expired due to inactivity');
    }

    // User account status check
    if (session.user.status !== 'active') {
      throw new UnauthorizedException('Account is disabled');
    }

    // Conditional update of last_seen_at (throttled to at most once per minute)
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
    if (session.lastSeenAt < oneMinuteAgo) {
      await this.prisma.$executeRaw`
        UPDATE "sessions"
        SET "last_seen_at" = ${now}
        WHERE "id" = ${session.id}::uuid
          AND "last_seen_at" < ${oneMinuteAgo}
          AND "revoked_at" IS NULL
          AND "expires_at" > ${now};
      `;
    }

    // CSRF token check on state-changing methods (POST, PUT, PATCH, DELETE)
    const method = request.method.toUpperCase();
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      const csrfHeader = request.headers['x-csrf-token'];
      if (!csrfHeader || typeof csrfHeader !== 'string') {
        throw new ForbiddenException('Invalid CSRF token');
      }

      const headerBuf = Buffer.from(csrfHeader);
      const expectedBuf = Buffer.from(session.csrfToken);

      // Condition 1: Check length first to avoid crypto.timingSafeEqual throwing on mismatched lengths
      if (
        headerBuf.length !== expectedBuf.length ||
        !crypto.timingSafeEqual(headerBuf, expectedBuf)
      ) {
        throw new ForbiddenException('Invalid CSRF token');
      }
    }

    // must_change_password gate: refuse any endpoint not marked @AllowPasswordChange()
    if (session.user.mustChangePassword) {
      const allowPasswordChange = this.reflector.getAllAndOverride<
        boolean | undefined
      >(ALLOW_PASSWORD_CHANGE_KEY, [context.getHandler(), context.getClass()]);

      if (allowPasswordChange !== true) {
        throw new ForbiddenException({
          code: PASSWORD_CHANGE_REQUIRED,
          message: 'Password change required before accessing other resources',
        });
      }
    }

    // Effective permissions: union of user's roles' permissions from DB
    const permissionsSet = new Set<string>();
    const roles: string[] = [];

    for (const ur of session.user.userRoles) {
      roles.push(ur.role.code);
      for (const rp of ur.role.rolePermissions) {
        permissionsSet.add(rp.permissionCode);
      }
    }

    request.user = {
      id: session.user.id,
      username: session.user.username,
      fullName: session.user.fullName,
      status: session.user.status,
      mustChangePassword: session.user.mustChangePassword,
      roles,
      permissions: Array.from(permissionsSet),
      sessionId: session.id,
    };

    // Update AsyncLocalStorage context with authenticated actor information (Correction F)
    this.requestContextService.setAuth({
      actorUserId: session.user.id,
      actorUsername: session.user.username,
      sessionId: session.id,
    });

    return true;
  }
}
