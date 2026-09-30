import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { configureSecurityAndSwagger } from './bootstrap-utils';
import { ENV_CONFIG } from './config';
import type { EnvConfig } from './config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // Attach Pino logger
  app.useLogger(app.get(Logger));

  const env = app.get<EnvConfig>(ENV_CONFIG);

  // Configure Helmet CSP and Swagger documentation
  configureSecurityAndSwagger(app, env);

  // Global API route prefix
  app.setGlobalPrefix('api/v1');

  // Graceful shutdown
  app.enableShutdownHooks();

  await app.listen(env.PORT);
}

void bootstrap();
