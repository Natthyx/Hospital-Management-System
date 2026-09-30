import {
  UnauthorizedException,
  ForbiddenException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { DefaultDenyGuard } from './default-deny.guard';

describe('DefaultDenyGuard', () => {
  let guard: DefaultDenyGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new DefaultDenyGuard(reflector);
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

  it('fails closed (403) when endpoint lacks both @Public() and @RequirePermission()', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    const context = createMockContext({ permissions: [] });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context)).toThrow(
      'Access denied: endpoint has no public or permission declaration',
    );
  });

  it('rejects with 401 Unauthorized when non-public endpoint accessed without user session', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === 'isPublic') return undefined;
      if (key === 'permissions') return ['users.read'];
      return undefined;
    });

    const context = createMockContext(undefined);
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(context)).toThrow('Authentication required');
  });

  it('rejects with 403 Forbidden when user lacks required permission', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === 'isPublic') return undefined;
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
      if (key === 'isPublic') return undefined;
      if (key === 'permissions') return ['users.read', 'users.create'];
      return undefined;
    });

    const context = createMockContext({
      permissions: ['users.read', 'users.create', 'audit.read'],
    });
    expect(guard.canActivate(context)).toBe(true);
  });
});
