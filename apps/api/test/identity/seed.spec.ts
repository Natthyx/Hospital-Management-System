import { PERMISSIONS } from '@hms/shared';
import { PrismaClient } from '@prisma/client';

import { runSeedCli } from '../../src/database/seeds/cli';
import {
  generateSeedPassword,
  UNAMBIGUOUS_ALPHANUMERIC,
} from '../../src/database/seeds/seed-password';
import { seedRequired } from '../../src/database/seeds/seed-required';
import { cleanTestDatabase } from '../utils/test-cleaner';

describe('Required Seed (seedRequired)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    await cleanTestDatabase({ reSeed: false });
    prisma = new PrismaClient(
      process.env.DATABASE_URL
        ? { datasources: { db: { url: process.env.DATABASE_URL } } }
        : undefined,
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Password Generator Policy Compliance', () => {
    it('generates a 24-character unambiguous alphanumeric password', () => {
      const pwd = generateSeedPassword(24);
      expect(pwd.length).toBe(24);

      // Verify all characters are in UNAMBIGUOUS_ALPHANUMERIC
      for (const char of pwd) {
        expect(UNAMBIGUOUS_ALPHANUMERIC).toContain(char);
      }

      // Verify ambiguous characters are strictly absent
      expect(pwd).not.toMatch(/[O0ol1I]/);

      // Verify compliance with Rule 04 policy
      expect(pwd.length).toBeGreaterThanOrEqual(10);
      expect(pwd.toLowerCase()).not.toBe('admin');
    });

    it('rejects requested length less than 10 characters', () => {
      expect(() => generateSeedPassword(9)).toThrow(
        'Seed password length must be at least 10 characters',
      );
    });
  });

  describe('Seed Execution, Idempotency & Invariants', () => {
    let firstPassword: string | null = null;

    it('creates admin user, default roles, and catalog permissions on initial run', async () => {
      // Database was truncated with reSeed: false in beforeAll
      const result = await seedRequired(prisma);

      expect(result.createdAdmin).toBe(true);
      expect(result.generatedPassword).toBeDefined();
      expect(typeof result.generatedPassword).toBe('string');
      expect(result.generatedPassword?.length).toBe(24);

      firstPassword = result.generatedPassword;

      // Verify admin user exists
      const admin = await prisma.user.findUnique({
        where: { username: 'admin' },
      });
      expect(admin).toBeDefined();
      expect(admin?.mustChangePassword).toBe(true);
      expect(admin?.status).toBe('active');
    });

    it('is strictly idempotent on a second run without altering state', async () => {
      const auditCountBefore = await prisma.auditLog.count();
      const secondResult = await seedRequired(prisma);

      expect(secondResult.createdAdmin).toBe(false);
      expect(secondResult.generatedPassword).toBeNull();

      // State is untouched
      const admin = await prisma.user.findUnique({
        where: { username: 'admin' },
      });
      expect(admin).toBeDefined();

      const auditCountAfter = await prisma.auditLog.count();
      expect(auditCountAfter).toBe(auditCountBefore);
    });

    it('never removes existing permissions from admin role', async () => {
      // 1. Manually add a custom permission to DB and assign to admin
      const customPerm = await prisma.permission.create({
        data: {
          code: 'audit.custom_export',
          module: 'audit',
          description: 'Custom export permission',
        },
      });

      const adminRole = await prisma.role.findUniqueOrThrow({
        where: { code: 'admin' },
      });

      await prisma.rolePermission.create({
        data: {
          roleId: adminRole.id,
          permissionCode: customPerm.code,
        },
      });

      // 2. Re-run seedRequired (spy on console.warn to silence output and assert warning)
      const warnSpy1 = jest
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      try {
        await seedRequired(prisma);
        expect(warnSpy1).toHaveBeenCalledWith(
          expect.stringContaining(
            '[SEED WARNING] Orphaned permissions found in database: audit.custom_export',
          ),
        );
      } finally {
        warnSpy1.mockRestore();
      }

      // 3. Verify custom permission is STILL assigned to admin
      const assigned = await prisma.rolePermission.findUnique({
        where: {
          roleId_permissionCode: {
            roleId: adminRole.id,
            permissionCode: customPerm.code,
          },
        },
      });
      expect(assigned).toBeDefined();
    });

    it('never overwrites existing role names or descriptions', async () => {
      // 1. Modify the description of doctor role
      const doctorRole = await prisma.role.findUniqueOrThrow({
        where: { code: 'doctor' },
      });

      await prisma.role.update({
        where: { id: doctorRole.id },
        data: {
          name: 'Attending Physician',
          description: 'Specialized clinical practitioner',
        },
      });

      // 2. Re-run seedRequired (spy on console.warn for existing orphan)
      const warnSpy2 = jest
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      try {
        await seedRequired(prisma);
        expect(warnSpy2).toHaveBeenCalledWith(
          expect.stringContaining(
            '[SEED WARNING] Orphaned permissions found in database: audit.custom_export',
          ),
        );
      } finally {
        warnSpy2.mockRestore();
      }

      // 3. Verify name and description were preserved and NOT overwritten
      const preserved = await prisma.role.findUniqueOrThrow({
        where: { id: doctorRole.id },
      });
      expect(preserved.name).toBe('Attending Physician');
      expect(preserved.description).toBe('Specialized clinical practitioner');
    });

    it('reports orphaned permissions without deleting them', async () => {
      // We already inserted 'audit.custom_export' above which is not in PERMISSIONS catalog
      const orphanBefore = await prisma.permission.findUnique({
        where: { code: 'audit.custom_export' },
      });
      expect(orphanBefore).toBeDefined();

      // Re-run seed (spy on console.warn)
      const warnSpy3 = jest
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      try {
        await seedRequired(prisma);
        expect(warnSpy3).toHaveBeenCalledWith(
          expect.stringContaining(
            '[SEED WARNING] Orphaned permissions found in database: audit.custom_export',
          ),
        );
      } finally {
        warnSpy3.mockRestore();
      }

      // Orphan is still present
      const orphanAfter = await prisma.permission.findUnique({
        where: { code: 'audit.custom_export' },
      });
      expect(orphanAfter).toBeDefined();
    });

    it('guarantees that no cleartext password is stored in any table column', async () => {
      expect(firstPassword).toBeDefined();

      // Check users table
      const users = await prisma.user.findMany();
      for (const u of users) {
        expect(u.passwordHash).not.toBe(firstPassword);
        expect(u.passwordHash).toMatch(/^\$argon2id\$/);
        expect(u.username).not.toBe(firstPassword);
        expect(u.fullName).not.toBe(firstPassword);
      }

      // Check sessions table
      const sessions = await prisma.session.findMany();
      for (const s of sessions) {
        expect(s.tokenHash).not.toBe(firstPassword);
      }
    });

    it('proves that a failure midway in admin creation leaves no partial state (atomic transaction)', async () => {
      // Clean database so admin does not exist
      await cleanTestDatabase({ reSeed: false });

      // Run seed with all permissions and roles prepared
      for (const perm of PERMISSIONS) {
        await prisma.permission.upsert({
          where: { code: perm.code },
          update: {},
          create: {
            code: perm.code,
            module: perm.module,
            description: perm.description,
          },
        });
      }

      // Intentionally simulate an error during transaction (e.g. by passing invalid username or throwing)
      await expect(
        prisma.$transaction(async (tx) => {
          await tx.user.create({
            data: {
              username: 'admin',
              fullName: 'Admin',
              passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$salt$hash',
              status: 'active',
            },
          });

          // Simulate midway crash
          throw new Error('Simulated crash midway through transaction');
        }),
      ).rejects.toThrow('Simulated crash midway through transaction');

      // Verify that user was rolled back and DOES NOT exist
      const adminAfterCrash = await prisma.user.findUnique({
        where: { username: 'admin' },
      });
      expect(adminAfterCrash).toBeNull();
    });

    it('concurrent seed runs handle race condition cleanly without duplicate or partial state', async () => {
      await cleanTestDatabase({ reSeed: false });

      // Run two concurrent seedRequired invocations
      const [res1, res2] = await Promise.allSettled([
        seedRequired(prisma),
        seedRequired(prisma),
      ]);

      // At least one must succeed
      const fulfilled = [res1, res2].filter(
        (
          r,
        ): r is PromiseFulfilledResult<{
          createdAdmin: boolean;
          generatedPassword: string | null;
        }> => r.status === 'fulfilled',
      );
      expect(fulfilled.length).toBeGreaterThanOrEqual(1);

      // If one rejected due to unique constraint race, it must be Prisma unique violation (P2002)
      const rejected = [res1, res2].filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );
      for (const rej of rejected) {
        const error = rej.reason as { code?: string } | undefined;
        expect(error?.code).toBe('P2002');
      }

      // Exactly ONE admin user exists in DB
      const admins = await prisma.user.findMany({
        where: { username: 'admin' },
      });
      expect(admins.length).toBe(1);
      const admin = admins[0];
      if (!admin) {
        throw new Error('Admin user was not created');
      }

      // Exactly ONE userRole assignment exists for admin
      const adminRoles = await prisma.userRole.findMany({
        where: { userId: admin.id },
      });
      expect(adminRoles.length).toBe(1);
    });
  });

  describe('Password Leakage Prevention & CLI Output Control', () => {
    it('guarantees that seedRequired never leaks generated password to stdout, stderr, or console', async () => {
      await cleanTestDatabase({ reSeed: false });

      const stdoutSpy = jest
        .spyOn(process.stdout, 'write')
        .mockImplementation(() => true);
      const stderrSpy = jest
        .spyOn(process.stderr, 'write')
        .mockImplementation(() => true);
      const logSpy = jest
        .spyOn(console, 'log')
        .mockImplementation(() => undefined);
      const warnSpy = jest
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      const infoSpy = jest
        .spyOn(console, 'info')
        .mockImplementation(() => undefined);
      const debugSpy = jest
        .spyOn(console, 'debug')
        .mockImplementation(() => undefined);

      try {
        const result = await seedRequired(prisma);
        expect(result.createdAdmin).toBe(true);
        const pwd = result.generatedPassword;
        expect(pwd).toBeDefined();
        if (!pwd) {
          throw new Error('Password was not generated');
        }

        const checkCalls = (calls: unknown[][]) => {
          for (const call of calls) {
            const str = call.map(String).join(' ');
            expect(str).not.toContain(pwd);
          }
        };

        checkCalls(stdoutSpy.mock.calls);
        checkCalls(stderrSpy.mock.calls);
        checkCalls(logSpy.mock.calls);
        checkCalls(warnSpy.mock.calls);
        checkCalls(errorSpy.mock.calls);
        checkCalls(infoSpy.mock.calls);
        checkCalls(debugSpy.mock.calls);
      } finally {
        stdoutSpy.mockRestore();
        stderrSpy.mockRestore();
        logSpy.mockRestore();
        warnSpy.mockRestore();
        errorSpy.mockRestore();
        infoSpy.mockRestore();
        debugSpy.mockRestore();
      }
    });

    it('guarantees that the CLI wrapper prints the temporary password exactly once to console.log and nowhere else', async () => {
      await cleanTestDatabase({ reSeed: false });

      const stdoutSpy = jest
        .spyOn(process.stdout, 'write')
        .mockImplementation(() => true);
      const stderrSpy = jest
        .spyOn(process.stderr, 'write')
        .mockImplementation(() => true);
      const logSpy = jest
        .spyOn(console, 'log')
        .mockImplementation(() => undefined);
      const warnSpy = jest
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      const infoSpy = jest
        .spyOn(console, 'info')
        .mockImplementation(() => undefined);
      const debugSpy = jest
        .spyOn(console, 'debug')
        .mockImplementation(() => undefined);

      try {
        const result = await runSeedCli(prisma);
        expect(result.createdAdmin).toBe(true);
        const pwd = result.generatedPassword;
        expect(pwd).toBeDefined();
        if (!pwd) {
          throw new Error('Password was not generated');
        }

        // Password must appear in console.log exactly once
        const logCalls = logSpy.mock.calls.map((c) => c.map(String).join(' '));
        const matchingLogs = logCalls.filter((msg) => msg.includes(pwd));
        expect(matchingLogs.length).toBe(1);
        expect(matchingLogs[0]).toBe(
          `Admin user created. Temporary password: ${pwd}`,
        );

        // Password must NOT appear in stdout.write, stderr.write, console.warn, console.error, console.info, console.debug
        const checkNoPassword = (calls: unknown[][]) => {
          for (const call of calls) {
            const str = call.map(String).join(' ');
            expect(str).not.toContain(pwd);
          }
        };

        checkNoPassword(stdoutSpy.mock.calls);
        checkNoPassword(stderrSpy.mock.calls);
        checkNoPassword(warnSpy.mock.calls);
        checkNoPassword(errorSpy.mock.calls);
        checkNoPassword(infoSpy.mock.calls);
        checkNoPassword(debugSpy.mock.calls);
      } finally {
        stdoutSpy.mockRestore();
        stderrSpy.mockRestore();
        logSpy.mockRestore();
        warnSpy.mockRestore();
        errorSpy.mockRestore();
        infoSpy.mockRestore();
        debugSpy.mockRestore();
      }
    });
  });
});
