import type { Prisma, AuditLog } from '@prisma/client';

export interface AuditEvent {
  action: string;
  outcome: 'success' | 'denied' | 'failure';
  actorUserId?: string | null;
  actorUsername?: string | null;
  patientId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
  sessionId?: string | null;
  requestId?: string | null | undefined;
}

export interface AuditRecorder {
  record(event: AuditEvent, tx?: Prisma.TransactionClient): Promise<AuditLog>;
}

export const AUDIT_RECORDER = 'AUDIT_RECORDER';
