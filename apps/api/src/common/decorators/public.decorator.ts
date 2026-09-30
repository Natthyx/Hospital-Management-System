import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key for the @Public() decorator.
 * Routes marked @Public() bypass the default-deny guard.
 */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Mark a route as publicly accessible (no authentication required).
 * Every route MUST be decorated with @Public() or @RequirePermission(...).
 */
export const Public = (): ReturnType<typeof SetMetadata> =>
  SetMetadata(IS_PUBLIC_KEY, true);
