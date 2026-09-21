import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface HealthCheckResult {
  status: 'ok' | 'degraded';
  timestamp: string;
  uptime: number;
  environment: string;
  version: string;
  checks: {
    system: { status: 'up' };
  };
}

@Injectable()
export class HealthService {
  constructor(private readonly configService: ConfigService) {}

  check(): HealthCheckResult {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: this.configService.get<string>('NODE_ENV', 'development'),
      version: '1.0.0',
      checks: {
        system: { status: 'up' },
      },
    };
  }
}
