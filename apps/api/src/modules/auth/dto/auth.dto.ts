import {
  loginRequestSchema,
  changePasswordRequestSchema,
  sessionIdParamSchema,
} from '@hms/shared';
import { createZodDto } from 'nestjs-zod';

export class LoginRequestDto extends createZodDto(loginRequestSchema) {}

export class ChangePasswordRequestDto extends createZodDto(
  changePasswordRequestSchema,
) {}

export class SessionIdParamDto extends createZodDto(sessionIdParamSchema) {}
