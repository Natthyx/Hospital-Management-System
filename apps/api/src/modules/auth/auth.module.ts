import { Module } from '@nestjs/common';

import { Argon2LimiterService } from './argon2-limiter.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionCleanupService } from './session-cleanup.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, Argon2LimiterService, SessionCleanupService],
  exports: [AuthService, Argon2LimiterService, SessionCleanupService],
})
export class AuthModule {}
