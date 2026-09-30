import type { IncomingMessage, ServerResponse } from 'node:http';

import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { APP_GUARD, APP_FILTER, APP_PIPE, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { ZodSerializerInterceptor } from 'nestjs-zod';

import {
  DefaultDenyGuard,
  AllExceptionsFilter,
  AppZodValidationPipe,
  RequestIdMiddleware,
  ResponseEnvelopeInterceptor,
  REQUEST_ID_HEADER,
  resolveRequestId,
  serializeRequest,
  serializeResponse,
} from './common';
import { ConfigModule, ENV_CONFIG } from './config';
import type { EnvConfig } from './config';
import { DatabaseModule } from './database';
import { HealthModule } from './modules/health';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    HealthModule,
    ThrottlerModule.forRootAsync({
      inject: [ENV_CONFIG],
      useFactory: (env: EnvConfig) => [
        {
          ttl: env.THROTTLE_TTL_MS,
          limit: env.THROTTLE_LIMIT,
        },
      ],
    }),
    LoggerModule.forRootAsync({
      inject: [ENV_CONFIG],
      useFactory: (env: EnvConfig) => ({
        pinoHttp: {
          level:
            env.NODE_ENV === 'test' && process.env.TEST_LOGS_ENABLED !== 'true'
              ? 'silent'
              : env.LOG_LEVEL,
          genReqId: (req: IncomingMessage, res: ServerResponse) => {
            const rawHeader = req.headers[REQUEST_ID_HEADER];
            const incoming = Array.isArray(rawHeader)
              ? rawHeader[0]
              : rawHeader;
            const id = resolveRequestId(incoming);
            req.headers[REQUEST_ID_HEADER] = id;
            res.setHeader(REQUEST_ID_HEADER, id);
            return id;
          },
          // Redact paths kept as defense-in-depth. The custom serializers.req
          // allowlist below is the primary control preventing sensitive headers,
          // tokens, cookies, query parameters, or request bodies from being logged.
          redact: {
            paths: [
              'req.headers.cookie',
              'req.headers.authorization',
              'req.headers["x-csrf-token"]',
              'res.headers["set-cookie"]',
              'req.headers["set-cookie"]',
            ],
            censor: '[REDACTED]',
          },
          customReceivedMessage: (req: IncomingMessage) => {
            const rawUrl = req.url ?? '';
            const url = rawUrl.split('?')[0] ?? '';
            return `--> ${req.method ?? 'GET'} ${url}`;
          },
          customSuccessMessage: (req: IncomingMessage, res: ServerResponse) => {
            const rawUrl = req.url ?? '';
            const url = rawUrl.split('?')[0] ?? '';
            return `<-- ${req.method ?? 'GET'} ${url} ${String(res.statusCode)}`;
          },
          customErrorMessage: (
            req: IncomingMessage,
            res: ServerResponse,
            err: Error,
          ) => {
            const rawUrl = req.url ?? '';
            const url = rawUrl.split('?')[0] ?? '';
            return `xxx ${req.method ?? 'GET'} ${url} ${String(res.statusCode)} - ${err.message}`;
          },
          serializers: {
            req: serializeRequest,
            res: serializeResponse,
          },
          ...(env.NODE_ENV === 'development'
            ? {
                transport: {
                  target: 'pino-pretty',
                  options: {
                    colorize: true,
                    singleLine: true,
                    translateTime: 'SYS:standard',
                  },
                },
              }
            : {}),
        },
      }),
    }),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: DefaultDenyGuard,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_PIPE,
      useClass: AppZodValidationPipe,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseEnvelopeInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ZodSerializerInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
