import { z } from 'zod';

/**
 * Health check data schema.
 * Pure Zod schema with no framework dependencies (Rule 01 & ADR-020).
 * Removed timestamp per Milestone F2 specification.
 */
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  database: z.literal('connected'),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

/**
 * Full wrapped health envelope schema.
 */
export const healthEnvelopeSchema = z.object({
  data: healthResponseSchema,
});

export type HealthEnvelope = z.infer<typeof healthEnvelopeSchema>;
