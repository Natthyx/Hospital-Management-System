import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import type { EnvConfig } from '../../config';

import { OriginGuard } from './origin.guard';

describe('OriginGuard', () => {
  let guard: OriginGuard;
  const mockEnv = {
    APP_ORIGIN: 'http://localhost:3000',
  } as EnvConfig;

  beforeEach(() => {
    guard = new OriginGuard(mockEnv);
  });

  const createMockContext = (
    method: string,
    headers: Record<string, string | undefined> = {},
  ): ExecutionContext => {
    const req = {
      method,
      headers,
    } as unknown as Request;

    return {
      switchToHttp: () => ({
        getRequest: () => req,
      }),
    } as unknown as ExecutionContext;
  };

  it('allows safe methods (GET, HEAD, OPTIONS) without Origin or Referer', () => {
    expect(guard.canActivate(createMockContext('GET'))).toBe(true);
    expect(guard.canActivate(createMockContext('HEAD'))).toBe(true);
    expect(guard.canActivate(createMockContext('OPTIONS'))).toBe(true);
  });

  it('allows state-changing method when Origin matches APP_ORIGIN', () => {
    const context = createMockContext('POST', {
      origin: 'http://localhost:3000',
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects state-changing method when Origin does not match APP_ORIGIN', () => {
    const context = createMockContext('POST', {
      origin: 'http://attacker.com',
    });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context)).toThrow(
      'Invalid or missing origin header',
    );
  });

  it('allows state-changing method when Origin is missing but Referer matches APP_ORIGIN', () => {
    const context = createMockContext('POST', {
      referer: 'http://localhost:3000/login?redirect=true',
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows state-changing method when Origin is "null" and Referer matches APP_ORIGIN', () => {
    const context = createMockContext('POST', {
      origin: 'null',
      referer: 'http://localhost:3000/settings',
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects state-changing method when Origin is "null" and Referer is missing or invalid', () => {
    const context = createMockContext('POST', {
      origin: 'null',
    });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);

    const contextMismatched = createMockContext('POST', {
      origin: 'null',
      referer: 'http://evil.com/page',
    });
    expect(() => guard.canActivate(contextMismatched)).toThrow(
      ForbiddenException,
    );
  });

  it('rejects state-changing method when both Origin and Referer are missing', () => {
    const context = createMockContext('POST', {});
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context)).toThrow(
      'Invalid or missing origin header',
    );
  });

  it('rejects state-changing method when Referer is malformed URL', () => {
    const context = createMockContext('POST', {
      referer: 'not-a-valid-url',
    });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
