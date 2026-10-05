import crypto from 'node:crypto';

import {
  INVALID_CURRENT_PASSWORD,
  VALIDATION_FAILED,
  validatePasswordPolicy,
  type CurrentUser,
  type SessionSummary,
} from '@hms/shared';
import {
  Injectable,
  Inject,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import * as cookie from 'cookie';
import type { Request, Response } from 'express';

import { CLOCK, type Clock } from '../../common';
import { ENV_CONFIG, type EnvConfig } from '../../config';
import { PrismaService } from '../../database/prisma.service';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../audit/audit-recorder.interface';

import { Argon2LimiterService } from './argon2-limiter.service';
import { COMMON_PASSWORDS_SET } from './data/password-blocklist.data';

interface LoginResult {
  user: CurrentUser;
  permissions: string[];
  csrfToken: string;
}

interface ChangePasswordResult {
  success: true;
  csrfToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly argon2Limiter: Argon2LimiterService,
    @Inject(CLOCK)
    private readonly clock: Clock,
    @Inject(ENV_CONFIG)
    private readonly envConfig: EnvConfig,
    @Inject(AUDIT_RECORDER)
    private readonly auditRecorder: AuditRecorder,
  ) {}

  /**
   * Helper to truncate string to safe DB storage lengths.
   */
  private truncate(str: string | undefined | null, max: number): string | null {
    if (!str) return null;
    return str.length > max ? str.slice(0, max) : str;
  }

  /**
   * Sets the hms_session browser-session cookie.
   * Browser-session cookie: no maxAge or expires attribute per ADR-027.
   */
  private setSessionCookie(res: Response, token: string): void {
    const cookieHeader = cookie.serialize('hms_session', token, {
      httpOnly: true,
      secure: this.envConfig.COOKIE_SECURE,
      sameSite: 'strict',
      path: '/',
    });
    res.setHeader('Set-Cookie', cookieHeader);
  }

  /**
   * Clears the hms_session cookie with identical attributes.
   */
  private clearSessionCookie(res: Response): void {
    const cookieHeader = cookie.serialize('hms_session', '', {
      httpOnly: true,
      secure: this.envConfig.COOKIE_SECURE,
      sameSite: 'strict',
      path: '/',
      expires: new Date(0),
    });
    res.setHeader('Set-Cookie', cookieHeader);
  }

  /**
   * POST /api/v1/auth/login
   */
  async login(
    req: Request,
    res: Response,
    usernameInput: string,
    passwordInput: string,
  ): Promise<LoginResult> {
    const now = this.clock.now();
    const rawIp = req.ip ?? req.socket.remoteAddress;
    const ip = this.truncate(rawIp, 45);
    const userAgent = this.truncate(req.headers['user-agent'], 255);
    const requestId = (req as unknown as { id?: string }).id;

    // Condition 11: Normalizes username (trim, lowercase) before lookup
    const normUsername = usernameInput.trim().toLowerCase();

    // Check for previous session on request to revoke it with 'session_replaced'
    const rawCookies = req.headers.cookie ?? '';
    const parsedCookies = cookie.parse(rawCookies);
    const previousToken = parsedCookies.hms_session;

    const user = await this.prisma.user.findUnique({
      where: { username: normUsername },
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
    });

    // Unknown user or disabled user: execute dummy verify and return generic 401
    if (user?.status !== 'active') {
      await this.argon2Limiter.verifyDummy(passwordInput);
      await this.auditRecorder.record({
        action: 'auth.login_failed',
        outcome: 'failure',
        actorUserId: null,
        actorUsername: 'system:unknown', // Condition 8: never record attempted username
        metadata: {
          reason: user ? 'account_disabled' : 'invalid_credentials',
        },
        ip,
        userAgent,
        requestId,
      });
      throw new UnauthorizedException('Invalid username or password');
    }

    // Condition 3: While locked, even the correct password gets generic 401 with no Set-Cookie
    if (user.lockedUntil !== null && user.lockedUntil > now) {
      await this.argon2Limiter.verifyDummy(passwordInput);
      await this.auditRecorder.record({
        action: 'auth.login_failed',
        outcome: 'failure',
        actorUserId: user.id,
        actorUsername: user.username,
        metadata: { reason: 'account_locked' },
        ip,
        userAgent,
        requestId,
      });
      throw new UnauthorizedException('Invalid username or password');
    }

    // Verify password against Argon2id hash
    const isValid = await this.argon2Limiter.verify(
      user.passwordHash,
      passwordInput,
    );

    if (!isValid) {
      const lockExpiry = new Date(
        now.getTime() + this.envConfig.LOGIN_LOCK_MINUTES * 60 * 1000,
      );
      const maxFailures = this.envConfig.LOGIN_MAX_FAILURES;

      // Condition 2: Atomic update evaluating lock condition inside single SQL statement
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.$queryRaw<
          { failed_login_count: number; locked_until: Date | null }[]
        >`
          UPDATE "users"
          SET "failed_login_count" = CASE
                WHEN "locked_until" IS NOT NULL AND "locked_until" > ${now} THEN "failed_login_count"
                WHEN "locked_until" IS NOT NULL AND "locked_until" <= ${now} THEN 1
                WHEN "failed_login_count" + 1 >= ${maxFailures} THEN "failed_login_count" + 1
                ELSE "failed_login_count" + 1
              END,
              "locked_until" = CASE
                WHEN "locked_until" IS NOT NULL AND "locked_until" > ${now} THEN "locked_until"
                WHEN "locked_until" IS NOT NULL AND "locked_until" <= ${now} THEN NULL
                WHEN "failed_login_count" + 1 >= ${maxFailures} THEN ${lockExpiry}
                ELSE "locked_until"
              END
          WHERE "id" = ${user.id}::uuid
          RETURNING "failed_login_count", "locked_until";
        `;

        const finalCount = updated[0]?.failed_login_count ?? 1;
        const isNowLocked = updated[0]?.locked_until !== null;

        await this.auditRecorder.record(
          {
            action: 'auth.login_failed',
            outcome: 'failure',
            actorUserId: user.id,
            actorUsername: user.username,
            metadata: {
              reason: 'invalid_credentials',
              failedAttempts: finalCount,
            },
            ip,
            userAgent,
            requestId,
          },
          tx,
        );

        if (isNowLocked) {
          await this.auditRecorder.record(
            {
              action: 'auth.account_locked',
              outcome: 'failure',
              actorUserId: user.id,
              actorUsername: user.username,
              metadata: { lockedUntil: lockExpiry.toISOString() },
              ip,
              userAgent,
              requestId,
            },
            tx,
          );
        }
      });

      throw new UnauthorizedException('Invalid username or password');
    }

    // Credentials valid: create new session and reset lockout counter
    const sessionToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto
      .createHash('sha256')
      .update(sessionToken)
      .digest('hex');
    const csrfToken = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(
      now.getTime() + this.envConfig.SESSION_ABSOLUTE_HOURS * 3600 * 1000,
    );

    await this.prisma.$transaction(async (tx) => {
      // Condition 8: Revoke previous session with 'session_replaced' if present
      if (previousToken) {
        const prevTokenHash = crypto
          .createHash('sha256')
          .update(previousToken)
          .digest('hex');
        await tx.session.updateMany({
          where: { tokenHash: prevTokenHash, revokedAt: null },
          data: {
            revokedAt: now,
            revokedReason: 'session_replaced',
          },
        });
      }

      // Reset login counters on success without bumping version (ADR-023)
      await tx.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: 0,
          lockedUntil: null,
          lastLoginAt: now,
        },
      });

      const newSession = await tx.session.create({
        data: {
          userId: user.id,
          tokenHash,
          csrfToken,
          ip,
          userAgent,
          createdAt: now,
          lastSeenAt: now,
          expiresAt,
        },
      });

      await this.auditRecorder.record(
        {
          action: 'auth.login_success',
          outcome: 'success',
          actorUserId: user.id,
          actorUsername: user.username,
          sessionId: newSession.id,
          ip,
          userAgent,
          requestId,
        },
        tx,
      );
    });

    this.setSessionCookie(res, sessionToken);

    // Build permissions list
    const permissionsSet = new Set<string>();
    const roles: string[] = [];
    for (const ur of user.userRoles) {
      roles.push(ur.role.code);
      for (const rp of ur.role.rolePermissions) {
        permissionsSet.add(rp.permissionCode);
      }
    }

    return {
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        status: user.status,
        mustChangePassword: user.mustChangePassword,
        roles,
      },
      permissions: Array.from(permissionsSet),
      csrfToken,
    };
  }

  /**
   * POST /api/v1/auth/logout
   */
  async logout(
    req: Request,
    res: Response,
    userId: string,
    username: string,
    sessionId: string,
  ): Promise<void> {
    const now = this.clock.now();
    const rawIp = req.ip ?? req.socket.remoteAddress;
    const ip = this.truncate(rawIp, 45);
    const userAgent = this.truncate(req.headers['user-agent'], 255);
    const requestId = (req as unknown as { id?: string }).id;

    await this.prisma.$transaction(async (tx) => {
      await tx.session.updateMany({
        where: { id: sessionId, revokedAt: null },
        data: {
          revokedAt: now,
          revokedReason: 'logout',
        },
      });

      await this.auditRecorder.record(
        {
          action: 'auth.logout',
          outcome: 'success',
          actorUserId: userId,
          actorUsername: username,
          sessionId,
          ip,
          userAgent,
          requestId,
        },
        tx,
      );
    });

    this.clearSessionCookie(res);
  }

  /**
   * GET /api/v1/auth/me
   */
  async me(
    userId: string,
    sessionId: string,
  ): Promise<LoginResult & { mustChangePassword: boolean }> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
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
    });

    const session = await this.prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
    });

    const permissionsSet = new Set<string>();
    const roles: string[] = [];
    for (const ur of user.userRoles) {
      roles.push(ur.role.code);
      for (const rp of ur.role.rolePermissions) {
        permissionsSet.add(rp.permissionCode);
      }
    }

    return {
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        status: user.status,
        mustChangePassword: user.mustChangePassword,
        roles,
      },
      permissions: Array.from(permissionsSet),
      csrfToken: session.csrfToken,
      mustChangePassword: user.mustChangePassword,
    };
  }

  /**
   * POST /api/v1/auth/change-password
   */
  async changePassword(
    req: Request,
    res: Response,
    userId: string,
    currentSessionId: string,
    currentPasswordInput: string,
    newPasswordInput: string,
  ): Promise<ChangePasswordResult> {
    const now = this.clock.now();
    const rawIp = req.ip ?? req.socket.remoteAddress;
    const ip = this.truncate(rawIp, 45);
    const userAgent = this.truncate(req.headers['user-agent'], 255);
    const requestId = (req as unknown as { id?: string }).id;

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    // Verify current password
    const isCurrentValid = await this.argon2Limiter.verify(
      user.passwordHash,
      currentPasswordInput,
    );

    if (!isCurrentValid) {
      const lockExpiry = new Date(
        now.getTime() + this.envConfig.LOGIN_LOCK_MINUTES * 60 * 1000,
      );
      const maxFailures = this.envConfig.LOGIN_MAX_FAILURES;

      // Condition 4: Incorrect currentPassword counts toward lockout
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.$queryRaw<
          { failed_login_count: number; locked_until: Date | null }[]
        >`
          UPDATE "users"
          SET "failed_login_count" = "failed_login_count" + 1,
              "locked_until" = CASE
                WHEN "failed_login_count" + 1 >= ${maxFailures} THEN ${lockExpiry}
                ELSE "locked_until"
              END
          WHERE "id" = ${user.id}::uuid
          RETURNING "failed_login_count", "locked_until";
        `;

        const isNowLocked = updated[0]?.locked_until !== null;

        // Condition 4: When lock triggers, current session is revoked
        if (isNowLocked) {
          await tx.session.update({
            where: { id: currentSessionId },
            data: {
              revokedAt: now,
              revokedReason: 'account_locked',
            },
          });
          this.clearSessionCookie(res);

          await this.auditRecorder.record(
            {
              action: 'auth.account_locked',
              outcome: 'failure',
              actorUserId: user.id,
              actorUsername: user.username,
              sessionId: currentSessionId,
              metadata: { lockedUntil: lockExpiry.toISOString() },
              ip,
              userAgent,
              requestId,
            },
            tx,
          );
        }
      });

      throw new BadRequestException({
        code: INVALID_CURRENT_PASSWORD,
        message: 'Current password is incorrect',
      });
    }

    // Validate new password against policy
    const policyResult = validatePasswordPolicy(
      newPasswordInput,
      user.username,
      COMMON_PASSWORDS_SET,
    );

    if (!policyResult.valid) {
      throw new BadRequestException({
        code: VALIDATION_FAILED,
        message: 'Password does not meet policy requirements',
        details: policyResult.errors,
      });
    }

    // Hash new password
    const newHash = await this.argon2Limiter.hash(newPasswordInput);

    // Rotate current session credentials
    const newSessionToken = crypto.randomBytes(32).toString('base64url');
    const newTokenHash = crypto
      .createHash('sha256')
      .update(newSessionToken)
      .digest('hex');
    const newCsrfToken = crypto.randomBytes(32).toString('base64url');

    await this.prisma.$transaction(async (tx) => {
      // Update user password and bump version (ADR-023)
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: newHash,
          passwordChangedAt: now,
          mustChangePassword: false,
          failedLoginCount: 0,
          lockedUntil: null,
          version: { increment: 1 },
        },
      });

      // Revoke all OTHER sessions for this user
      await tx.session.updateMany({
        where: {
          userId: user.id,
          id: { not: currentSessionId },
          revokedAt: null,
        },
        data: {
          revokedAt: now,
          revokedReason: 'password_changed',
        },
      });

      // Rotate current session token & CSRF token
      await tx.session.update({
        where: { id: currentSessionId },
        data: {
          tokenHash: newTokenHash,
          csrfToken: newCsrfToken,
          lastSeenAt: now,
        },
      });

      await this.auditRecorder.record(
        {
          action: 'auth.password_changed',
          outcome: 'success',
          actorUserId: user.id,
          actorUsername: user.username,
          sessionId: currentSessionId,
          ip,
          userAgent,
          requestId,
        },
        tx,
      );
    });

    this.setSessionCookie(res, newSessionToken);

    return {
      success: true,
      csrfToken: newCsrfToken,
    };
  }

  /**
   * GET /api/v1/auth/sessions
   */
  async listSessions(
    userId: string,
    currentSessionId: string,
  ): Promise<SessionSummary[]> {
    const now = this.clock.now();
    const sessions = await this.prisma.session.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { lastSeenAt: 'desc' },
    });

    return sessions.map((s) => ({
      id: s.id,
      ip: s.ip,
      userAgent: s.userAgent,
      createdAt: s.createdAt.toISOString(),
      lastSeenAt: s.lastSeenAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      isCurrent: s.id === currentSessionId,
    }));
  }

  /**
   * DELETE /api/v1/auth/sessions/:id
   */
  async revokeSession(
    req: Request,
    res: Response,
    userId: string,
    username: string,
    currentSessionId: string,
    targetSessionId: string,
  ): Promise<void> {
    const now = this.clock.now();
    const rawIp = req.ip ?? req.socket.remoteAddress;
    const ip = this.truncate(rawIp, 45);
    const userAgent = this.truncate(req.headers['user-agent'], 255);
    const requestId = (req as unknown as { id?: string }).id;

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.session.updateMany({
        where: {
          id: targetSessionId,
          userId, // IDOR check: must match current user
          revokedAt: null,
        },
        data: {
          revokedAt: now,
          revokedReason: 'user_revoked',
        },
      });

      if (updated.count === 0) {
        throw new NotFoundException('Session not found');
      }

      await this.auditRecorder.record(
        {
          action: 'auth.session_revoked',
          outcome: 'success',
          actorUserId: userId,
          actorUsername: username,
          entityType: 'session',
          entityId: targetSessionId,
          ip,
          userAgent,
          requestId,
        },
        tx,
      );
    });

    // If user revoked their own current session, clear cookie
    if (targetSessionId === currentSessionId) {
      this.clearSessionCookie(res);
    }
  }
}
