import { PERMISSION_CODE_PATTERN, ROLE_CODE_PATTERN } from '@hms/shared';
import { PrismaClient } from '@prisma/client';

import { cleanTestDatabase } from '../utils/test-cleaner';

describe('Identity Database Constraints', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    await cleanTestDatabase();
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Constraint Definitions (Single Source of Truth Comparison)', () => {
    it('comproves that the database constraint regex for roles matches ROLE_CODE_PATTERN', async () => {
      const result = await prisma.$queryRaw<
        { constraintdef: string }[]
      >`SELECT pg_get_constraintdef(oid) as constraintdef
        FROM pg_constraint
        WHERE conname = 'roles_code_format';`;

      expect(result.length).toBe(1);
      const def = result[0]?.constraintdef ?? '';
      expect(def).toContain(ROLE_CODE_PATTERN);
    });

    it('comproves that the database constraint regex for permissions matches PERMISSION_CODE_PATTERN', async () => {
      const result = await prisma.$queryRaw<
        { constraintdef: string }[]
      >`SELECT pg_get_constraintdef(oid) as constraintdef
        FROM pg_constraint
        WHERE conname = 'permissions_code_format';`;

      expect(result.length).toBe(1);
      const def = result[0]?.constraintdef ?? '';
      expect(def).toContain(PERMISSION_CODE_PATTERN);
    });

    it('comproves that the permissions module prefix constraint uses split_part', async () => {
      const result = await prisma.$queryRaw<
        { constraintdef: string }[]
      >`SELECT pg_get_constraintdef(oid) as constraintdef
        FROM pg_constraint
        WHERE conname = 'permissions_module_prefix';`;

      expect(result.length).toBe(1);
      const def = result[0]?.constraintdef ?? '';
      expect(def).toContain("split_part(code, '.'::text, 1) = module");
    });
  });

  describe('users CHECK Constraints', () => {
    let userCounter = 0;
    function makeUser(overrides: Record<string, unknown> = {}) {
      userCounter += 1;
      return {
        username: `user_constraint_${String(userCounter)}`,
        fullName: `Test User ${String(userCounter)}`,
        email: `test_user_${String(userCounter)}@example.com`,
        passwordHash:
          '$argon2id$v=19$m=65536,t=3,p=4$some_valid_salt$some_valid_hash',
        status: 'active' as const,
        ...overrides,
      };
    }

    it('accepts valid username formats', async () => {
      const user = await prisma.user.create({
        data: makeUser({ username: 'valid.user-1_test' }),
      });
      expect(user.id).toBeDefined();
    });

    it('rejects uppercase characters in username', async () => {
      await expect(
        prisma.user.create({
          data: makeUser({ username: 'Upper_User' }),
        }),
      ).rejects.toThrow();
    });

    it('rejects username shorter than 3 characters', async () => {
      await expect(
        prisma.user.create({
          data: makeUser({ username: 'ab' }),
        }),
      ).rejects.toThrow();
    });

    it('rejects username longer than 32 characters', async () => {
      await expect(
        prisma.user.create({
          data: makeUser({ username: 'a'.repeat(33) }),
        }),
      ).rejects.toThrow();
    });

    it('rejects invalid characters in username (@ symbols)', async () => {
      await expect(
        prisma.user.create({
          data: makeUser({ username: 'user@hospital' }),
        }),
      ).rejects.toThrow();
    });

    it('accepts lowercase email or null email', async () => {
      const u1 = await prisma.user.create({
        data: makeUser({ email: null }),
      });
      expect(u1.email).toBeNull();

      const u2 = await prisma.user.create({
        data: makeUser({ email: 'lowercase@hospital.org' }),
      });
      expect(u2.email).toBe('lowercase@hospital.org');
    });

    it('rejects uppercase characters in email', async () => {
      await expect(
        prisma.user.create({
          data: makeUser({ email: 'Uppercase@Hospital.org' }),
        }),
      ).rejects.toThrow();
    });

    it('enforces non-negative failed_login_count', async () => {
      // 0 is valid
      const u1 = await prisma.user.create({
        data: makeUser({ failedLoginCount: 0 }),
      });
      expect(u1.failedLoginCount).toBe(0);

      // Negative is rejected
      await expect(
        prisma.user.create({
          data: makeUser({ failedLoginCount: -1 }),
        }),
      ).rejects.toThrow();
    });

    it('rejects password hash that does not start with $argon2id$', async () => {
      // Bcrypt hash rejected
      await expect(
        prisma.user.create({
          data: makeUser({
            passwordHash:
              '$2b$12$e8kZl1R8XzYyQ7bK4J2w4ePqjS6/qK5hH9z9/m6a1oF8j3g9s2q',
          }),
        }),
      ).rejects.toThrow();

      // Plaintext rejected
      await expect(
        prisma.user.create({
          data: makeUser({
            passwordHash: 'plaintext_password_123',
          }),
        }),
      ).rejects.toThrow();
    });

    it('enforces unique username', async () => {
      await prisma.user.create({
        data: makeUser({ username: 'unique_user_test' }),
      });

      await expect(
        prisma.user.create({
          data: makeUser({ username: 'unique_user_test' }),
        }),
      ).rejects.toThrow();
    });

    it('enforces unique email when set, but allows multiple null emails', async () => {
      await prisma.user.create({
        data: makeUser({ email: 'unique_test_email@example.com' }),
      });

      await expect(
        prisma.user.create({
          data: makeUser({ email: 'unique_test_email@example.com' }),
        }),
      ).rejects.toThrow();

      // Multiple NULL emails succeed
      const null1 = await prisma.user.create({
        data: makeUser({ email: null }),
      });
      const null2 = await prisma.user.create({
        data: makeUser({ email: null }),
      });
      expect(null1.id).toBeDefined();
      expect(null2.id).toBeDefined();
    });
  });

  describe('roles CHECK Constraints', () => {
    it('accepts valid role codes', async () => {
      const role = await prisma.role.create({
        data: {
          code: 'chief_medical_officer_2',
          name: 'Chief Medical Officer',
          description: 'CMO executive role',
        },
      });
      expect(role.id).toBeDefined();
    });

    it('rejects invalid role codes (uppercase, leading digits/underscores, too short, too long)', async () => {
      // Uppercase rejected
      await expect(
        prisma.role.create({
          data: {
            code: 'Doctor_Chief',
            name: 'Role',
            description: 'Desc',
          },
        }),
      ).rejects.toThrow();

      // Leading underscore rejected
      await expect(
        prisma.role.create({
          data: {
            code: '_doctor',
            name: 'Role',
            description: 'Desc',
          },
        }),
      ).rejects.toThrow();

      // Leading digit rejected
      await expect(
        prisma.role.create({
          data: {
            code: '1doctor',
            name: 'Role',
            description: 'Desc',
          },
        }),
      ).rejects.toThrow();

      // Single character rejected (min length 2)
      await expect(
        prisma.role.create({
          data: {
            code: 'd',
            name: 'Role',
            description: 'Desc',
          },
        }),
      ).rejects.toThrow();

      // Over 50 characters rejected
      await expect(
        prisma.role.create({
          data: {
            code: 'a'.repeat(51),
            name: 'Role',
            description: 'Desc',
          },
        }),
      ).rejects.toThrow();
    });

    it('enforces unique role code', async () => {
      await prisma.role.create({
        data: {
          code: 'unique_role_code',
          name: 'Role 1',
          description: 'Desc',
        },
      });

      await expect(
        prisma.role.create({
          data: {
            code: 'unique_role_code',
            name: 'Role 2',
            description: 'Desc',
          },
        }),
      ).rejects.toThrow();
    });
  });

  describe('permissions CHECK Constraints', () => {
    it('accepts valid permission codes matching prefix module', async () => {
      const perm = await prisma.permission.create({
        data: {
          code: 'custom.audit_action',
          module: 'custom',
          description: 'Custom audit action',
        },
      });
      expect(perm.code).toBe('custom.audit_action');
    });

    it('rejects permission code where prefix does not equal module', async () => {
      await expect(
        prisma.permission.create({
          data: {
            code: 'users.export_records',
            module: 'reports', // mismatch!
            description: 'Export records',
          },
        }),
      ).rejects.toThrow();
    });

    it('rejects invalid permission code formats (colon-separated, uppercase, no module)', async () => {
      // Colon rejected
      await expect(
        prisma.permission.create({
          data: {
            code: 'users:view',
            module: 'users',
            description: 'View users',
          },
        }),
      ).rejects.toThrow();

      // Uppercase rejected
      await expect(
        prisma.permission.create({
          data: {
            code: 'Users.view',
            module: 'Users',
            description: 'View users',
          },
        }),
      ).rejects.toThrow();

      // Trailing dot rejected
      await expect(
        prisma.permission.create({
          data: {
            code: 'users.',
            module: 'users',
            description: 'View users',
          },
        }),
      ).rejects.toThrow();
    });
  });
});
