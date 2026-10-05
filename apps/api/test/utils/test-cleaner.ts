import { PrismaClient } from '@prisma/client';

import {
  seedRequired,
  type SeedRequiredResult,
} from '../../src/database/seeds/seed-required';

/**
 * Test cleaner helper that runs as hms_owner against hms_test.
 *
 * Invariants:
 * 1. Hard-refuses to execute unless SELECT current_database() returns exactly 'hms_test'.
 * 2. Runs cleanup in ONE owner transaction.
 * 3. Temporarily disables audit_log immutability triggers during truncation and re-enables them.
 *    If the transaction fails, PostgreSQL rolls back and triggers remain enabled.
 * 4. Truncates all tables via CASCADE.
 * 5. Restores initial required seed state using hms_app.
 */
export async function cleanTestDatabase(
  options: { reSeed?: boolean } = { reSeed: true },
): Promise<SeedRequiredResult | null> {
  const ownerUrl = process.env.DATABASE_MIGRATION_URL;
  if (!ownerUrl) {
    throw new Error('cleanTestDatabase: DATABASE_MIGRATION_URL is missing');
  }

  const ownerPrisma = new PrismaClient({
    datasources: { db: { url: ownerUrl } },
  });

  try {
    // Perform cleanup in ONE owner transaction
    await ownerPrisma.$transaction(async (tx) => {
      // 1. Verify active connection database name
      const result = await tx.$queryRaw<
        { current_database: string }[]
      >`SELECT current_database();`;

      const currentDb = result[0]?.current_database;
      if (currentDb !== 'hms_test') {
        throw new Error(
          `CRITICAL SAFETY REFUSAL: cleanTestDatabase only allowed on database 'hms_test' (current database: '${String(currentDb)}')`,
        );
      }

      // 2. Temporarily disable audit immutability triggers for truncation
      await tx.$executeRawUnsafe(
        `ALTER TABLE "audit_log" DISABLE TRIGGER "audit_log_reject_update_delete";`,
      );
      await tx.$executeRawUnsafe(
        `ALTER TABLE "audit_log" DISABLE TRIGGER "audit_log_reject_truncate";`,
      );

      try {
        // 3. Truncate tables with CASCADE
        await tx.$executeRawUnsafe(`
          TRUNCATE TABLE "audit_log", "sessions", "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE;
        `);
      } finally {
        // 4. Re-enable audit immutability triggers
        await tx.$executeRawUnsafe(
          `ALTER TABLE "audit_log" ENABLE TRIGGER "audit_log_reject_update_delete";`,
        );
        await tx.$executeRawUnsafe(
          `ALTER TABLE "audit_log" ENABLE TRIGGER "audit_log_reject_truncate";`,
        );
      }
    });

    // 5. Re-seed required data if requested (uses hms_app)
    if (options.reSeed) {
      const appUrl = process.env.DATABASE_URL;
      const appPrisma = new PrismaClient(
        appUrl ? { datasources: { db: { url: appUrl } } } : undefined,
      );
      try {
        return await seedRequired(appPrisma);
      } finally {
        await appPrisma.$disconnect();
      }
    }

    return null;
  } finally {
    await ownerPrisma.$disconnect();
  }
}
