import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import type { AuditEvent, AuditRecorder } from './audit-recorder.interface';

@Injectable()
export class InMemoryAuditRecorder implements AuditRecorder {
  private readonly logger = new Logger(InMemoryAuditRecorder.name);
  private events: AuditEvent[] = [];

  record(event: AuditEvent, _tx?: Prisma.TransactionClient): Promise<void> {
    this.events.push({ ...event });
    this.logger.debug(
      `[Audit Hook] ${event.action} - outcome: ${event.outcome} - actor: ${event.actorUsername ?? 'unknown'}`,
    );
    return Promise.resolve();
  }

  getEvents(): readonly AuditEvent[] {
    return this.events;
  }

  clear(): void {
    this.events = [];
  }
}
