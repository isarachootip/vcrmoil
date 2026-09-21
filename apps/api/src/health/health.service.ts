import { Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PrismaService } from '../database/prisma.service';

export interface ComponentStatus {
  status: 'up' | 'down' | 'warming_up' | 'unconfigured';
  message?: string;
  latencyMs?: number;
}

export interface HealthCheckResult {
  status: 'ok' | 'degraded';
  timestamp: string;
  uptime: number;
  environment: string;
  version: string;
  info: {
    database: ComponentStatus;
    redis: ComponentStatus;
  };
  checks: {
    system: { status: 'up' };
    database?: ComponentStatus;
    redis?: ComponentStatus;
  };
}

@Injectable()
export class HealthService implements OnModuleDestroy {
  private readonly logger = new Logger(HealthService.name);
  private redisClient: Redis | null = null;

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  async onModuleDestroy(): Promise<void> {
    if (this.redisClient) {
      try {
        this.redisClient.removeAllListeners();
        this.redisClient.on('error', () => {});
        await this.redisClient.quit();
      } catch {
        this.redisClient.disconnect();
      }
      this.redisClient = null;
    }
  }

  async check(): Promise<HealthCheckResult> {
    const [database, redis] = await Promise.all([this.probeDatabase(), this.probeRedis()]);

    const isDatabaseOk = database.status === 'up';
    const isRedisOk = redis.status === 'up' || redis.status === 'unconfigured';
    const isSystemOk = isDatabaseOk && isRedisOk;

    return {
      status: isSystemOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: this.configService.get<string>('NODE_ENV', 'development'),
      version: '1.0.0',
      info: {
        database,
        redis,
      },
      checks: {
        system: { status: 'up' },
        database,
        redis,
      },
    };
  }

  private async probeDatabase(): Promise<ComponentStatus> {
    if (!this.prisma) {
      return { status: 'down', message: 'Database client not initialized' };
    }

    const start = Date.now();
    let timer: NodeJS.Timeout | undefined;

    try {
      const queryPromise = this.prisma.$queryRaw`SELECT 1 as ping`;

      queryPromise.catch((lateErr: Error) => {
        this.logger.debug?.(`Late database probe rejection absorbed: ${lateErr?.message}`);
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Database ping timed out')), 1500);
        timer.unref?.();
      });

      await Promise.race([queryPromise, timeoutPromise]);
      if (timer) clearTimeout(timer);

      return {
        status: 'up',
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      if (timer) clearTimeout(timer);
      const error = err as Error;
      this.logger.warn(`Health check database probe warning: ${error.message}`);
      return {
        status: 'down',
        message: error.message,
      };
    }
  }

  private async probeRedis(): Promise<ComponentStatus> {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    if (!redisUrl || redisUrl.trim() === '') {
      return { status: 'unconfigured' };
    }

    const start = Date.now();
    let timer: NodeJS.Timeout | undefined;

    try {
      if (!this.redisClient) {
        this.redisClient = new Redis(redisUrl, {
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
          connectTimeout: 1000,
          lazyConnect: true,
          retryStrategy: () => null,
        });

        this.redisClient.on('error', (err) => {
          this.logger.debug?.(`Redis health connection notice: ${err.message}`);
        });
      }

      if (this.redisClient.status !== 'ready' && this.redisClient.status !== 'connecting') {
        await this.redisClient.connect();
      }

      const pingPromise = this.redisClient.ping();
      pingPromise.catch((lateErr: Error) => {
        this.logger.debug?.(`Late Redis ping rejection absorbed: ${lateErr?.message}`);
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Redis ping timed out')), 1000);
        timer.unref?.();
      });

      await Promise.race([pingPromise, timeoutPromise]);
      if (timer) clearTimeout(timer);

      return {
        status: 'up',
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      if (timer) clearTimeout(timer);
      const error = err as Error;
      this.logger.warn(`Health check Redis probe warning: ${error.message}`);
      return {
        status: 'down',
        message: error.message,
      };
    }
  }
}
