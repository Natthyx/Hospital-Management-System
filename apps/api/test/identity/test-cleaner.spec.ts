import { cleanTestDatabase } from '../utils/test-cleaner';

describe('Test Cleaner Safety Refusal', () => {
  it('hard-refuses execution if current_database() is not hms_test', async () => {
    const originalMigrationUrl = process.env.DATABASE_MIGRATION_URL;
    try {
      // Point DATABASE_MIGRATION_URL to hms_dev (or non-test db)
      process.env.DATABASE_MIGRATION_URL =
        'postgresql://hms_owner:dev_owner_pass@localhost:5432/hms_dev';

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
});
