import {
  Controller,
  Get,
  HttpStatus,
  HttpCode,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ZodSerializerDto } from 'nestjs-zod';

import { Public } from '../../common';
import { PrismaService } from '../../database';

import { HealthResponseDto } from './dto/health.dto';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly prismaService: PrismaService) {}

  @Get()
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Overall health check' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'System is healthy and database is connected',
    type: HealthResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.SERVICE_UNAVAILABLE,
    description: 'Database unreachable',
  })
  @ZodSerializerDto(HealthResponseDto)
  async check(): Promise<HealthResponseDto> {
    const isDbHealthy = await this.prismaService.isHealthy();

    if (!isDbHealthy) {
      throw new ServiceUnavailableException(
        'Database connectivity check failed',
      );
    }

    return {
      status: 'ok',
      database: 'connected',
    };
  }
}
