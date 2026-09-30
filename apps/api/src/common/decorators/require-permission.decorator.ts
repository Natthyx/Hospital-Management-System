import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key for permissions required to access an endpoint.
 */
export const PERMISSIONS_KEY = 'permissions';

/**
 * Declare permissions required to access an endpoint.
 * Every endpoint MUST declare either @Public() or @RequirePermission(...).
 * Default is deny: endpoints without either decorator will fail closed.
 */
export const RequirePermission = (
  ...permissions: string[]
): ReturnType<typeof SetMetadata> => SetMetadata(PERMISSIONS_KEY, permissions);
