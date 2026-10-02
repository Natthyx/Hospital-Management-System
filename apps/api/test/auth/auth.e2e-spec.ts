import type { Server } from 'node:http';

import {
  INVALID_CURRENT_PASSWORD,
  PASSWORD_CHANGE_REQUIRED,
  UNAUTHENTICATED,
  FORBIDDEN,
  NOT_FOUND,
  type LoginResponse,
  type MeResponse,
  type ChangePasswordResponse,
  type SessionsListResponse,
  type RevokeSessionResponse,
} from '@hms/shared';
import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { configureSecurityAndSwagger } from '../../src/bootstrap-utils';
import { CLOCK, TestClock } from '../../src/common';
import { ENV_CONFIG, type EnvConfig } from '../../src/config';
import { InMemoryAuditRecorder } from '../../src/modules/audit';
import { Argon2LimiterService } from '../../src/modules/auth/argon2-limiter.service';
import { cleanTestDatabase } from '../utils/test-cleaner';

interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId: string;
  };
}

interface SuccessEnvelope<T> {
  data: T;
}

function getBody<T>(res: request.Response): SuccessEnvelope<T> {
  return res.body as SuccessEnvelope<T>;
}

function getErrorBody(res: request.Response): ErrorEnvelope {
  return res.body as ErrorEnvelope;
}

describe('Authentication Module & Security Guards (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaClient;
  let testClock: TestClock;
  let argon2Limiter: Argon2LimiterService;
  let auditRecorder: InMemoryAuditRecorder;
  let envConfig: EnvConfig;

  const validPassword = 'SecurePassword123!';
  const appOrigin = 'http://localhost:5173';

  function getCookie(res: request.Response): string {
    const headers = res.headers as Record<
      string,
      string | string[] | undefined
    >;
    const raw = headers['set-cookie'];
    const cookie = Array.isArray(raw) ? raw[0] : raw;
    if (typeof cookie !== 'string') {
      throw new Error('Expected set-cookie header on response');
    }
    return cookie;
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3006';
    process.env.AUTH_THROTTLE_LIMIT = '1000';
    process.env.THROTTLE_LIMIT = '1000';
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ??
      'postgresql://hms_app:dev_app_pass@localhost:5432/hms_test';
    process.env.DATABASE_MIGRATION_URL =
      process.env.DATABASE_MIGRATION_URL ??
      'postgresql://hms_owner:dev_owner_pass@localhost:5432/hms_test';

    testClock = new TestClock(new Date('2026-10-02T12:00:00.000Z'));

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CLOCK)
      .useValue(testClock)
      .compile();

    app = moduleFixture.createNestApplication();
    envConfig = app.get<EnvConfig>(ENV_CONFIG);
    configureSecurityAndSwagger(app, envConfig);
    app.setGlobalPrefix('api/v1');
    await app.init();

    server = app.getHttpServer() as Server;
    server.setMaxListeners(50);
    prisma = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL } },
    });
    argon2Limiter = app.get<Argon2LimiterService>(Argon2LimiterService);
    auditRecorder = app.get<InMemoryAuditRecorder>(InMemoryAuditRecorder);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    testClock.setTime(new Date('2026-10-02T12:00:00.000Z'));
    auditRecorder.clear();
    await cleanTestDatabase({ reSeed: true });
  });

  // Helper to create a user with a known password hash
  async function createTestUser(params: {
    username: string;
    password?: string;
    status?: 'active' | 'disabled';
    mustChangePassword?: boolean;
    roleCode?: string;
  }) {
    const password = params.password ?? validPassword;
    const passwordHash = await argon2Limiter.hash(password);
    const user = await prisma.user.create({
      data: {
        username: params.username.toLowerCase(),
        fullName: `User ${params.username}`,
        passwordHash,
        status: params.status ?? 'active',
        mustChangePassword: params.mustChangePassword ?? false,
      },
    });

    if (params.roleCode) {
      const role = await prisma.role.findUniqueOrThrow({
        where: { code: params.roleCode },
      });
      await prisma.userRole.create({
        data: {
          userId: user.id,
          roleId: role.id,
        },
      });
    }

    return { user, password };
  }

  describe('Login Flow & Cookie Security', () => {
    it('successfully logs in with valid credentials, sets secure browser-session cookie, and emits audit event', async () => {
      await createTestUser({
        username: 'testdoc',
        roleCode: 'doctor',
      });

      const res = await request(server)
        .post('/api/v1/auth/login')
        .set('Origin', appOrigin)
        .send({
          username: 'testdoc',
          password: validPassword,
        })
        .expect(200);

      const body = getBody<LoginResponse['data']>(res);
      expect(body.data).toBeDefined();
      expect(body.data.user).toMatchObject({
        username: 'testdoc',
        status: 'active',
        mustChangePassword: false,
        roles: ['doctor'],
      });
      expect(body.data.csrfToken).toBeDefined();
      expect(typeof body.data.csrfToken).toBe('string');
      expect(Array.isArray(body.data.permissions)).toBe(true);

      // Verify Set-Cookie header attributes
      const cookieHeader = getCookie(res);
      expect(cookieHeader).toContain('hms_session=');
      expect(cookieHeader).toContain('Path=/');
      expect(cookieHeader).toContain('HttpOnly');
      expect(cookieHeader).toContain('SameSite=Strict');
      // Browser-session cookie: must NOT contain Max-Age or Expires (ADR-027)
      expect(cookieHeader).not.toMatch(/Max-Age/i);
      expect(cookieHeader).not.toMatch(/Expires/i);

      // Verify audit event
      const events = auditRecorder.getEvents();
      const loginEvent = events.find((e) => e.action === 'auth.login_success');
      expect(loginEvent).toBeDefined();
      expect(loginEvent?.outcome).toBe('success');
      expect(loginEvent?.actorUsername).toBe('testdoc');
    });

    it('rejects incorrect password with generic 401 and sets no session cookie', async () => {
      await createTestUser({ username: 'testuser' });

      const res = await request(server)
        .post('/api/v1/auth/login')
        .set('Origin', appOrigin)
        .send({
          username: 'testuser',
          password: 'WrongPassword123!',
        })
        .expect(401);

      const body = getErrorBody(res);
      expect(body.error).toMatchObject({
        code: UNAUTHENTICATED,
        message: 'Invalid username or password',
      });
      const headers = res.headers as Record<string, string | undefined>;
      expect(headers['set-cookie']).toBeUndefined();

      // Audit event
      const events = auditRecorder.getEvents();
      const failedEvent = events.find((e) => e.action === 'auth.login_failed');
      expect(failedEvent).toBeDefined();
      expect(failedEvent?.outcome).toBe('failure');
      expect(failedEvent?.actorUsername).toBe('testuser');
    });

    it('rejects unknown user with identical generic 401 without recording attempted username', async () => {
      const res = await request(server)
        .post('/api/v1/auth/login')
        .set('Origin', appOrigin)
        .send({
          username: 'nonexistentuser',
          password: validPassword,
        })
        .expect(401);

      const body = getErrorBody(res);
      expect(body.error).toMatchObject({
        code: UNAUTHENTICATED,
        message: 'Invalid username or password',
      });
      const headers = res.headers as Record<string, string | undefined>;
      expect(headers['set-cookie']).toBeUndefined();

      // Condition 8: Never record attempted username if unknown
      const events = auditRecorder.getEvents();
      const failedEvent = events.find((e) => e.action === 'auth.login_failed');
      expect(failedEvent).toBeDefined();
      expect(failedEvent?.actorUsername).toBe('unknown');
    });

    it('rejects disabled/inactive user with identical generic 401', async () => {
      await createTestUser({
        username: 'disableduser',
        status: 'disabled',
      });

      const res = await request(server)
        .post('/api/v1/auth/login')
        .set('Origin', appOrigin)
        .send({
          username: 'disableduser',
          password: validPassword,
        })
        .expect(401);

      const body = getErrorBody(res);
      expect(body.error).toMatchObject({
        code: UNAUTHENTICATED,
        message: 'Invalid username or password',
      });
      const headers = res.headers as Record<string, string | undefined>;
      expect(headers['set-cookie']).toBeUndefined();
    });

    it('revokes previous session with session_replaced when logging in again with active cookie', async () => {
      await createTestUser({ username: 'multisession' });

      // First login
      const res1 = await request(server)
        .post('/api/v1/auth/login')
        .set('Origin', appOrigin)
        .send({ username: 'multisession', password: validPassword })
        .expect(200);

      const cookie1 = getCookie(res1);

      // Second login supplying the first session cookie
      const res2 = await request(server)
        .post('/api/v1/auth/login')
        .set('Origin', appOrigin)
        .set('Cookie', cookie1)
        .send({ username: 'multisession', password: validPassword })
        .expect(200);

      const cookie2 = getCookie(res2);
      expect(cookie1).not.toBe(cookie2);

      // Verify DB: first session revoked with 'session_replaced'
      const sessions = await prisma.session.findMany({
        orderBy: { createdAt: 'asc' },
      });
      expect(sessions.length).toBe(2);
      expect(sessions[0]?.revokedAt).not.toBeNull();
      expect(sessions[0]?.revokedReason).toBe('session_replaced');
      expect(sessions[1]?.revokedAt).toBeNull();
    });
  });

  describe('Logout Flow', () => {
    it('revokes session in database, clears cookie with matching attributes, and denies subsequent requests', async () => {
      await createTestUser({ username: 'logoutuser' });

      const loginRes = await request(server)
        .post('/api/v1/auth/login')
        .set('Origin', appOrigin)
        .send({ username: 'logoutuser', password: validPassword })
        .expect(200);

      const sessionCookie = getCookie(loginRes);
      const loginBody = getBody<LoginResponse['data']>(loginRes);
      const csrfToken = loginBody.data.csrfToken;

      // Logout request
      const logoutRes = await request(server)
        .post('/api/v1/auth/logout')
        .set('Origin', appOrigin)
        .set('Cookie', sessionCookie)
        .set('X-CSRF-Token', csrfToken)
        .expect(200);

      const logoutBody = getBody<{ success: true }>(logoutRes);
      expect(logoutBody.data).toEqual({ success: true });

      // Verify Set-Cookie clears the session
      const clearCookie = getCookie(logoutRes);
      expect(clearCookie).toContain('hms_session=;');
      expect(clearCookie).toContain('Path=/');
      expect(clearCookie).toContain('HttpOnly');
      expect(clearCookie).toContain('SameSite=Strict');
      expect(clearCookie).toMatch(/Expires=/i);

      // Subsequent request using cleared session is rejected
      const meRes = await request(server)
        .get('/api/v1/auth/me')
        .set('Cookie', sessionCookie)
        .expect(401);

      expect(getErrorBody(meRes).error.message).toBe(
        'Session has been revoked',
      );
    });
  });

  describe('OriginGuard & CSRF Defense', () => {
    it('OriginGuard executes BEFORE AuthGuard: invalid Origin without session returns 403', async () => {
      const res = await request(server)
        .post('/api/v1/auth/logout')
        .set('Origin', 'http://attacker.com')
        .expect(403);

      expect(getErrorBody(res).error.code).toBe(FORBIDDEN);
      expect(getErrorBody(res).error.message).toBe(
        'Invalid or missing origin header',
      );
    });

    it('AuthGuard executes AFTER OriginGuard: valid Origin without session returns 401', async () => {
      const res = await request(server)
        .post('/api/v1/auth/logout')
        .set('Origin', appOrigin)
        .expect(401);

      expect(getErrorBody(res).error.code).toBe(UNAUTHENTICATED);
      expect(getErrorBody(res).error.message).toBe('Authentication required');
    });

    it('allows Origin: null with matching Referer header', async () => {
      await createTestUser({ username: 'nulloriginuser' });

      const res = await request(server)
        .post('/api/v1/auth/login')
        .set('Origin', 'null')
        .set('Referer', `${appOrigin}/login`)
        .send({ username: 'nulloriginuser', password: validPassword })
        .expect(200);

      const body = getBody<LoginResponse['data']>(res);
      expect(body.data.user.username).toBe('nulloriginuser');
    });

    it('rejects Origin: null with mismatching Referer header', async () => {
      await createTestUser({ username: 'nulloriginuser2' });

      const res = await request(server)
        .post('/api/v1/auth/login')
        .set('Origin', 'null')
        .set('Referer', 'http://evil.com/login')
        .send({ username: 'nulloriginuser2', password: validPassword })
        .expect(403);

      expect(getErrorBody(res).error.code).toBe(FORBIDDEN);
    });

    it('rejects state-changing method with missing CSRF token with 403 (never 500)', async () => {
      await createTestUser({ username: 'csrfmissing' });
      const loginRes = await request(server)
        .post('/api/v1/auth/login')
        .set('Origin', appOrigin)
        .send({ username: 'csrfmissing', password: validPassword })
        .expect(200);

      const sessionCookie = getCookie(loginRes);
      const res = await request(server)
        .post('/api/v1/auth/logout')
        .set('Origin', appOrigin)
        .set('Cookie', sessionCookie);

      expect(res.status).toBe(403);
      expect(res.status).not.toBe(500);
      expect(getErrorBody(res).error.message).toBe('Invalid CSRF token');
    });

    it('rejects state-changing method with empty CSRF token with 403 (never 500)', async () => {
      await createTestUser({ username: 'csrfempty' });
      const loginRes = await request(server)
        .post('/api/v1/auth/login')
        .set('Origin', appOrigin)
        .send({ username: 'csrfempty', password: validPassword })
        .expect(200);

      const sessionCookie = getCookie(loginRes);
      const res = await request(server)
        .post('/api/v1/auth/logout')
        .set('Origin', appOrigin)
        .set('Cookie', sessionCookie)
        .set('X-CSRF-Token', '');

      expect(res.status).toBe(403);
      expect(res.status).not.toBe(500);
      expect(getErrorBody(res).error.message).toBe('Invalid CSRF token');
    });

    it('rejects state-changing method with short CSRF token with 403 (never 500)', async () => {
      await createTestUser({ username: 'csrfshort' });
      const loginRes = await request(server)
        .post('/api/v1/auth/login')
        .set('Origin', appOrigin)
        .send({ username: 'csrfshort', password: validPassword })
        .expect(200);

      const sessionCookie = getCookie(loginRes);
      const res = await request(server)
        .post('/api/v1/auth/logout')
        .set('Origin', appOrigin)
        .set('Cookie', sessionCookie)
        .set('X-CSRF-Token', 'short');

      expect(res.status).toBe(403);
      expect(res.status).not.toBe(500);
      expect(getErrorBody(res).error.message).toBe('Invalid CSRF token');
    });

    it('rejects state-changing method with long CSRF token with 403 (never 500)', async () => {
      await createTestUser({ username: 'csrflong' });
      const loginRes = await request(server)
        .post('/api/v1/auth/login')
        .set('Origin', appOrigin)
        .send({ username: 'csrflong', password: validPassword })
        .expect(200);

      const sessionCookie = getCookie(loginRes);
      const res = await request(server)
        .post('/api/v1/auth/logout')
        .set('Origin', appOrigin)
        .set('Cookie', sessionCookie)
        .set('X-CSRF-Token', 'a'.repeat(256));

      expect(res.status).toBe(403);
      expect(res.status).not.toBe(500);
      expect(getErrorBody(res).error.message).toBe('Invalid CSRF token');
    });

    it('rejects state-changing method with non-ASCII CSRF token with 403 (never 500)', async () => {
      await createTestUser({ username: 'csrfnonascii' });
      const loginRes = await request(server)
        .post('/api/v1/auth/login')
        .set('Origin', appOrigin)
        .send({ username: 'csrfnonascii', password: validPassword })
        .expect(200);

      const sessionCookie = getCookie(loginRes);
      const res = await request(server)
        .post('/api/v1/auth/logout')
        .set('Origin', appOrigin)
        .set('Cookie', sessionCookie)
        .set(
          'X-CSRF-Token',
          't\u00e9st_c\u00f1rf_t\u00f6ken_non_ascii_12345678901234',
        );

      expect(res.status).toBe(403);
      expect(res.status).not.toBe(500);
      expect(getErrorBody(res).error.message).toBe('Invalid CSRF token');
    });
  });

  describe('Account Lockout & Concurrency', () => {
    it('LOGIN_MAX_FAILURES raised above 10: 10 concurrent failures end at exactly 10', async () => {
      const { user } = await createTestUser({ username: 'concurrent10' });
      const originalMaxFailures = envConfig.LOGIN_MAX_FAILURES;
      envConfig.LOGIN_MAX_FAILURES = 15;

      try {
        const attempts = Array.from({ length: 10 }, () =>
          request(server)
            .post('/api/v1/auth/login')
            .set('Origin', appOrigin)
            .send({ username: 'concurrent10', password: 'WrongPassword!' }),
        );

        const results = await Promise.all(attempts);
        for (const res of results) {
          expect(res.status).toBe(401);
        }

        const dbUser = await prisma.user.findUniqueOrThrow({
          where: { id: user.id },
        });
        expect(dbUser.failedLoginCount).toBe(10);
        expect(dbUser.lockedUntil).toBeNull();
      } finally {
        envConfig.LOGIN_MAX_FAILURES = originalMaxFailures;
      }
    });

    it('default 5: 10 concurrent failures end at exactly 5 with locked_until set once and not extended', async () => {
      const { user } = await createTestUser({ username: 'concurrent5' });
      expect(envConfig.LOGIN_MAX_FAILURES).toBe(5);

      const attempts = Array.from({ length: 10 }, () =>
        request(server)
          .post('/api/v1/auth/login')
          .set('Origin', appOrigin)
          .send({ username: 'concurrent5', password: 'WrongPassword!' }),
      );

      const results = await Promise.all(attempts);
      for (const res of results) {
        expect(res.status).toBe(401);
      }

      const dbUser = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(dbUser.failedLoginCount).toBe(5);
      expect(dbUser.lockedUntil).not.toBeNull();
      const initialLockedUntil = dbUser.lockedUntil;
      if (!initialLockedUntil) {
        throw new Error('Expected lockedUntil to be set');
      }

      // 11th failed attempt while locked must not extend locked_until or increment count
      await request(server)
        .post('/api/v1/auth/login')
        .set('Origin', appOrigin)
        .send({ username: 'concurrent5', password: 'WrongPassword!' })
        .expect(401);

      const dbUserAfter = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(dbUserAfter.failedLoginCount).toBe(5);
      expect(dbUserAfter.lockedUntil?.getTime()).toBe(
        initialLockedUntil.getTime(),
      );
    });

    it('locks account after 5 consecutive failures, does not extend lock on subsequent failures, and rejects correct password while locked', async () => {
      const { user } = await createTestUser({ username: 'lockme' });

      // Run 5 failed attempts sequentially
      for (let i = 0; i < 5; i++) {
        await request(server)
          .post('/api/v1/auth/login')
          .set('Origin', appOrigin)
          .send({ username: 'lockme', password: 'WrongPassword!' })
          .expect(401);
      }

      // Check DB: account is now locked
      const dbUser = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(dbUser.failedLoginCount).toBe(5);
      expect(dbUser.lockedUntil).not.toBeNull();
      const initialLockedUntil = dbUser.lockedUntil;
      if (!initialLockedUntil) {
        throw new Error('Expected lockedUntil to be defined');
      }

      // 6th failed attempt while locked: locked_until must NOT be extended (Condition 2)
      await request(server)
        .post('/api/v1/auth/login')
        .set('Origin', appOrigin)
        .send({ username: 'lockme', password: 'WrongPassword!' })
        .expect(401);

      const dbUserAfter = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(dbUserAfter.lockedUntil?.getTime()).toBe(
        initialLockedUntil.getTime(),
      );

      // Correct password while locked: still returns generic 401 and sets no cookie
      const lockedRes = await request(server)
        .post('/api/v1/auth/login')
        .set('Origin', appOrigin)
        .send({ username: 'lockme', password: validPassword })
        .expect(401);

      expect(getErrorBody(lockedRes).error.message).toBe(
        'Invalid username or password',
      );
      const headers = lockedRes.headers as Record<
        string,
        string | string[] | undefined
      >;
      expect(headers['set-cookie']).toBeUndefined();
    });

    it('lockout on login does not revoke existing active sessions of the user', async () => {
      await createTestUser({ username: 'sessionpreserved' });

      // Log in to establish an active session
      const loginRes = await request(server)
        .post('/api/v1/auth/login')
        .set('Origin', appOrigin)
        .send({ username: 'sessionpreserved', password: validPassword })
        .expect(200);

      const sessionCookie = getCookie(loginRes);

      // Lock account via 5 failed login attempts
      for (let i = 0; i < 5; i++) {
        await request(server)
          .post('/api/v1/auth/login')
          .set('Origin', appOrigin)
          .send({ username: 'sessionpreserved', password: 'WrongPassword!' })
          .expect(401);
      }

      // The pre-existing session still functions
      const meRes = await request(server)
        .get('/api/v1/auth/me')
        .set('Cookie', sessionCookie)
        .expect(200);

      const body = getBody<MeResponse['data']>(meRes);
      expect(body.data.user.username).toBe('sessionpreserved');
    });
  });

  describe('Password Change Flow', () => {
    it('updates password hash, revokes other sessions, rotates current session and CSRF token, and increments version', async () => {
      const { user } = await createTestUser({ username: 'changepass' });

      // Login session 1 (other session)
      const res1 = await request(server)
        .post('/api/v1/auth/login')
        .set('Origin', appOrigin)
        .send({ username: 'changepass', password: validPassword })
        .expect(200);
      const cookie1 = getCookie(res1);

      // Login session 2 (current session to perform change)
      const res2 = await request(server)
        .post('/api/v1/auth/login')
        .set('Origin', appOrigin)
        .send({ username: 'changepass', password: validPassword })
        .expect(200);
      const cookie2 = getCookie(res2);
      const login2Body = getBody<LoginResponse['data']>(res2);
      const csrf2 = login2Body.data.csrfToken;

      const newPassword = 'BrandNewPassword999!';

      // Change password
      const changeRes = await request(server)
        .post('/api/v1/auth/change-password')
        .set('Origin', appOrigin)
        .set('Cookie', cookie2)
        .set('X-CSRF-Token', csrf2)
        .send({
          currentPassword: validPassword,
          newPassword,
        })
        .expect(200);

      const changeBody = getBody<ChangePasswordResponse['data']>(changeRes);
      expect(changeBody.data.csrfToken).toBeDefined();
      expect(changeBody.data.csrfToken).not.toBe(csrf2);
      const rotatedCookie = getCookie(changeRes);

      // Check DB updates
      const updatedUser = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(updatedUser.version).toBe(2); // Bumped version from 1 to 2 (ADR-023)
      expect(updatedUser.mustChangePassword).toBe(false);
      expect(updatedUser.passwordChangedAt).not.toBeNull();

      // Session 1 is revoked with 'password_changed'
      const session1 = await prisma.session.findFirst({
        where: { userId: user.id, revokedReason: 'password_changed' },
      });
      expect(session1).toBeDefined();

      // Old cookie 1 now rejected
      await request(server)
        .get('/api/v1/auth/me')
        .set('Cookie', cookie1)
        .expect(401);

      // Rotated cookie succeeds with new CSRF token
      const meRes = await request(server)
        .get('/api/v1/auth/me')
        .set('Cookie', rotatedCookie)
        .expect(200);
      const meBody = getBody<MeResponse['data']>(meRes);
      expect(meBody.data.user.username).toBe('changepass');
    });

    it('incorrect currentPassword counts toward lockout and revokes current session when lockout triggers', async () => {
      await createTestUser({ username: 'wrongcurrent' });

      const loginRes = await request(server)
        .post('/api/v1/auth/login')
        .set('Origin', appOrigin)
        .send({ username: 'wrongcurrent', password: validPassword })
        .expect(200);

      const sessionCookie = getCookie(loginRes);
      const loginBody = getBody<LoginResponse['data']>(loginRes);
      const csrfToken = loginBody.data.csrfToken;

      // First 4 attempts return 400 INVALID_CURRENT_PASSWORD
      for (let i = 0; i < 4; i++) {
        const res = await request(server)
          .post('/api/v1/auth/change-password')
          .set('Origin', appOrigin)
          .set('Cookie', sessionCookie)
          .set('X-CSRF-Token', csrfToken)
          .send({
            currentPassword: 'WrongPassword!',
            newPassword: 'BrandNewPassword999!',
          })
          .expect(400);

        expect(getErrorBody(res).error.code).toBe(INVALID_CURRENT_PASSWORD);
      }

      // 5th attempt triggers lockout and revokes current session
      const lockRes = await request(server)
        .post('/api/v1/auth/change-password')
        .set('Origin', appOrigin)
        .set('Cookie', sessionCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({
          currentPassword: 'WrongPassword!',
          newPassword: 'BrandNewPassword999!',
        })
        .expect(400);

      expect(getErrorBody(lockRes).error.code).toBe(INVALID_CURRENT_PASSWORD);

      // Cookie is cleared
      const clearCookie = getCookie(lockRes);
      expect(clearCookie).toContain('hms_session=;');

      // Current session in DB is revoked with 'account_locked'
      const revokedSession = await prisma.session.findFirst({
        where: { revokedReason: 'account_locked' },
      });
      expect(revokedSession).toBeDefined();

      // Next request with that session cookie is rejected
      await request(server)
        .get('/api/v1/auth/me')
        .set('Cookie', sessionCookie)
        .expect(401);
    });
  });

  describe('Forced Password Change Gate (must_change_password)', () => {
    it('allows /auth/me, /auth/change-password, and /auth/logout but blocks other routes with 403 PASSWORD_CHANGE_REQUIRED', async () => {
      await createTestUser({
        username: 'forceduser',
        mustChangePassword: true,
      });

      const loginRes = await request(server)
        .post('/api/v1/auth/login')
        .set('Origin', appOrigin)
        .send({ username: 'forceduser', password: validPassword })
        .expect(200);

      const sessionCookie = getCookie(loginRes);
      const loginBody = getBody<LoginResponse['data']>(loginRes);
      const csrfToken = loginBody.data.csrfToken;

      expect(loginBody.data.user.mustChangePassword).toBe(true);

      // 1. /auth/me is allowed
      const meRes = await request(server)
        .get('/api/v1/auth/me')
        .set('Cookie', sessionCookie);
      expect(meRes.status).toBe(200);
      const meBody = getBody<MeResponse['data']>(meRes);
      expect(meBody.data.mustChangePassword).toBe(true);

      // 2. Other authenticated endpoints (e.g. /auth/sessions) are blocked
      const blockedRes = await request(server)
        .get('/api/v1/auth/sessions')
        .set('Cookie', sessionCookie)
        .expect(403);

      expect(getErrorBody(blockedRes).error.code).toBe(
        PASSWORD_CHANGE_REQUIRED,
      );

      // 3. /auth/change-password is allowed and clears the flag
      const changeRes = await request(server)
        .post('/api/v1/auth/change-password')
        .set('Origin', appOrigin)
        .set('Cookie', sessionCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({
          currentPassword: validPassword,
          newPassword: 'BrandNewPassword999!',
        })
        .expect(200);

      const rotatedCookie = getCookie(changeRes);

      // After change, /auth/sessions is now allowed
      const sessionsRes = await request(server)
        .get('/api/v1/auth/sessions')
        .set('Cookie', rotatedCookie)
        .expect(200);
      const sessionsBody = getBody<SessionsListResponse['data']>(sessionsRes);
      expect(Array.isArray(sessionsBody.data)).toBe(true);
    });
  });

  describe('Session Management & IDOR Protection', () => {
    it('lists own active sessions without token hashes or csrf tokens', async () => {
      await createTestUser({ username: 'sessionlister' });

      const loginRes = await request(server)
        .post('/api/v1/auth/login')
        .set('Origin', appOrigin)
        .send({ username: 'sessionlister', password: validPassword })
        .expect(200);

      const sessionCookie = getCookie(loginRes);

      const res = await request(server)
        .get('/api/v1/auth/sessions')
        .set('Cookie', sessionCookie)
        .expect(200);

      const sessionsBody = getBody<SessionsListResponse['data']>(res);
      const list = sessionsBody.data;
      expect(list.length).toBe(1);
      const firstItem = list[0];
      if (!firstItem) {
        throw new Error('Expected at least one session');
      }
      expect(firstItem.id).toBeDefined();
      expect(firstItem.isCurrent).toBe(true);
      const rawFirstItem = firstItem as Record<string, unknown>;
      expect(rawFirstItem.tokenHash).toBeUndefined();
      expect(rawFirstItem.csrfToken).toBeUndefined();
    });

    it('revokes own session, clearing cookie if current session', async () => {
      await createTestUser({ username: 'selfrevoker' });

      const loginRes = await request(server)
        .post('/api/v1/auth/login')
        .set('Origin', appOrigin)
        .send({ username: 'selfrevoker', password: validPassword })
        .expect(200);

      const sessionCookie = getCookie(loginRes);
      const loginBody = getBody<LoginResponse['data']>(loginRes);
      const csrfToken = loginBody.data.csrfToken;

      const sessionsRes = await request(server)
        .get('/api/v1/auth/sessions')
        .set('Cookie', sessionCookie)
        .expect(200);

      const sessionsBody = getBody<SessionsListResponse['data']>(sessionsRes);
      const sessionsList = sessionsBody.data;
      const firstSession = sessionsList[0];
      if (!firstSession) {
        throw new Error('Expected at least one session');
      }
      const sessionId = firstSession.id;

      const deleteRes = await request(server)
        .delete(`/api/v1/auth/sessions/${sessionId}`)
        .set('Origin', appOrigin)
        .set('Cookie', sessionCookie)
        .set('X-CSRF-Token', csrfToken)
        .expect(200);

      const deleteBody = getBody<RevokeSessionResponse['data']>(deleteRes);
      expect(deleteBody.data).toEqual({ success: true });
      expect(getCookie(deleteRes)).toContain('hms_session=;');
    });

    it('IDOR: user A attempting to revoke user B session returns 404', async () => {
      await createTestUser({ username: 'usera' });
      await createTestUser({ username: 'userb' });

      // User A login
      const resA = await request(server)
        .post('/api/v1/auth/login')
        .set('Origin', appOrigin)
        .send({ username: 'usera', password: validPassword })
        .expect(200);
      const cookieA = getCookie(resA);
      const loginABody = getBody<LoginResponse['data']>(resA);
      const csrfA = loginABody.data.csrfToken;

      // User B login
      const resB = await request(server)
        .post('/api/v1/auth/login')
        .set('Origin', appOrigin)
        .send({ username: 'userb', password: validPassword })
        .expect(200);
      const cookieB = getCookie(resB);

      const sessionsBRes = await request(server)
        .get('/api/v1/auth/sessions')
        .set('Cookie', cookieB)
        .expect(200);
      const sessionsBBody = getBody<SessionsListResponse['data']>(sessionsBRes);
      const sessionsBList = sessionsBBody.data;
      const firstSessionB = sessionsBList[0];
      if (!firstSessionB) {
        throw new Error('Expected at least one session for user B');
      }
      const sessionBId = firstSessionB.id;

      // User A attempts to delete User B session
      const idorRes = await request(server)
        .delete(`/api/v1/auth/sessions/${sessionBId}`)
        .set('Origin', appOrigin)
        .set('Cookie', cookieA)
        .set('X-CSRF-Token', csrfA)
        .expect(404);

      expect(getErrorBody(idorRes).error.code).toBe(NOT_FOUND);
    });
  });

  describe('Mid-Session Invalidation & Authorization', () => {
    it('deactivating user mid-session immediately denies subsequent requests', async () => {
      const { user } = await createTestUser({ username: 'deactivateme' });

      const loginRes = await request(server)
        .post('/api/v1/auth/login')
        .set('Origin', appOrigin)
        .send({ username: 'deactivateme', password: validPassword })
        .expect(200);
      const sessionCookie = getCookie(loginRes);

      // Deactivate user in DB
      await prisma.user.update({
        where: { id: user.id },
        data: { status: 'disabled' },
      });

      const meRes = await request(server)
        .get('/api/v1/auth/me')
        .set('Cookie', sessionCookie)
        .expect(401);

      expect(getErrorBody(meRes).error.message).toBe('Account is disabled');
    });

    it('updating user role in DB immediately takes effect on next request', async () => {
      const { user } = await createTestUser({ username: 'promoteme' });

      const loginRes = await request(server)
        .post('/api/v1/auth/login')
        .set('Origin', appOrigin)
        .send({ username: 'promoteme', password: validPassword })
        .expect(200);
      const sessionCookie = getCookie(loginRes);

      const loginBody = getBody<LoginResponse['data']>(loginRes);
      expect(loginBody.data.user.roles).toEqual([]);

      // Assign admin role in DB
      const adminRole = await prisma.role.findUniqueOrThrow({
        where: { code: 'admin' },
      });
      await prisma.userRole.create({
        data: { userId: user.id, roleId: adminRole.id },
      });

      const meRes = await request(server)
        .get('/api/v1/auth/me')
        .set('Cookie', sessionCookie)
        .expect(200);

      const meBody = getBody<MeResponse['data']>(meRes);
      expect(meBody.data.user.roles).toContain('admin');
      expect(meBody.data.permissions).toContain('users.read');
    });
  });

  describe('Session Timeouts via TestClock', () => {
    it('enforces 15-minute idle timeout', async () => {
      await createTestUser({ username: 'idleuser' });

      const loginRes = await request(server)
        .post('/api/v1/auth/login')
        .set('Origin', appOrigin)
        .send({ username: 'idleuser', password: validPassword })
        .expect(200);
      const sessionCookie = getCookie(loginRes);

      // Advance clock by 14 minutes -> still active
      testClock.advance(14 * 60 * 1000);
      await request(server)
        .get('/api/v1/auth/me')
        .set('Cookie', sessionCookie)
        .expect(200);

      // Advance clock by another 16 minutes without activity -> idle expired
      testClock.advance(16 * 60 * 1000);
      const expiredRes = await request(server)
        .get('/api/v1/auth/me')
        .set('Cookie', sessionCookie)
        .expect(401);

      expect(getErrorBody(expiredRes).error.message).toBe(
        'Session expired due to inactivity',
      );
    });

    it('enforces 12-hour absolute timeout even if continuously active', async () => {
      await createTestUser({ username: 'absoluteuser' });

      const loginRes = await request(server)
        .post('/api/v1/auth/login')
        .set('Origin', appOrigin)
        .send({ username: 'absoluteuser', password: validPassword })
        .expect(200);
      const sessionCookie = getCookie(loginRes);

      // Advance clock past 12 hours (12 hours + 1 second)
      testClock.advance(12 * 3600 * 1000 + 1000);

      const expiredRes = await request(server)
        .get('/api/v1/auth/me')
        .set('Cookie', sessionCookie)
        .expect(401);

      expect(getErrorBody(expiredRes).error.message).toBe('Session expired');
    });
  });

  describe('Ambiguous Cookies Protection', () => {
    it('rejects requests with multiple hms_session cookies with 401 Ambiguous session credentials', async () => {
      const res = await request(server)
        .get('/api/v1/auth/me')
        .set('Cookie', 'hms_session=tokenA; other=val; hms_session=tokenB')
        .expect(401);

      expect(getErrorBody(res).error.message).toBe(
        'Ambiguous session credentials',
      );
    });
  });

  describe('Proxy Trust & Header Truncation', () => {
    it('TRUST_PROXY=0 ignores X-Forwarded-For and TRUST_PROXY=1 uses it (through shared bootstrap helper)', async () => {
      const { user: user0 } = await createTestUser({ username: 'trustproxy0' });
      const { user: user1 } = await createTestUser({ username: 'trustproxy1' });

      // When TRUST_PROXY=0 (disabled)
      configureSecurityAndSwagger(app, { ...envConfig, TRUST_PROXY: 0 });
      await request(server)
        .post('/api/v1/auth/login')
        .set('Origin', appOrigin)
        .set('X-Forwarded-For', '203.0.113.195')
        .send({ username: 'trustproxy0', password: validPassword })
        .expect(200);

      const dbSession0 = await prisma.session.findFirstOrThrow({
        where: { userId: user0.id },
      });
      // Should ignore X-Forwarded-For (ip will be local socket address, not 203.0.113.195)
      expect(dbSession0.ip).not.toBe('203.0.113.195');

      // When TRUST_PROXY=1 (enabled for 1 hop)
      configureSecurityAndSwagger(app, { ...envConfig, TRUST_PROXY: 1 });
      await request(server)
        .post('/api/v1/auth/login')
        .set('Origin', appOrigin)
        .set('X-Forwarded-For', '203.0.113.195')
        .send({ username: 'trustproxy1', password: validPassword })
        .expect(200);

      const dbSession1 = await prisma.session.findFirstOrThrow({
        where: { userId: user1.id },
      });
      // Should trust and use X-Forwarded-For
      expect(dbSession1.ip).toBe('203.0.113.195');

      // Reset back to original envConfig
      configureSecurityAndSwagger(app, envConfig);
    });

    it('truncates ip to 45 chars and user_agent to 255 chars without DB overflow', async () => {
      const { user } = await createTestUser({ username: 'truncatetest' });
      configureSecurityAndSwagger(app, { ...envConfig, TRUST_PROXY: 1 });

      const longIp =
        '2001:0db8:85a3:0000:0000:8a2e:0370:7334:extra_long_ipv6_padding_data_exceeding_45_characters';
      const longUserAgent = 'HMS-Test-Client/'.concat('A'.repeat(300));

      await request(server)
        .post('/api/v1/auth/login')
        .set('Origin', appOrigin)
        .set('X-Forwarded-For', longIp)
        .set('User-Agent', longUserAgent)
        .send({ username: 'truncatetest', password: validPassword })
        .expect(200);

      const session = await prisma.session.findFirstOrThrow({
        where: { userId: user.id },
      });

      expect(session.ip).not.toBeNull();
      expect(session.ip?.length).toBe(45);
      expect(session.ip).toBe(longIp.slice(0, 45));

      expect(session.userAgent).not.toBeNull();
      expect(session.userAgent?.length).toBe(255);
      expect(session.userAgent).toBe(longUserAgent.slice(0, 255));

      // Audit event should also have truncated values
      const events = auditRecorder.getEvents();
      const loginEvent = events.find(
        (e) => e.action === 'auth.login_success' && e.actorUserId === user.id,
      );
      expect(loginEvent).toBeDefined();
      expect(loginEvent?.ip?.length).toBe(45);
      expect(loginEvent?.userAgent?.length).toBe(255);

      configureSecurityAndSwagger(app, envConfig);
    });
  });

  describe('Cache-Control on /auth responses', () => {
    it('sets Cache-Control: no-store and Pragma: no-cache on all /auth responses', async () => {
      await createTestUser({ username: 'nocacheuser' });

      // 1. POST /api/v1/auth/login
      const loginRes = await request(server)
        .post('/api/v1/auth/login')
        .set('Origin', appOrigin)
        .send({ username: 'nocacheuser', password: validPassword })
        .expect(200);

      expect(loginRes.headers['cache-control']).toBe(
        'no-store, no-cache, must-revalidate, proxy-revalidate',
      );
      expect(loginRes.headers.pragma).toBe('no-cache');

      const sessionCookie = getCookie(loginRes);
      const loginBody = getBody<LoginResponse['data']>(loginRes);
      const csrfToken = loginBody.data.csrfToken;

      // 2. GET /api/v1/auth/me
      const meRes = await request(server)
        .get('/api/v1/auth/me')
        .set('Cookie', sessionCookie)
        .expect(200);

      expect(meRes.headers['cache-control']).toBe(
        'no-store, no-cache, must-revalidate, proxy-revalidate',
      );
      expect(meRes.headers.pragma).toBe('no-cache');

      // 3. GET /api/v1/auth/sessions
      const sessionsRes = await request(server)
        .get('/api/v1/auth/sessions')
        .set('Cookie', sessionCookie)
        .expect(200);

      expect(sessionsRes.headers['cache-control']).toBe(
        'no-store, no-cache, must-revalidate, proxy-revalidate',
      );
      expect(sessionsRes.headers.pragma).toBe('no-cache');

      // 4. POST /api/v1/auth/logout
      const logoutRes = await request(server)
        .post('/api/v1/auth/logout')
        .set('Origin', appOrigin)
        .set('Cookie', sessionCookie)
        .set('X-CSRF-Token', csrfToken)
        .expect(200);

      expect(logoutRes.headers['cache-control']).toBe(
        'no-store, no-cache, must-revalidate, proxy-revalidate',
      );
      expect(logoutRes.headers.pragma).toBe('no-cache');
    });
  });
});
