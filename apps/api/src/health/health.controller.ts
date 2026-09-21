import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
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
        checks: {
          system: { status: 'up' },
        },
      },
    },
  })
  check(): HealthCheckResult {
    return this.healthService.check();
  }
}
