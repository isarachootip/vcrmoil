import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { Logger } from '@nestjs/common';

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor?: ReturnType<typeof createAdapter>;
  private readonly logger = new Logger(RedisIoAdapter.name);

  async connectToRedis(redisUrl: string): Promise<void> {
    try {
      const pubClient = new Redis(redisUrl, {
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        retryStrategy: () => null, // don't loop endlessly if redis is unavailable in dev
      });

      const subClient = pubClient.duplicate();

      pubClient.on('error', (err) => {
        this.logger.warn(`Redis pub client connection error: ${err.message}`);
      });
      subClient.on('error', (err) => {
        this.logger.warn(`Redis sub client connection error: ${err.message}`);
      });

      await Promise.all([
        new Promise<void>((resolve) => {
          pubClient.once('ready', () => resolve());
          pubClient.once('error', () => resolve());
        }),
        new Promise<void>((resolve) => {
          subClient.once('ready', () => resolve());
          subClient.once('error', () => resolve());
        }),
      ]);

      if (pubClient.status === 'ready' && subClient.status === 'ready') {
        this.adapterConstructor = createAdapter(pubClient, subClient);
        this.logger.log('Socket.IO connected to Redis adapter');
      } else {
        this.logger.warn('Redis adapter unavailable. Falling back to in-memory Socket.IO adapter.');
      }
    } catch (err) {
      const error = err as Error;
      this.logger.warn(
        `Failed to initialize Redis Socket.IO adapter: ${error.message}. Using default in-memory adapter.`,
      );
    }
  }

  override createIOServer(port: number, options?: ServerOptions): unknown {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}
