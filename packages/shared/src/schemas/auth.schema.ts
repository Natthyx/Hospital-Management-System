import { z } from 'zod';

import { USER_STATUSES } from '../identity';

/**
 * Snapshot of the currently authenticated user.
 */
export const currentUserSchema = z
  .object({
    id: z.uuid(),
    username: z.string().min(1).max(64),
    fullName: z.string().min(1),
    status: z.enum(USER_STATUSES),
    mustChangePassword: z.boolean(),
    roles: z.array(z.string()),
  })
  .strict();

export type CurrentUser = z.infer<typeof currentUserSchema>;

/**
 * 1. POST /api/v1/auth/login request and response
 * Accepts username up to 64 chars; password up to 256 chars.
 * Does not reject invalid username format with 400 to avoid probing.
 */
export const loginRequestSchema = z
  .object({
    username: z.string().min(1, 'Username is required').max(64),
    password: z.string().min(1, 'Password is required').max(256),
  })
  .strict();

export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const loginResponseDataSchema = z
  .object({
    user: currentUserSchema,
    permissions: z.array(z.string()),
    csrfToken: z.string().min(1),
  })
  .strict();

export type LoginResponseData = z.infer<typeof loginResponseDataSchema>;

export const loginResponseSchema = z
  .object({
    data: loginResponseDataSchema,
  })
  .strict();

export type LoginResponse = z.infer<typeof loginResponseSchema>;

/**
 * 2. POST /api/v1/auth/logout response
 */
export const logoutResponseSchema = z
  .object({
    data: z
      .object({
        success: z.literal(true),
      })
      .strict(),
  })
  .strict();

export type LogoutResponse = z.infer<typeof logoutResponseSchema>;

/**
 * 3. GET /api/v1/auth/me response
 */
export const meResponseDataSchema = z
  .object({
    user: currentUserSchema,
    permissions: z.array(z.string()),
    csrfToken: z.string().min(1),
    mustChangePassword: z.boolean(),
  })
  .strict();

export type MeResponseData = z.infer<typeof meResponseDataSchema>;

export const meResponseSchema = z
  .object({
    data: meResponseDataSchema,
  })
  .strict();

export type MeResponse = z.infer<typeof meResponseSchema>;

/**
 * 4. POST /api/v1/auth/change-password request and response
 */
export const changePasswordRequestSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required').max(256),
    newPassword: z
      .string()
      .min(10, 'Password must be at least 10 characters long')
      .max(128, 'Password must not exceed 128 characters'),
  })
  .strict();

export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

export const changePasswordResponseSchema = z
  .object({
    data: z
      .object({
        success: z.literal(true),
        csrfToken: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export type ChangePasswordResponse = z.infer<
  typeof changePasswordResponseSchema
>;

/**
 * 5. GET /api/v1/auth/sessions summary item and list response
 */
export const sessionSummarySchema = z
  .object({
    id: z.uuid(),
    ip: z.string().nullable(),
    userAgent: z.string().nullable(),
    createdAt: z.iso.datetime(),
    lastSeenAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    isCurrent: z.boolean(),
  })
  .strict();

export type SessionSummary = z.infer<typeof sessionSummarySchema>;

export const sessionsListResponseSchema = z
  .object({
    data: z.array(sessionSummarySchema),
  })
  .strict();

export type SessionsListResponse = z.infer<typeof sessionsListResponseSchema>;

/**
 * 6. DELETE /api/v1/auth/sessions/:id params and response
 */
export const sessionIdParamSchema = z
  .object({
    id: z.uuid(),
  })
  .strict();

export type SessionIdParam = z.infer<typeof sessionIdParamSchema>;

export const revokeSessionResponseSchema = z
  .object({
    data: z
      .object({
        success: z.literal(true),
      })
      .strict(),
  })
  .strict();

export type RevokeSessionResponse = z.infer<typeof revokeSessionResponseSchema>;
