import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateKeyPairSync } from 'crypto';
import jwt from 'jsonwebtoken';
import { AuthService } from './auth.service';
import { PrismaService } from '../database/prisma.service';
import { TenantPrismaService } from '../database/tenant-prisma.service';
import { CryptoUtils } from './utils/crypto.utils';
import { AuthProvider } from './auth.constants';
import { AgentStatus } from '@vcrm/shared';

describe('AuthService', () => {
  let service: AuthService;
  let mockPrisma: Record<string, unknown>;
  let mockTenantPrisma: Record<string, unknown>;
  let configService: Partial<ConfigService>;

  const jwtSecret = 'test-jwt-secret-key-32-chars-long!!';
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const userId = '00000000-0000-0000-0000-000000000002';
  const email = 'admin@acme.com';
  const rawPassword = 'password123';

  let inMemorySessions: Array<Record<string, unknown>> = [];
  let storedPasswordHash: string;

  beforeAll(async () => {
    storedPasswordHash = await CryptoUtils.hashPassword(rawPassword);
  });

  beforeEach(() => {
    inMemorySessions = [];

    const mockUser = {
      id: userId,
      tenant_id: tenantId,
      email,
      name: 'Admin User',
      role: {
        id: 'role-1',
        name: 'TenantAdmin',
        permissions: [
          {
            permission: { code: 'user.create' },
            data_scope: 'all',
          },
        ],
      },
      team_id: null,
      status: AgentStatus.ONLINE,
      max_concurrent_chats: 5,
    };

    const mockIdentity = {
      id: 'identity-1',
      tenant_id: tenantId,
      user_id: userId,
      provider: AuthProvider.LOCAL,
      provider_user_id: email,
      password_hash: storedPasswordHash,
      last_login_at: null,
    };

    const mockTx = {
      user: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where?.tenant_id_email?.email === email || where?.id === userId) {
            return Promise.resolve(mockUser);
          }
          return Promise.resolve(null);
        }),
      },
      userIdentity: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where?.tenant_id_provider_provider_user_id?.provider_user_id === email) {
            return Promise.resolve(mockIdentity);
          }
          return Promise.resolve(null);
        }),
        update: jest.fn().mockResolvedValue(mockIdentity),
        upsert: jest.fn().mockResolvedValue(mockIdentity),
      },
      session: {
        create: jest.fn().mockImplementation(({ data }) => {
          const session = { id: `session-${Date.now()}`, ...data };
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

    mockTenantPrisma = {
      withTenant: jest.fn().mockImplementation((_tid, cb) => cb(mockTx)),
    };

    mockPrisma = {
      tenant: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.slug === 'acme' || where.id === tenantId) {
            return Promise.resolve({ id: tenantId, slug: 'acme', name: 'Acme Corp' });
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
        findFirst: jest.fn().mockResolvedValue(mockUser),
      },
    };

    configService = {
      get: jest.fn().mockImplementation((key: string, defaultVal: unknown) => {
        if (key === 'JWT_LOCAL_SECRET') return jwtSecret;
        if (key === 'AUTH_MODE') return 'local';
        if (key === 'OIDC_ISSUER_URL') return 'http://localhost:8080/realms/vcrm';
        return defaultVal;
      }),
    };

    service = new AuthService(
      mockPrisma as unknown as PrismaService,
      mockTenantPrisma as unknown as TenantPrismaService,
      configService as ConfigService,
    );
  });

  describe('login', () => {
    it('successfully logs in with valid credentials and returns tokens and UserContext', async () => {
      const res = await service.login({ email, password: rawPassword }, tenantId);

      expect(res.accessToken).toBeDefined();
      expect(res.refreshToken).toBeDefined();
      expect(res.tokenType).toBe('Bearer');
      expect(res.expiresIn).toBe(900);
      expect(res.user.email).toBe(email);
      expect(res.user.role).toBe('TenantAdmin');
      expect(inMemorySessions).toHaveLength(1);
    });

    it('throws UnauthorizedException when password does not match', async () => {
      await expect(service.login({ email, password: 'wrong-password' }, tenantId)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when user does not exist', async () => {
      await expect(
        service.login({ email: 'unknown@acme.com', password: rawPassword }, tenantId),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('rotates refresh token and returns new tokens while revoking old session', async () => {
      const loginRes = await service.login({ email, password: rawPassword }, tenantId);
      const oldRefreshToken = loginRes.refreshToken;

      const refreshRes = await service.refresh({ refreshToken: oldRefreshToken });

      expect(refreshRes.accessToken).toBeDefined();
      expect(refreshRes.refreshToken).toBeDefined();
      expect(refreshRes.refreshToken).not.toBe(oldRefreshToken);

      // Old session was marked revoked
      const oldHash = CryptoUtils.hashToken(oldRefreshToken);
      const oldSession = inMemorySessions.find((s) => s.refresh_token_hash === oldHash);
      expect(oldSession?.revoked_at).toBeDefined();

      // New active session exists
      expect(inMemorySessions).toHaveLength(2);
    });

    it('throws UnauthorizedException when attempting to reuse a revoked refresh token', async () => {
      const loginRes = await service.login({ email, password: rawPassword }, tenantId);
      await service.refresh({ refreshToken: loginRes.refreshToken });

      // Attempting to refresh again with old token fails
      await expect(service.refresh({ refreshToken: loginRes.refreshToken })).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('revokes session for the specified refresh token', async () => {
      const loginRes = await service.login({ email, password: rawPassword }, tenantId);
      const result = await service.logout(loginRes.refreshToken);

      expect(result.success).toBe(true);

      const hash = CryptoUtils.hashToken(loginRes.refreshToken);
      const session = inMemorySessions.find((s) => s.refresh_token_hash === hash);
      expect(session?.revoked_at).toBeDefined();
    });
  });

  describe('verifyToken', () => {
    it('verifies a valid local JWT token and loads fresh user context', async () => {
      const loginRes = await service.login({ email, password: rawPassword }, tenantId);
      const user = await service.verifyToken(loginRes.accessToken);

      expect(user.id).toBe(userId);
      expect(user.email).toBe(email);
      expect(user.role).toBe('TenantAdmin');
    });

    it('throws UnauthorizedException when token signature is invalid', async () => {
      const invalidToken = jwt.sign({ sub: userId, tenantId }, 'wrong-secret');
      await expect(service.verifyToken(invalidToken)).rejects.toThrow(UnauthorizedException);
    });

    it('verifies Keycloak OIDC RS256 token using public key', async () => {
      // Generate test RSA key pair
      const { privateKey, publicKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });

      // Configure service with OIDC mode and mock public key
      (service as unknown as { authMode: string }).authMode = 'oidc';
      service.setMockPublicKey('keycloak-test-kid', publicKey);

      const oidcToken = jwt.sign(
        {
          sub: 'kc-sub-123',
          email,
          tenantId,
        },
        privateKey,
        {
          algorithm: 'RS256',
          keyid: 'keycloak-test-kid',
          expiresIn: '15m',
        },
      );

      const user = await service.verifyToken(oidcToken);
      expect(user.email).toBe(email);
      expect(user.id).toBe(userId);
    });
  });
});
