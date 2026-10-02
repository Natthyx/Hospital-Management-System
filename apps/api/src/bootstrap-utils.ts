import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { cleanupOpenApiDoc } from 'nestjs-zod';

import type { EnvConfig } from './config';

/**
 * Configures security headers (Helmet) and OpenAPI Swagger UI on the application.
 *
 * Enforces:
 * 1. Strict CSP across the API (/api/v1/*) with no 'unsafe-inline'.
 * 2. Relaxed CSP only for /api/docs and only in non-production when SWAGGER_ENABLED=true.
 * 3. Swagger documentation is exposed at /api/docs only in development when SWAGGER_ENABLED=true.
 */
export function configureSecurityAndSwagger(
  app: INestApplication,
  env: EnvConfig,
): void {
  // Trust proxy configuration for reverse proxies (e.g. nginx)
  const expressApp = app.getHttpAdapter().getInstance() as {
    set?: (setting: string, val: unknown) => void;
  } | null;
  if (expressApp && typeof expressApp.set === 'function') {
    expressApp.set(
      'trust proxy',
      env.TRUST_PROXY > 0 ? env.TRUST_PROXY : false,
    );
  }

  // Route-specific CSP via Helmet
  app.use((req: Request, res: Response, next: NextFunction) => {
    const isSwaggerRoute = req.path.startsWith('/api/docs');
    const relaxSwaggerCsp =
      isSwaggerRoute && env.SWAGGER_ENABLED && env.NODE_ENV !== 'production';

    if (relaxSwaggerCsp) {
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:'],
          },
        },
        crossOriginEmbedderPolicy: false,
      })(req, res, next);
    } else {
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'"],
            imgSrc: ["'self'"],
            connectSrc: ["'self'"],
          },
        },
        crossOriginEmbedderPolicy: false,
      })(req, res, next);
    }
  });

  // Swagger Documentation
  if (env.SWAGGER_ENABLED && env.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Hospital Management System (HMS) API')
      .setDescription('Production-grade Hospital Management System API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    const cleanedDocument = cleanupOpenApiDoc(document);
    SwaggerModule.setup('api/docs', app, cleanedDocument);
  }
}
