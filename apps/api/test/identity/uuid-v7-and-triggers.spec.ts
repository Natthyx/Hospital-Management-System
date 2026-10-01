import { PrismaClient } from '@prisma/client';

import { cleanTestDatabase } from '../utils/test-cleaner';

describe('UUIDv7 Generation and Database Triggers', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    await cleanTestDatabase();
    prisma = new PrismaClient(
      process.env.DATABASE_URL
        ? { datasources: { db: { url: process.env.DATABASE_URL } } }
        : undefined,
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('UUIDv7 Format & Version Nibble', () => {
    it('generates valid UUIDv7 IDs with version nibble 7 and RFC 4122/9562 variant', async () => {
      const user = await prisma.user.create({
        data: {
          username: 'uuidv7_test_user',
          fullName: 'UUIDv7 Test',
          email: 'uuidv7@hospital.org',
          passwordHash:
            '$argon2id$v=19$m=65536,t=3,p=4$some_valid_salt$some_valid_hash',
          status: 'active',
        },
      });

      expect(user.id).toBeDefined();
      expect(typeof user.id).toBe('string');
      // UUID format: 8-4-4-4-12 = 36 chars
      expect(user.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );

      // Character 14 is the version digit (index 14 in 0-indexed string)
      expect(user.id.charAt(14)).toBe('7');

      // Character 19 is the variant digit (8, 9, a, or b)
      const variantChar = user.id.charAt(19).toLowerCase();
      expect(['8', '9', 'a', 'b']).toContain(variantChar);
    });
  });

  describe('updated_at Trigger Functionality', () => {
    it('automatically updates updated_at on users table edits via database trigger', async () => {
      const user = await prisma.user.create({
        data: {
          username: 'trigger_user_test',
          fullName: 'Initial Name',
          email: 'trigger_user@hospital.org',
          passwordHash:
            '$argon2id$v=19$m=65536,t=3,p=4$some_valid_salt$some_valid_hash',
          status: 'active',
        },
      });

      const initialUpdatedAt = user.updatedAt.getTime();

      // Brief sleep to guarantee timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 50));

      const updated = await prisma.user.update({
        where: { id: user.id },
        data: { fullName: 'Updated Name' },
      });

      expect(updated.updatedAt.getTime()).toBeGreaterThan(initialUpdatedAt);
    });

    it('automatically updates updated_at on roles table edits via database trigger', async () => {
      const role = await prisma.role.create({
        data: {
          code: 'trigger_role_test',
          name: 'Initial Role Name',
          description: 'Initial Description',
        },
      });

      const initialUpdatedAt = role.updatedAt.getTime();

      await new Promise((resolve) => setTimeout(resolve, 50));

      const updated = await prisma.role.update({
        where: { id: role.id },
        data: { description: 'Updated Description' },
      });

      expect(updated.updatedAt.getTime()).toBeGreaterThan(initialUpdatedAt);
    });

    it('verifies that sessions and permissions do not have set_updated_at triggers', async () => {
      const triggers = await prisma.$queryRaw<
        { event_object_table: string; trigger_name: string }[]
      >`
        SELECT event_object_table, trigger_name
        FROM information_schema.triggers
        WHERE trigger_schema = 'public'
          AND action_statement LIKE '%set_updated_at%';
      `;

      const triggerTables = triggers.map((t) => t.event_object_table);

      // Triggers must be on users and roles only
      expect(triggerTables.sort()).toEqual(['roles', 'users']);
      expect(triggerTables).not.toContain('sessions');
      expect(triggerTables).not.toContain('permissions');
      expect(triggerTables).not.toContain('role_permissions');
      expect(triggerTables).not.toContain('user_roles');
    });
  });
});
