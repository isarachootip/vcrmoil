import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, RequestMethod } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { Rfc7807ExceptionFilter } from '../src/common/filters/rfc7807-exception.filter';
import { PrismaService } from '../src/database/prisma.service';
import { ConfigService } from '@nestjs/config';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  const mockPrisma = {
    $queryRaw: jest.fn().mockResolvedValue([{ ping: 1 }]),
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    // Unconfigure REDIS_URL to prevent unwanted outbound network attempts during test
    process.env.REDIS_URL = '';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .overrideProvider(ConfigService)
      .useValue({
        get: jest.fn().mockImplementation((key: string, defaultValue?: unknown) => {
          if (key === 'REDIS_URL') return '';
          if (key === 'NODE_ENV') return 'development';
          if (key === 'LOG_LEVEL') return 'info';
          return defaultValue;
        }),
      })
      .compile();

    app = moduleFixture.createNestApplication();

    app.useGlobalFilters(new Rfc7807ExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.setGlobalPrefix('api/v1', {
      exclude: [{ path: 'health', method: RequestMethod.GET }],
    });

    const swaggerConfig = new DocumentBuilder()
      .setTitle('vCRM Platform API')
      .setDescription('Multi-tenant Contact-Center CRM API for Thai Enterprises')
      .setVersion('1.0')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns 200 and healthy status matching COOLIFY.md specification when dependencies are up', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ ping: 1 }]);

    const res = await request(app.getHttpServer()).get('/health').expect(200);

    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('uptime');
    expect(res.body).toHaveProperty('environment');
    expect(res.body).toHaveProperty('version');

    // Backwards compatibility verification
    expect(res.body).toHaveProperty('checks');
    expect(res.body.checks.system).toEqual({ status: 'up' });

    // Structured service info matching COOLIFY.md
    expect(res.body).toHaveProperty('info');
    expect(res.body.info).toHaveProperty('database');
    expect(res.body.info.database.status).toBe('up');
    expect(typeof res.body.info.database.latencyMs).toBe('number');
    expect(res.body.info).toHaveProperty('redis');
    expect(['up', 'unconfigured']).toContain(res.body.info.redis.status);
  });

  it('GET /health returns 503 and degraded status when database probe fails', async () => {
    mockPrisma.$queryRaw.mockRejectedValueOnce(new Error('Database connection refused'));

    const res = await request(app.getHttpServer()).get('/health').expect(503);

    expect(res.body).toHaveProperty('status', 'degraded');
    expect(res.body.info.database.status).toBe('down');
    expect(res.body.info.database.message).toContain('Database connection refused');
  });

  it('GET /health handles database query timeouts gracefully without unhandled rejection', async () => {
    mockPrisma.$queryRaw.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Slow database error')), 1800);
        }),
    );

    const res = await request(app.getHttpServer()).get('/health').expect(503);

    expect(res.body).toHaveProperty('status', 'degraded');
    expect(res.body.info.database.status).toBe('down');
    expect(res.body.info.database.message).toBe('Database ping timed out');
  });

  it('GET /api/docs/ loads Swagger UI html', async () => {
    const res = await request(app.getHttpServer()).get('/api/docs/').expect(200);

    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('swagger-ui');
  });

  it('Non-existent route returns RFC 7807 problem details', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/non-existent-route').expect(404);

    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toHaveProperty('status', 404);
    expect(res.body).toHaveProperty('title');
    expect(res.body).toHaveProperty('instance', '/api/v1/non-existent-route');
    expect(res.body).toHaveProperty('timestamp');
  });
});
