import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { CLOCK, type Clock } from '../../common/time';
import { PrismaService } from '../../database/prisma.service';

/**
 * Retention period for expired and revoked sessions: 30 days.
 * (ADR-029: 30-day retention window for security investigation, after which
 * sessions are purged to prevent unbounded table growth).
 */
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class SessionCleanupService {
  private readonly logger = new Logger(SessionCleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Hourly scheduled cron job to purge sessions past the 30-day retention window.
   * In test environment, cron execution is bypassed so tests control execution
   * deterministically via direct invocation of cleanupExpiredSessions().
   */
  @Cron('0 * * * *')
  async handleCron(): Promise<void> {
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    try {
      const purged = await this.cleanupExpiredSessions();
      if (purged > 0) {
        this.logger.log(
          `Session cleanup purged ${String(purged)} session(s) older than 30 days`,
        );
      }
    } catch (err) {
      this.logger.error(
        'Failed to execute scheduled session cleanup',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  /**
   * Deletes sessions where:
   * 1. expires_at < (now - 30 days), OR
   * 2. (revoked_at IS NOT NULL AND revoked_at < (now - 30 days))
   *
   * @returns number of deleted session records
   */
  async cleanupExpiredSessions(): Promise<number> {
    const now = this.clock.now();
    const cutoff = new Date(now.getTime() - RETENTION_MS);

    const result = await this.prisma.session.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: cutoff } },
          {
            revokedAt: {
              not: null,
              lt: cutoff,
            },
          },
        ],
      },
    });

    return result.count;
  }
}
