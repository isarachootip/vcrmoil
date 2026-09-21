import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, RequestMethod } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { Rfc7807ExceptionFilter } from '../src/common/filters/rfc7807-exception.filter';
import { PrismaService } from '../src/database/prisma.service';
import { AgentStatus, DataScope, TenantStatus, UserContext } from '@vcrm/shared';
import { Permissions } from '../src/iam/iam.constants';
import { AuditActions } from '../src/audit/audit.constants';

describe('Audit Log & PDPA PII Tracking (e2e)', () => {
  let app: INestApplication;

  const testTenant = {
    id: randomUUID(),
    slug: 'acme',
    name: 'Acme Corp',
    status: TenantStatus.ACTIVE,
    plan: 'enterprise',
  };

  const adminRoleId = randomUUID();
  const agentRoleId = randomUUID();

  const adminUser: UserContext = {
    id: randomUUID(),
    tenantId: testTenant.id,
    email: 'admin@acme.com',
    name: 'Admin Audit',
    role: 'TenantAdmin',
    teamId: randomUUID(),
    status: AgentStatus.ONLINE,
    maxConcurrentChats: 5,
    permissions: [
      { code: Permissions.USER_CREATE, dataScope: DataScope.ALL },
      { code: Permissions.USER_READ, dataScope: DataScope.ALL },
      { code: Permissions.USER_UPDATE, dataScope: DataScope.ALL },
      { code: Permissions.USER_DELETE, dataScope: DataScope.ALL },
      { code: Permissions.AUDIT_READ, dataScope: DataScope.ALL },
    ],
  };

  const agentUser: UserContext = {
    id: randomUUID(),
    tenantId: testTenant.id,
    email: 'agent@acme.com',
    name: 'Agent Somchai',
    role: 'Agent',
    teamId: randomUUID(),
    status: AgentStatus.ONLINE,
    maxConcurrentChats: 3,
    permissions: [{ code: Permissions.USER_READ, dataScope: DataScope.OWN }],
  };

  interface MockAuditRecord {
    id: string;
    tenant_id: string;
    actor_id?: string;
    actor_type?: string;
    actor_email?: string;
    action: string;
    entity: string;
    entity_id?: string;
    before?: unknown;
    after?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    created_at: Date;
  }

  interface MockUserRecord {
    id: string;
    tenant_id: string;
    email: string;
    name: string;
    role_id: string;
    created_at: Date;
    updated_at: Date;
    [key: string]: unknown;
  }

  const inMemoryAuditLogs: MockAuditRecord[] = [];
  const inMemoryUsers: MockUserRecord[] = [];

  const mockTx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    auditLog: {
      create: jest.fn().mockImplementation(({ data }) => {
        const record = {
          id: randomUUID(),
          ...data,
          created_at: new Date(),
        };
        inMemoryAuditLogs.push(record);
        return Promise.resolve(record);
      }),
      findMany: jest.fn().mockImplementation(({ where, skip = 0, take = 20 }) => {
        let results = inMemoryAuditLogs.filter((l) => l.tenant_id === where.tenant_id);
        if (where.entity) {
          results = results.filter((l) => l.entity === where.entity);
        }
        if (where.action) {
          results = results.filter((l) => l.action === where.action);
        }
        return Promise.resolve(results.slice(skip, skip + take));
      }),
      findFirst: jest.fn().mockImplementation(({ where }) => {
        return Promise.resolve(
          inMemoryAuditLogs.find((l) => l.id === where.id && l.tenant_id === where.tenant_id) ||
            null,
        );
      }),
      count: jest.fn().mockImplementation(({ where }) => {
        return Promise.resolve(
          inMemoryAuditLogs.filter((l) => l.tenant_id === where.tenant_id).length,
        );
      }),
    },
    user: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        if (where?.tenant_id_email) {
          return Promise.resolve(
            inMemoryUsers.find(
              (u) =>
                u.tenant_id === where.tenant_id_email.tenant_id &&
                u.email === where.tenant_id_email.email,
            ) || null,
          );
        }
        if (where?.id) {
          return Promise.resolve(inMemoryUsers.find((u) => u.id === where.id) || null);
        }
        return Promise.resolve(null);
      }),
      findMany: jest.fn().mockImplementation(() => Promise.resolve([...inMemoryUsers])),
      create: jest.fn().mockImplementation(({ data }) => {
        const created = {
          id: randomUUID(),
          ...data,
          role: { id: data.role_id, name: 'Agent' },
          team: null,
          skills: [],
          created_at: new Date(),
          updated_at: new Date(),
        };
        inMemoryUsers.push(created);
        return Promise.resolve(created);
      }),
      update: jest.fn().mockImplementation(({ where, data }) => {
        const idx = inMemoryUsers.findIndex((u) => u.id === where.id);
        if (idx === -1) return Promise.resolve(null);
        inMemoryUsers[idx] = { ...inMemoryUsers[idx], ...data, updated_at: new Date() };
        return Promise.resolve(inMemoryUsers[idx]);
      }),
      delete: jest.fn().mockImplementation(({ where }) => {
        const idx = inMemoryUsers.findIndex((u) => u.id === where.id);
        if (idx !== -1) inMemoryUsers.splice(idx, 1);
        return Promise.resolve({ id: where.id });
      }),
    },
  };

  const mockPrisma = {
    tenant: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        if (where.slug === testTenant.slug || where.id === testTenant.id) {
          return Promise.resolve({ ...testTenant });
        }
        return Promise.resolve(null);
      }),
    },
    role: {
      findMany: jest.fn().mockResolvedValue([
        { id: adminRoleId, name: 'TenantAdmin', is_system: true, permissions: [] },
        { id: agentRoleId, name: 'Agent', is_system: true, permissions: [] },
      ]),
    },
    $transaction: jest.fn().mockImplementation(async (callback) => {
      return callback(mockTx);
    }),
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

    app.use(
      (
        req: { headers: Record<string, string | undefined>; user?: unknown },
        _res: unknown,
        next: () => void,
      ) => {
        const mockUserHeader = req.headers['x-mock-user'];
        if (mockUserHeader) {
          try {
            req.user = JSON.parse(mockUserHeader);
          } catch {
            // noop
          }
        }
        next();
      },
    );

    app.setGlobalPrefix('api/v1', {
      exclude: [{ path: 'health', method: RequestMethod.GET }],
    });
    app.useGlobalFilters(new Rfc7807ExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    inMemoryAuditLogs.length = 0;
    inMemoryUsers.length = 0;
  });

  it('automatically writes an audit log row when creating a user', async () => {
    const payload = {
      email: 'newbie@acme.com',
      name: 'Newbie User',
      roleId: agentRoleId,
    };

    const res = await request(app.getHttpServer())
      .post('/api/v1/iam/users')
      .set('Host', `${testTenant.slug}.localhost`)
      .set('x-mock-user', JSON.stringify(adminUser))
      .set('User-Agent', 'SupertestRunner/1.0')
      .send(payload)
      .expect(201);

    expect(res.body.id).toBeDefined();

    // Allow async interceptor microtask to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(inMemoryAuditLogs.length).toBeGreaterThan(0);
    const audit = inMemoryAuditLogs.find(
      (l) => l.action === AuditActions.CREATE && l.entity === 'user',
    );
    expect(audit).toBeDefined();
    expect(audit!.tenant_id).toBe(testTenant.id);
    expect(audit!.actor_id).toBe(adminUser.id);
    expect(audit!.actor_email).toBe(adminUser.email);
    expect(audit!.entity_id).toBe(res.body.id);
    expect(audit!.after?.email).toBe('newbie@acme.com');
  });

  it('automatically writes an audit log row when updating a user', async () => {
    const createdUser = await mockTx.user.create({
      data: {
        tenant_id: testTenant.id,
        email: 'target@acme.com',
        name: 'Original Target',
        role_id: agentRoleId,
      },
    });

    await request(app.getHttpServer())
      .patch(`/api/v1/iam/users/${createdUser.id}`)
      .set('Host', `${testTenant.slug}.localhost`)
      .set('x-mock-user', JSON.stringify(adminUser))
      .send({ name: 'Updated Target Name' })
      .expect(200);

    await new Promise((resolve) => setTimeout(resolve, 50));

    const updateAudit = inMemoryAuditLogs.find(
      (l) => l.action === AuditActions.UPDATE && l.entity_id === createdUser.id,
    );
    expect(updateAudit).toBeDefined();
    expect(updateAudit!.actor_id).toBe(adminUser.id);
    expect(updateAudit!.after?.name).toBe('Updated Target Name');
  });

  it('writes a PII audit log when reading user profile with @AuditPiiView', async () => {
    const existingUser = await mockTx.user.create({
      data: {
        tenant_id: testTenant.id,
        email: 'confidential@acme.com',
        name: 'Confidential Person',
        role_id: agentRoleId,
      },
    });

    await request(app.getHttpServer())
      .get(`/api/v1/iam/users/${existingUser.id}`)
      .set('Host', `${testTenant.slug}.localhost`)
      .set('x-mock-user', JSON.stringify(adminUser))
      .expect(200);

    await new Promise((resolve) => setTimeout(resolve, 50));

    const piiAudit = inMemoryAuditLogs.find(
      (l) => l.action === AuditActions.READ_PII && l.entity_id === existingUser.id,
    );
    expect(piiAudit).toBeDefined();
    expect(piiAudit!.entity).toBe('user');
    expect(piiAudit!.metadata?.piiFields).toContain('name');
    expect(piiAudit!.metadata?.piiFields).toContain('email');
  });

  it('allows authorized user to query audit logs via GET /api/v1/audit-logs', async () => {
    // Record dummy audit log directly in memory
    inMemoryAuditLogs.push({
      id: randomUUID(),
      tenant_id: testTenant.id,
      actor_id: adminUser.id,
      actor_type: 'user',
      actor_email: adminUser.email,
      action: AuditActions.CREATE,
      entity: 'user',
      entity_id: 'usr-dummy',
      created_at: new Date(),
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/audit-logs')
      .set('Host', `${testTenant.slug}.localhost`)
      .set('x-mock-user', JSON.stringify(adminUser))
      .expect(200);

    expect(res.body.items).toBeDefined();
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.total).toBeGreaterThan(0);
  });

  it('denies audit logs query to user without audit.read permission', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/audit-logs')
      .set('Host', `${testTenant.slug}.localhost`)
      .set('x-mock-user', JSON.stringify(agentUser))
      .expect(403);
  });
});
