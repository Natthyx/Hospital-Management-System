import { Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { cleanTestDatabase } from '../../../test/utils/test-cleaner';
import { RequestContextService } from '../../common/context/request-context.service';
import { SystemClock } from '../../common/time/clock';
import { type PrismaService } from '../../database/prisma.service';

import { AuditWriteError } from './audit-errors';
import { AuditService } from './audit.service';

describe('AuditService (Stage 2 Core)', () => {
  let prisma: PrismaService;
  let rawPrisma: PrismaClient;
  let clock: SystemClock;
  let requestContextService: RequestContextService;
  let auditService: AuditService;

  beforeAll(async () => {
    await cleanTestDatabase();
    rawPrisma = new PrismaClient({
      datasources: {
        db: {
          url:
            process.env.DATABASE_URL ??
            'postgresql://hms_app:dev_app_pass@localhost:5432/hms_test',
        },
      },
    });
  });

  afterAll(async () => {
    await rawPrisma.$disconnect();
  });

  beforeEach(() => {
    prisma = rawPrisma as unknown as PrismaService;
    clock = new SystemClock();
    requestContextService = new RequestContextService();
    auditService = new AuditService(prisma, clock, requestContextService);

    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Action Catalog Validation (Correction P)', () => {
    it('accepts valid canonical audit action', async () => {
      const entry = await auditService.record({
        action: 'auth.login_success',
        outcome: 'success',
        actorUsername: 'admin',
        metadata: { source: 'test' },
      });

      expect(entry.id).toBeDefined();
      expect(entry.action).toBe('auth.login_success');
      expect(entry.outcome).toBe('success');
      expect(entry.actorUsername).toBe('admin');
    });

    it('rejects action outside canonical AUDIT_ACTIONS at runtime', async () => {
      await expect(
        auditService.record({
          action: 'unregistered.custom_action',
          outcome: 'success',
          actorUsername: 'admin',
        }),
      ).rejects.toThrow(
        /Invalid audit action: "unregistered.custom_action" is not recognized in canonical AUDIT_ACTIONS catalog/,
      );
    });
  });

  describe('AsyncLocalStorage Request Context Correlation (Correction F)', () => {
    it('automatically uses context from ALS store when event parameters are omitted', async () => {
      const adminUser = await rawPrisma.user.findUnique({
        where: { username: 'admin' },
      });

      const store = {
        requestId: 'trace-req-als-123',
        ip: '192.168.1.100',
        userAgent: 'Mozilla/5.0 TestBrowser',
        actorUserId: adminUser?.id ?? null,
        actorUsername: 'admin',
        sessionId: '00000000-0000-0000-0000-000000000002',
        patientId: null,
      };

      await requestContextService.runWithContext(store, async () => {
        const entry = await auditService.record({
          action: 'auth.login_success',
          outcome: 'success',
        });

        expect(entry.requestId).toBe('trace-req-als-123');
        expect(entry.ip).toBe('192.168.1.100');
        expect(entry.userAgent).toBe('Mozilla/5.0 TestBrowser');
        expect(entry.actorUserId).toBe(adminUser?.id);
        expect(entry.actorUsername).toBe('admin');
        expect(entry.sessionId).toBe('00000000-0000-0000-0000-000000000002');
      });
    });

    it('explicit parameters in event take precedence over ALS store (Correction F)', async () => {
      const store = {
        requestId: 'store-req-id',
        ip: '10.0.0.1',
        userAgent: 'StoreAgent',
        actorUserId: null,
        actorUsername: 'store_user',
        sessionId: '00000000-0000-0000-0000-000000000002',
        patientId: null,
      };

      await requestContextService.runWithContext(store, async () => {
        const entry = await auditService.record({
          action: 'auth.login_failed',
          outcome: 'failure',
          requestId: 'explicit-req-id',
          ip: '172.16.0.1',
          userAgent: 'ExplicitAgent',
          actorUsername: 'system:unknown',
          actorUserId: null,
          sessionId: null,
        });

        expect(entry.requestId).toBe('explicit-req-id');
        expect(entry.ip).toBe('172.16.0.1');
        expect(entry.userAgent).toBe('ExplicitAgent');
        expect(entry.actorUsername).toBe('system:unknown');
        expect(entry.actorUserId).toBeNull();
        expect(entry.sessionId).toBeNull();
      });
    });

    it('defaults actorUsername to system:unknown when neither event nor ALS provide one', async () => {
      const entry = await auditService.record({
        action: 'auth.login_failed',
        outcome: 'failure',
      });

      expect(entry.actorUsername).toBe('system:unknown');
    });
  });

  describe('Payload Redaction Integration (Correction G)', () => {
    it('redacts sensitive keys and secret values before writing to database', async () => {
      const sensitiveToken = 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v';
      const argonHash =
        '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$abcdefghijklmnopqrstuvwxyz0123456789+/=';

      const entry = await auditService.record({
        action: 'auth.login_success',
        outcome: 'success',
        actorUsername: 'admin',
        metadata: {
          password: 'plainPassword123',
          cookie: 'session_cookie_secret',
          opaqueValue: sensitiveToken,
          digestData: argonHash,
          safeField: 'visible_data',
        },
      });

      const meta = entry.metadata as Record<string, unknown>;
      expect(meta.password).toBe('[REDACTED]');
      expect(meta.cookie).toBe('[REDACTED]');
      expect(meta.opaqueValue).toBe('[REDACTED_TOKEN]');
      expect(meta.digestData).toBe('[REDACTED_HASH]');
      expect(meta.safeField).toBe('visible_data');
    });

    it('enforces 8 KiB size cap on metadata without throwing', async () => {
      const oversized = {
        huge: 'x'.repeat(10000),
      };

      const entry = await auditService.record({
        action: 'auth.login_success',
        outcome: 'success',
        actorUsername: 'admin',
        metadata: oversized,
      });

      const meta = entry.metadata as Record<string, unknown>;
      expect(meta._truncated).toBe(true);
      expect(meta._originalBytes as number).toBeGreaterThan(8192);
    });
  });

  describe('Transaction Atomic Support & Clock (Correction P)', () => {
    it('uses injected Clock timestamp for occurred_at', async () => {
      const fixedTime = new Date('2026-10-05T12:30:00.000Z');
      const fixedClock = { now: () => fixedTime };
      const customAuditService = new AuditService(
        prisma,
        fixedClock,
        requestContextService,
      );

      const entry = await customAuditService.record({
        action: 'auth.login_success',
        outcome: 'success',
        actorUsername: 'admin',
      });

      expect(entry.occurredAt.toISOString()).toBe(fixedTime.toISOString());
    });

    it('writes inside the callers transaction and persists on commit', async () => {
      let createdId: bigint | undefined;

      await rawPrisma.$transaction(async (tx) => {
        const entry = await auditService.record(
          {
            action: 'auth.login_success',
            outcome: 'success',
            actorUsername: 'admin',
            metadata: { txTest: true },
          },
          tx,
        );
        createdId = entry.id;
      });

      expect(createdId).toBeDefined();
      if (!createdId) {
        throw new Error('Expected createdId to be defined');
      }

      const found = await rawPrisma.auditLog.findUnique({
        where: { id: createdId },
      });
      expect(found).not.toBeNull();
      expect(found?.action).toBe('auth.login_success');
    });

    it('rolls back audit write when callers transaction aborts', async () => {
      let rolledBackId: bigint | undefined;

      await expect(
        rawPrisma.$transaction(async (tx) => {
          const entry = await auditService.record(
            {
              action: 'auth.login_success',
              outcome: 'success',
              actorUsername: 'admin',
              metadata: { shouldRollback: true },
            },
            tx,
          );
          rolledBackId = entry.id;

          throw new Error('Simulated transaction failure');
        }),
      ).rejects.toThrow('Simulated transaction failure');

      expect(rolledBackId).toBeDefined();
      if (rolledBackId !== undefined) {
        const found = await rawPrisma.auditLog.findUnique({
          where: { id: rolledBackId },
        });
        expect(found).toBeNull();
      }
    });
  });

  describe('Error Sanitization on Audit Write Failure', () => {
    it('wraps failed audit writes in AuditWriteError and logs only error class and SQLSTATE', async () => {
      const loggerSpy = jest.spyOn(Logger.prototype, 'error');

      // Force failure: invalid actorUserId (non-existent foreign key)
      const fakeUserId = '00000000-0000-0000-0000-000000000099';
      await expect(
        auditService.record({
          action: 'auth.login_success',
          outcome: 'success',
          actorUserId: fakeUserId,
          actorUsername: 'admin',
        }),
      ).rejects.toThrow(AuditWriteError);

      const calls = loggerSpy.mock.calls;
      const lastCall: unknown = calls[calls.length - 1]?.[0];
      expect(String(lastCall)).toContain('Audit write failed');
      expect(String(lastCall)).toMatch(/(23503|P2003)/);
    });
  });
});
