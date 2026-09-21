import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, RequestMethod } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { Rfc7807ExceptionFilter } from '../src/common/filters/rfc7807-exception.filter';
import { PrismaService } from '../src/database/prisma.service';
import { AgentStatus, DataScope, TenantStatus, UserContext } from '@vcrm/shared';
import { Permissions } from '../src/iam/iam.constants';

describe('IAM & RBAC Permission Guard (e2e)', () => {
  let app: INestApplication;

  const testTenant = {
    id: randomUUID(),
    slug: 'acme',
    name: 'Acme Corp',
    status: TenantStatus.ACTIVE,
    plan: 'enterprise',
  };

  const agentRoleId = randomUUID();
  const adminRoleId = randomUUID();

  const agentUser: UserContext = {
    id: randomUUID(),
    tenantId: testTenant.id,
    email: 'agent@acme.com',
    name: 'Somchai Agent',
    role: 'Agent',
    teamId: randomUUID(),
    status: AgentStatus.ONLINE,
    maxConcurrentChats: 3,
    permissions: [
      { code: Permissions.CASE_READ, dataScope: DataScope.TEAM },
      { code: Permissions.CASE_UPDATE, dataScope: DataScope.OWN },
    ],
  };

  const adminUser: UserContext = {
    id: randomUUID(),
    tenantId: testTenant.id,
    email: 'admin@acme.com',
    name: 'Admin Boss',
    role: 'TenantAdmin',
    teamId: randomUUID(),
    status: AgentStatus.ONLINE,
    maxConcurrentChats: 5,
    permissions: [
      { code: Permissions.USER_CREATE, dataScope: DataScope.ALL },
      { code: Permissions.USER_READ, dataScope: DataScope.ALL },
      { code: Permissions.USER_UPDATE, dataScope: DataScope.ALL },
      { code: Permissions.USER_DELETE, dataScope: DataScope.ALL },
      { code: Permissions.TEAM_MANAGE, dataScope: DataScope.ALL },
      { code: Permissions.ROLE_MANAGE, dataScope: DataScope.ALL },
      { code: Permissions.SKILL_MANAGE, dataScope: DataScope.ALL },
    ],
  };

  const superAdminUser: UserContext = {
    id: randomUUID(),
    tenantId: testTenant.id,
    email: 'superadmin@vcrm.app',
    name: 'Global Admin',
    role: 'SuperAdmin',
    status: AgentStatus.ONLINE,
    maxConcurrentChats: 10,
    permissions: [],
  };

  // In-memory data store interfaces
  interface MockUserRecord {
    id: string;
    tenant_id: string;
    email: string;
    name: string;
    role_id: string;
    team_id?: string;
    status: string;
    max_concurrent_chats: number;
    created_at: Date;
    updated_at: Date;
    [key: string]: unknown;
  }

  interface MockTeamRecord {
    id: string;
    tenant_id: string;
    name: string;
    description?: string;
    created_at: Date;
    updated_at: Date;
    [key: string]: unknown;
  }

  interface MockSkillRecord {
    id: string;
    tenant_id: string;
    name: string;
    description?: string;
    created_at: Date;
    [key: string]: unknown;
  }

  interface MockUserSkillRecord {
    id: string;
    user_id: string;
    skill_id: string;
    level: number;
    [key: string]: unknown;
  }

  const inMemoryUsers: MockUserRecord[] = [];
  const inMemoryTeams: MockTeamRecord[] = [];
  const inMemorySkills: MockSkillRecord[] = [];
  const inMemoryUserSkills: MockUserSkillRecord[] = [];

  const mockTx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
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
      findMany: jest.fn().mockImplementation(({ where } = {}) => {
        let results = [...inMemoryUsers];
        if (where?.tenant_id) {
          results = results.filter((u) => u.tenant_id === where.tenant_id);
        }
        if (where?.id) {
          results = results.filter((u) => u.id === where.id);
        }
        if (where?.team_id) {
          results = results.filter((u) => u.team_id === where.team_id);
        }
        return Promise.resolve(results);
      }),
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
    team: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        if (where?.tenant_id_name) {
          return Promise.resolve(
            inMemoryTeams.find(
              (t) =>
                t.tenant_id === where.tenant_id_name.tenant_id &&
                t.name === where.tenant_id_name.name,
            ) || null,
          );
        }
        if (where?.id) {
          return Promise.resolve(inMemoryTeams.find((t) => t.id === where.id) || null);
        }
        return Promise.resolve(null);
      }),
      findMany: jest.fn().mockImplementation(() => Promise.resolve([...inMemoryTeams])),
      create: jest.fn().mockImplementation(({ data }) => {
        const created = {
          id: randomUUID(),
          ...data,
          created_at: new Date(),
          updated_at: new Date(),
        };
        inMemoryTeams.push(created);
        return Promise.resolve(created);
      }),
      delete: jest.fn().mockImplementation(({ where }) => {
        const idx = inMemoryTeams.findIndex((t) => t.id === where.id);
        if (idx !== -1) inMemoryTeams.splice(idx, 1);
        return Promise.resolve({ id: where.id });
      }),
    },
    skill: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        if (where?.tenant_id_name) {
          return Promise.resolve(
            inMemorySkills.find(
              (s) =>
                s.tenant_id === where.tenant_id_name.tenant_id &&
                s.name === where.tenant_id_name.name,
            ) || null,
          );
        }
        if (where?.id) {
          return Promise.resolve(inMemorySkills.find((s) => s.id === where.id) || null);
        }
        return Promise.resolve(null);
      }),
      findMany: jest.fn().mockImplementation(() => Promise.resolve([...inMemorySkills])),
      create: jest.fn().mockImplementation(({ data }) => {
        const created = {
          id: randomUUID(),
          ...data,
          created_at: new Date(),
        };
        inMemorySkills.push(created);
        return Promise.resolve(created);
      }),
    },
    userSkill: {
      upsert: jest.fn().mockImplementation(({ where, create, update }) => {
        const existingIdx = inMemoryUserSkills.findIndex(
          (us) =>
            us.user_id === where.user_id_skill_id.user_id &&
            us.skill_id === where.user_id_skill_id.skill_id,
        );
        if (existingIdx >= 0) {
          inMemoryUserSkills[existingIdx].level = update.level;
          return Promise.resolve({
            ...inMemoryUserSkills[existingIdx],
            skill: { id: update.skill_id || where.user_id_skill_id.skill_id, name: 'Thai Voice' },
          });
        }
        const created = {
          id: randomUUID(),
          ...create,
          skill: { id: create.skill_id, name: 'Thai Voice' },
        };
        inMemoryUserSkills.push(created);
        return Promise.resolve(created);
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
        { id: agentRoleId, name: 'Agent', is_system: true, permissions: [] },
        { id: adminRoleId, name: 'TenantAdmin', is_system: true, permissions: [] },
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

    // Attach mock user extractor middleware for testing RBAC
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
            // ignore parsing error
          }
        }
        next();
      },
    );

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

  describe('Unauthenticated Access', () => {
    it('returns 403 Forbidden when calling protected endpoint without authenticated user', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/iam/users')
        .set('X-Tenant', 'acme');

      expect(res.status).toBe(403);
      expect(res.body.type).toBe('https://vcrm.app/errors/forbidden');
      expect(res.body.detail).toContain('Authenticated user identity is required');
    });
  });

  describe('Agent Role Restrictions (Forbidden 403)', () => {
    it('blocks Agent from creating new users (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/iam/users')
        .set('X-Tenant', 'acme')
        .set('X-Mock-User', JSON.stringify(agentUser))
        .send({
          email: 'newuser@acme.com',
          name: 'New Agent',
          roleId: agentRoleId,
        });

      expect(res.status).toBe(403);
      expect(res.body.type).toBe('https://vcrm.app/errors/forbidden');
      expect(res.body.detail).toContain("Missing required permission 'user.create'");
    });

    it('blocks Agent from creating new teams (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/iam/teams')
        .set('X-Tenant', 'acme')
        .set('X-Mock-User', JSON.stringify(agentUser))
        .send({
          name: 'Tier 2 Support',
          description: 'Escalations team',
        });

      expect(res.status).toBe(403);
      expect(res.body.type).toBe('https://vcrm.app/errors/forbidden');
      expect(res.body.detail).toContain("Missing required permission 'team.manage'");
    });

    it('blocks Agent from creating new skills (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/iam/skills')
        .set('X-Tenant', 'acme')
        .set('X-Mock-User', JSON.stringify(agentUser))
        .send({
          name: 'Thai Billing',
        });

      expect(res.status).toBe(403);
      expect(res.body.type).toBe('https://vcrm.app/errors/forbidden');
      expect(res.body.detail).toContain("Missing required permission 'skill.manage'");
    });
  });

  describe('TenantAdmin Operations (Authorized 200/201)', () => {
    let createdUserId: string;
    let createdSkillId: string;

    it('allows Admin with user.create to create a new user (201 Created)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/iam/users')
        .set('X-Tenant', 'acme')
        .set('X-Mock-User', JSON.stringify(adminUser))
        .send({
          email: 'agent2@acme.com',
          name: 'Anong Agent',
          roleId: agentRoleId,
          status: AgentStatus.ONLINE,
          maxConcurrentChats: 3,
        });

      expect(res.status).toBe(201);
      expect(res.body.email).toBe('agent2@acme.com');
      expect(res.body.name).toBe('Anong Agent');
      createdUserId = res.body.id;
    });

    it('allows Admin with user.read to list users (200 OK)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/iam/users')
        .set('X-Tenant', 'acme')
        .set('X-Mock-User', JSON.stringify(adminUser));

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });

    it('allows Admin with team.manage to create a team (201 Created)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/iam/teams')
        .set('X-Tenant', 'acme')
        .set('X-Mock-User', JSON.stringify(adminUser))
        .send({
          name: 'Customer Success',
          description: 'Tier 1 contact team',
        });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Customer Success');
    });

    it('allows Admin with skill.manage to create a skill (201 Created)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/iam/skills')
        .set('X-Tenant', 'acme')
        .set('X-Mock-User', JSON.stringify(adminUser))
        .send({
          name: 'Thai Billing Expertise',
          description: 'Handing tax invoices and billing queries',
        });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Thai Billing Expertise');
      createdSkillId = res.body.id;
    });

    it('allows Admin to assign skill with level 1-5 to a user (200 OK)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/iam/skills/${createdUserId}/assign`)
        .set('X-Tenant', 'acme')
        .set('X-Mock-User', JSON.stringify(adminUser))
        .send({
          skillId: createdSkillId,
          level: 4,
        });

      expect(res.status).toBe(200);
      expect(res.body.level).toBe(4);
      expect(res.body.skill).toBeDefined();
    });

    it('rejects skill assignment with invalid level > 5 (400 Bad Request)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/iam/skills/${createdUserId}/assign`)
        .set('X-Tenant', 'acme')
        .set('X-Mock-User', JSON.stringify(adminUser))
        .send({
          skillId: createdSkillId,
          level: 10, // Max allowed is 5
        });

      expect(res.status).toBe(400);
      expect(res.body.type).toBe('https://vcrm.app/errors/validation-error');
    });
  });

  describe('SuperAdmin Global Access', () => {
    it('allows SuperAdmin to access endpoints without explicit granular permissions', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/iam/roles')
        .set('X-Tenant', 'acme')
        .set('X-Mock-User', JSON.stringify(superAdminUser));

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);
    });
  });

  describe('RBAC DataScope Enforcement on User Listings', () => {
    const teamAlphaId = randomUUID();
    const teamBetaId = randomUUID();

    const agentAlpha: UserContext = {
      id: randomUUID(),
      tenantId: testTenant.id,
      email: 'agent.alpha@acme.com',
      name: 'Agent Alpha',
      role: 'Agent',
      teamId: teamAlphaId,
      status: AgentStatus.ONLINE,
      maxConcurrentChats: 3,
      permissions: [{ code: Permissions.USER_READ, dataScope: DataScope.OWN }],
    };

    const supervisorAlpha: UserContext = {
      id: randomUUID(),
      tenantId: testTenant.id,
      email: 'supervisor.alpha@acme.com',
      name: 'Supervisor Alpha',
      role: 'Supervisor',
      teamId: teamAlphaId,
      status: AgentStatus.ONLINE,
      maxConcurrentChats: 5,
      permissions: [{ code: Permissions.USER_READ, dataScope: DataScope.TEAM }],
    };

    beforeAll(() => {
      // Seed distinct users across team Alpha and team Beta into inMemoryUsers
      inMemoryUsers.push(
        {
          id: agentAlpha.id,
          tenant_id: testTenant.id,
          email: agentAlpha.email,
          name: agentAlpha.name,
          role_id: agentRoleId,
          team_id: teamAlphaId,
          status: 'online',
          max_concurrent_chats: 3,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: supervisorAlpha.id,
          tenant_id: testTenant.id,
          email: supervisorAlpha.email,
          name: supervisorAlpha.name,
          role_id: agentRoleId,
          team_id: teamAlphaId,
          status: 'online',
          max_concurrent_chats: 5,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: randomUUID(),
          tenant_id: testTenant.id,
          email: 'agent.beta@acme.com',
          name: 'Agent Beta',
          role_id: agentRoleId,
          team_id: teamBetaId,
          status: 'online',
          max_concurrent_chats: 3,
          created_at: new Date(),
          updated_at: new Date(),
        },
      );
    });

    it('enforces DataScope.OWN returning only the current user record', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/iam/users')
        .set('X-Tenant', 'acme')
        .set('X-Mock-User', JSON.stringify(agentAlpha));

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(1);
      expect(res.body[0].id).toBe(agentAlpha.id);
      expect(res.body[0].email).toBe(agentAlpha.email);
    });

    it('enforces DataScope.TEAM returning only users in the caller team', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/iam/users')
        .set('X-Tenant', 'acme')
        .set('X-Mock-User', JSON.stringify(supervisorAlpha));

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(2);
      expect(res.body.every((u: { team_id?: string }) => u.team_id === teamAlphaId)).toBe(true);
    });

    it('enforces DataScope.ALL returning all users in the tenant', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/iam/users')
        .set('X-Tenant', 'acme')
        .set('X-Mock-User', JSON.stringify(adminUser));

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(3);
    });
  });
});
