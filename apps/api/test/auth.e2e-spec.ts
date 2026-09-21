import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, RequestMethod } from '@nestjs/common';
import request from 'supertest';
import { randomUUID, generateKeyPairSync } from 'crypto';
import jwt from 'jsonwebtoken';
import { AppModule } from '../src/app.module';
import { Rfc7807ExceptionFilter } from '../src/common/filters/rfc7807-exception.filter';
import { PrismaService } from '../src/database/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { CryptoUtils } from '../src/auth/utils/crypto.utils';
import { AgentStatus, DataScope, TenantStatus } from '@vcrm/shared';
import { AuthProvider } from '../src/auth/auth.constants';
import { Permissions } from '../src/iam/iam.constants';

describe('Authentication & OIDC / JWT Integration (e2e)', () => {
  let app: INestApplication;
  let authService: AuthService;

  const testTenant = {
    id: randomUUID(),
    slug: 'acme',
    name: 'Acme Corp',
    status: TenantStatus.ACTIVE,
    plan: 'enterprise',
  };

  const adminUser = {
    id: randomUUID(),
    tenant_id: testTenant.id,
    email: 'admin@acme.com',
    name: 'Admin Boss',
    role_id: randomUUID(),
    role: {
      id: randomUUID(),
      name: 'TenantAdmin',
      permissions: [
        {
          permission: { code: Permissions.USER_CREATE },
          data_scope: DataScope.ALL,
        },
        {
          permission: { code: Permissions.USER_READ },
          data_scope: DataScope.ALL,
        },
      ],
    },
    team_id: null,
    status: AgentStatus.ONLINE,
    max_concurrent_chats: 5,
    skills: [],
    created_at: new Date(),
    updated_at: new Date(),
  };

  const agentUser = {
    id: randomUUID(),
    tenant_id: testTenant.id,
    email: 'agent@acme.com',
    name: 'Somchai Agent',
    role_id: randomUUID(),
    role: {
      id: randomUUID(),
      name: 'Agent',
      permissions: [
        {
          permission: { code: Permissions.CASE_READ },
          data_scope: DataScope.OWN,
        },
      ],
    },
    team_id: null,
    status: AgentStatus.ONLINE,
    max_concurrent_chats: 3,
    skills: [],
    created_at: new Date(),
    updated_at: new Date(),
  };

  let adminPasswordHash: string;
  let agentPasswordHash: string;
  const adminRawPassword = 'adminPassword123!';
  const agentRawPassword = 'agentPassword123!';

  // In-memory data store
  const inMemoryUsers: Array<Record<string, unknown>> = [];
  const inMemoryIdentities: Array<Record<string, unknown>> = [];
  const inMemorySessions: Array<Record<string, unknown>> = [];

  // RSA Keypair for Keycloak OIDC mock verification
  const { privateKey: oidcPrivateKey, publicKey: oidcPublicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const oidcKid = 'keycloak-test-key-id';

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
      findMany: jest.fn().mockImplementation(() => Promise.resolve([...inMemoryUsers])),
    },
    userIdentity: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        if (where?.tenant_id_provider_provider_user_id) {
          const { tenant_id, provider, provider_user_id } =
            where.tenant_id_provider_provider_user_id;
          return Promise.resolve(
            inMemoryIdentities.find(
              (i) =>
                i.tenant_id === tenant_id &&
                i.provider === provider &&
                i.provider_user_id === provider_user_id,
            ) || null,
          );
        }
        return Promise.resolve(null);
      }),
      update: jest.fn().mockImplementation(({ where, data }) => {
        const idx = inMemoryIdentities.findIndex((i) => i.id === where.id);
        if (idx >= 0) {
          inMemoryIdentities[idx] = { ...inMemoryIdentities[idx], ...data };
          return Promise.resolve(inMemoryIdentities[idx]);
        }
        return Promise.resolve(null);
      }),
      upsert: jest.fn().mockImplementation(({ where, create, update }) => {
        const { tenant_id, provider, provider_user_id } = where.tenant_id_provider_provider_user_id;
        const idx = inMemoryIdentities.findIndex(
          (i) =>
            i.tenant_id === tenant_id &&
            i.provider === provider &&
            i.provider_user_id === provider_user_id,
        );
        if (idx >= 0) {
          inMemoryIdentities[idx] = { ...inMemoryIdentities[idx], ...update };
          return Promise.resolve(inMemoryIdentities[idx]);
        }
        const created = { id: randomUUID(), ...create };
        inMemoryIdentities.push(created);
        return Promise.resolve(created);
      }),
    },
    session: {
      create: jest.fn().mockImplementation(({ data }) => {
        const session = { id: randomUUID(), ...data };
        inMemorySessions.push(session);
        return Promise.resolve(session);
      }),
      update: jest.fn().mockImplementation(({ where, data }) => {
        const idx = inMemorySessions.findIndex((s) => s.id === where.id);
        if (idx >= 0) {
          inMemorySessions[idx] = { ...inMemorySessions[idx], ...data };
          return Promise.resolve(inMemorySessions[idx]);
        }
        return Promise.resolve(null);
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
    session: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        return Promise.resolve(
          inMemorySessions.find((s) => s.refresh_token_hash === where.refresh_token_hash) || null,
        );
      }),
      updateMany: jest.fn().mockImplementation(({ where, data }) => {
        let count = 0;
        inMemorySessions.forEach((s) => {
          if (s.refresh_token_hash === where.refresh_token_hash) {
            Object.assign(s, data);
            count++;
          }
        });
        return Promise.resolve({ count });
      }),
    },
    user: {
      findFirst: jest.fn().mockImplementation(({ where }) => {
        return Promise.resolve(inMemoryUsers.find((u) => u.email === where.email) || null);
      }),
      findUnique: jest.fn().mockImplementation(({ where }) => {
        return Promise.resolve(inMemoryUsers.find((u) => u.id === where.id) || null);
      }),
    },
    $transaction: jest.fn().mockImplementation(async (callback) => {
      return callback(mockTx);
    }),
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    adminPasswordHash = await CryptoUtils.hashPassword(adminRawPassword);
    agentPasswordHash = await CryptoUtils.hashPassword(agentRawPassword);

    inMemoryUsers.push(adminUser, agentUser);
    inMemoryIdentities.push(
      {
        id: randomUUID(),
        tenant_id: testTenant.id,
        user_id: adminUser.id,
        provider: AuthProvider.LOCAL,
        provider_user_id: adminUser.email,
        password_hash: adminPasswordHash,
        last_login_at: null,
      },
      {
        id: randomUUID(),
        tenant_id: testTenant.id,
        user_id: agentUser.id,
        provider: AuthProvider.LOCAL,
        provider_user_id: agentUser.email,
        password_hash: agentPasswordHash,
        last_login_at: null,
      },
    );

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .compile();

    app = moduleFixture.createNestApplication();
    authService = app.get(AuthService);

    // Register mock OIDC public key in AuthService
    authService.setMockPublicKey(oidcKid, oidcPublicKey);

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

  describe('Local Login Flow (POST /api/v1/auth/login)', () => {
    it('successfully logs in with email and password and returns access token and user context (200 OK)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('X-Tenant', 'acme')
        .send({
          email: 'admin@acme.com',
          password: adminRawPassword,
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body.tokenType).toBe('Bearer');
      expect(res.body.expiresIn).toBe(900);
      expect(res.body.user).toHaveProperty('id', adminUser.id);
      expect(res.body.user).toHaveProperty('email', 'admin@acme.com');
      expect(res.body.user).toHaveProperty('role', 'TenantAdmin');
      expect(res.body.user.permissions).toHaveLength(2);
    });

    it('rejects login with incorrect password (401 Unauthorized)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('X-Tenant', 'acme')
        .send({
          email: 'admin@acme.com',
          password: 'wrongPassword123!',
        });

      expect(res.status).toBe(401);
      expect(res.body.type).toBe('https://vcrm.app/errors/unauthorized');
      expect(res.body.detail).toContain('Invalid email or password');
    });

    it('rejects login for non-existent user email (401 Unauthorized)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('X-Tenant', 'acme')
        .send({
          email: 'ghost@acme.com',
          password: 'password123!',
        });

      expect(res.status).toBe(401);
      expect(res.body.type).toBe('https://vcrm.app/errors/unauthorized');
    });
  });

  describe('Protected Profile API (GET /api/v1/auth/me)', () => {
    let adminToken: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('X-Tenant', 'acme')
        .send({
          email: 'admin@acme.com',
          password: adminRawPassword,
        });
      adminToken = res.body.accessToken;
    });

    it('returns current user context when called with valid Bearer token (200 OK)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(adminUser.id);
      expect(res.body.email).toBe('admin@acme.com');
      expect(res.body.role).toBe('TenantAdmin');
    });

    it('rejects access when Bearer token is missing (401 Unauthorized)', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.type).toBe('https://vcrm.app/errors/unauthorized');
      expect(res.body.detail).toContain('Bearer token is required');
    });

    it('rejects access when Bearer token is invalid/forged (401 Unauthorized)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer forged.invalid.token');

      expect(res.status).toBe(401);
      expect(res.body.type).toBe('https://vcrm.app/errors/unauthorized');
    });
  });

  describe('Refresh Token Rotation (POST /api/v1/auth/refresh)', () => {
    it('rotates refresh token and returns new tokens (200 OK)', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('X-Tenant', 'acme')
        .send({
          email: 'agent@acme.com',
          password: agentRawPassword,
        });

      const initialRefreshToken = loginRes.body.refreshToken;

      const refreshRes = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: initialRefreshToken });

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body).toHaveProperty('accessToken');
      expect(refreshRes.body).toHaveProperty('refreshToken');
      expect(refreshRes.body.refreshToken).not.toBe(initialRefreshToken);

      // Verify the new access token can be used to access protected endpoints
      const meRes = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${refreshRes.body.accessToken}`);

      expect(meRes.status).toBe(200);
      expect(meRes.body.email).toBe('agent@acme.com');

      // Attempting to reuse old refresh token must be rejected (401 Unauthorized)
      const reuseRes = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: initialRefreshToken });

      expect(reuseRes.status).toBe(401);
      expect(reuseRes.body.detail).toContain('Invalid or expired refresh token');
    });
  });

  describe('Logout (POST /api/v1/auth/logout)', () => {
    it('revokes session so the refresh token can no longer be used (200 OK)', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('X-Tenant', 'acme')
        .send({
          email: 'admin@acme.com',
          password: adminRawPassword,
        });

      const refreshToken = loginRes.body.refreshToken;

      const logoutRes = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .send({ refreshToken });

      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.success).toBe(true);

      // Refresh with revoked token must fail
      const refreshRes = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken });

      expect(refreshRes.status).toBe(401);
    });
  });

  describe('Keycloak OIDC JWT Verification Mock', () => {
    it('authenticates user with Keycloak OIDC RS256 token signed by private key (200 OK)', async () => {
      // Enable OIDC mode in authService for this test
      (authService as unknown as { authMode: string }).authMode = 'oidc';

      const oidcToken = jwt.sign(
        {
          sub: 'kc-sub-somchai',
          email: 'agent@acme.com',
          tenantId: testTenant.id,
        },
        oidcPrivateKey,
        {
          algorithm: 'RS256',
          keyid: oidcKid,
          expiresIn: '15m',
        },
      );

      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${oidcToken}`);

      expect(res.status).toBe(200);
      expect(res.body.email).toBe('agent@acme.com');
      expect(res.body.role).toBe('Agent');
    });
  });

  describe('End-to-End IAM Permission Enforcement with Real Bearer Tokens', () => {
    let adminToken: string;
    let agentToken: string;

    beforeAll(async () => {
      // Reset auth mode to local
      (authService as unknown as { authMode: string }).authMode = 'local';

      const adminLogin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('X-Tenant', 'acme')
        .send({ email: 'admin@acme.com', password: adminRawPassword });
      adminToken = adminLogin.body.accessToken;

      const agentLogin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('X-Tenant', 'acme')
        .send({ email: 'agent@acme.com', password: agentRawPassword });
      agentToken = agentLogin.body.accessToken;
    });

    it('allows Admin with user.read to list users using Bearer token (200 OK)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/iam/users')
        .set('X-Tenant', 'acme')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('blocks Agent lacking user.create from creating users using Bearer token (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/iam/users')
        .set('X-Tenant', 'acme')
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          email: 'agent3@acme.com',
          name: 'New Agent',
          roleId: randomUUID(),
        });

      expect(res.status).toBe(403);
      expect(res.body.detail).toContain("Missing required permission 'user.create'");
    });
  });
});
