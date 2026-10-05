import { z } from 'zod';

import { AUDIT_ACTIONS, AUDIT_CATEGORIES, AUDIT_OUTCOMES } from '../audit';

/**
 * ISO 8601 string with timezone offset (e.g. 2026-10-02T20:00:00Z or +03:00)
 */
const ISO_DATETIME_OFFSET_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export const auditDetailParamsSchema = z
  .object({
    id: z
      .string()
      .regex(
        /^[0-9]{1,19}$/,
        'Audit entry ID must be a numeric string up to 19 digits',
      ),
  })
  .strict();
export type AuditDetailParams = z.infer<typeof auditDetailParamsSchema>;

export const auditListQuerySchema = z
  .object({
    from: z
      .string()
      .regex(
        ISO_DATETIME_OFFSET_REGEX,
        'from must be an ISO 8601 timestamp with timezone offset',
      )
      .optional(),
    to: z
      .string()
      .regex(
        ISO_DATETIME_OFFSET_REGEX,
        'to must be an ISO 8601 timestamp with timezone offset',
      )
      .optional(),
    actorUserId: z.uuid().optional(),
    action: z.enum(AUDIT_ACTIONS).optional(),
    category: z.enum(AUDIT_CATEGORIES).optional(),
    entityType: z.string().min(1).max(100).optional(),
    entityId: z.string().min(1).max(100).optional(),
    patientId: z.uuid().optional(),
    outcome: z.enum(AUDIT_OUTCOMES).optional(),
    requestId: z.string().min(1).max(100).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict()
  .superRefine((data, ctx) => {
    // 1. Capped query: page * pageSize cannot exceed 10,000
    if (data.page * data.pageSize > 10000) {
      ctx.addIssue({
        code: 'custom',
        message:
          'page * pageSize cannot exceed 10,000; please apply narrower filters',
        path: ['page'],
      });
    }

    // 2. Validate from / to logic if both are provided
    if (data.from && data.to) {
      const fromTime = new Date(data.from).getTime();
      const toTime = new Date(data.to).getTime();

      if (Number.isNaN(fromTime)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Invalid from timestamp',
          path: ['from'],
        });
        return;
      }

      if (Number.isNaN(toTime)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Invalid to timestamp',
          path: ['to'],
        });
        return;
      }

      if (fromTime >= toTime) {
        ctx.addIssue({
          code: 'custom',
          message: 'from timestamp must be strictly earlier than to timestamp',
          path: ['from'],
        });
        return;
      }

      // Reject far-future dates (allow up to 5 minutes clock skew)
      const maxFutureTime = Date.now() + 5 * 60 * 1000;
      if (toTime > maxFutureTime) {
        ctx.addIssue({
          code: 'custom',
          message: 'to timestamp cannot be in the future',
          path: ['to'],
        });
        return;
      }

      // Max window enforcement: 90 days unfiltered, 400 days with targeted filter
      const diffMs = toTime - fromTime;
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      const hasSpecificTarget = Boolean(
        data.patientId ?? data.actorUserId ?? data.entityId ?? data.requestId,
      );
      const maxDays = hasSpecificTarget ? 400 : 90;

      if (diffDays > maxDays) {
        ctx.addIssue({
          code: 'custom',
          message: `Date range exceeds maximum allowed window (${String(maxDays)} days${hasSpecificTarget ? ' with targeted filter' : ' for unfiltered queries'})`,
          path: ['to'],
        });
      }
    }
  });

export type AuditListQuery = z.infer<typeof auditListQuerySchema>;

export const auditLogItemSchema = z
  .object({
    id: z.string(),
    occurredAt: z.string(),
    actorUserId: z.string().nullable(),
    actorUsername: z.string().nullable(),
    action: z.enum(AUDIT_ACTIONS),
    outcome: z.enum(AUDIT_OUTCOMES),
    entityType: z.string().nullable(),
    entityId: z.string().nullable(),
    patientId: z.string().nullable(),
    metadata: z.record(z.string(), z.unknown()),
    ip: z.string().nullable(),
    userAgent: z.string().nullable(),
    sessionId: z.string().nullable(),
    requestId: z.string().nullable(),
  })
  .strict();
export type AuditLogItem = z.infer<typeof auditLogItemSchema>;

export const auditLogDetailSchema = auditLogItemSchema
  .extend({
    before: z.record(z.string(), z.unknown()).nullable(),
    after: z.record(z.string(), z.unknown()).nullable(),
  })
  .strict();
export type AuditLogDetail = z.infer<typeof auditLogDetailSchema>;

export const auditListResponseDataSchema = z
  .object({
    items: z.array(auditLogItemSchema),
    total: z.number().int().nonnegative(),
    totalCapped: z.boolean(),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
  })
  .strict();
export type AuditListResponseData = z.infer<typeof auditListResponseDataSchema>;

export const auditListResponseSchema = z
  .object({
    data: auditListResponseDataSchema,
  })
  .strict();
export type AuditListResponse = z.infer<typeof auditListResponseSchema>;

export const auditDetailResponseSchema = z
  .object({
    data: auditLogDetailSchema,
  })
  .strict();
export type AuditDetailResponse = z.infer<typeof auditDetailResponseSchema>;
