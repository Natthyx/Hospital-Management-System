/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';

import { seedRequired, type SeedRequiredResult } from './seed-required';

export async function runSeedCli(
  prismaClient?: PrismaClient,
): Promise<SeedRequiredResult> {
  const dbUrl = process.env.DATABASE_URL;
  const prisma =
    prismaClient ??
    new PrismaClient(
      dbUrl
        ? {
            datasources: {
              db: {
                url: dbUrl,
              },
            },
          }
        : undefined,
    );
  try {
    const result = await seedRequired(prisma);
    if (result.createdAdmin && result.generatedPassword) {
      console.log(
        `Admin user created. Temporary password: ${result.generatedPassword}`,
      );
    } else {
      console.log('Required seed up to date.');
    }
    return result;
  } catch (error) {
    console.error('Failed to run required seed:', error);
    process.exitCode = 1;
    throw error;
  } finally {
    if (!prismaClient) {
      await prisma.$disconnect();
    }
  }
}

if (require.main === module) {
  void runSeedCli().catch(() => {
    process.exit(1);
  });
}
