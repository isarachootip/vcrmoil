import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPublicKey } from 'crypto';
import jwt from 'jsonwebtoken';
import { PrismaService } from '../database/prisma.service';
import { TenantPrismaService } from '../database/tenant-prisma.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AuthResponseDto, TokenRefreshResponseDto } from './dto/auth-response.dto';
import { CryptoUtils } from './utils/crypto.utils';
import {
  ACCESS_TOKEN_EXPIRES_IN_SEC,
  AuthProvider,
  REFRESH_TOKEN_EXPIRES_IN_DAYS,
} from './auth.constants';
import { AgentStatus, DataScope, UserContext } from '@vcrm/shared';

interface JwkKey {
  kid: string;
  kty: string;
  n: string;
  e: string;
  [key: string]: unknown;
}

interface JwksResponse {
  keys: JwkKey[];
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly jwtSecret: string;
  private readonly authMode: 'local' | 'oidc';
  private readonly oidcIssuerUrl: string;
  private readonly jwksCache = new Map<string, { pem: string; expiresAt: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly configService: ConfigService,
  ) {
    this.jwtSecret = this.configService.get<string>('JWT_LOCAL_SECRET', 'dev-only-change-me');
    this.authMode = this.configService.get<'local' | 'oidc'>('AUTH_MODE', 'local');
    this.oidcIssuerUrl = this.configService.get<string>(
      'OIDC_ISSUER_URL',
      'http://localhost:8080/realms/vcrm',
    );
  }

  // Set mock public key for testing Keycloak OIDC verification
  setMockPublicKey(kid: string, pem: string) {
    this.jwksCache.set(kid, {
      pem,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    });
  }

  // ==================== LOCAL LOGIN ====================

  async login(
    dto: LoginDto,
    tenantId?: string,
    clientMeta?: { ip?: string; userAgent?: string },
  ): Promise<AuthResponseDto> {
    const email = dto.email.toLowerCase().trim();

    // 1. Resolve tenant
    let targetTenantId = tenantId;
    if (!targetTenantId) {
      if (!dto.tenantSlug) {
        throw new UnauthorizedException('Tenant identification is required to login');
      }
      const tenant = await this.prisma.tenant.findUnique({
        where: { slug: dto.tenantSlug },
      });
      if (!tenant) {
        throw new UnauthorizedException('Invalid tenant or credentials');
      }
      targetTenantId = tenant.id;
    }

    // 2. Fetch user within tenant
    return this.tenantPrisma.withTenant(targetTenantId, async (tx) => {
      const user = await tx.user.findUnique({
        where: {
          tenant_id_email: {
            tenant_id: targetTenantId,
            email,
          },
        },
        include: {
          role: {
            include: {
              permissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      });

      if (!user) {
        throw new UnauthorizedException('Invalid email or password');
      }

      // 3. Verify local identity password hash
      const identity = await tx.userIdentity.findUnique({
        where: {
          tenant_id_provider_provider_user_id: {
            tenant_id: targetTenantId,
            provider: AuthProvider.LOCAL,
            provider_user_id: email,
          },
        },
      });

      if (!identity || !identity.password_hash) {
        throw new UnauthorizedException('Invalid email or password');
      }

      const isPasswordValid = await CryptoUtils.verifyPassword(
        dto.password,
        identity.password_hash,
      );

      if (!isPasswordValid) {
        throw new UnauthorizedException('Invalid email or password');
      }

      // 4. Update last login
      await tx.userIdentity.update({
        where: { id: identity.id },
        data: { last_login_at: new Date() },
      });

      // 5. Construct UserContext
      const userContext: UserContext = {
        id: user.id,
        tenantId: user.tenant_id,
        email: user.email,
        name: user.name,
        role: user.role.name,
        teamId: user.team_id || undefined,
        status: user.status as AgentStatus,
        maxConcurrentChats: user.max_concurrent_chats,
        permissions: user.role.permissions.map((rp) => ({
          code: rp.permission.code,
          dataScope: rp.data_scope as DataScope,
        })),
      };

      // 6. Sign access token (JWT)
      const accessToken = this.generateAccessToken(userContext);

      // 7. Generate & store refresh token in Session
      const refreshToken = CryptoUtils.generateRandomToken(32);
      const refreshTokenHash = CryptoUtils.hashToken(refreshToken);
      const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000);

      await tx.session.create({
        data: {
          tenant_id: targetTenantId,
          user_id: user.id,
          refresh_token_hash: refreshTokenHash,
          user_agent: clientMeta?.userAgent,
          ip_address: clientMeta?.ip,
          expires_at: expiresAt,
        },
      });

      return {
        accessToken,
        refreshToken,
        expiresIn: ACCESS_TOKEN_EXPIRES_IN_SEC,
        tokenType: 'Bearer',
        user: userContext,
      };
    });
  }

  // ==================== REFRESH TOKEN ====================

  async refresh(
    dto: RefreshTokenDto,
    clientMeta?: { ip?: string; userAgent?: string },
  ): Promise<TokenRefreshResponseDto> {
    const refreshTokenHash = CryptoUtils.hashToken(dto.refreshToken);

    // Look up active session
    const session = await this.prisma.session.findUnique({
      where: { refresh_token_hash: refreshTokenHash },
    });

    if (!session || session.revoked_at || session.expires_at < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    return this.tenantPrisma.withTenant(session.tenant_id, async (tx) => {
      // 1. Revoke the used session (rotation)
      await tx.session.update({
        where: { id: session.id },
        data: { revoked_at: new Date() },
      });

      // 2. Fetch fresh user context
      const user = await tx.user.findUnique({
        where: { id: session.user_id },
        include: {
          role: {
            include: {
              permissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      });

      if (!user) {
        throw new UnauthorizedException('User account no longer exists');
      }

      const userContext: UserContext = {
        id: user.id,
        tenantId: user.tenant_id,
        email: user.email,
        name: user.name,
        role: user.role.name,
        teamId: user.team_id || undefined,
        status: user.status as AgentStatus,
        maxConcurrentChats: user.max_concurrent_chats,
        permissions: user.role.permissions.map((rp) => ({
          code: rp.permission.code,
          dataScope: rp.data_scope as DataScope,
        })),
      };

      // 3. Generate new tokens
      const newAccessToken = this.generateAccessToken(userContext);
      const newRefreshToken = CryptoUtils.generateRandomToken(32);
      const newRefreshTokenHash = CryptoUtils.hashToken(newRefreshToken);
      const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000);

      // 4. Save new active session
      await tx.session.create({
        data: {
          tenant_id: session.tenant_id,
          user_id: user.id,
          refresh_token_hash: newRefreshTokenHash,
          user_agent: clientMeta?.userAgent,
          ip_address: clientMeta?.ip,
          expires_at: expiresAt,
        },
      });

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresIn: ACCESS_TOKEN_EXPIRES_IN_SEC,
        tokenType: 'Bearer',
      };
    });
  }

  // ==================== LOGOUT ====================

  async logout(refreshToken?: string): Promise<{ success: boolean }> {
    if (refreshToken) {
      const refreshTokenHash = CryptoUtils.hashToken(refreshToken);
      await this.prisma.session.updateMany({
        where: {
          refresh_token_hash: refreshTokenHash,
          revoked_at: null,
        },
        data: {
          revoked_at: new Date(),
        },
      });
    }
    return { success: true };
  }

  // ==================== TOKEN VERIFICATION ====================

  async verifyToken(token: string): Promise<UserContext> {
    try {
      // 1. Try local JWT verification
      try {
        const decoded = jwt.verify(token, this.jwtSecret) as jwt.JwtPayload;
        return await this.loadUserContextFromPayload(decoded);
      } catch (localErr) {
        // 2. If local fails and OIDC is enabled, try OIDC verification
        if (this.authMode === 'oidc') {
          const decoded = await this.verifyOidcToken(token);
          return await this.syncAndLoadOidcUser(decoded);
        }
        throw localErr;
      }
    } catch {
      throw new UnauthorizedException('Invalid or expired authentication token');
    }
  }

  async getOidcPublicKey(kid: string): Promise<string> {
    const cached = this.jwksCache.get(kid);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.pem;
    }

    try {
      const jwksUrl = `${this.oidcIssuerUrl}/protocol/openid-connect/certs`;
      const res = await fetch(jwksUrl);
      if (!res.ok) {
        throw new Error(`JWKS HTTP error: ${res.statusText}`);
      }

      const data = (await res.json()) as JwksResponse;
      for (const key of data.keys) {
        if (key.kid && key.kty === 'RSA') {
          const pubKey = createPublicKey({
            key: {
              kty: key.kty,
              n: key.n,
              e: key.e,
            },
            format: 'jwk',
          });
          const pem = pubKey.export({ type: 'spki', format: 'pem' }) as string;
          this.jwksCache.set(key.kid, {
            pem,
            expiresAt: Date.now() + 10 * 60 * 1000,
          });
        }
      }
    } catch (err) {
      this.logger.warn(`Could not refresh JWKS keys: ${(err as Error).message}`);
    }

    const found = this.jwksCache.get(kid);
    if (!found) {
      throw new Error(`Public key with kid '${kid}' not found in JWKS`);
    }
    return found.pem;
  }

  private async verifyOidcToken(token: string): Promise<jwt.JwtPayload> {
    const decodedHeader = jwt.decode(token, { complete: true });
    if (!decodedHeader || typeof decodedHeader === 'string' || !decodedHeader.header.kid) {
      throw new UnauthorizedException('Invalid token header or missing kid');
    }

    const pem = await this.getOidcPublicKey(decodedHeader.header.kid);
    return new Promise((resolve, reject) => {
      jwt.verify(
        token,
        pem,
        {
          algorithms: ['RS256'],
        },
        (err, decoded) => {
          if (err) return reject(err);
          resolve(decoded as jwt.JwtPayload);
        },
      );
    });
  }

  // ==================== HELPERS ====================

  generateAccessToken(user: UserContext): string {
    return jwt.sign(
      {
        sub: user.id,
        tenantId: user.tenantId,
        email: user.email,
        name: user.name,
        role: user.role,
        teamId: user.teamId,
        status: user.status,
        maxConcurrentChats: user.maxConcurrentChats,
        permissions: user.permissions,
      },
      this.jwtSecret,
      {
        algorithm: 'HS256',
        expiresIn: ACCESS_TOKEN_EXPIRES_IN_SEC,
      },
    );
  }

  private async loadUserContextFromPayload(payload: jwt.JwtPayload): Promise<UserContext> {
    const userId = payload.sub as string;
    const tenantId = payload.tenantId as string;

    if (!userId || !tenantId) {
      throw new UnauthorizedException('Malformed token payload');
    }

    return this.tenantPrisma.withTenant(tenantId, async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        include: {
          role: {
            include: {
              permissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      });

      if (!user || user.tenant_id !== tenantId) {
        throw new UnauthorizedException('User no longer exists or tenant mismatch');
      }

      return {
        id: user.id,
        tenantId: user.tenant_id,
        email: user.email,
        name: user.name,
        role: user.role.name,
        teamId: user.team_id || undefined,
        status: user.status as AgentStatus,
        maxConcurrentChats: user.max_concurrent_chats,
        permissions: user.role.permissions.map((rp) => ({
          code: rp.permission.code,
          dataScope: rp.data_scope as DataScope,
        })),
      };
    });
  }

  private async syncAndLoadOidcUser(payload: jwt.JwtPayload): Promise<UserContext> {
    const email = (payload.email as string)?.toLowerCase();
    const sub = payload.sub as string;
    const tenantId = (payload.tenant_id || payload.tenantId) as string | undefined;

    if (!email || !sub) {
      throw new UnauthorizedException('OIDC token missing email or subject');
    }

    // Lookup user by email in tenant
    const user = await this.prisma.user.findFirst({
      where: {
        email,
        ...(tenantId ? { tenant_id: tenantId } : {}),
      },
      include: {
        role: {
          include: {
            permissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException(
        `User '${email}' not provisioned in vCRM. Contact your administrator.`,
      );
    }

    // Auto-link Keycloak UserIdentity if not already linked
    await this.tenantPrisma.withTenant(user.tenant_id, async (tx) => {
      await tx.userIdentity.upsert({
        where: {
          tenant_id_provider_provider_user_id: {
            tenant_id: user.tenant_id,
            provider: AuthProvider.KEYCLOAK,
            provider_user_id: sub,
          },
        },
        update: {
          last_login_at: new Date(),
        },
        create: {
          tenant_id: user.tenant_id,
          user_id: user.id,
          provider: AuthProvider.KEYCLOAK,
          provider_user_id: sub,
          last_login_at: new Date(),
        },
      });
    });

    return {
      id: user.id,
      tenantId: user.tenant_id,
      email: user.email,
      name: user.name,
      role: user.role.name,
      teamId: user.team_id || undefined,
      status: user.status as AgentStatus,
      maxConcurrentChats: user.max_concurrent_chats,
      permissions: user.role.permissions.map((rp) => ({
        code: rp.permission.code,
        dataScope: rp.data_scope as DataScope,
      })),
    };
  }

  // ==================== IDENTITY PROVISIONING HELPER ====================

  async createLocalIdentity(
    tenantId: string,
    userId: string,
    email: string,
    passwordPlain: string,
  ) {
    const passwordHash = await CryptoUtils.hashPassword(passwordPlain);
    return this.tenantPrisma.withTenant(tenantId, async (tx) => {
      return tx.userIdentity.upsert({
        where: {
          tenant_id_provider_provider_user_id: {
            tenant_id: tenantId,
            provider: AuthProvider.LOCAL,
            provider_user_id: email.toLowerCase().trim(),
          },
        },
        update: {
          password_hash: passwordHash,
        },
        create: {
          tenant_id: tenantId,
          user_id: userId,
          provider: AuthProvider.LOCAL,
          provider_user_id: email.toLowerCase().trim(),
          password_hash: passwordHash,
        },
      });
    });
  }
}
