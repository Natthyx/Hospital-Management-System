import * as crypto from 'node:crypto';

import { validatePasswordPolicy } from '@hms/shared';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

import {
  executeAdminPasswordReset,
  generateCompliantTemporaryPassword,
} from '../../src/modules/auth/admin-recovery';
import { COMMON_PASSWORDS_SET } from '../../src/modules/auth/data/password-blocklist.data';
import { InMemoryAuditRecorder } from '../utils/in-memory-audit-recorder';
import { cleanTestDatabase } from '../utils/test-cleaner';

describe('Admin Password Recovery CLI (admin-recovery.ts)', () => {
  let prisma: PrismaClient;
  let auditRecorder: InMemoryAuditRecorder;

  beforeAll(() => {
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ??
      'postgresql://hms_app:dev_app_pass@localhost:5432/hms_test';

    prisma = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL } },
    });
    auditRecorder = new InMemoryAuditRecorder();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    auditRecorder.clear();
    await cleanTestDatabase({ reSeed: true });
  });

  describe('generateCompliantTemporaryPassword', () => {
    it('generates 50 distinct compliant passwords satisfying all password policy rules', () => {
      const username = 'recoveryadmin';
      const passwords = new Set<string>();

      for (let i = 0; i < 50; i++) {
        const pwd = generateCompliantTemporaryPassword(username);
        expect(pwd.length).toBeGreaterThanOrEqual(12);

        // Validation against shared password rules
        const validation = validatePasswordPolicy(
          pwd,
          username,
          COMMON_PASSWORDS_SET,
        );
        expect(validation.valid).toBe(true);

        // Absence from Wikimedia blocklist
        const normalized = pwd.toLowerCase().normalize('NFKC');
        expect(COMMON_PASSWORDS_SET.has(normalized)).toBe(false);

        // Uniqueness check across samples
        passwords.add(pwd);
      }

      expect(passwords.size).toBe(50);
    });
  });

  describe('executeAdminPasswordReset', () => {
    it('refuses execution if non-TTY and --force is not specified', async () => {
      await expect(
        executeAdminPasswordReset({
          username: 'admin',
          isTty: false,
          force: false,
          prisma,
        }),
      ).rejects.toThrow(
        /Refusing to run password reset in non-interactive environment/,
      );
    });

    it('refuses execution in TTY mode if user fails confirmation prompt', async () => {
      await expect(
        executeAdminPasswordReset({
          username: 'admin',
          isTty: true,
          force: false,
          promptFn: () => Promise.resolve('wrong_confirmation'),
          prisma,
        }),
      ).rejects.toThrow(/Confirmation mismatch/);
    });

    it('throws when the target username does not exist', async () => {
      await expect(
        executeAdminPasswordReset({
          username: 'nonexistent_user_999',
          force: true,
          prisma,
        }),
      ).rejects.toThrow(/User 'nonexistent_user_999' not found/);
    });

    it('successfully resets password with --force: bumps version, revokes sessions, resets lockout, and emits audit event', async () => {
      // 1. Setup user with locked state, failed count > 0, and active sessions
      const initialUser = await prisma.user.findFirstOrThrow({
        where: { username: 'admin' },
      });
      const initialVersion = initialUser.version;

      await prisma.user.update({
        where: { id: initialUser.id },
        data: {
          failedLoginCount: 5,
          lockedUntil: new Date(Date.now() + 15 * 60 * 1000),
          mustChangePassword: false,
        },
      });

      // Create 2 active sessions for this user
      const rawToken1 = crypto.randomBytes(32).toString('base64url');
      const hash1 = crypto.createHash('sha256').update(rawToken1).digest('hex');
      const s1 = await prisma.session.create({
        data: {
          userId: initialUser.id,
          tokenHash: hash1,
          csrfToken: crypto.randomBytes(32).toString('base64url'),
          expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
        },
      });

      const rawToken2 = crypto.randomBytes(32).toString('base64url');
      const hash2 = crypto.createHash('sha256').update(rawToken2).digest('hex');
      const s2 = await prisma.session.create({
        data: {
          userId: initialUser.id,
          tokenHash: hash2,
          csrfToken: crypto.randomBytes(32).toString('base64url'),
          expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
        },
      });

      // 2. Execute password reset
      const result = await executeAdminPasswordReset({
        username: 'admin',
        force: true,
        prisma,
        auditRecorder,
      });

      expect(result.username).toBe('admin');
      expect(result.version).toBe(initialVersion + 1);
      expect(typeof result.temporaryPassword).toBe('string');
      expect(result.temporaryPassword.length).toBeGreaterThanOrEqual(12);

      // 3. Verify user record in database
      const updatedUser = await prisma.user.findUniqueOrThrow({
        where: { id: initialUser.id },
      });

      expect(updatedUser.version).toBe(initialVersion + 1);
      expect(updatedUser.mustChangePassword).toBe(true);
      expect(updatedUser.failedLoginCount).toBe(0);
      expect(updatedUser.lockedUntil).toBeNull();
      expect(updatedUser.passwordChangedAt).not.toBeNull();

      // Verify new temporary password hashes and verifies with argon2
      const isValidPassword = await argon2.verify(
        updatedUser.passwordHash,
        result.temporaryPassword,
      );
      expect(isValidPassword).toBe(true);

      // 4. Verify sessions were revoked with reason 'admin_recovery_reset'
      const session1 = await prisma.session.findUniqueOrThrow({
        where: { id: s1.id },
      });
      const session2 = await prisma.session.findUniqueOrThrow({
        where: { id: s2.id },
      });

      expect(session1.revokedAt).not.toBeNull();
      expect(session1.revokedReason).toBe('admin_recovery_reset');
      expect(session2.revokedAt).not.toBeNull();
      expect(session2.revokedReason).toBe('admin_recovery_reset');

      // 5. Verify audit event
      const events = auditRecorder.getEvents();
      const recoveryEvent = events.find(
        (e) => e.action === 'user.password_reset',
      );
      expect(recoveryEvent).toBeDefined();
      expect(recoveryEvent?.outcome).toBe('success');
      expect(recoveryEvent?.actorUsername).toBe('cli:recovery');
      expect(recoveryEvent?.entityId).toBe(initialUser.id);
      expect(recoveryEvent?.metadata?.method).toBe('cli_recovery');
      expect(recoveryEvent?.metadata?.username).toBe('admin');
    });

    it('successfully resets password in interactive TTY mode when confirmation matches', async () => {
      const result = await executeAdminPasswordReset({
        username: 'admin',
        isTty: true,
        force: false,
        promptFn: () => Promise.resolve('admin'),
        prisma,
        auditRecorder,
      });

      expect(result.username).toBe('admin');
      expect(typeof result.temporaryPassword).toBe('string');
    });
  });
});
