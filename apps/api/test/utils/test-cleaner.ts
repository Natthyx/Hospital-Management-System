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
 * 2. Truncates all identity tables via CASCADE.
 * 3. Restores initial required seed state using hms_app.
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
    // 1. Verify active connection database name
    const result = await ownerPrisma.$queryRaw<
      { current_database: string }[]
    >`SELECT current_database();`;

    const currentDb = result[0]?.current_database;
    if (currentDb !== 'hms_test') {
      throw new Error(
        `CRITICAL SAFETY REFUSAL: cleanTestDatabase only allowed on database 'hms_test' (current database: '${String(currentDb)}')`,
      );
    }

    // 2. Truncate tables with CASCADE
    await ownerPrisma.$executeRawUnsafe(`
      TRUNCATE TABLE "sessions", "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE;
    `);

    // 3. Re-seed required data if requested
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
