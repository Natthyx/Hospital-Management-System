import { Logger, type ArgumentsHost } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { Request, Response } from 'express';

import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { AuditWriteError } from '../../src/modules/audit/audit-errors';
import { cleanTestDatabase } from '../utils/test-cleaner';

describe('Audit Insert Error Sanitization & Leak Prevention', () => {
  let prisma: PrismaClient;
  let filter: AllExceptionsFilter;
  let loggedErrors: string[];

  beforeAll(async () => {
    await cleanTestDatabase();
    prisma = new PrismaClient(
      process.env.DATABASE_URL
        ? { datasources: { db: { url: process.env.DATABASE_URL } } }
        : undefined,
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    loggedErrors = [];
    jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation((message: unknown) => {
        loggedErrors.push(String(message));
      });
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
    capturedPayload: () => Record<string, unknown>;
  } => {
    let responseBody: Record<string, unknown> = {};
    const jsonMock = jest.fn((body: Record<string, unknown>) => {
      responseBody = body;
    });
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
      method: 'POST',
      url: '/api/v1/auth/login',
    } as unknown as Request;

    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    } as unknown as ArgumentsHost;

    return {
      host,
      statusMock,
      jsonMock,
      capturedPayload: () => responseBody,
    };
  };

  it('proves raw Prisma error embeds failing row with sentinel metadata, but sanitized filter NEVER leaks sentinel in logs or HTTP body', async () => {
    const sentinel = 'SECRET_PHI_SENTINEL_PATIENT_SSN_987654321';
    let rawPrismaError: unknown;

    // 1. Force real database NOT NULL constraint violation (actor_username is NULL)
    // containing sensitive sentinel string inside metadata
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "audit_log" ("action", "outcome", "actor_username", "metadata")
         VALUES ('auth.login_success', 'success', NULL, '{"secret": "${sentinel}"}'::jsonb);`,
      );
    } catch (err: unknown) {
      rawPrismaError = err;
    }

    expect(rawPrismaError).toBeDefined();

    // Verify the problem: raw Prisma error text DOES embed the failing row and sentinel
    const rawErrorString = String(rawPrismaError);
    expect(rawErrorString).toContain(sentinel);

    // 2. Process through AllExceptionsFilter (simulating HTTP layer handling)
    const { host, statusMock, capturedPayload } = createMockHost({
      'x-request-id': 'test-trace-123',
    });

    filter.catch(rawPrismaError, host);

    // 3. Verify HTTP response
    expect(statusMock).toHaveBeenCalledWith(500);
    const body = capturedPayload();
    const serializedBody = JSON.stringify(body);

    // PROVE: Sentinel NEVER appears in the HTTP error body
    expect(serializedBody).not.toContain(sentinel);

    // PROVE: Body contains only error class and SQLSTATE code, never the row
    const errorEnvelope = (
      body as { error?: { code: string; message: string } }
    ).error;
    expect(errorEnvelope).toBeDefined();
    expect(errorEnvelope?.code).toBe('INTERNAL_ERROR');
    expect(errorEnvelope?.message).toContain('PrismaClientKnownRequestError');
    expect(errorEnvelope?.message).toContain('23502');

    // 4. Verify logs
    expect(loggedErrors.length).toBeGreaterThan(0);
    const combinedLogs = loggedErrors.join('\n');

    // PROVE: Sentinel NEVER appears in the logs
    expect(combinedLogs).not.toContain(sentinel);

    // PROVE: Log contains only error class and SQLSTATE code
    expect(combinedLogs).toContain('PrismaClientKnownRequestError');
    expect(combinedLogs).toContain('23502');
  });

  it('proves PrismaClientUnknownRequestError (CHECK constraint violation) with sentinel metadata is sanitized in logs and HTTP body', async () => {
    const sentinel = 'SECRET_SESSION_TOKEN_SENTINEL_abcdef123456';
    let rawPrismaError: unknown;

    // Force real database CHECK constraint violation (actor_username > 64 chars)
    // containing sensitive sentinel string in metadata
    try {
      await prisma.auditLog.create({
        data: {
          actorUsername: 'a'.repeat(65),
          action: 'auth.login_success',
          outcome: 'success',
          metadata: { token: sentinel },
        },
      });
    } catch (err: unknown) {
      rawPrismaError = err;
    }

    expect(rawPrismaError).toBeDefined();

    // Verify raw error embeds sentinel
    expect(String(rawPrismaError)).toContain(sentinel);

    // Process through AllExceptionsFilter
    const { host, statusMock, capturedPayload } = createMockHost();
    filter.catch(rawPrismaError, host);

    expect(statusMock).toHaveBeenCalledWith(500);
    const body = capturedPayload();
    const serializedBody = JSON.stringify(body);

    // PROVE: Sentinel NEVER appears in HTTP body or logs
    expect(serializedBody).not.toContain(sentinel);
    const combinedLogs = loggedErrors.join('\n');
    expect(combinedLogs).not.toContain(sentinel);

    // PROVE: Only error class and SQLSTATE 23514 are exposed
    expect(combinedLogs).toContain('23514');
  });

  it('AuditWriteError encapsulates cause and strips failing row, exposing only errorClass and sqlState', async () => {
    const sentinel = 'SECRET_ENCRYPTION_KEY_SENTINEL_000111222';
    let rawPrismaError: unknown;

    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "audit_log" ("action", "outcome", "actor_username", "metadata")
         VALUES ('auth.login_success', 'success', NULL, '{"key": "${sentinel}"}'::jsonb);`,
      );
    } catch (err: unknown) {
      rawPrismaError = err;
    }

    // Wrap in AuditWriteError
    const auditError = new AuditWriteError(rawPrismaError);

    // Properties
    expect(auditError.errorClass).toBe('PrismaClientKnownRequestError');
    expect(auditError.sqlState).toBe('23502');

    // Error message and stack MUST NOT contain sentinel
    expect(auditError.message).not.toContain(sentinel);
    expect(auditError.message).toBe(
      'Audit write failed: PrismaClientKnownRequestError (SQLSTATE 23502)',
    );
    expect(auditError.stack).not.toContain(sentinel);

    // Process through AllExceptionsFilter
    const { host, statusMock, capturedPayload } = createMockHost();
    filter.catch(auditError, host);

    expect(statusMock).toHaveBeenCalledWith(500);
    const serializedBody = JSON.stringify(capturedPayload());
    expect(serializedBody).not.toContain(sentinel);
    const combinedLogs = loggedErrors.join('\n');
    expect(combinedLogs).not.toContain(sentinel);
    expect(combinedLogs).toContain('23502');
  });

  it('proves production mode returns generic message while logs contain only errorClass and SQLSTATE without sentinel', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const sentinel = 'SECRET_PROD_SENTINEL_xyz999';
      let rawPrismaError: unknown;

      try {
        await prisma.$executeRawUnsafe(
          `INSERT INTO "audit_log" ("action", "outcome", "actor_username", "metadata")
           VALUES ('auth.login_success', 'success', NULL, '{"secret": "${sentinel}"}'::jsonb);`,
        );
      } catch (err: unknown) {
        rawPrismaError = err;
      }

      const { host, statusMock, capturedPayload } = createMockHost();
      filter.catch(rawPrismaError, host);

      expect(statusMock).toHaveBeenCalledWith(500);
      const body = capturedPayload();
      const serializedBody = JSON.stringify(body);

      // In production: generic message
      expect(serializedBody).not.toContain(sentinel);
      const errorEnvelope = (
        body as { error?: { code: string; message: string } }
      ).error;
      expect(errorEnvelope?.message).toBe('An unexpected error occurred');

      // Logs contain only errorClass and SQLSTATE, NEVER sentinel
      const combinedLogs = loggedErrors.join('\n');
      expect(combinedLogs).not.toContain(sentinel);
      expect(combinedLogs).toContain('PrismaClientKnownRequestError');
      expect(combinedLogs).toContain('23502');
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});
