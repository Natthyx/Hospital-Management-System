import { z } from 'zod';

/**
 * Standard error response envelope schema (Rule 01).
 * Every error response from the HMS API must adhere to this shape.
 */
export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string(),
  }),
});

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
