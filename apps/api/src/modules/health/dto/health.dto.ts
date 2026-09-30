import { healthResponseSchema } from '@hms/shared';
import { createZodDto } from 'nestjs-zod';

export class HealthResponseDto extends createZodDto(healthResponseSchema) {}
