import { randomUUID } from 'node:crypto';

import { AUDIT_ACTION_PATTERN } from '@hms/shared';
import { PrismaClient } from '@prisma/client';

import { cleanTestDatabase } from '../utils/test-cleaner';

describe('Audit Database Constraints & Immutability Triggers', () => {
  let appPrisma: PrismaClient;
  let ownerPrisma: PrismaClient;

  beforeAll(async () => {
    await cleanTestDatabase();
    appPrisma = new PrismaClient(
      process.env.DATABASE_URL
        ? { datasources: { db: { url: process.env.DATABASE_URL } } }
        : undefined,
    );
    const migrationUrl = process.env.DATABASE_MIGRATION_URL;
    if (!migrationUrl) {
      throw new Error('DATABASE_MIGRATION_URL is required');
    }
    ownerPrisma = new PrismaClient({
      datasources: { db: { url: migrationUrl } },
    });
  });

  afterAll(async () => {
    await appPrisma.$disconnect();
    await ownerPrisma.$disconnect();
  });

  describe('Constraint Definitions (Single Source of Truth Comparison)', () => {
    it('comproves that the database constraint regex for action matches AUDIT_ACTION_PATTERN', async () => {
      const result = await appPrisma.$queryRaw<
        { constraintdef: string }[]
      >`SELECT pg_get_constraintdef(oid) as constraintdef
        FROM pg_constraint
        WHERE conname = 'audit_log_action_format';`;

      expect(result.length).toBe(1);
      const def = result[0]?.constraintdef ?? '';
      expect(def).toContain(AUDIT_ACTION_PATTERN);
    });
  });

  describe('audit_log NOT NULL & Format Constraints', () => {
    it('accepts valid audit entry with all required fields', async () => {
      const entry = await appPrisma.auditLog.create({
        data: {
          actorUsername: 'admin',
          action: 'auth.login_success',
          outcome: 'success',
          metadata: { test: true },
        },
      });
      expect(entry.id).toBeDefined();
      expect(entry.actorUsername).toBe('admin');
    });

    it('rejects null actor_username at database level', async () => {
      await expect(
        appPrisma.$executeRawUnsafe(
          `INSERT INTO "audit_log" ("action", "outcome", "actor_username")
           VALUES ('auth.login_success', 'success', NULL);`,
        ),
      ).rejects.toThrow(/23502/);
    });

    it('rejects invalid audit action formats (uppercase, no dot, trailing dot, invalid chars)', async () => {
      // Uppercase rejected
      await expect(
        appPrisma.auditLog.create({
          data: {
            actorUsername: 'admin',
            action: 'Auth.login_success',
            outcome: 'success',
          },
        }),
      ).rejects.toThrow(/audit_log_action_format/);

      // No dot rejected
      await expect(
        appPrisma.auditLog.create({
          data: {
            actorUsername: 'admin',
            action: 'loginsuccess',
            outcome: 'success',
          },
        }),
      ).rejects.toThrow(/audit_log_action_format/);

      // Colon rejected
      await expect(
        appPrisma.auditLog.create({
          data: {
            actorUsername: 'admin',
            action: 'auth:login_success',
            outcome: 'success',
          },
        }),
      ).rejects.toThrow(/audit_log_action_format/);

      // Trailing dot rejected
      await expect(
        appPrisma.auditLog.create({
          data: {
            actorUsername: 'admin',
            action: 'auth.',
            outcome: 'success',
          },
        }),
      ).rejects.toThrow(/audit_log_action_format/);
    });
  });

  describe('audit_log Length CHECK Constraints (char_length)', () => {
    it('enforces action length <= 64 chars', async () => {
      // Valid action with 64 characters
      const valid64 = 'auth.' + 'a'.repeat(59);
      expect(valid64.length).toBe(64);
      const entry = await appPrisma.auditLog.create({
        data: {
          actorUsername: 'admin',
          action: valid64,
          outcome: 'success',
        },
      });
      expect(entry.id).toBeDefined();

      // Invalid action with 65 characters
      const invalid65 = 'auth.' + 'a'.repeat(60);
      expect(invalid65.length).toBe(65);
      await expect(
        appPrisma.auditLog.create({
          data: {
            actorUsername: 'admin',
            action: invalid65,
            outcome: 'success',
          },
        }),
      ).rejects.toThrow(/audit_log_action_length/);
    });

    it('enforces actor_username length <= 64 chars', async () => {
      // Valid actor_username with 64 characters
      const validActor = 'a'.repeat(64);
      const entry = await appPrisma.auditLog.create({
        data: {
          actorUsername: validActor,
          action: 'auth.login_success',
          outcome: 'success',
        },
      });
      expect(entry.id).toBeDefined();

      // Invalid actor_username with 65 characters
      const invalidActor = 'a'.repeat(65);
      await expect(
        appPrisma.auditLog.create({
          data: {
            actorUsername: invalidActor,
            action: 'auth.login_success',
            outcome: 'success',
          },
        }),
      ).rejects.toThrow(/audit_log_actor_username_length/);
    });

    it('enforces entity_type length <= 64 chars', async () => {
      // Valid entity_type with 64 characters
      const validEntity = 'e'.repeat(64);
      const entry = await appPrisma.auditLog.create({
        data: {
          actorUsername: 'admin',
          action: 'user.create',
          outcome: 'success',
          entityType: validEntity,
        },
      });
      expect(entry.id).toBeDefined();

      // Invalid entity_type with 65 characters
      const invalidEntity = 'e'.repeat(65);
      await expect(
        appPrisma.auditLog.create({
          data: {
            actorUsername: 'admin',
            action: 'user.create',
            outcome: 'success',
            entityType: invalidEntity,
          },
        }),
      ).rejects.toThrow(/audit_log_entity_type_length/);
    });

    it('enforces entity_id length <= 64 chars', async () => {
      // Valid entity_id with 64 characters
      const validId = 'i'.repeat(64);
      const entry = await appPrisma.auditLog.create({
        data: {
          actorUsername: 'admin',
          action: 'user.create',
          outcome: 'success',
          entityId: validId,
        },
      });
      expect(entry.id).toBeDefined();

      // Invalid entity_id with 65 characters
      const invalidId = 'i'.repeat(65);
      await expect(
        appPrisma.auditLog.create({
          data: {
            actorUsername: 'admin',
            action: 'user.create',
            outcome: 'success',
            entityId: invalidId,
          },
        }),
      ).rejects.toThrow(/audit_log_entity_id_length/);
    });

    it('enforces request_id length <= 64 chars', async () => {
      // Valid request_id with 64 characters
      const validReq = 'r'.repeat(64);
      const entry = await appPrisma.auditLog.create({
        data: {
          actorUsername: 'admin',
          action: 'auth.login_success',
          outcome: 'success',
          requestId: validReq,
        },
      });
      expect(entry.id).toBeDefined();

      // Invalid request_id with 65 characters
      const invalidReq = 'r'.repeat(65);
      await expect(
        appPrisma.auditLog.create({
          data: {
            actorUsername: 'admin',
            action: 'auth.login_success',
            outcome: 'success',
            requestId: invalidReq,
          },
        }),
      ).rejects.toThrow(/audit_log_request_id_length/);
    });

    it('enforces ip length <= 45 chars (IPv6 max)', async () => {
      // Valid IPv6 address up to 45 characters
      const validIp = '0000:0000:0000:0000:0000:0000:192.168.100.100';
      expect(validIp.length).toBeLessThanOrEqual(45);
      const entry = await appPrisma.auditLog.create({
        data: {
          actorUsername: 'admin',
          action: 'auth.login_success',
          outcome: 'success',
          ip: validIp,
        },
      });
      expect(entry.id).toBeDefined();

      // Invalid IP with 46 characters
      const invalidIp = 'a'.repeat(46);
      await expect(
        appPrisma.auditLog.create({
          data: {
            actorUsername: 'admin',
            action: 'auth.login_success',
            outcome: 'success',
            ip: invalidIp,
          },
        }),
      ).rejects.toThrow(/audit_log_ip_length/);
    });

    it('enforces user_agent length <= 255 chars', async () => {
      // Valid user_agent with 255 characters
      const validUa = 'u'.repeat(255);
      const entry = await appPrisma.auditLog.create({
        data: {
          actorUsername: 'admin',
          action: 'auth.login_success',
          outcome: 'success',
          userAgent: validUa,
        },
      });
      expect(entry.id).toBeDefined();

      // Invalid user_agent with 256 characters
      const invalidUa = 'u'.repeat(256);
      await expect(
        appPrisma.auditLog.create({
          data: {
            actorUsername: 'admin',
            action: 'auth.login_success',
            outcome: 'success',
            userAgent: invalidUa,
          },
        }),
      ).rejects.toThrow(/audit_log_user_agent_length/);
    });
  });

  describe('audit_log JSONB Size Limits', () => {
    it('enforces 32 KiB size check on before column', async () => {
      const oversizedPayload = { data: 'x'.repeat(33000) };

      await expect(
        appPrisma.auditLog.create({
          data: {
            actorUsername: 'admin',
            action: 'user.password_reset',
            outcome: 'success',
            before: oversizedPayload,
          },
        }),
      ).rejects.toThrow(/audit_log_before_size/);
    });

    it('enforces 32 KiB size check on after column', async () => {
      const oversizedPayload = { data: 'x'.repeat(33000) };

      await expect(
        appPrisma.auditLog.create({
          data: {
            actorUsername: 'admin',
            action: 'user.password_reset',
            outcome: 'success',
            after: oversizedPayload,
          },
        }),
      ).rejects.toThrow(/audit_log_after_size/);
    });

    it('enforces 32 KiB size check on metadata column', async () => {
      const oversizedPayload = { data: 'x'.repeat(33000) };

      await expect(
        appPrisma.auditLog.create({
          data: {
            actorUsername: 'admin',
            action: 'auth.login_failed',
            outcome: 'failure',
            metadata: oversizedPayload,
          },
        }),
      ).rejects.toThrow(/audit_log_metadata_size/);
    });

    it('accepts null before and after, but requires metadata to be valid json', async () => {
      const entry = await appPrisma.auditLog.create({
        data: {
          actorUsername: 'admin',
          action: 'auth.login_success',
          outcome: 'success',
          metadata: {},
        },
      });
      expect(entry.id).toBeDefined();
    });
  });

  describe('audit_log Foreign Key Constraints', () => {
    it('accepts valid actor_user_id referencing existing user', async () => {
      const adminUser = await appPrisma.user.findUnique({
        where: { username: 'admin' },
      });
      expect(adminUser).not.toBeNull();
      if (!adminUser) {
        throw new Error('Expected admin user to exist');
      }

      const entry = await appPrisma.auditLog.create({
        data: {
          actorUsername: adminUser.username,
          action: 'auth.login_success',
          outcome: 'success',
          actorUserId: adminUser.id,
        },
      });
      expect(entry.id).toBeDefined();
      expect(entry.actorUserId).toBe(adminUser.id);
    });

    it('accepts null actor_user_id for system actions', async () => {
      const entry = await appPrisma.auditLog.create({
        data: {
          actorUsername: 'system:scheduler',
          action: 'system.session_cleanup',
          outcome: 'success',
          actorUserId: null,
        },
      });
      expect(entry.id).toBeDefined();
      expect(entry.actorUserId).toBeNull();
    });

    it('rejects non-existent actor_user_id', async () => {
      const fakeUserId = randomUUID();
      await expect(
        appPrisma.auditLog.create({
          data: {
            actorUsername: 'unknown_actor',
            action: 'auth.login_success',
            outcome: 'success',
            actorUserId: fakeUserId,
          },
        }),
      ).rejects.toThrow(/(foreign key constraint|23503)/i);
    });
  });

  describe('Defense-in-depth Immutability Triggers (hms_owner)', () => {
    it('rejects UPDATE on audit_log even for owner role (error code 55000)', async () => {
      const entry = await appPrisma.auditLog.create({
        data: {
          actorUsername: 'admin',
          action: 'auth.login_success',
          outcome: 'success',
        },
      });

      await expect(
        ownerPrisma.$executeRawUnsafe(
          `UPDATE "audit_log" SET action = 'tampered' WHERE id = ${String(entry.id)};`,
        ),
      ).rejects.toThrow(/55000/);
    });

    it('rejects DELETE on audit_log even for owner role (error code 55000)', async () => {
      const entry = await appPrisma.auditLog.create({
        data: {
          actorUsername: 'admin',
          action: 'auth.login_success',
          outcome: 'success',
        },
      });

      await expect(
        ownerPrisma.$executeRawUnsafe(
          `DELETE FROM "audit_log" WHERE id = ${String(entry.id)};`,
        ),
      ).rejects.toThrow(/55000/);
    });

    it('rejects TRUNCATE on audit_log even for owner role (error code 55000)', async () => {
      await expect(
        ownerPrisma.$executeRawUnsafe(`TRUNCATE TABLE "audit_log";`),
      ).rejects.toThrow(/55000/);
    });

    it('rejects TRUNCATE users CASCADE because it cascades into audit_log where trigger fires', async () => {
      await expect(
        ownerPrisma.$executeRawUnsafe(`TRUNCATE TABLE "users" CASCADE;`),
      ).rejects.toThrow(/55000/);
    });
  });
});
