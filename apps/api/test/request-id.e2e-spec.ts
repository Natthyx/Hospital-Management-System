import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('Request-ID Validation and Correlation (e2e)', () => {
  let app: INestApplication;
  let server: Server;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3002';
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
  });

  afterAll(async () => {
    await app.close();
  });

  it('echoes a valid client X-Request-Id in response header and error body', async () => {
    const validId = 'client-trace-12345_ABC-xyz';

    // 1. Success route
    const successRes = await request(server)
      .get('/api/v1/health')
      .set('x-request-id', validId)
      .expect(200);

    expect(successRes.headers['x-request-id']).toBe(validId);

    // 2. Error route (404)
    const errorRes = await request(server)
      .get('/api/v1/nonexistent')
      .set('x-request-id', validId)
      .expect(404);

    expect(errorRes.headers['x-request-id']).toBe(validId);
    expect(errorRes.body).toMatchObject({
      error: {
        code: 'NOT_FOUND',
        requestId: validId,
      },
    });
  });

  it('replaces an invalid X-Request-Id with a generated UUID in response header and error body', async () => {
    const invalidId = 'bad<script>$!';

    // 1. Success route
    const successRes = await request(server)
      .get('/api/v1/health')
      .set('x-request-id', invalidId)
      .expect(200);

    const generatedId = successRes.headers['x-request-id'];
    expect(generatedId).not.toBe(invalidId);
    expect(generatedId).toMatch(UUID_V4_REGEX);

    // 2. Error route (404)
    const errorRes = await request(server)
      .get('/api/v1/nonexistent')
      .set('x-request-id', invalidId)
      .expect(404);

    const errorGeneratedId = errorRes.headers['x-request-id'];
    expect(errorGeneratedId).not.toBe(invalidId);
    expect(errorGeneratedId).toMatch(UUID_V4_REGEX);
    expect(errorRes.body).toMatchObject({
      error: {
        code: 'NOT_FOUND',
        requestId: errorGeneratedId,
      },
    });
  });

  it('generates a new UUID when X-Request-Id is omitted by the client', async () => {
    const res = await request(server).get('/api/v1/health').expect(200);

    const generatedId = res.headers['x-request-id'];
    expect(generatedId).toBeDefined();
    expect(generatedId).toMatch(UUID_V4_REGEX);
  });
});
