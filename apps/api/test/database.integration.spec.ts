import { PrismaClient } from '@prisma/client';

describe('Database Integration (hms_app role)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    const testDbUrl =
      process.env.DATABASE_URL ??
      'postgresql://hms_app:dev_app_pass@localhost:5432/hms_test';

    prisma = new PrismaClient({
      datasources: {
        db: {
          url: testDbUrl,
        },
      },
    });

    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('connects to PostgreSQL and executes SELECT 1', async () => {
    const result = await prisma.$queryRaw<
      { connected: number }[]
    >`SELECT 1 as connected`;
    expect(result).toHaveLength(1);
    expect(result[0]?.connected).toBe(1);
  });

  it('can use pg_trgm extension function similarity', async () => {
    const result = await prisma.$queryRaw<
      { sim: number }[]
    >`SELECT similarity('hospital'::text, 'hosp'::text) as sim`;
    expect(result).toHaveLength(1);
    expect(result[0]?.sim).toBeGreaterThan(0);
  });

  it('can use unaccent extension function', async () => {
    const result = await prisma.$queryRaw<
      { clean: string }[]
    >`SELECT unaccent('Hôtel'::text) as clean`;
    expect(result).toHaveLength(1);
    expect(result[0]?.clean).toBe('Hotel');
  });

  it('fails with permission denied when hms_app attempts DDL (CREATE TABLE)', async () => {
    await expect(
      prisma.$executeRawUnsafe(
        'CREATE TABLE test_forbidden (id serial primary key)',
      ),
    ).rejects.toThrow();
  });
});
