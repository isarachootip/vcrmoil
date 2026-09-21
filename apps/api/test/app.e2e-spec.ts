import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, RequestMethod } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { Rfc7807ExceptionFilter } from '../src/common/filters/rfc7807-exception.filter';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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

  it('GET /health returns 200 and healthy status', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);

    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('checks');
    expect(res.body.checks.system).toEqual({ status: 'up' });
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('uptime');
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
