import {
  UnauthorizedException,
  ForbiddenException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { IS_AUTHENTICATED_KEY } from '../decorators/authenticated.decorator';

import { PermissionGuard } from './permission.guard';

describe('PermissionGuard', () => {
  let guard: PermissionGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new PermissionGuard(reflector);
  });

  const createMockContext = (user?: {
    permissions?: string[];
  }): ExecutionContext => {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as unknown as ExecutionContext;
  };

  it('allows access if route is marked @Public()', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === 'isPublic') return true;
      return undefined;
    });

    const context = createMockContext();
    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects with 401 when non-public endpoint accessed without user', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    const context = createMockContext(undefined);
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(context)).toThrow('Authentication required');
  });

  it('allows access if route is marked @Authenticated() and user is present', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === IS_AUTHENTICATED_KEY) return true;
      return undefined;
    });

    const context = createMockContext({ permissions: [] });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('fails closed (403) when endpoint lacks @Public(), @Authenticated(), and @RequirePermission()', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    const context = createMockContext({ permissions: [] });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context)).toThrow(
      'Access denied: endpoint has no public or permission declaration',
    );
  });

  it('rejects with 403 Forbidden when user lacks required permission', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === 'permissions') return ['users.read'];
      return undefined;
    });

    const context = createMockContext({ permissions: ['other.permission'] });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context)).toThrow(
      'Insufficient permissions',
    );
  });

  it('allows access when user possesses all declared permissions', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === 'permissions') return ['users.read', 'users.create'];
      return undefined;
    });

    const context = createMockContext({
      permissions: ['users.read', 'users.create', 'audit.read'],
    });
    expect(guard.canActivate(context)).toBe(true);
  });
});
