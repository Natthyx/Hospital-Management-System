import { PrismaClient } from '@prisma/client';

import { cleanTestDatabase } from '../utils/test-cleaner';

describe('Database Role Grants & Least Privilege (hms_app)', () => {
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

  const EXPECTED_GRANT_MATRIX: Record<string, string[]> = {
    users: ['INSERT', 'SELECT', 'UPDATE'],
    roles: ['INSERT', 'SELECT', 'UPDATE'],
    permissions: ['INSERT', 'SELECT', 'UPDATE'],
    role_permissions: ['DELETE', 'INSERT', 'SELECT'],
    user_roles: ['DELETE', 'INSERT', 'SELECT'],
    sessions: ['DELETE', 'INSERT', 'SELECT', 'UPDATE'],
    audit_log: ['INSERT', 'SELECT'],
  };

  const ALL_TABLE_PRIVILEGES = [
    'SELECT',
    'INSERT',
    'UPDATE',
    'DELETE',
    'TRUNCATE',
    'REFERENCES',
    'TRIGGER',
  ];

  const ALL_SEQUENCE_PRIVILEGES = ['USAGE', 'SELECT', 'UPDATE'];

  it('strictly verifies hms_app privileges across all public tables using has_table_privilege', async () => {
    // 1. Discover all user tables in public schema except _prisma_migrations
    const tables = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename != '_prisma_migrations'
        ORDER BY tablename ASC;
    `;

    const tableNames = tables.map((t) => t.tablename);
    expect(tableNames.sort()).toEqual(
      Object.keys(EXPECTED_GRANT_MATRIX).sort(),
    );

    // 2. Query has_table_privilege for each privilege type
    for (const tableName of tableNames) {
      const actualPrivileges: string[] = [];
      for (const priv of ALL_TABLE_PRIVILEGES) {
        const rows = await prisma.$queryRawUnsafe<{ has_priv: boolean }[]>(
          `SELECT has_table_privilege('hms_app', 'public."${tableName}"', '${priv}') as has_priv;`,
        );
        if (rows[0]?.has_priv) {
          actualPrivileges.push(priv);
        }
      }

      const expected = EXPECTED_GRANT_MATRIX[tableName] ?? [];
      expect(actualPrivileges.sort()).toEqual(expected.sort());
    }
  });

  it('guarantees that PUBLIC role has zero privileges on all public tables (via pg_class.relacl aclexplode)', async () => {
    const publicGrants = await prisma.$queryRaw<
      { relname: string; grantee: string; privilege_type: string }[]
    >`
      SELECT c.relname, a.grantee::text, a.privilege_type
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND c.relname != '_prisma_migrations'
        AND a.grantee = 0;
    `;

    expect(publicGrants).toEqual([]);
  });

  it('verifies that hms_app and PUBLIC have zero sequence privileges on identity sequences, yet INSERT works', async () => {
    // 1. Discover all sequences in public schema
    const sequences = await prisma.$queryRaw<{ relname: string }[]>`
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'S'
      ORDER BY c.relname ASC;
    `;

    expect(sequences.length).toBeGreaterThan(0);

    for (const seq of sequences) {
      // 2. hms_app must have ZERO sequence privileges (Correction B)
      for (const priv of ALL_SEQUENCE_PRIVILEGES) {
        const rows = await prisma.$queryRawUnsafe<{ has_priv: boolean }[]>(
          `SELECT has_sequence_privilege('hms_app', 'public."${seq.relname}"', '${priv}') as has_priv;`,
        );
        expect(rows[0]?.has_priv).toBe(false);
      }

      // 3. PUBLIC role must have zero sequence privileges
      const publicSeqGrants = await prisma.$queryRawUnsafe<
        { relname: string; grantee: string; privilege_type: string }[]
      >(`
        SELECT c.relname, a.grantee::text, a.privilege_type
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('S', c.relowner))) a
        WHERE n.nspname = 'public'
          AND c.relname = '${seq.relname}'
          AND a.grantee = 0;
      `);
      expect(publicSeqGrants).toEqual([]);
    }

    // 4. Prove that INSERT into audit_log as hms_app succeeds without any sequence grant
    const insertResult = await prisma.$queryRaw<
      { id: bigint; action: string }[]
    >`
      INSERT INTO "audit_log" ("actor_username", "action", "outcome", "metadata")
      VALUES ('system:test', 'audit.read', 'success', '{"test": "no_seq_grant"}'::jsonb)
      RETURNING "id", "action";
    `;
    expect(insertResult.length).toBe(1);
    expect(insertResult[0]?.id).toBeDefined();
    expect(insertResult[0]?.action).toBe('audit.read');
  });

  describe('Functional Grant Enforcement (hms_app)', () => {
    it('denies DELETE on users, roles, permissions, and audit_log to hms_app', async () => {
      // DELETE on users is denied
      await expect(
        prisma.$executeRawUnsafe(
          `DELETE FROM "users" WHERE username = 'non_existent';`,
        ),
      ).rejects.toThrow(/(permission denied|42501)/i);

      // DELETE on roles is denied
      await expect(
        prisma.$executeRawUnsafe(
          `DELETE FROM "roles" WHERE code = 'non_existent';`,
        ),
      ).rejects.toThrow(/(permission denied|42501)/i);

      // DELETE on permissions is denied
      await expect(
        prisma.$executeRawUnsafe(
          `DELETE FROM "permissions" WHERE code = 'non_existent.perm';`,
        ),
      ).rejects.toThrow(/(permission denied|42501)/i);

      // DELETE on audit_log is denied
      await expect(
        prisma.$executeRawUnsafe(
          `DELETE FROM "audit_log" WHERE action = 'audit.read';`,
        ),
      ).rejects.toThrow(/(permission denied|42501)/i);
    });

    it('denies TRUNCATE on all tables including audit_log to hms_app', async () => {
      for (const table of Object.keys(EXPECTED_GRANT_MATRIX)) {
        await expect(
          prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}";`),
        ).rejects.toThrow(/(permission denied|42501)/i);
      }
    });

    it('denies UPDATE on join tables (role_permissions, user_roles) and audit_log to hms_app', async () => {
      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE "role_permissions" SET granted_at = now();`,
        ),
      ).rejects.toThrow(/(permission denied|42501)/i);

      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE "user_roles" SET assigned_at = now();`,
        ),
      ).rejects.toThrow(/(permission denied|42501)/i);

      await expect(
        prisma.$executeRawUnsafe(`UPDATE "audit_log" SET action = 'tampered';`),
      ).rejects.toThrow(/(permission denied|42501)/i);
    });

    it('allows DELETE on join tables (role_permissions, user_roles) and sessions to hms_app', async () => {
      // DELETE on role_permissions succeeds
      const countRP = await prisma.$executeRawUnsafe(
        `DELETE FROM "role_permissions" WHERE permission_code = 'non_existent';`,
      );
      expect(typeof countRP).toBe('number');

      // DELETE on user_roles succeeds
      const countUR = await prisma.$executeRawUnsafe(
        `DELETE FROM "user_roles" WHERE role_id = '00000000-0000-0000-0000-000000000000';`,
      );
      expect(typeof countUR).toBe('number');

      // DELETE on sessions succeeds
      const countS = await prisma.$executeRawUnsafe(
        `DELETE FROM "sessions" WHERE token_hash = 'non_existent';`,
      );
      expect(typeof countS).toBe('number');
    });

    it('allows SELECT and INSERT on audit_log to hms_app', async () => {
      // INSERT succeeds
      const inserted = await prisma.auditLog.create({
        data: {
          actorUsername: 'admin',
          action: 'auth.login_success',
          outcome: 'success',
          metadata: { ip: '127.0.0.1' },
        },
      });
      expect(inserted.id).toBeDefined();

      // SELECT succeeds
      const found = await prisma.auditLog.findUnique({
        where: { id: inserted.id },
      });
      expect(found).not.toBeNull();
      expect(found?.action).toBe('auth.login_success');
    });
  });
});
