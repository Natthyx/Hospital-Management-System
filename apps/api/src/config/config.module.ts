import { Module, Global } from '@nestjs/common';

import { validateEnv } from './env.schema';
import type { EnvConfig } from './env.schema';

/**
 * Token for injecting validated environment configuration.
 */
export const ENV_CONFIG = Symbol('ENV_CONFIG');

/**
 * Global module that validates environment variables at boot
 * and provides the typed EnvConfig throughout the application.
 */
@Global()
@Module({
  providers: [
    {
      provide: ENV_CONFIG,
      useFactory: (): EnvConfig => validateEnv(),
    },
  ],
  exports: [ENV_CONFIG],
})
export class ConfigModule {}
