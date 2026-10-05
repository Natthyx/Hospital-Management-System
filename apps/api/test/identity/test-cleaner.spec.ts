import { cleanTestDatabase } from '../utils/test-cleaner';

describe('Test Cleaner Safety Refusal', () => {
  it('hard-refuses execution if current_database() is not hms_test', async () => {
    const originalMigrationUrl = process.env.DATABASE_MIGRATION_URL;
    if (!originalMigrationUrl) {
      throw new Error('DATABASE_MIGRATION_URL is required for this test');
    }
    try {
      // Point DATABASE_MIGRATION_URL to a non-test database using the active credentials and host
      const nonTestUrl = new URL(originalMigrationUrl);
      nonTestUrl.pathname = '/hms_test_shadow';
      process.env.DATABASE_MIGRATION_URL = nonTestUrl.toString();

      await expect(cleanTestDatabase()).rejects.toThrow(
        /CRITICAL SAFETY REFUSAL: cleanTestDatabase only allowed on database 'hms_test'/,
      );
    } finally {
      process.env.DATABASE_MIGRATION_URL = originalMigrationUrl;
    }
  });

  it('succeeds and resets data cleanly when connected to hms_test', async () => {
    const result = await cleanTestDatabase({ reSeed: true });
    expect(result).toBeDefined();
    expect(result?.createdAdmin).toBe(true);
  });

  it('guarantees audit_log immutability triggers remain strictly enabled after cleaning', async () => {
    await cleanTestDatabase();

    const ownerUrl = process.env.DATABASE_MIGRATION_URL;
    if (!ownerUrl) {
      throw new Error('DATABASE_MIGRATION_URL is required');
    }
    const { PrismaClient } = await import('@prisma/client');
    const ownerPrisma = new PrismaClient({
      datasources: { db: { url: ownerUrl } },
    });

    try {
      const triggers = await ownerPrisma.$queryRaw<
        { tgname: string; tgenabled: string }[]
      >`
        SELECT tgname, tgenabled
        FROM pg_trigger
        WHERE tgrelid = 'public.audit_log'::regclass
          AND tgname IN ('audit_log_reject_update_delete', 'audit_log_reject_truncate')
        ORDER BY tgname ASC;
      `;

      expect(triggers.length).toBe(2);
      // In PostgreSQL, 'O' denotes "origin and local" (enabled)
      for (const trg of triggers) {
        expect(trg.tgenabled).toBe('O');
      }
    } finally {
      await ownerPrisma.$disconnect();
    }
  });
});
