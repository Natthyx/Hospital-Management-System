import { SetMetadata, type CustomDecorator } from '@nestjs/common';

export const IS_AUTHENTICATED_KEY = 'is_authenticated';

/**
 * Decorator that marks an endpoint as requiring valid authentication,
 * but no specific role or permission (pure user identity).
 * See Milestone F4 spec & PermissionGuard.
 */
export const Authenticated = (): CustomDecorator =>
  SetMetadata(IS_AUTHENTICATED_KEY, true);
