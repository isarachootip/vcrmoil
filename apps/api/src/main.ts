import { NestFactory } from '@nestjs/core';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { bootstrapOpenTelemetry } from './tracing';
import { AppModule } from './app.module';
import { Rfc7807ExceptionFilter } from './common/filters/rfc7807-exception.filter';
import { RedisIoAdapter } from './events/redis-io.adapter';

async function bootstrap(): Promise<void> {
  // Initialize OpenTelemetry SDK before app bootstrap
  bootstrapOpenTelemetry();

  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('API_PORT', 4000);
  const redisUrl = configService.get<string>('REDIS_URL', 'redis://localhost:6379');

  // Pino Logger
  app.useLogger(app.get(Logger));

  // Enable Graceful Shutdown Hooks
  app.enableShutdownHooks();

  // Global RFC 7807 Exception Filter
  app.useGlobalFilters(new Rfc7807ExceptionFilter());

  // Global Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global prefix /api/v1, excluding root /health check
  app.setGlobalPrefix('api/v1', {
    exclude: [{ path: 'health', method: RequestMethod.GET }],
  });

  // Enable CORS
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // Socket.IO Redis Adapter
  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis(redisUrl);
  app.useWebSocketAdapter(redisIoAdapter);

  // OpenAPI (Swagger) Documentation at /api/docs
  const swaggerConfig = new DocumentBuilder()
    .setTitle('vCRM Platform API')
    .setDescription('Multi-tenant Contact-Center CRM API for Thai Enterprises')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Enter Keycloak or Local JWT token',
        in: 'header',
      },
      'bearer',
    )
    .addTag('Health', 'Health and liveness checks')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  await app.listen(port);
  const logger = app.get(Logger);
  logger.log(`vCRM API successfully listening on port ${port}`);
  logger.log(`Health endpoint: http://localhost:${port}/health`);
  logger.log(`Swagger documentation: http://localhost:${port}/api/docs`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal error during bootstrap:', err);
  process.exit(1);
});
