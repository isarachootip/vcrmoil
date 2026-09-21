import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { HealthCheckResult, HealthService } from './health.service';

@ApiTags('Health')
@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('health')
  @ApiOperation({ summary: 'System health check' })
  @ApiResponse({
    status: 200,
    description: 'System is healthy and operational',
    schema: {
      example: {
        status: 'ok',
        timestamp: '2026-09-21T06:00:00.000Z',
        uptime: 120.4,
        environment: 'development',
        version: '1.0.0',
        info: {
          database: { status: 'up' },
          redis: { status: 'up' },
        },
        checks: {
          system: { status: 'up' },
          database: { status: 'up' },
          redis: { status: 'up' },
        },
      },
    },
  })
  @ApiResponse({
    status: 503,
    description: 'System is degraded or dependencies unavailable',
  })
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthCheckResult> {
    const result = await this.healthService.check();
    if (result.status !== 'ok') {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return result;
  }
}
