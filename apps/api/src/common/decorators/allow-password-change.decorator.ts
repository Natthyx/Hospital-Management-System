import { SetMetadata, type CustomDecorator } from '@nestjs/common';

export const ALLOW_PASSWORD_CHANGE_KEY = 'allow_password_change';

/**
 * Decorator that marks an endpoint as accessible even when `must_change_password` is true.
 * Used on /auth/me, /auth/change-password, and /auth/logout.
 */
export const AllowPasswordChange = (): CustomDecorator =>
  SetMetadata(ALLOW_PASSWORD_CHANGE_KEY, true);
