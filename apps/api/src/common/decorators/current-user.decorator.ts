import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

export interface RequestUser {
  id: string;
  username: string;
  fullName: string;
  status: 'active' | 'disabled';
  mustChangePassword: boolean;
  roles: string[];
  permissions: string[];
  sessionId: string;
}

/**
 * Parameter decorator to extract the authenticated user from the request.
 * Usage: `@CurrentUser() user: RequestUser` or `@CurrentUser('id') userId: string`
 */
export const CurrentUser = createParamDecorator(
  (data: keyof RequestUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: RequestUser }>();
    const user = request.user;
    if (!user) {
      return undefined;
    }
    return data ? user[data] : user;
  },
);
