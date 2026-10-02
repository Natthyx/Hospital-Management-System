import { Module } from '@nestjs/common';

import { Argon2LimiterService } from './argon2-limiter.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, Argon2LimiterService],
  exports: [AuthService, Argon2LimiterService],
})
export class AuthModule {}
