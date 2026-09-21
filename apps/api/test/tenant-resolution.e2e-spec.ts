import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, RequestMethod } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { Rfc7807ExceptionFilter } from '../src/common/filters/rfc7807-exception.filter';
import { PrismaService } from '../src/database/prisma.service';
import { TenantStatus } from '@vcrm/shared';

describe('Tenant Resolution & SaaS Provisioning (e2e)', () => {
  let app: INestApplication;

  // In-memory tenant store for deterministic e2e test
  const inMemoryTenants: Array<{
    id: string;
    slug: string;
    name: string;
    status: string;
    plan: string;
    settings: Record<string, unknown>;
    created_at: Date;
    updated_at: Date;
  }> = [];

  const mockPrisma = {
    tenant: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        let found = null;
        if (where.slug) {
          found = inMemoryTenants.find((t) => t.slug === where.slug);
        } else if (where.id) {
          found = inMemoryTenants.find((t) => t.id === where.id);
        }
        return Promise.resolve(found ? { ...found } : null);
      }),
      findMany: jest.fn().mockImplementation(() => {
        return Promise.resolve([...inMemoryTenants]);
      }),
      count: jest.fn().mockImplementation(() => {
        return Promise.resolve(inMemoryTenants.length);
      }),
      create: jest.fn().mockImplementation(({ data }) => {
        const newTenant = {
          id: `tenant-id-${data.slug}`,
          slug: data.slug,
          name: data.name,
          status: data.status || TenantStatus.TRIAL,
          plan: data.plan || 'standard',
          settings: data.settings || {},
          created_at: new Date(),
          updated_at: new Date(),
        };
        inMemoryTenants.push(newTenant);
        return Promise.resolve({ ...newTenant });
      }),
      update: jest.fn().mockImplementation(({ where, data }) => {
        const index = inMemoryTenants.findIndex((t) => t.id === where.id);
        if (index === -1) {
          throw new Error('Tenant not found');
        }
        inMemoryTenants[index] = {
          ...inMemoryTenants[index]!,
          ...data,
          updated_at: new Date(),
        };
        return Promise.resolve({ ...inMemoryTenants[index]! });
      }),
    },
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
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

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/v1/platform/tenants provisions Tenant A successfully', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/platform/tenants')
      .send({
        name: 'Tenant Alpha',
        slug: 'tenant-a',
        plan: 'standard',
        adminEmail: 'admin@tenant-a.com',
      })
      .expect(201);

    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('slug', 'tenant-a');
    expect(res.body).toHaveProperty('name', 'Tenant Alpha');
    expect(res.body).toHaveProperty('status', TenantStatus.TRIAL);
  });

  it('POST /api/v1/platform/tenants provisions Tenant B successfully', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/platform/tenants')
      .send({
        name: 'Tenant Beta',
        slug: 'tenant-b',
        plan: 'enterprise',
        adminEmail: 'admin@tenant-b.com',
      })
      .expect(201);

    expect(res.body).toHaveProperty('slug', 'tenant-b');
  });

  it('POST /api/v1/platform/tenants rejects duplicate slug with 409 Conflict', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/platform/tenants')
      .send({
        name: 'Tenant Alpha Duplicate',
        slug: 'tenant-a',
        adminEmail: 'other@tenant-a.com',
      })
      .expect(409);

    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toHaveProperty('status', 409);
  });

  it('Resolves Tenant A via subdomain (tenant-a.localhost) on tenant API', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/tenant/profile')
      .set('Host', 'tenant-a.localhost')
      .expect(200);

    expect(res.body).toHaveProperty('slug', 'tenant-a');
    expect(res.body).toHaveProperty('name', 'Tenant Alpha');
  });

  it('Resolves Tenant B via subdomain (tenant-b.localhost) on tenant API', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/tenant/profile')
      .set('Host', 'tenant-b.localhost')
      .expect(200);

    expect(res.body).toHaveProperty('slug', 'tenant-b');
    expect(res.body).toHaveProperty('name', 'Tenant Beta');
  });

  it('Resolves Tenant A via X-Tenant header fallback for API clients', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/tenant/profile')
      .set('X-Tenant', 'tenant-a')
      .expect(200);

    expect(res.body).toHaveProperty('slug', 'tenant-a');
  });

  it('Returns 404 for unknown tenant subdomain', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/tenant/profile')
      .set('Host', 'unknown-tenant.localhost')
      .expect(404);

    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toHaveProperty('status', 404);
  });

  it('Suspended tenant returns 403 on all tenant APIs while active tenant continues to work', async () => {
    // 1. SuperAdmin suspends Tenant B
    const updateRes = await request(app.getHttpServer())
      .patch('/api/v1/platform/tenants/tenant-id-tenant-b/status')
      .send({ status: TenantStatus.SUSPENDED })
      .expect(200);

    expect(updateRes.body).toHaveProperty('status', TenantStatus.SUSPENDED);

    // 2. Tenant B now returns 403 Forbidden
    const suspendedRes = await request(app.getHttpServer())
      .get('/api/v1/tenant/profile')
      .set('Host', 'tenant-b.localhost')
      .expect(403);

    expect(suspendedRes.headers['content-type']).toContain('application/problem+json');
    expect(suspendedRes.body).toHaveProperty('status', 403);
    expect(suspendedRes.body.detail).toContain('suspended');

    // 3. Tenant A remains active and returns 200 OK
    const activeRes = await request(app.getHttpServer())
      .get('/api/v1/tenant/profile')
      .set('Host', 'tenant-a.localhost')
      .expect(200);

    expect(activeRes.body).toHaveProperty('status', TenantStatus.TRIAL);
    expect(activeRes.body).toHaveProperty('slug', 'tenant-a');
  });
});
