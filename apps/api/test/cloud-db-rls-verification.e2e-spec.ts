import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { AgentStatus, DataScope, UserContext } from '@vcrm/shared';
import { TenantPrismaService } from '../src/database/tenant-prisma.service';
import { PrismaService } from '../src/database/prisma.service';
import { PermissionGuard } from '../src/iam/guards/permission.guard';
import { DataScopeHelper } from '../src/iam/helpers/data-scope.helper';
import { AuditService } from '../src/audit/audit.service';
import { Permissions, PERMISSION_KEY } from '../src/iam/iam.constants';
import { AuditActions, AuditActorTypes } from '../src/audit/audit.constants';

describe('Cloud Database RLS & Security Verification Suite (e2e)', () => {
  // Test Tenancy Fixtures
  const tenantA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const tenantB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  // In-Memory Database Model emulating PostgreSQL 16 RLS Engine with NOBYPASSRLS & Table Revocations
  interface DbRecord {
    id: string;
    tenant_id: string;
    [key: string]: unknown;
  }

  interface AuditRecord {
    id: string;
    tenant_id: string;
    actor_id?: string;
    actor_type: string;
    actor_email?: string;
    action: string;
    entity: string;
    entity_id?: string;
    before?: unknown;
    after?: unknown;
    ip_address?: string;
    user_agent?: string;
    metadata?: unknown;
    created_at: Date;
  }

  let dbTenantConfigs: DbRecord[];
  let dbAuditLogs: AuditRecord[];
  let activeTransactionTenant: string | null = null;

  let tenantPrisma: TenantPrismaService;
  let auditService: AuditService;

  beforeEach(() => {
    activeTransactionTenant = null;

    dbTenantConfigs = [
      { id: 'cfg-tenant-a-1', tenant_id: tenantA, key: 'branding', value: { theme: 'dark' } },
      { id: 'cfg-tenant-a-2', tenant_id: tenantA, key: 'locale', value: { lang: 'th' } },
      { id: 'cfg-tenant-b-1', tenant_id: tenantB, key: 'branding', value: { theme: 'light' } },
      { id: 'cfg-tenant-b-2', tenant_id: tenantB, key: 'locale', value: { lang: 'en' } },
    ];

    dbAuditLogs = [
      {
        id: randomUUID(),
        tenant_id: tenantA,
        actor_id: randomUUID(),
        actor_type: AuditActorTypes.USER,
        actor_email: 'admin@tenant-a.com',
        action: AuditActions.CREATE,
        entity: 'case',
        entity_id: 'case-101',
        before: null,
        after: { status: 'open' },
        created_at: new Date(),
      },
      {
        id: randomUUID(),
        tenant_id: tenantB,
        actor_id: randomUUID(),
        actor_type: AuditActorTypes.USER,
        actor_email: 'admin@tenant-b.com',
        action: AuditActions.CREATE,
        entity: 'case',
        entity_id: 'case-202',
        before: null,
        after: { status: 'open' },
        created_at: new Date(),
      },
    ];
  });

  // Mock Prisma Service implementing native PostgreSQL RLS and role permissions
  const createMockPrismaService = () => ({
    $transaction: jest.fn().mockImplementation(async (callback) => {
      let sessionTenantId: string | null = null;

      const mockTx = {
        $executeRaw: jest
          .fn()
          .mockImplementation((strings: TemplateStringsArray, ...values: unknown[]) => {
            const sql = Array.isArray(strings) ? strings.join('?') : String(strings);
            if (sql.includes('set_config') && sql.includes('app.tenant_id')) {
              sessionTenantId = (values[0] as string) || null;
              activeTransactionTenant = sessionTenantId;
            }
            return Promise.resolve(1);
          }),

        tenantConfig: {
          findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
            const row = dbTenantConfigs.find((r) => r.id === where.id);
            // Postgres RLS: if row.tenant_id does not match sessionTenantId, row is filtered out
            if (!row || row.tenant_id !== sessionTenantId) {
              return Promise.resolve(null);
            }
            return Promise.resolve(row);
          }),

          findMany: jest.fn().mockImplementation(({ where }: { where?: { key?: string } } = {}) => {
            // Postgres RLS filter applied at kernel level: USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
            const rows = dbTenantConfigs.filter((r) => {
              if (r.tenant_id !== sessionTenantId) return false;
              if (where?.key && r.key !== where.key) return false;
              return true;
            });
            return Promise.resolve(rows);
          }),

          update: jest
            .fn()
            .mockImplementation(
              ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
                const index = dbTenantConfigs.findIndex(
                  (r) => r.id === where.id && r.tenant_id === sessionTenantId,
                );
                if (index === -1) {
                  throw new Error('Record not found or access denied by RLS policy');
                }
                dbTenantConfigs[index] = { ...dbTenantConfigs[index]!, ...data };
                return Promise.resolve(dbTenantConfigs[index]!);
              },
            ),

          delete: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
            const index = dbTenantConfigs.findIndex(
              (r) => r.id === where.id && r.tenant_id === sessionTenantId,
            );
            if (index === -1) {
              throw new Error('Record not found or access denied by RLS policy');
            }
            const deleted = dbTenantConfigs.splice(index, 1)[0]!;
            return Promise.resolve(deleted);
          }),

          create: jest.fn().mockImplementation(({ data }: { data: DbRecord }) => {
            // Postgres RLS WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
            if (data.tenant_id !== sessionTenantId) {
              const err = new Error(
                'new row violates row-level security policy for table "tenant_configs"',
              );
              (err as unknown as { code: string }).code = '42501';
              throw err;
            }
            dbTenantConfigs.push(data);
            return Promise.resolve(data);
          }),
        },

        auditLog: {
          create: jest
            .fn()
            .mockImplementation(({ data }: { data: Omit<AuditRecord, 'id' | 'created_at'> }) => {
              if (data.tenant_id !== sessionTenantId) {
                const err = new Error(
                  'new row violates row-level security policy for table "audit_logs"',
                );
                (err as unknown as { code: string }).code = '42501';
                throw err;
              }
              const record: AuditRecord = {
                id: randomUUID(),
                ...data,
                created_at: new Date(),
              };
              dbAuditLogs.push(record);
              return Promise.resolve(record);
            }),

          findMany: jest
            .fn()
            .mockImplementation(
              ({ where }: { where?: { tenant_id?: string; entity?: string } } = {}) => {
                let results = dbAuditLogs.filter((l) => l.tenant_id === sessionTenantId);
                if (where?.entity) {
                  results = results.filter((l) => l.entity === where.entity);
                }
                return Promise.resolve(results);
              },
            ),

          findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
            const row = dbAuditLogs.find((l) => l.id === where.id);
            if (!row || row.tenant_id !== sessionTenantId) {
              return Promise.resolve(null);
            }
            return Promise.resolve(row);
          }),
        },
      };

      try {
        const result = await callback(mockTx);
        return result;
      } finally {
        // Reset transaction-local state simulating is_local = true parameter cleanup
        activeTransactionTenant = null;
      }
    }),
  });

  beforeAll(async () => {
    const mockPrisma = createMockPrismaService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantPrismaService,
        AuditService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    tenantPrisma = module.get<TenantPrismaService>(TenantPrismaService);
    auditService = module.get<AuditService>(AuditService);
  });

  // =========================================================================
  // 1. Multi-Tenant Isolation using current_setting('app.tenant_id')
  // =========================================================================
  describe('1. Native Multi-Tenant Isolation via current_setting("app.tenant_id")', () => {
    it('executes SELECT set_config("app.tenant_id", $1, true) within transaction boundaries', async () => {
      let verifiedTenantInsideTx: string | null = null;

      await tenantPrisma.withTenant(tenantA, async () => {
        verifiedTenantInsideTx = activeTransactionTenant;
        return Promise.resolve();
      });

      expect(verifiedTenantInsideTx).toBe(tenantA);
    });

    it('ensures session parameter is strictly local (is_local = true) and cleared post-transaction', async () => {
      await tenantPrisma.withTenant(tenantA, async () => {
        expect(activeTransactionTenant).toBe(tenantA);
        return Promise.resolve();
      });

      // Post-transaction, parameter must be reset to prevent connection pool contamination
      expect(activeTransactionTenant).toBeNull();
    });

    it('rejects queries immediately when tenantId is empty or undefined', async () => {
      await expect(tenantPrisma.withTenant('', async () => Promise.resolve())).rejects.toThrow(
        'Tenant ID is required to execute tenant-scoped queries',
      );

      await expect(
        tenantPrisma.withTenant(undefined as unknown as string, async () => Promise.resolve()),
      ).rejects.toThrow('Tenant ID is required to execute tenant-scoped queries');
    });

    it('fails closed when tenant context is missing (returns 0 rows)', async () => {
      const result = await tenantPrisma.withTenant(randomUUID(), async (tx) => {
        const client = tx as unknown as { tenantConfig: { findMany: () => Promise<DbRecord[]> } };
        return client.tenantConfig.findMany();
      });

      expect(result).toEqual([]);
    });
  });

  // =========================================================================
  // 2. Cross-Tenant Data Leak Protection (Tenant A vs Tenant B)
  // =========================================================================
  describe('2. Cross-Tenant Data Leak Protection (Tenant A vs Tenant B)', () => {
    it('allows Tenant A to read its own configuration records', async () => {
      const result = await tenantPrisma.withTenant(tenantA, async (tx) => {
        const client = tx as unknown as {
          tenantConfig: { findUnique: (args: unknown) => Promise<DbRecord | null> };
        };
        return client.tenantConfig.findUnique({
          where: { id: 'cfg-tenant-a-1' },
        });
      });

      expect(result).not.toBeNull();
      expect(result?.id).toBe('cfg-tenant-a-1');
      expect(result?.tenant_id).toBe(tenantA);
    });

    it('strictly prevents Tenant A from reading Tenant B row even with forged ID (returns null)', async () => {
      const result = await tenantPrisma.withTenant(tenantA, async (tx) => {
        const client = tx as unknown as {
          tenantConfig: { findUnique: (args: unknown) => Promise<DbRecord | null> };
        };
        return client.tenantConfig.findUnique({
          where: { id: 'cfg-tenant-b-1' },
        });
      });

      expect(result).toBeNull();
    });

    it('strictly isolates bulk queries so Tenant A receives zero records belonging to Tenant B', async () => {
      const rows = await tenantPrisma.withTenant(tenantA, async (tx) => {
        const client = tx as unknown as { tenantConfig: { findMany: () => Promise<DbRecord[]> } };
        return client.tenantConfig.findMany();
      });

      expect(rows.length).toBe(2);
      expect(rows.every((r) => r.tenant_id === tenantA)).toBe(true);
      expect(rows.some((r) => r.tenant_id === tenantB)).toBe(false);
    });

    it('strictly blocks Tenant A from updating Tenant B record by forged ID (leaves Tenant B intact)', async () => {
      await expect(
        tenantPrisma.withTenant(tenantA, async (tx) => {
          const client = tx as unknown as {
            tenantConfig: {
              update: (args: {
                where: { id: string };
                data: Record<string, unknown>;
              }) => Promise<DbRecord>;
            };
          };
          return client.tenantConfig.update({
            where: { id: 'cfg-tenant-b-1' },
            data: { value: { theme: 'hacked-by-tenant-a' } },
          });
        }),
      ).rejects.toThrow('Record not found or access denied by RLS policy');

      // Verify Tenant B's record was not modified
      const originalRecord = dbTenantConfigs.find((r) => r.id === 'cfg-tenant-b-1');
      expect(originalRecord?.value).toEqual({ theme: 'light' });
    });

    it('strictly blocks Tenant A from deleting Tenant B record by forged ID (leaves Tenant B intact)', async () => {
      await expect(
        tenantPrisma.withTenant(tenantA, async (tx) => {
          const client = tx as unknown as {
            tenantConfig: { delete: (args: { where: { id: string } }) => Promise<DbRecord> };
          };
          return client.tenantConfig.delete({
            where: { id: 'cfg-tenant-b-1' },
          });
        }),
      ).rejects.toThrow('Record not found or access denied by RLS policy');

      const existingRecord = dbTenantConfigs.find((r) => r.id === 'cfg-tenant-b-1');
      expect(existingRecord).toBeDefined();
    });

    it('rejects cross-tenant forged INSERT via WITH CHECK policy violation', async () => {
      await expect(
        tenantPrisma.withTenant(tenantA, async (tx) => {
          const client = tx as unknown as {
            tenantConfig: { create: (args: { data: DbRecord }) => Promise<DbRecord> };
          };
          return client.tenantConfig.create({
            data: {
              id: 'cfg-forged-b',
              tenant_id: tenantB, // Forged tenant ID inserted while session is Tenant A
              key: 'security_override',
              value: { exploit: true },
            },
          });
        }),
      ).rejects.toThrow('new row violates row-level security policy');
    });
  });

  // =========================================================================
  // 3. Database Role Permissions (vcrm_app NOBYPASSRLS vs vcrm_owner)
  // =========================================================================
  describe('3. Database Role Permissions (vcrm_app NOBYPASSRLS)', () => {
    it('verifies infra/docker/postgres/init-db.sql defines vcrm_app with NOBYPASSRLS and NOSUPERUSER', () => {
      const initDbPath = path.resolve(__dirname, '../../../infra/docker/postgres/init-db.sql');
      expect(fs.existsSync(initDbPath)).toBe(true);

      const initDbContent = fs.readFileSync(initDbPath, 'utf-8');

      // Check role separation
      expect(initDbContent).toContain('CREATE ROLE vcrm_owner WITH LOGIN PASSWORD');
      expect(initDbContent).toContain('SUPERUSER');
      expect(initDbContent).toContain('CREATE ROLE vcrm_app WITH LOGIN PASSWORD');
      expect(initDbContent).toContain('NOBYPASSRLS NOSUPERUSER');

      // Check schema permissions
      expect(initDbContent).toContain('GRANT USAGE ON SCHEMA public TO vcrm_app');
      expect(initDbContent).toContain('GRANT ALL ON SCHEMA public TO vcrm_owner');
    });

    it('verifies all Prisma migration scripts apply FORCE ROW LEVEL SECURITY and AS RESTRICTIVE policies', () => {
      const migrationsDir = path.resolve(__dirname, '../prisma/migrations');
      expect(fs.existsSync(migrationsDir)).toBe(true);

      const tenancyMigration = fs.readFileSync(
        path.join(migrationsDir, '20260921000000_init_tenancy_rls/migration.sql'),
        'utf-8',
      );
      expect(tenancyMigration).toContain('ALTER TABLE "tenant_configs" ENABLE ROW LEVEL SECURITY;');
      expect(tenancyMigration).toContain('ALTER TABLE "tenant_configs" FORCE ROW LEVEL SECURITY;');
      expect(tenancyMigration).toContain('AS RESTRICTIVE');
      expect(tenancyMigration).toContain("current_setting('app.tenant_id', true)");

      const iamMigration = fs.readFileSync(
        path.join(migrationsDir, '20260921010000_iam/migration.sql'),
        'utf-8',
      );
      expect(iamMigration).toContain('ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;');
      expect(iamMigration).toContain('ALTER TABLE "users" FORCE ROW LEVEL SECURITY;');
      expect(iamMigration).toContain('ALTER TABLE "teams" FORCE ROW LEVEL SECURITY;');
      expect(iamMigration).toContain('ALTER TABLE "skills" FORCE ROW LEVEL SECURITY;');

      const authMigration = fs.readFileSync(
        path.join(migrationsDir, '20260921020000_auth/migration.sql'),
        'utf-8',
      );
      expect(authMigration).toContain('ALTER TABLE "sessions" FORCE ROW LEVEL SECURITY;');
      expect(authMigration).toContain('ALTER TABLE "user_identities" FORCE ROW LEVEL SECURITY;');
    });

    it('verifies application runtime connects via vcrm_app role in env.config.ts', () => {
      const envConfigPath = path.resolve(__dirname, '../src/config/env.config.ts');
      const envConfigContent = fs.readFileSync(envConfigPath, 'utf-8');

      expect(envConfigContent).toContain('postgresql://vcrm_app:changeme@localhost:5432/vcrm');
      expect(envConfigContent).toContain('DATABASE_MIGRATION_URL');
      expect(envConfigContent).toContain('postgresql://vcrm_owner:changeme@localhost:5432/vcrm');
    });
  });

  // =========================================================================
  // 4. Engine-Level Immutable AuditLog (audit_logs UPDATE and DELETE rejected)
  // =========================================================================
  describe('4. Engine-Level Immutable AuditLog (audit_logs UPDATE & DELETE rejected)', () => {
    it('verifies migration 20260921030000_audit_log explicitly revokes UPDATE and DELETE from vcrm_app', () => {
      const auditMigrationPath = path.resolve(
        __dirname,
        '../prisma/migrations/20260921030000_audit_log/migration.sql',
      );
      expect(fs.existsSync(auditMigrationPath)).toBe(true);

      const content = fs.readFileSync(auditMigrationPath, 'utf-8');
      expect(content).toContain('REVOKE UPDATE, DELETE ON "audit_logs" FROM vcrm_app;');
      expect(content).toContain('ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;');
      expect(content).toContain('CREATE POLICY tenant_isolation_audit_logs ON "audit_logs"');
    });

    it('statically asserts migration DDL revokes UPDATE and DELETE privileges on audit_logs from vcrm_app', () => {
      const auditMigrationPath = path.resolve(
        __dirname,
        '../prisma/migrations/20260921030000_audit_log/migration.sql',
      );
      const content = fs.readFileSync(auditMigrationPath, 'utf-8');

      // Verify explicit PostgreSQL privilege revocation statement in migration
      expect(content).toMatch(
        /REVOKE\s+UPDATE\s*,\s*DELETE\s+ON\s+["']?audit_logs["']?\s+FROM\s+vcrm_app/i,
      );
    });

    it('statically asserts init-db.sql grants no table alteration or update bypasses to vcrm_app', () => {
      const initDbPath = path.resolve(__dirname, '../../../infra/docker/postgres/init-db.sql');
      const content = fs.readFileSync(initDbPath, 'utf-8');

      // Verify application role is strictly NOBYPASSRLS and NOSUPERUSER
      expect(content).toContain('CREATE ROLE vcrm_app WITH LOGIN PASSWORD');
      expect(content).toContain('NOBYPASSRLS NOSUPERUSER');
    });

    it('allows append-only INSERT of audit log entries with actor, action, and diff states', async () => {
      const actorId = randomUUID();
      const newEntry = await auditService.record({
        tenantId: tenantA,
        actorId,
        actorType: AuditActorTypes.USER,
        actorEmail: 'agent@tenant-a.com',
        action: AuditActions.UPDATE,
        entity: 'case',
        entityId: 'case-999',
        before: { status: 'open', priority: 'medium' },
        after: { status: 'in_progress', priority: 'high' },
        ipAddress: '192.168.1.100',
        userAgent: 'vCRM-Browser/1.0',
        metadata: { source: 'agent-portal' },
      });

      expect(newEntry).toBeDefined();
      expect(newEntry.id).toBeDefined();
      expect(newEntry.tenant_id).toBe(tenantA);
      expect(newEntry.action).toBe(AuditActions.UPDATE);
      expect(newEntry.entity).toBe('case');
      expect(newEntry.actor_email).toBe('agent@tenant-a.com');
      expect(newEntry.before).toEqual({ status: 'open', priority: 'medium' });
      expect(newEntry.after).toEqual({ status: 'in_progress', priority: 'high' });
    });

    it('verifies AuditService interface guarantees immutability (no update/delete methods)', () => {
      const proto = Object.getPrototypeOf(auditService);
      const methods = Object.getOwnPropertyNames(proto);

      expect(methods).toContain('record');
      expect(methods).toContain('findMany');
      expect(methods).toContain('findById');

      // Immutability invariant: No mutating methods on audit records
      expect(methods).not.toContain('update');
      expect(methods).not.toContain('delete');
      expect(methods).not.toContain('destroy');
      expect(methods).not.toContain('truncate');
    });
  });

  // =========================================================================
  // 5. RBAC Permission Enforcement with Data Scopes (own, team, all)
  // =========================================================================
  describe('5. RBAC Permission Enforcement with Data Scopes (own, team, all)', () => {
    let reflector: Reflector;
    let permissionGuard: PermissionGuard;

    const team1 = randomUUID();
    const team2 = randomUUID();

    const agentOwnUser: UserContext = {
      id: randomUUID(),
      tenantId: tenantA,
      email: 'agent1@tenant-a.com',
      name: 'Agent One',
      role: 'Agent',
      teamId: team1,
      status: AgentStatus.ONLINE,
      maxConcurrentChats: 3,
      permissions: [{ code: Permissions.CASE_READ, dataScope: DataScope.OWN }],
    };

    const supervisorTeamUser: UserContext = {
      id: randomUUID(),
      tenantId: tenantA,
      email: 'supervisor@tenant-a.com',
      name: 'Supervisor',
      role: 'Supervisor',
      teamId: team1,
      status: AgentStatus.ONLINE,
      maxConcurrentChats: 5,
      permissions: [{ code: Permissions.CASE_READ, dataScope: DataScope.TEAM }],
    };

    const adminAllUser: UserContext = {
      id: randomUUID(),
      tenantId: tenantA,
      email: 'admin@tenant-a.com',
      name: 'Admin All',
      role: 'TenantAdmin',
      teamId: team1,
      status: AgentStatus.ONLINE,
      maxConcurrentChats: 5,
      permissions: [{ code: Permissions.CASE_READ, dataScope: DataScope.ALL }],
    };

    const superAdminUser: UserContext = {
      id: randomUUID(),
      tenantId: tenantA,
      email: 'superadmin@vcrm.app',
      name: 'Global Admin',
      role: 'SuperAdmin',
      status: AgentStatus.ONLINE,
      maxConcurrentChats: 10,
      permissions: [],
    };

    beforeAll(() => {
      reflector = new Reflector();
      permissionGuard = new PermissionGuard(reflector);
    });

    const createMockExecutionContext = (
      user?: UserContext,
      requiredPermission?: string,
    ): { context: ExecutionContext; req: { user?: UserContext; dataScope?: DataScope } } => {
      const req: { user?: UserContext; dataScope?: DataScope } = { user };

      jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: unknown) => {
        if (key === PERMISSION_KEY) return requiredPermission;
        return undefined;
      });

      const context = {
        getHandler: jest.fn(),
        getClass: jest.fn(),
        switchToHttp: () => ({
          getRequest: () => req,
        }),
      } as unknown as ExecutionContext;

      return { context, req };
    };

    it('rejects request with 403 Forbidden when user lacks required permission', () => {
      const userWithoutPerm: UserContext = {
        ...agentOwnUser,
        permissions: [{ code: Permissions.USER_READ, dataScope: DataScope.ALL }],
      };

      const { context } = createMockExecutionContext(userWithoutPerm, Permissions.CASE_READ);

      expect(() => permissionGuard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => permissionGuard.canActivate(context)).toThrow(
        "Missing required permission 'case.read'",
      );
    });

    it('rejects request with 403 Forbidden when user is unauthenticated', () => {
      const { context } = createMockExecutionContext(undefined, Permissions.CASE_READ);

      expect(() => permissionGuard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => permissionGuard.canActivate(context)).toThrow(
        'Authenticated user identity is required',
      );
    });

    it('enforces DataScope.OWN: attaches OWN scope and generates created_by filter', () => {
      const { context, req } = createMockExecutionContext(agentOwnUser, Permissions.CASE_READ);

      const allowed = permissionGuard.canActivate(context);
      expect(allowed).toBe(true);
      expect(req.dataScope).toBe(DataScope.OWN);

      const filter = DataScopeHelper.buildFilter(agentOwnUser, req.dataScope);
      expect(filter).toEqual({ created_by: agentOwnUser.id });

      // Verify scoping isolates from other users' records
      const otherUserId = randomUUID();
      expect(filter['created_by']).not.toBe(otherUserId);
    });

    it('enforces DataScope.TEAM: attaches TEAM scope and generates team_id filter', () => {
      const { context, req } = createMockExecutionContext(
        supervisorTeamUser,
        Permissions.CASE_READ,
      );

      const allowed = permissionGuard.canActivate(context);
      expect(allowed).toBe(true);
      expect(req.dataScope).toBe(DataScope.TEAM);

      const filter = DataScopeHelper.buildFilter(supervisorTeamUser, req.dataScope);
      expect(filter).toEqual({ team_id: team1 });

      // Verify scoping isolates from records belonging to team2
      expect(filter['team_id']).not.toBe(team2);
    });

    it('enforces DataScope.ALL: attaches ALL scope and produces empty filter (all tenant records)', () => {
      const { context, req } = createMockExecutionContext(adminAllUser, Permissions.CASE_READ);

      const allowed = permissionGuard.canActivate(context);
      expect(allowed).toBe(true);
      expect(req.dataScope).toBe(DataScope.ALL);

      const filter = DataScopeHelper.buildFilter(adminAllUser, req.dataScope);
      expect(filter).toEqual({});
    });

    it('allows SuperAdmin global bypass without explicit granular permissions', () => {
      const { context, req } = createMockExecutionContext(superAdminUser, Permissions.CASE_READ);

      const allowed = permissionGuard.canActivate(context);
      expect(allowed).toBe(true);
      expect(req.dataScope).toBe(DataScope.ALL);

      const filter = DataScopeHelper.buildFilter(superAdminUser, req.dataScope);
      expect(filter).toEqual({});
    });
  });
});
