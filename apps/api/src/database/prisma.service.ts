import {
  Injectable,
  Inject,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { ENV_CONFIG } from '../config';
import type { EnvConfig } from '../config';

/**
 * PrismaService wraps PrismaClient with NestJS lifecycle hooks.
 *
 * Connects via DATABASE_URL (hms_app, least-privilege role).
 * Prisma log levels restricted to warn/error to avoid leaking query data.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(@Inject(ENV_CONFIG) envConfig: EnvConfig) {
    super({
      datasources: {
        db: {
          url: envConfig.DATABASE_URL,
        },
      },
      log: [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    });

    this.$on('warn' as never, (e: unknown) => {
      const event = e as { message: string };
      this.logger.warn(event.message);
    });

    this.$on('error' as never, (e: unknown) => {
      const event = e as { message: string };
      this.logger.error(event.message);
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Database connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Database disconnected');
  }

  /**
   * Check database connectivity. Returns true if reachable.
   */
  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
