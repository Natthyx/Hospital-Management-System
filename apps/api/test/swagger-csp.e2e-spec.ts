import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test, type TestingModule } from '@nestjs/testing';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureSecurityAndSwagger } from '../src/bootstrap-utils';
import { ENV_CONFIG, validateEnv } from '../src/config';
import type { EnvConfig } from '../src/config';

interface ErrorEnvelope {
  error: {
    code: string;
    requestId: string;
  };
}

describe('Swagger Documentation and CSP Isolation (Spec C.g)', () => {
  let appEnabled: INestApplication;
  let serverEnabled: Server;

  let appDisabled: INestApplication;
  let serverDisabled: Server;

  let appProduction: INestApplication;
  let serverProduction: Server;

  const baseEnv = {
    PORT: '3006',
    APP_ORIGIN: 'http://localhost:5173',
    DATABASE_URL:
      process.env.DATABASE_URL ??
      'postgresql://hms_app:dev_app_pass@localhost:5432/hms_test',
    DATABASE_MIGRATION_URL:
      process.env.DATABASE_MIGRATION_URL ??
      'postgresql://hms_owner:dev_owner_pass@localhost:5432/hms_test',
  };

  beforeAll(async () => {
    // 1. App with SWAGGER_ENABLED=true in development
    const envEnabledConfig: EnvConfig = validateEnv({
      ...baseEnv,
      NODE_ENV: 'development',
      SWAGGER_ENABLED: 'true',
    });

    const fixtureEnabled: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ENV_CONFIG)
      .useValue(envEnabledConfig)
      .compile();

    appEnabled = fixtureEnabled.createNestApplication();
    appEnabled.setGlobalPrefix('api/v1');
    configureSecurityAndSwagger(appEnabled, envEnabledConfig);
    await appEnabled.init();
    serverEnabled = appEnabled.getHttpServer() as Server;

    // 2. App with SWAGGER_ENABLED=false
    const envDisabledConfig: EnvConfig = validateEnv({
      ...baseEnv,
      NODE_ENV: 'development',
      SWAGGER_ENABLED: 'false',
    });

    const fixtureDisabled: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ENV_CONFIG)
      .useValue(envDisabledConfig)
      .compile();

    appDisabled = fixtureDisabled.createNestApplication();
    appDisabled.setGlobalPrefix('api/v1');
    configureSecurityAndSwagger(appDisabled, envDisabledConfig);
    await appDisabled.init();
    serverDisabled = appDisabled.getHttpServer() as Server;

    // 3. App with NODE_ENV=production (Swagger must stay disabled)
    const envProductionConfig: EnvConfig = validateEnv({
      ...baseEnv,
      NODE_ENV: 'production',
      SWAGGER_ENABLED: 'true',
      COOKIE_SECURE: 'true',
      APP_ORIGIN: 'https://hms.hospital.org',
    });

    const fixtureProduction: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ENV_CONFIG)
      .useValue(envProductionConfig)
      .compile();

    appProduction = fixtureProduction.createNestApplication();
    appProduction.setGlobalPrefix('api/v1');
    configureSecurityAndSwagger(appProduction, envProductionConfig);
    await appProduction.init();
    serverProduction = appProduction.getHttpServer() as Server;
  });

  afterAll(async () => {
    await appEnabled.close();
    await appDisabled.close();
    await appProduction.close();
  });

  it('serves Swagger docs at /api/docs in development when SWAGGER_ENABLED=true', async () => {
    const res = await request(serverEnabled).get('/api/docs/');
    expect([200, 301]).toContain(res.status);

    if (res.status === 301) {
      const location = res.headers.location;
      expect(typeof location).toBe('string');
      if (typeof location === 'string') {
        const redirectRes = await request(serverEnabled)
          .get(location)
          .expect(200);
        expect(redirectRes.text).toContain('swagger');
      }
    } else {
      expect(res.text).toContain('swagger');
    }
  });

  it('relaxes CSP only for /api/docs when enabled in development', async () => {
    const swaggerRes = await request(serverEnabled).get('/api/docs/');
    const swaggerCsp = swaggerRes.headers['content-security-policy'];
    expect(typeof swaggerCsp).toBe('string');
    if (typeof swaggerCsp === 'string') {
      expect(swaggerCsp).toContain("'unsafe-inline'");
    }

    // Verify API endpoints retain strict CSP with no unsafe-inline
    const apiRes = await request(serverEnabled)
      .get('/api/v1/health')
      .expect(200);
    const apiCsp = apiRes.headers['content-security-policy'];
    expect(typeof apiCsp).toBe('string');
    if (typeof apiCsp === 'string') {
      expect(apiCsp).not.toContain("'unsafe-inline'");
    }
  });

  it('returns 404 for /api/docs when SWAGGER_ENABLED=false', async () => {
    const res = await request(serverDisabled).get('/api/docs').expect(404);
    const body = res.body as unknown as ErrorEnvelope;

    expect(body).toMatchObject({
      error: {
        code: 'NOT_FOUND',
        requestId: expect.any(String) as string,
      },
    });

    const csp = res.headers['content-security-policy'];
    if (typeof csp === 'string') {
      expect(csp).not.toContain("'unsafe-inline'");
    }
  });

  it('refuses to enable Swagger in production even if SWAGGER_ENABLED=true', async () => {
    const res = await request(serverProduction).get('/api/docs').expect(404);
    const body = res.body as unknown as ErrorEnvelope;

    expect(body).toMatchObject({
      error: {
        code: 'NOT_FOUND',
        requestId: expect.any(String) as string,
      },
    });

    const csp = res.headers['content-security-policy'];
    if (typeof csp === 'string') {
      expect(csp).not.toContain("'unsafe-inline'");
    }
  });

  it('generates OpenAPI document with cleanupOpenApiDoc and verifies /api/v1/health response schema', () => {
    const config = new DocumentBuilder()
      .setTitle('Hospital Management System (HMS) API')
      .setVersion('1.0')
      .build();

    const rawDocument = SwaggerModule.createDocument(appEnabled, config);
    const cleanedDocument = cleanupOpenApiDoc(rawDocument);

    expect(cleanedDocument.paths).toBeDefined();
    expect(cleanedDocument.paths['/api/v1/health']).toBeDefined();
    const getHealth = cleanedDocument.paths['/api/v1/health']?.get;
    expect(getHealth).toBeDefined();
    expect(getHealth?.responses['200']).toBeDefined();
  });
});
