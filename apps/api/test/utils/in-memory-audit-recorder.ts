import { Injectable, Logger } from '@nestjs/common';
import type { Prisma, AuditLog } from '@prisma/client';

import type {
  AuditEvent,
  AuditRecorder,
} from '../../src/modules/audit/audit-recorder.interface';

/**
 * InMemoryAuditRecorder is retained ONLY as an isolated test utility.
 * The production application uses AuditService.
 */
@Injectable()
export class InMemoryAuditRecorder implements AuditRecorder {
  private readonly logger = new Logger(InMemoryAuditRecorder.name);
  private readonly events: AuditEvent[] = [];

  record(event: AuditEvent, _tx?: Prisma.TransactionClient): Promise<AuditLog> {
    this.events.push(event);
    this.logger.debug(
      `[Audit Hook] ${event.action} - outcome: ${event.outcome} - actor: ${event.actorUsername ?? 'anonymous'}`,
    );

    const logEntry: AuditLog = {
      id: BigInt(this.events.length),
      occurredAt: new Date(),
      action: event.action,
      outcome: event.outcome,
      actorUserId: event.actorUserId ?? null,
      actorUsername: event.actorUsername ?? 'system:unknown',
      sessionId: event.sessionId ?? null,
      patientId: event.patientId ?? null,
      entityType: event.entityType ?? null,
      entityId: event.entityId ?? null,
      before: event.before ?? null,
      after: event.after ?? null,
      metadata: (event.metadata ?? {}) as Prisma.JsonValue,
      requestId: event.requestId ?? 'test-req',
      ip: event.ip ?? null,
      userAgent: event.userAgent ?? null,
    };

    return Promise.resolve(logEntry);
  }

  getEvents(): AuditEvent[] {
    return [...this.events];
  }

  clear(): void {
    this.events.length = 0;
  }
}
