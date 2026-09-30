import type { Server } from 'node:http';

import {
  Controller,
  Post,
  Req,
  Res,
  type INestApplication,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request, Response } from 'express';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { Public } from '../src/common';

@Controller('test-redaction')
class TestRedactionController {
  @Post()
  @Public()
  handlePost(@Req() _req: Request, @Res() res: Response): void {
    res.setHeader(
      'Set-Cookie',
      'session=secret_new_cookie_999; Path=/; HttpOnly',
    );
    res.status(200).json({ ok: true });
  }
}

describe('Log Redaction and Data Protection (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  const capturedLogs: string[] = [];
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3003';
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ??
      'postgresql://hms_app:dev_app_pass@localhost:5432/hms_test';
    process.env.DATABASE_MIGRATION_URL =
      process.env.DATABASE_MIGRATION_URL ??
      'postgresql://hms_owner:dev_owner_pass@localhost:5432/hms_test';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [TestRedactionController],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    process.stdout.write = originalStdoutWrite;
    await app.close();
  });

  it('redacts sensitive headers, query string, query contents, and request body from all log lines', async () => {
    const sensitiveValues = {
      cookie: 'secret_session_token_123',
      auth: 'secret_bearer_token_xyz',
      csrf: 'secret_csrf_token_abc',
      setCookie: 'secret_new_cookie_999',
      queryRaw: 'John%20Smith',
      queryDecoded: 'John Smith',
      bodyVal: 'secret_body_payload_forbidden',
    };

    // Intercept stdout to capture Pino JSON log lines
    capturedLogs.length = 0;
    (process.stdout.write as unknown) = (
      chunk: string | Buffer,
      encodingOrCb?: BufferEncoding | ((err?: Error) => void),
      cb?: (err?: Error) => void,
    ) => {
      const str = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      capturedLogs.push(str);
      if (typeof encodingOrCb === 'function') {
        encodingOrCb();
      } else if (typeof cb === 'function') {
        cb();
      }
      return true;
    };

    // Perform the HTTP request with sensitive data across headers, query, and body
    const res = await request(server)
      .post('/api/v1/test-redaction?q=John%20Smith')
      .set('Cookie', `session=${sensitiveValues.cookie}`)
      .set('Authorization', `Bearer ${sensitiveValues.auth}`)
      .set('X-CSRF-Token', sensitiveValues.csrf)
      .send({ sensitive: sensitiveValues.bodyVal })
      .expect(200);

    // Restore stdout
    process.stdout.write = originalStdoutWrite;

    expect(res.headers['set-cookie']).toBeDefined();

    const fullLogText = capturedLogs.join('');
    expect(fullLogText.length).toBeGreaterThan(0);

    // 1. None of the sensitive values must appear anywhere in logs
    expect(fullLogText).not.toContain(sensitiveValues.cookie);
    expect(fullLogText).not.toContain(sensitiveValues.auth);
    expect(fullLogText).not.toContain(sensitiveValues.csrf);
    expect(fullLogText).not.toContain(sensitiveValues.setCookie);
    expect(fullLogText).not.toContain(sensitiveValues.queryRaw);
    expect(fullLogText).not.toContain(sensitiveValues.queryDecoded);
    expect(fullLogText).not.toContain('?q=');
    expect(fullLogText).not.toContain(sensitiveValues.bodyVal);

    // 2. Parse log JSON lines and verify query object contents are empty
    const lines = fullLogText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('{') && l.endsWith('}'));

    expect(lines.length).toBeGreaterThan(0);

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as {
          req?: { query?: Record<string, unknown>; url?: string };
        };
        if (parsed.req) {
          if (parsed.req.query) {
            expect(Object.keys(parsed.req.query)).toHaveLength(0);
          }
          if (parsed.req.url) {
            expect(parsed.req.url).not.toContain('?');
          }
        }
      } catch {
        // Not a JSON log line (e.g. pretty format), continue
      }
    }
  });
});
