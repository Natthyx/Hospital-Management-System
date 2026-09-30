import {
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
  ServiceUnavailableException,
  Logger,
  type ArgumentsHost,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodValidationException } from 'nestjs-zod';
import { z } from 'zod';

import { AllExceptionsFilter } from './all-exceptions.filter';

interface CapturedErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: { path: string }[];
    requestId: string;
  };
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const createMockHost = (
    reqHeaders: Record<string, string> = {},
  ): {
    host: ArgumentsHost;
    statusMock: jest.Mock;
    jsonMock: jest.Mock;
    setHeaderMock: jest.Mock;
  } => {
    const jsonMock = jest.fn();
    const statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    const getHeaderMock = jest.fn();
    const setHeaderMock = jest.fn();

    const response = {
      status: statusMock,
      getHeader: getHeaderMock,
      setHeader: setHeaderMock,
    } as unknown as Response;

    const request = {
      headers: reqHeaders,
      method: 'GET',
      url: '/api/v1/test',
    } as unknown as Request;

    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    } as unknown as ArgumentsHost;

    return { host, statusMock, jsonMock, setHeaderMock };
  };

  it('formats NotFoundException with NOT_FOUND code and requestId', () => {
    const { host, statusMock, jsonMock } = createMockHost();
    const exception = new NotFoundException('Resource missing');

    filter.catch(exception, host);

    expect(statusMock).toHaveBeenCalledWith(404);
    const calls = jsonMock.mock.calls as unknown[][];
    const payload = calls[0]?.[0] as CapturedErrorEnvelope;
    expect(payload.error.code).toBe('NOT_FOUND');
    expect(payload.error.message).toBe('Resource missing');
    expect(typeof payload.error.requestId).toBe('string');
    expect(payload.error.requestId.length).toBeGreaterThan(0);
  });

  it('formats UnauthorizedException with UNAUTHENTICATED code and requestId', () => {
    const { host, statusMock, jsonMock } = createMockHost();
    const exception = new UnauthorizedException('Please login');

    filter.catch(exception, host);

    expect(statusMock).toHaveBeenCalledWith(401);
    const calls = jsonMock.mock.calls as unknown[][];
    const payload = calls[0]?.[0] as CapturedErrorEnvelope;
    expect(payload.error.code).toBe('UNAUTHENTICATED');
    expect(payload.error.message).toBe('Please login');
    expect(typeof payload.error.requestId).toBe('string');
    expect(payload.error.requestId.length).toBeGreaterThan(0);
  });

  it('formats ForbiddenException with FORBIDDEN code and requestId', () => {
    const { host, statusMock, jsonMock } = createMockHost();
    const exception = new ForbiddenException('Access denied');

    filter.catch(exception, host);

    expect(statusMock).toHaveBeenCalledWith(403);
    const calls = jsonMock.mock.calls as unknown[][];
    const payload = calls[0]?.[0] as CapturedErrorEnvelope;
    expect(payload.error.code).toBe('FORBIDDEN');
    expect(payload.error.message).toBe('Access denied');
    expect(typeof payload.error.requestId).toBe('string');
    expect(payload.error.requestId.length).toBeGreaterThan(0);
  });

  it('formats ServiceUnavailableException with SERVICE_UNAVAILABLE code and requestId', () => {
    const { host, statusMock, jsonMock } = createMockHost();
    const exception = new ServiceUnavailableException(
      'Service temporarily down',
    );

    filter.catch(exception, host);

    expect(statusMock).toHaveBeenCalledWith(503);
    const calls = jsonMock.mock.calls as unknown[][];
    const payload = calls[0]?.[0] as CapturedErrorEnvelope;
    expect(payload.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(payload.error.message).toBe('Service temporarily down');
    expect(typeof payload.error.requestId).toBe('string');
    expect(payload.error.requestId.length).toBeGreaterThan(0);
  });

  it('formats ZodValidationException with VALIDATION_FAILED code and issue details', () => {
    const { host, statusMock, jsonMock } = createMockHost();
    const testSchema = z.object({
      username: z.string().min(3),
    });

    const parseResult = testSchema.safeParse({ username: 'ab' });
    if (!parseResult.success) {
      const exception = new ZodValidationException(parseResult.error);
      filter.catch(exception, host);

      expect(statusMock).toHaveBeenCalledWith(400);

      const calls = jsonMock.mock.calls as unknown[][];
      const payload = calls[0]?.[0] as CapturedErrorEnvelope;
      expect(payload.error.code).toBe('VALIDATION_FAILED');
      expect(payload.error.message).toBe('Validation failed');
      expect(payload.error.details?.[0]?.path).toBe('username');
      expect(typeof payload.error.requestId).toBe('string');
    }
  });

  it('echoes a valid X-Request-Id header in error envelope and response headers', () => {
    const validId = 'client-trace-12345';
    const { host, jsonMock, setHeaderMock } = createMockHost({
      'x-request-id': validId,
    });
    const exception = new NotFoundException('Missing');

    filter.catch(exception, host);

    expect(setHeaderMock).toHaveBeenCalledWith('x-request-id', validId);
    const calls = jsonMock.mock.calls as unknown[][];
    const payload = calls[0]?.[0] as CapturedErrorEnvelope;
    expect(payload.error.requestId).toBe(validId);
  });

  it('replaces an invalid X-Request-Id header with a generated UUID v4', () => {
    const invalidId = 'bad<script>$!';
    const { host, jsonMock, setHeaderMock } = createMockHost({
      'x-request-id': invalidId,
    });
    const exception = new NotFoundException('Missing');

    filter.catch(exception, host);

    expect(setHeaderMock).not.toHaveBeenCalledWith('x-request-id', invalidId);
    const calls = jsonMock.mock.calls as unknown[][];
    const payload = calls[0]?.[0] as CapturedErrorEnvelope;
    expect(payload.error.requestId).not.toBe(invalidId);
    expect(payload.error.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('redacts unhandled errors in production environment and does not leak stacks', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const { host, statusMock, jsonMock } = createMockHost();
    const exception = new Error('Sensitive database internal error message');

    filter.catch(exception, host);

    expect(statusMock).toHaveBeenCalledWith(500);
    const calls = jsonMock.mock.calls as unknown[][];
    const payload = calls[0]?.[0] as CapturedErrorEnvelope;
    expect(payload.error.code).toBe('INTERNAL_ERROR');
    expect(payload.error.message).toBe('An unexpected error occurred');
    expect(typeof payload.error.requestId).toBe('string');

    process.env.NODE_ENV = originalEnv;
  });
});
