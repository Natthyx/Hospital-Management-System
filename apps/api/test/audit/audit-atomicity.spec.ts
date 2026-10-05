import type { Server } from 'node:http';

import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { configureSecurityAndSwagger } from '../../src/bootstrap-utils';
import { CLOCK, TestClock } from '../../src/common';
import { ENV_CONFIG, type EnvConfig } from '../../src/config';
import { Argon2LimiterService } from '../../src/modules/auth/argon2-limiter.service';
import { cleanTestDatabase } from '../utils/test-cleaner';

describe('Audit Atomicity & Transactional Rollback (Correction H)', () => {
  let app: INestApplication;
  let server: Server;
  let appPrisma: PrismaClient;
  let ownerPrisma: PrismaClient;
  let testClock: TestClock;
  let argon2Limiter: Argon2LimiterService;
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

  async function failAuditOnAction(action: string): Promise<void> {
    await ownerPrisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION test_fail_audit_trigger() RETURNS trigger AS $$
      BEGIN
        IF NEW.action = '${action}' THEN
          RAISE EXCEPTION 'Simulated audit write failure for atomicity test' USING ERRCODE = '55000';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await ownerPrisma.$executeRawUnsafe(`
      DROP TRIGGER IF EXISTS test_audit_fail_trigger ON audit_log;
    `);

    await ownerPrisma.$executeRawUnsafe(`
      CREATE TRIGGER test_audit_fail_trigger
      BEFORE INSERT ON audit_log
      FOR EACH ROW
      EXECUTE FUNCTION test_fail_audit_trigger();
    `);
  }

  async function resetAuditFailTrigger(): Promise<void> {
    await ownerPrisma.$executeRawUnsafe(`
      DROP TRIGGER IF EXISTS test_audit_fail_trigger ON audit_log;
    `);
    await ownerPrisma.$executeRawUnsafe(`
      DROP FUNCTION IF EXISTS test_fail_audit_trigger();
    `);
  }

  async function createTestUser(params: {
    username: string;
    password?: string;
    status?: 'active' | 'disabled';
  }): Promise<{ id: string; username: string }> {
    const pwd = params.password ?? validPassword;
    const hash = await argon2Limiter.hash(pwd);
    const user = await appPrisma.user.create({
      data: {
        username: params.username,
        fullName: `User ${params.username}`,
        passwordHash: hash,
        status: params.status ?? 'active',
        mustChangePassword: false,
      },
    });

    const doctorRole = await appPrisma.role.findUniqueOrThrow({
      where: { code: 'doctor' },
    });
    await appPrisma.userRole.create({
      data: {
        userId: user.id,
        roleId: doctorRole.id,
      },
    });

    return { id: user.id, username: user.username };
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3007';
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
    appPrisma = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL } },
    });
    ownerPrisma = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_MIGRATION_URL } },
    });
    argon2Limiter = app.get<Argon2LimiterService>(Argon2LimiterService);

    await resetAuditFailTrigger();
  });

  afterAll(async () => {
    await resetAuditFailTrigger();
    await appPrisma.$disconnect();
    await ownerPrisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    testClock.setTime(new Date('2026-10-02T12:00:00.000Z'));
    await resetAuditFailTrigger();
    await cleanTestDatabase({ reSeed: true });
  });

  afterEach(async () => {
    await resetAuditFailTrigger();
  });

  describe('Business Rollback on Audit Insert Failure (Atomicity)', () => {
    it('rolls back failed_login_count update when audit write for auth.login_failed fails', async () => {
      const user = await createTestUser({ username: 'loginfailuser' });

      // Trigger fails only for auth.login_failed
      await failAuditOnAction('auth.login_failed');

      // Attempt login with incorrect password
      const res = await request(server)
        .post('/api/v1/auth/login')
        .set('Origin', appOrigin)
        .send({
          username: user.username,
          password: 'WrongPassword999!',
        });

      // Business operation MUST fail when audit fails
      expect(res.status).toBe(500);

      // Verify in database: failed_login_count must be rolled back to 0
      const dbUser = await appPrisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(dbUser.failedLoginCount).toBe(0);
      expect(dbUser.lockedUntil).toBeNull();

      // Verify no audit row was committed
      const auditRows = await appPrisma.auditLog.findMany({
        where: { action: 'auth.login_failed' },
      });
      expect(auditRows.length).toBe(0);

      // After dropping trigger, valid login works normally
      await resetAuditFailTrigger();
      const validRes = await request(server)
        .post('/api/v1/auth/login')
        .set('Origin', appOrigin)
        .send({
          username: user.username,
          password: validPassword,
        });
      expect(validRes.status).toBe(200);
    });

    it('rolls back password update and version increment when audit write for auth.password_changed fails', async () => {
      const user = await createTestUser({ username: 'pwdchangeuser' });

      // Login to get valid session and CSRF token
      const loginRes = await request(server)
        .post('/api/v1/auth/login')
        .set('Origin', appOrigin)
        .send({
          username: user.username,
          password: validPassword,
        })
        .expect(200);

      const cookie = getCookie(loginRes);
      const csrfToken = (loginRes.body as { data: { csrfToken: string } }).data
        .csrfToken;

      const userBefore = await appPrisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      const initialHash = userBefore.passwordHash;
      const initialVersion = userBefore.version;

      // Fail audit only on auth.password_changed
      await failAuditOnAction('auth.password_changed');

      const newPassword = 'NewBrandSecurePassword999!';
      const changeRes = await request(server)
        .post('/api/v1/auth/change-password')
        .set('Origin', appOrigin)
        .set('Cookie', cookie)
        .set('x-csrf-token', csrfToken)
        .send({
          currentPassword: validPassword,
          newPassword,
        });

      expect(changeRes.status).toBe(500);

      // Verify database rollback: passwordHash and version are untouched
      const userAfter = await appPrisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(userAfter.passwordHash).toBe(initialHash);
      expect(userAfter.version).toBe(initialVersion);

      // Verify no audit row committed
      const auditRows = await appPrisma.auditLog.findMany({
        where: { action: 'auth.password_changed' },
      });
      expect(auditRows.length).toBe(0);

      // Reset trigger: verify user can STILL authenticate with original password, NOT the new one
      await resetAuditFailTrigger();

      const oldPwdAuth = await request(server)
        .post('/api/v1/auth/login')
        .set('Origin', appOrigin)
        .send({
          username: user.username,
          password: validPassword,
        });
      expect(oldPwdAuth.status).toBe(200);

      const newPwdAuth = await request(server)
        .post('/api/v1/auth/login')
        .set('Origin', appOrigin)
        .send({
          username: user.username,
          password: newPassword,
        });
      expect(newPwdAuth.status).toBe(401);
    });

    it('rolls back session revocation when audit write for auth.logout fails', async () => {
      const user = await createTestUser({ username: 'logoutuser' });

      const loginRes = await request(server)
        .post('/api/v1/auth/login')
        .set('Origin', appOrigin)
        .send({
          username: user.username,
          password: validPassword,
        })
        .expect(200);

      const cookie = getCookie(loginRes);
      const csrfToken = (loginRes.body as { data: { csrfToken: string } }).data
        .csrfToken;

      const sessionBefore = await appPrisma.session.findFirstOrThrow({
        where: { userId: user.id },
      });
      expect(sessionBefore.revokedAt).toBeNull();

      // Trigger fails only for auth.logout
      await failAuditOnAction('auth.logout');

      const logoutRes = await request(server)
        .post('/api/v1/auth/logout')
        .set('Origin', appOrigin)
        .set('Cookie', cookie)
        .set('x-csrf-token', csrfToken);

      expect(logoutRes.status).toBe(500);

      // Verify in database: session was NOT revoked
      const sessionAfter = await appPrisma.session.findUniqueOrThrow({
        where: { id: sessionBefore.id },
      });
      expect(sessionAfter.revokedAt).toBeNull();
      expect(sessionAfter.revokedReason).toBeNull();

      // Verify no audit row committed
      const auditRows = await appPrisma.auditLog.findMany({
        where: { action: 'auth.logout' },
      });
      expect(auditRows.length).toBe(0);

      // Reset trigger: the session is STILL valid and can access /auth/me
      await resetAuditFailTrigger();
      const meRes = await request(server)
        .get('/api/v1/auth/me')
        .set('Origin', appOrigin)
        .set('Cookie', cookie);
      expect(meRes.status).toBe(200);
    });

    it('rolls back session revocation when audit write for auth.session_revoked fails', async () => {
      const user = await createTestUser({ username: 'revokesessionuser' });

      // Login 1
      const login1Res = await request(server)
        .post('/api/v1/auth/login')
        .set('Origin', appOrigin)
        .send({
          username: user.username,
          password: validPassword,
        })
        .expect(200);
      const cookie1 = getCookie(login1Res);
      const csrfToken1 = (login1Res.body as { data: { csrfToken: string } })
        .data.csrfToken;

      // Login 2 (creates a second session)
      await request(server)
        .post('/api/v1/auth/login')
        .set('Origin', appOrigin)
        .send({
          username: user.username,
          password: validPassword,
        })
        .expect(200);

      // Find the second session
      const sessions = await appPrisma.session.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
      });
      expect(sessions.length).toBeGreaterThanOrEqual(2);
      const targetSession = sessions[0]; // most recent
      expect(targetSession).toBeDefined();
      if (!targetSession) {
        throw new Error('Target session is missing');
      }

      // Trigger fails only for auth.session_revoked
      await failAuditOnAction('auth.session_revoked');

      const revokeRes = await request(server)
        .delete(`/api/v1/auth/sessions/${targetSession.id}`)
        .set('Origin', appOrigin)
        .set('Cookie', cookie1)
        .set('x-csrf-token', csrfToken1);

      expect(revokeRes.status).toBe(500);

      // Verify in database: target session is STILL active
      const targetAfter = await appPrisma.session.findUniqueOrThrow({
        where: { id: targetSession.id },
      });
      expect(targetAfter.revokedAt).toBeNull();
      expect(targetAfter.revokedReason).toBeNull();

      // Verify no audit row committed
      const auditRows = await appPrisma.auditLog.findMany({
        where: { action: 'auth.session_revoked' },
      });
      expect(auditRows.length).toBe(0);
    });
  });
});
