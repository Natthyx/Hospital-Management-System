import type { Server } from 'node:http';

import {
  Controller,
  Get,
  Post,
  Body,
  ForbiddenException,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
  type INestApplication,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { createZodDto } from 'nestjs-zod';
import request from 'supertest';
import { z } from 'zod';

import { AppModule } from '../src/app.module';
import { Public } from '../src/common';

interface ErrorEnvelopeBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId: string;
  };
}

// Strict schema that rejects unknown/unrecognized keys
const strictInputSchema = z
  .object({
    name: z.string().min(1),
  })
  .strict();

class StrictInputDto extends createZodDto(strictInputSchema) {}

class NonZodClass {
  value?: string;
}

@Controller('test-security')
class SecurityTestController {
  // e. Default-deny: route without @Public() must return 401 UNAUTHENTICATED
  @Get('default-deny')
  unprotectedEndpoint(): { message: string } {
    return { message: 'should never be reached unauthenticated' };
  }

  // d. Unknown keys: strict Zod DTO
  @Post('strict-dto')
  @Public()
  strictEndpoint(@Body() dto: StrictInputDto): { echo: string } {
    return { echo: dto.name };
  }

  // d. Parameter without ZodDto: should be rejected by strictSchemaDeclaration
  @Post('missing-dto')
  @Public()
  untypedEndpoint(@Body() _body: NonZodClass): { ok: boolean } {
    return { ok: true };
  }

  // HTTP-level test endpoints for all standard error statuses
  @Get('trigger-403')
  @Public()
  trigger403(): void {
    throw new ForbiddenException('You do not have access');
  }

  @Get('trigger-429')
  @Public()
  trigger429(): void {
    throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
  }

  @Get('trigger-500')
  @Public()
  trigger500(): void {
    throw new Error('Unexpected crash simulation');
  }

  @Get('trigger-503')
  @Public()
  trigger503(): void {
    throw new ServiceUnavailableException('Service is down');
  }
}

describe('Security Guards, Schema Validation & Error Envelope (e2e)', () => {
  let app: INestApplication;
  let server: Server;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3005';
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ??
      'postgresql://hms_app:dev_app_pass@localhost:5432/hms_test';
    process.env.DATABASE_MIGRATION_URL =
      process.env.DATABASE_MIGRATION_URL ??
      'postgresql://hms_owner:dev_owner_pass@localhost:5432/hms_test';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [SecurityTestController],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  it('Default-deny: synthetic route without @Public() returns 401 UNAUTHENTICATED with requestId', async () => {
    const res = await request(server)
      .get('/api/v1/test-security/default-deny')
      .expect(401);
    const body = res.body as unknown as ErrorEnvelopeBody;

    expect(body).toEqual({
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Authentication required',
        requestId: expect.any(String) as string,
      },
    });
    expect(res.headers['x-request-id']).toBe(body.error.requestId);
  });

  it('Unknown keys: strict Zod DTO returns 400 VALIDATION_FAILED listing unrecognized keys', async () => {
    const res = await request(server)
      .post('/api/v1/test-security/strict-dto')
      .set('Origin', 'http://localhost:5173')
      .send({
        name: 'Valid Name',
        extraSneakyField: 'malicious-data',
        anotherUnexpectedField: 123,
      })
      .expect(400);
    const body = res.body as unknown as ErrorEnvelopeBody;

    expect(body).toMatchObject({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Validation failed',
        requestId: expect.any(String) as string,
      },
    });

    // Details must list the unrecognized keys
    const details = body.error.details as { message: string }[];
    expect(details).toBeDefined();
    const joinedMessages = JSON.stringify(details);
    expect(
      joinedMessages.includes('unrecognized') ||
        joinedMessages.includes('extraSneakyField'),
    ).toBe(true);
  });

  it('strictSchemaDeclaration: route parameter without a ZodDto is rejected', async () => {
    const res = await request(server)
      .post('/api/v1/test-security/missing-dto')
      .set('Origin', 'http://localhost:5173')
      .send({ value: 'hello' })
      .expect(500);
    const body = res.body as unknown as ErrorEnvelopeBody;

    expect(body).toMatchObject({
      error: {
        code: 'INTERNAL_ERROR',
        requestId: expect.any(String) as string,
      },
    });
  });

  describe('Error Envelope Coverage (400, 401, 403, 404, 429, 500, 503)', () => {
    it('HTTP 400: includes code VALIDATION_FAILED and requestId', async () => {
      const res = await request(server)
        .post('/api/v1/test-security/strict-dto')
        .set('Origin', 'http://localhost:5173')
        .send({ name: '' }) // empty string violates min(1)
        .expect(400);
      const body = res.body as unknown as ErrorEnvelopeBody;

      expect(body).toMatchObject({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Validation failed',
          requestId: expect.any(String) as string,
        },
      });
      expect(res.headers['x-request-id']).toBe(body.error.requestId);
    });

    it('HTTP 401: includes code UNAUTHENTICATED and requestId', async () => {
      const res = await request(server)
        .get('/api/v1/test-security/default-deny')
        .expect(401);
      const body = res.body as unknown as ErrorEnvelopeBody;

      expect(body).toMatchObject({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Authentication required',
          requestId: expect.any(String) as string,
        },
      });
      expect(res.headers['x-request-id']).toBe(body.error.requestId);
    });

    it('HTTP 403: includes code FORBIDDEN and requestId', async () => {
      const res = await request(server)
        .get('/api/v1/test-security/trigger-403')
        .expect(403);
      const body = res.body as unknown as ErrorEnvelopeBody;

      expect(body).toMatchObject({
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have access',
          requestId: expect.any(String) as string,
        },
      });
      expect(res.headers['x-request-id']).toBe(body.error.requestId);
    });

    it('HTTP 404: includes code NOT_FOUND and requestId', async () => {
      const res = await request(server)
        .get('/api/v1/test-security/route-that-does-not-exist')
        .expect(404);
      const body = res.body as unknown as ErrorEnvelopeBody;

      expect(body).toMatchObject({
        error: {
          code: 'NOT_FOUND',
          requestId: expect.any(String) as string,
        },
      });
      expect(res.headers['x-request-id']).toBe(body.error.requestId);
    });

    it('HTTP 429: includes code RATE_LIMITED and requestId', async () => {
      const res = await request(server)
        .get('/api/v1/test-security/trigger-429')
        .expect(429);
      const body = res.body as unknown as ErrorEnvelopeBody;

      expect(body).toMatchObject({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests',
          requestId: expect.any(String) as string,
        },
      });
      expect(res.headers['x-request-id']).toBe(body.error.requestId);
    });

    it('HTTP 500: includes code INTERNAL_ERROR and requestId', async () => {
      const res = await request(server)
        .get('/api/v1/test-security/trigger-500')
        .expect(500);
      const body = res.body as unknown as ErrorEnvelopeBody;

      expect(body).toMatchObject({
        error: {
          code: 'INTERNAL_ERROR',
          requestId: expect.any(String) as string,
        },
      });
      expect(res.headers['x-request-id']).toBe(body.error.requestId);
    });

    it('HTTP 503: includes code SERVICE_UNAVAILABLE and requestId', async () => {
      const res = await request(server)
        .get('/api/v1/test-security/trigger-503')
        .expect(503);
      const body = res.body as unknown as ErrorEnvelopeBody;

      expect(body).toMatchObject({
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Service is down',
          requestId: expect.any(String) as string,
        },
      });
      expect(res.headers['x-request-id']).toBe(body.error.requestId);
    });
  });
});
