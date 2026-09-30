import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database';

interface HealthBody {
  data?: {
    status?: string;
    database?: string;
    timestamp?: string;
  };
  timestamp?: string;
}

interface ErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}

describe('Health Endpoint (Integration)', () => {
  let app: INestApplication;
  let server: Server;
  let prismaService: PrismaService;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3001';
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ??
      'postgresql://hms_app:dev_app_pass@localhost:5432/hms_test';
    process.env.DATABASE_MIGRATION_URL =
      process.env.DATABASE_MIGRATION_URL ??
      'postgresql://hms_owner:dev_owner_pass@localhost:5432/hms_test';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    server = app.getHttpServer() as Server;
    prismaService = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health returns 200 with standard data envelope and no timestamp', async () => {
    const res = await request(server).get('/api/v1/health').expect(200);
    const body = res.body as unknown as HealthBody;

    expect(body).toEqual({
      data: {
        status: 'ok',
        database: 'connected',
      },
    });
    // Ensure no timestamp is returned
    expect(body.timestamp).toBeUndefined();
    expect(body.data?.timestamp).toBeUndefined();
    // Ensure x-request-id header is present
    const headerId = res.headers['x-request-id'];
    expect(typeof headerId).toBe('string');
    expect(headerId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('GET /api/v1/health/liveness returns 404 (removed probe route)', async () => {
    const res = await request(server)
      .get('/api/v1/health/liveness')
      .expect(404);
    const body = res.body as unknown as ErrorBody;

    expect(body).toMatchObject({
      error: {
        code: 'NOT_FOUND',
        requestId: expect.any(String) as string,
      },
    });
  });

  it('GET /api/v1/health/readiness returns 404 (removed probe route)', async () => {
    const res = await request(server)
      .get('/api/v1/health/readiness')
      .expect(404);
    const body = res.body as unknown as ErrorBody;

    expect(body).toMatchObject({
      error: {
        code: 'NOT_FOUND',
        requestId: expect.any(String) as string,
      },
    });
  });

  it('returns 503 SERVICE_UNAVAILABLE when database is unreachable and recovers to 200 without app restart', async () => {
    // 1. Simulate DB failure
    const isHealthySpy = jest
      .spyOn(prismaService, 'isHealthy')
      .mockResolvedValueOnce(false);

    const errorRes = await request(server).get('/api/v1/health').expect(503);
    const errorBody = errorRes.body as unknown as ErrorBody;

    expect(errorBody).toMatchObject({
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: expect.any(String) as string,
        requestId: expect.any(String) as string,
      },
    });
    // Verify no internal connection or database credentials leaked
    const rawResponseBody = JSON.stringify(errorBody);
    expect(rawResponseBody).not.toContain('postgresql://');
    expect(rawResponseBody).not.toContain('localhost');
    expect(rawResponseBody).not.toContain('5432');
    expect(rawResponseBody).not.toContain('hms_app');

    // 2. Verify recovery without app restart
    isHealthySpy.mockRestore();

    const recoveredRes = await request(server)
      .get('/api/v1/health')
      .expect(200);
    const recoveredBody = recoveredRes.body as unknown as HealthBody;

    expect(recoveredBody).toEqual({
      data: {
        status: 'ok',
        database: 'connected',
      },
    });
  });
});
