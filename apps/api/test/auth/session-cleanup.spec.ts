import * as crypto from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { TestClock } from '../../src/common/time';
import type { PrismaService } from '../../src/database/prisma.service';
import { SessionCleanupService } from '../../src/modules/auth/session-cleanup.service';
import { cleanTestDatabase } from '../utils/test-cleaner';

describe('SessionCleanupService (ADR-029 Retention Purge)', () => {
  let prisma: PrismaClient;
  let testClock: TestClock;
  let cleanupService: SessionCleanupService;
  let testUserId: string;

  const baseTime = new Date('2026-10-02T12:00:00.000Z');
  const DAY_MS = 24 * 60 * 60 * 1000;

  beforeAll(() => {
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ??
      'postgresql://hms_app:dev_app_pass@localhost:5432/hms_test';

    prisma = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL } },
    });
    testClock = new TestClock(baseTime);

    const prismaService = prisma as unknown as PrismaService;
    cleanupService = new SessionCleanupService(prismaService, testClock);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    testClock.setTime(baseTime);
    await cleanTestDatabase({ reSeed: true });

    // Find an existing active user from seed or create one
    const user = await prisma.user.findFirstOrThrow({
      where: { username: 'admin' },
    });
    testUserId = user.id;
  });

  async function createSession(params: {
    createdAt?: Date;
    expiresAt: Date;
    revokedAt?: Date | null;
    revokedReason?: string;
  }) {
    const rawToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');
    const csrfToken = crypto.randomBytes(32).toString('base64url');

    return prisma.session.create({
      data: {
        userId: testUserId,
        tokenHash,
        csrfToken,
        createdAt: params.createdAt ?? baseTime,
        lastSeenAt: params.createdAt ?? baseTime,
        expiresAt: params.expiresAt,
        revokedAt: params.revokedAt ?? null,
        revokedReason: params.revokedReason ?? null,
      },
    });
  }

  it('purges only sessions exceeding the 30-day retention window', async () => {
    // 1. Active session (expires in future) -> Retained
    const sActive = await createSession({
      expiresAt: new Date(baseTime.getTime() + 12 * 60 * 60 * 1000),
    });

    // 2. Expired 29 days ago (within 30d retention) -> Retained
    const sExpired29 = await createSession({
      expiresAt: new Date(baseTime.getTime() - 29 * DAY_MS),
    });

    // 3. Expired 31 days ago (exceeds 30d retention) -> Purged
    const sExpired31 = await createSession({
      expiresAt: new Date(baseTime.getTime() - 31 * DAY_MS),
    });

    // 4. Revoked 29 days ago (within 30d retention) -> Retained
    const sRevoked29 = await createSession({
      expiresAt: new Date(baseTime.getTime() + 12 * 60 * 60 * 1000),
      revokedAt: new Date(baseTime.getTime() - 29 * DAY_MS),
      revokedReason: 'user_logout',
    });

    // 5. Revoked 31 days ago (exceeds 30d retention) -> Purged
    const sRevoked31 = await createSession({
      expiresAt: new Date(baseTime.getTime() + 12 * 60 * 60 * 1000),
      revokedAt: new Date(baseTime.getTime() - 31 * DAY_MS),
      revokedReason: 'password_changed',
    });

    // 6. Both expired 31d and revoked 31d ago -> Purged
    const sBoth31 = await createSession({
      expiresAt: new Date(baseTime.getTime() - 31 * DAY_MS),
      revokedAt: new Date(baseTime.getTime() - 31 * DAY_MS),
      revokedReason: 'admin_revocation',
    });

    const purgedCount = await cleanupService.cleanupExpiredSessions();
    expect(purgedCount).toBe(3); // sExpired31, sRevoked31, sBoth31

    // Verify surviving sessions
    const surviving = await prisma.session.findMany({
      select: { id: true },
    });
    const survivingIds = new Set(surviving.map((s) => s.id));

    expect(survivingIds.has(sActive.id)).toBe(true);
    expect(survivingIds.has(sExpired29.id)).toBe(true);
    expect(survivingIds.has(sRevoked29.id)).toBe(true);

    // Verify purged sessions are gone
    expect(survivingIds.has(sExpired31.id)).toBe(false);
    expect(survivingIds.has(sRevoked31.id)).toBe(false);
    expect(survivingIds.has(sBoth31.id)).toBe(false);
  });

  it('purges retained sessions once TestClock is advanced past 30 days', async () => {
    // Session expired 10 days ago (retained at baseTime)
    const session = await createSession({
      expiresAt: new Date(baseTime.getTime() - 10 * DAY_MS),
    });

    // At baseTime: not purged
    let purged = await cleanupService.cleanupExpiredSessions();
    expect(purged).toBe(0);

    const check1 = await prisma.session.findUnique({
      where: { id: session.id },
    });
    expect(check1).not.toBeNull();

    // Advance clock by 25 days (now expired 35 days ago relative to clock)
    testClock.advance(25 * DAY_MS);

    purged = await cleanupService.cleanupExpiredSessions();
    expect(purged).toBe(1);

    const check2 = await prisma.session.findUnique({
      where: { id: session.id },
    });
    expect(check2).toBeNull();
  });

  it('handleCron() skips execution in test environment (NODE_ENV=test)', async () => {
    // Session expired 35 days ago
    const session = await createSession({
      expiresAt: new Date(baseTime.getTime() - 35 * DAY_MS),
    });

    // Calling handleCron directly in test environment must no-op
    await cleanupService.handleCron();

    // Session is still present because handleCron returns early in test mode
    const check = await prisma.session.findUnique({
      where: { id: session.id },
    });
    expect(check).not.toBeNull();

    // Direct invocation cleans it up
    await cleanupService.cleanupExpiredSessions();
    const checkAfter = await prisma.session.findUnique({
      where: { id: session.id },
    });
    expect(checkAfter).toBeNull();
  });
});
