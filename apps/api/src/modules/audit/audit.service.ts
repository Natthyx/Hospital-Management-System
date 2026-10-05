import { randomUUID } from 'node:crypto';

import { AUDIT_ACTIONS, type AuditAction } from '@hms/shared';
import { Injectable, Inject, Logger } from '@nestjs/common';
import { Prisma, type AuditLog } from '@prisma/client';

import { RequestContextService } from '../../common/context/request-context.service';
import { CLOCK, type Clock } from '../../common/time/clock';
import { PrismaService } from '../../database/prisma.service';

import { AuditWriteError } from './audit-errors';
import type { AuditEvent, AuditRecorder } from './audit-recorder.interface';
import { sanitizeMetadata, sanitizePayloadState } from './audit-redaction';

@Injectable()
export class AuditService implements AuditRecorder {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK)
    private readonly clock: Clock,
    private readonly requestContextService: RequestContextService,
  ) {}

  async record(
    event: AuditEvent,
    tx?: Prisma.TransactionClient,
  ): Promise<AuditLog> {
    // 1. Runtime validation: reject actions outside canonical catalog (Correction P)
    if (!AUDIT_ACTIONS.includes(event.action as AuditAction)) {
      throw new Error(
        `Invalid audit action: "${event.action}" is not recognized in canonical AUDIT_ACTIONS catalog`,
      );
    }

    // 2. Correlate with active AsyncLocalStorage request context (Correction F)
    const als = this.requestContextService.getStore();

    const requestId = event.requestId ?? als?.requestId ?? randomUUID();
    const ip = event.ip !== undefined ? event.ip : (als?.ip ?? null);
    const userAgent =
      event.userAgent !== undefined
        ? event.userAgent
        : (als?.userAgent ?? null);

    const actorUserId =
      event.actorUserId !== undefined
        ? event.actorUserId
        : (als?.actorUserId ?? null);

    const actorUsername =
      event.actorUsername ?? als?.actorUsername ?? 'system:unknown';

    const sessionId =
      event.sessionId !== undefined
        ? event.sessionId
        : (als?.sessionId ?? null);
    const patientId = event.patientId ?? null;

    const entityType = event.entityType ?? null;
    const entityId = event.entityId ?? null;

    // 3. Payload sanitization & size limit enforcement (Correction G)
    const metadata = sanitizeMetadata(event.metadata);
    const before = sanitizePayloadState(event.before);
    const after = sanitizePayloadState(event.after);

    // 4. Injected deterministic clock timestamp (Correction P)
    const occurredAt = this.clock.now();

    const client = tx ?? this.prisma;

    try {
      return await client.auditLog.create({
        data: {
          action: event.action,
          outcome: event.outcome,
          occurredAt,
          actorUserId,
          actorUsername,
          sessionId,
          patientId,
          entityType,
          entityId,
          before: (before ?? Prisma.JsonNull) as
            Prisma.InputJsonObject | Prisma.NullableJsonNullValueInput,
          after: (after ?? Prisma.JsonNull) as
            Prisma.InputJsonObject | Prisma.NullableJsonNullValueInput,
          metadata: metadata as Prisma.InputJsonObject,
          requestId,
          ip,
          userAgent,
        },
      });
    } catch (err: unknown) {
      // Security & Safety: Wrap Prisma error to strip failing row and expose only errorClass and sqlState
      const auditWriteError = new AuditWriteError(err);

      this.logger.error(
        `Audit write failed for action "${event.action}": ${auditWriteError.message}`,
      );

      // Patient safety rule: If the audit write fails, the business operation MUST fail!
      throw auditWriteError;
    }
  }
}
