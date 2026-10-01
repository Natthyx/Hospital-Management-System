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
});
