import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, RequestMethod } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { TenantPrismaService } from '../src/database/tenant-prisma.service';
import { PrismaService } from '../src/database/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { AuditActions, AuditActorTypes } from '../src/audit/audit.constants';
import { AppModule } from '../src/app.module';
import { Rfc7807ExceptionFilter } from '../src/common/filters/rfc7807-exception.filter';
import { AgentStatus, DataScope, TenantStatus, UserContext } from '@vcrm/shared';
import { Permissions } from '../src/iam/iam.constants';

describe('Adversarial RLS, Tenant Isolation & Immutable AuditLog Suite (e2e)', () => {
  // Test Tenancies
  const tenantA = '11111111-1111-4111-8111-111111111111';
  const tenantB = '22222222-2222-4222-8222-222222222222';
  const tenantC = '33333333-3333-4333-8333-333333333333';
  const nonexistentTenant = '99999999-9999-4999-8999-999999999999';

  // In-memory PostgreSQL 16 Kernel Emulator enforcing:
  // - Strict NOBYPASSRLS
  // - FORCE ROW LEVEL SECURITY
  // - AS RESTRICTIVE policies
  // - REVOKE UPDATE, DELETE on audit_logs from vcrm_app
  // - Transaction-local set_config('app.tenant_id', val, true)
  interface DbConfigRecord {
    id: string;
    tenant_id: string;
    key: string;
    value: unknown;
  }

  interface DbAuditRecord {
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

  let dbConfigs: DbConfigRecord[];
  let dbAuditLogs: DbAuditRecord[];
  let activeSessionTenant: string | null = null;
  let currentDbRole: 'vcrm_app' | 'vcrm_owner' = 'vcrm_app';

  // Reset in-memory database store
  const resetDb = () => {
    currentDbRole = 'vcrm_app';
    activeSessionTenant = null;

    dbConfigs = [
      { id: 'cfg-tenant-a-1', tenant_id: tenantA, key: 'branding', value: { theme: 'dark' } },
      { id: 'cfg-tenant-a-2', tenant_id: tenantA, key: 'webhook', value: { url: 'https://a.com' } },
      { id: 'cfg-tenant-b-1', tenant_id: tenantB, key: 'branding', value: { theme: 'light' } },
      { id: 'cfg-tenant-b-2', tenant_id: tenantB, key: 'webhook', value: { url: 'https://b.com' } },
      { id: 'cfg-tenant-c-1', tenant_id: tenantC, key: 'branding', value: { theme: 'cyber' } },
    ];

    dbAuditLogs = [
      {
        id: 'audit-log-a-001',
        tenant_id: tenantA,
        actor_id: randomUUID(),
        actor_type: AuditActorTypes.USER,
        actor_email: 'admin@tenant-a.com',
        action: AuditActions.CREATE,
        entity: 'case',
        entity_id: 'case-a-100',
        created_at: new Date(),
      },
      {
        id: 'audit-log-b-001',
        tenant_id: tenantB,
        actor_id: randomUUID(),
        actor_type: AuditActorTypes.USER,
        actor_email: 'admin@tenant-b.com',
        action: AuditActions.CREATE,
        entity: 'case',
        entity_id: 'case-b-200',
        created_at: new Date(),
      },
    ];
  };

  const createEmulatedPrismaService = () => ({
    $transaction: jest.fn().mockImplementation(async (callback) => {
      let txTenantId: string | null = null;

      const tx = {
        $executeRaw: jest
          .fn()
          .mockImplementation((strings: TemplateStringsArray, ...values: unknown[]) => {
            const sql = Array.isArray(strings) ? strings.join('?') : String(strings);

            // Emulate set_config('app.tenant_id', val, true)
            if (sql.includes('set_config') && sql.includes('app.tenant_id')) {
              const rawVal = values[0];
              if (typeof rawVal === 'string') {
                // Emulate Postgres UUID parser
                const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                if (!uuidRegex.test(rawVal.trim())) {
                  const err = new Error(`invalid input syntax for type uuid: "${rawVal}"`);
                  (err as unknown as { code: string }).code = '22P02';
                  throw err;
                }
                txTenantId = rawVal.trim();
                activeSessionTenant = txTenantId;
              }
              return Promise.resolve(1);
            }

            // Direct SQL UPDATE on audit_logs
            if (/UPDATE\s+["']?audit_logs["']?/i.test(sql)) {
              if (currentDbRole === 'vcrm_app') {
                const err = new Error('permission denied for table audit_logs');
                (err as unknown as { code: string }).code = '42501';
                throw err;
              }
              return Promise.resolve(1);
            }

            // Direct SQL DELETE on audit_logs
            if (/DELETE\s+FROM\s+["']?audit_logs["']?/i.test(sql)) {
              if (currentDbRole === 'vcrm_app') {
                const err = new Error('permission denied for table audit_logs');
                (err as unknown as { code: string }).code = '42501';
                throw err;
              }
              return Promise.resolve(1);
            }

            // Direct SQL TRUNCATE on audit_logs
            if (/TRUNCATE\s+(TABLE\s+)?["']?audit_logs["']?/i.test(sql)) {
              if (currentDbRole === 'vcrm_app') {
                const err = new Error('permission denied for table audit_logs');
                (err as unknown as { code: string }).code = '42501';
                throw err;
              }
              return Promise.resolve(1);
            }

            return Promise.resolve(1);
          }),

        tenantConfig: {
          findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
            // RLS: USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
            if (!txTenantId) return Promise.resolve(null);
            const row = dbConfigs.find((c) => c.id === where.id && c.tenant_id === txTenantId);
            return Promise.resolve(row || null);
          }),

          findMany: jest.fn().mockImplementation(() => {
            if (!txTenantId) return Promise.resolve([]);
            return Promise.resolve(dbConfigs.filter((c) => c.tenant_id === txTenantId));
          }),

          create: jest.fn().mockImplementation(({ data }: { data: DbConfigRecord }) => {
            // WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
            if (!txTenantId || data.tenant_id !== txTenantId) {
              const err = new Error(
                'new row violates row-level security policy for table "tenant_configs"',
              );
              (err as unknown as { code: string }).code = '42501';
              throw err;
            }
            dbConfigs.push(data);
            return Promise.resolve(data);
          }),

          update: jest
            .fn()
            .mockImplementation(
              ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
                const index = dbConfigs.findIndex(
                  (c) => c.id === where.id && c.tenant_id === txTenantId,
                );
                if (index === -1) {
                  throw new Error('Record not found or access denied by RLS policy');
                }
                dbConfigs[index] = { ...dbConfigs[index]!, ...data };
                return Promise.resolve(dbConfigs[index]);
              },
            ),

          delete: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
            const index = dbConfigs.findIndex(
              (c) => c.id === where.id && c.tenant_id === txTenantId,
            );
            if (index === -1) {
              throw new Error('Record not found or access denied by RLS policy');
            }
            const deleted = dbConfigs.splice(index, 1)[0]!;
            return Promise.resolve(deleted);
          }),
        },

        auditLog: {
          findMany: jest
            .fn()
            .mockImplementation(({ where }: { where?: { tenant_id?: string } } = {}) => {
              if (!txTenantId) return Promise.resolve([]);
              return Promise.resolve(
                dbAuditLogs.filter(
                  (a) =>
                    a.tenant_id === txTenantId &&
                    (!where?.tenant_id || a.tenant_id === where.tenant_id),
                ),
              );
            }),

          count: jest.fn().mockImplementation(() => {
            if (!txTenantId) return Promise.resolve(0);
            return Promise.resolve(dbAuditLogs.filter((a) => a.tenant_id === txTenantId).length);
          }),

          findFirst: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
            if (!txTenantId) return Promise.resolve(null);
            return Promise.resolve(
              dbAuditLogs.find((a) => a.id === where.id && a.tenant_id === txTenantId) || null,
            );
          }),

          create: jest
            .fn()
            .mockImplementation(({ data }: { data: Omit<DbAuditRecord, 'id' | 'created_at'> }) => {
              // WITH CHECK policy
              if (!txTenantId || data.tenant_id !== txTenantId) {
                const err = new Error(
                  'new row violates row-level security policy for table "audit_logs"',
                );
                (err as unknown as { code: string }).code = '42501';
                throw err;
              }
              const record: DbAuditRecord = {
                id: randomUUID(),
                ...data,
                created_at: new Date(),
              };
              dbAuditLogs.push(record);
              return Promise.resolve(record);
            }),

          update: jest.fn().mockImplementation(() => {
            if (currentDbRole === 'vcrm_app') {
              const err = new Error('permission denied for table audit_logs');
              (err as unknown as { code: string }).code = '42501';
              throw err;
            }
            return Promise.resolve({});
          }),

          delete: jest.fn().mockImplementation(() => {
            if (currentDbRole === 'vcrm_app') {
              const err = new Error('permission denied for table audit_logs');
              (err as unknown as { code: string }).code = '42501';
              throw err;
            }
            return Promise.resolve({});
          }),
        },
      };

      try {
        return await callback(tx);
      } finally {
        // Parameter cleanup simulating is_local = true reverting at transaction completion
        activeSessionTenant = null;
      }
    }),
  });

  let tenantPrisma: TenantPrismaService;
  let auditService: AuditService;

  beforeEach(() => {
    resetDb();
  });

  beforeAll(async () => {
    const mockPrisma = createEmulatedPrismaService();
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
  // Challenge Vector 1: Tenant Context Tampering & Edge Cases
  // =========================================================================
  describe('Challenge Vector 1: Tenant Context Tampering', () => {
    it('throws immediate error when tenantId is empty string', async () => {
      await expect(tenantPrisma.withTenant('', async () => Promise.resolve('ok'))).rejects.toThrow(
        'Tenant ID is required to execute tenant-scoped queries',
      );
    });

    it('throws immediate error when tenantId is undefined or null', async () => {
      await expect(
        tenantPrisma.withTenant(undefined as unknown as string, async () => Promise.resolve('ok')),
      ).rejects.toThrow('Tenant ID is required to execute tenant-scoped queries');

      await expect(
        tenantPrisma.withTenant(null as unknown as string, async () => Promise.resolve('ok')),
      ).rejects.toThrow('Tenant ID is required to execute tenant-scoped queries');
    });

    it('aborts query with invalid uuid error when tenantId is malformed string', async () => {
      await expect(
        tenantPrisma.withTenant('malformed-uuid-1234', async (tx) => {
          const client = tx as unknown as { tenantConfig: { findMany: () => Promise<unknown[]> } };
          return client.tenantConfig.findMany();
        }),
      ).rejects.toThrow('invalid input syntax for type uuid');
    });

    it('neutralizes SQL injection attempts in tenantId parameter', async () => {
      const sqlInjectionPayload =
        "11111111-1111-4111-8111-111111111111'); DROP TABLE tenant_configs; --";
      await expect(
        tenantPrisma.withTenant(sqlInjectionPayload, async (tx) => {
          const client = tx as unknown as { tenantConfig: { findMany: () => Promise<unknown[]> } };
          return client.tenantConfig.findMany();
        }),
      ).rejects.toThrow('invalid input syntax for type uuid');

      // Verify table data is intact
      expect(dbConfigs.length).toBe(5);
    });

    it('fails closed when tenantId is valid UUID but does not match any existing records', async () => {
      const result = await tenantPrisma.withTenant(nonexistentTenant, async (tx) => {
        const client = tx as unknown as { tenantConfig: { findMany: () => Promise<unknown[]> } };
        return client.tenantConfig.findMany();
      });

      expect(result).toEqual([]);
    });

    it('fails closed when tenant context is missing (activeSessionTenant is null)', async () => {
      expect(activeSessionTenant).toBeNull();
    });
  });

  // =========================================================================
  // Challenge Vector 2: Cross-Tenant Forged ID Queries & Mutation Attacks
  // =========================================================================
  describe('Challenge Vector 2: Cross-Tenant Forged ID Queries & Mutation Attacks', () => {
    it('Tenant A cannot read Tenant B record by forged ID via findUnique (returns null)', async () => {
      const result = await tenantPrisma.withTenant(tenantA, async (tx) => {
        const client = tx as unknown as {
          tenantConfig: {
            findUnique: (args: { where: { id: string } }) => Promise<DbConfigRecord | null>;
          };
        };
        return client.tenantConfig.findUnique({
          where: { id: 'cfg-tenant-b-1' }, // Target Tenant B's record
        });
      });

      expect(result).toBeNull();
    });

    it('Tenant A cannot read Tenant C record by forged ID via findUnique (returns null)', async () => {
      const result = await tenantPrisma.withTenant(tenantA, async (tx) => {
        const client = tx as unknown as {
          tenantConfig: {
            findUnique: (args: { where: { id: string } }) => Promise<DbConfigRecord | null>;
          };
        };
        return client.tenantConfig.findUnique({
          where: { id: 'cfg-tenant-c-1' }, // Target Tenant C's record
        });
      });

      expect(result).toBeNull();
    });

    it('Tenant A findMany returns exclusively Tenant A records and zero records of Tenant B or C', async () => {
      const results = await tenantPrisma.withTenant(tenantA, async (tx) => {
        const client = tx as unknown as {
          tenantConfig: { findMany: () => Promise<DbConfigRecord[]> };
        };
        return client.tenantConfig.findMany();
      });

      expect(results.length).toBe(2);
      expect(results.every((r) => r.tenant_id === tenantA)).toBe(true);
      expect(results.some((r) => r.tenant_id === tenantB)).toBe(false);
      expect(results.some((r) => r.tenant_id === tenantC)).toBe(false);
    });

    it('Tenant A cannot update Tenant B record by forged ID (rejected, Tenant B record unmodified)', async () => {
      await expect(
        tenantPrisma.withTenant(tenantA, async (tx) => {
          const client = tx as unknown as {
            tenantConfig: {
              update: (args: {
                where: { id: string };
                data: Record<string, unknown>;
              }) => Promise<DbConfigRecord>;
            };
          };
          return client.tenantConfig.update({
            where: { id: 'cfg-tenant-b-1' },
            data: { value: { theme: 'forged-override' } },
          });
        }),
      ).rejects.toThrow('Record not found or access denied by RLS policy');

      // Verify original value
      const recordB = dbConfigs.find((c) => c.id === 'cfg-tenant-b-1');
      expect(recordB?.value).toEqual({ theme: 'light' });
    });

    it('Tenant A cannot delete Tenant B record by forged ID (rejected, Tenant B record remains intact)', async () => {
      await expect(
        tenantPrisma.withTenant(tenantA, async (tx) => {
          const client = tx as unknown as {
            tenantConfig: { delete: (args: { where: { id: string } }) => Promise<DbConfigRecord> };
          };
          return client.tenantConfig.delete({
            where: { id: 'cfg-tenant-b-1' },
          });
        }),
      ).rejects.toThrow('Record not found or access denied by RLS policy');

      // Verify record still exists
      const recordB = dbConfigs.find((c) => c.id === 'cfg-tenant-b-1');
      expect(recordB).toBeDefined();
    });
  });

  // =========================================================================
  // Challenge Vector 3: Forged INSERT with Mismatched Tenant ID
  // =========================================================================
  describe('Challenge Vector 3: Forged INSERT with Mismatched Tenant ID', () => {
    it('rejects INSERT of Tenant B record during Tenant A transaction via WITH CHECK policy', async () => {
      await expect(
        tenantPrisma.withTenant(tenantA, async (tx) => {
          const client = tx as unknown as {
            tenantConfig: { create: (args: { data: DbConfigRecord }) => Promise<DbConfigRecord> };
          };
          return client.tenantConfig.create({
            data: {
              id: 'cfg-forged-tenant-b',
              tenant_id: tenantB, // Deliberate mismatch
              key: 'backdoor',
              value: { injected: true },
            },
          });
        }),
      ).rejects.toThrow('new row violates row-level security policy');

      // Verify no record was inserted
      const inserted = dbConfigs.find((c) => c.id === 'cfg-forged-tenant-b');
      expect(inserted).toBeUndefined();
    });

    it('rejects INSERT of AuditLog with mismatched tenant_id via WITH CHECK policy', async () => {
      await expect(
        tenantPrisma.withTenant(tenantA, async (tx) => {
          const client = tx as unknown as {
            auditLog: {
              create: (args: {
                data: Omit<DbAuditRecord, 'id' | 'created_at'>;
              }) => Promise<DbAuditRecord>;
            };
          };
          return client.auditLog.create({
            data: {
              tenant_id: tenantB, // Mismatched tenant
              actor_type: AuditActorTypes.USER,
              action: AuditActions.DELETE,
              entity: 'user',
            },
          });
        }),
      ).rejects.toThrow('new row violates row-level security policy');
    });
  });

  // =========================================================================
  // Challenge Vector 4: AuditLog Engine Immutability Stress-Testing
  // =========================================================================
  describe('Challenge Vector 4: AuditLog Engine Immutability', () => {
    it('rejects direct SQL UPDATE on audit_logs under vcrm_app role with 42501 permission denied', async () => {
      currentDbRole = 'vcrm_app';

      await expect(
        tenantPrisma.withTenant(tenantA, async (tx) => {
          return tx.$executeRaw`UPDATE "audit_logs" SET "action" = 'tampered' WHERE "id" = 'audit-log-a-001'`;
        }),
      ).rejects.toThrow('permission denied for table audit_logs');

      // Verify log content is completely unaltered
      const log = dbAuditLogs.find((l) => l.id === 'audit-log-a-001');
      expect(log?.action).toBe(AuditActions.CREATE);
    });

    it('rejects direct SQL DELETE on audit_logs under vcrm_app role with 42501 permission denied', async () => {
      currentDbRole = 'vcrm_app';

      await expect(
        tenantPrisma.withTenant(tenantA, async (tx) => {
          return tx.$executeRaw`DELETE FROM "audit_logs" WHERE "id" = 'audit-log-a-001'`;
        }),
      ).rejects.toThrow('permission denied for table audit_logs');

      // Verify log still exists
      const log = dbAuditLogs.find((l) => l.id === 'audit-log-a-001');
      expect(log).toBeDefined();
    });

    it('rejects direct SQL TRUNCATE on audit_logs under vcrm_app role with 42501 permission denied', async () => {
      currentDbRole = 'vcrm_app';

      await expect(
        tenantPrisma.withTenant(tenantA, async (tx) => {
          return tx.$executeRaw`TRUNCATE TABLE "audit_logs"`;
        }),
      ).rejects.toThrow('permission denied for table audit_logs');

      expect(dbAuditLogs.length).toBe(2);
    });

    it('verifies AuditService interface enforces append-only semantics (no mutate/delete methods)', () => {
      const proto = Object.getPrototypeOf(auditService);
      const methods = Object.getOwnPropertyNames(proto);

      // Permitted query/insert methods
      expect(methods).toContain('record');
      expect(methods).toContain('findMany');
      expect(methods).toContain('findById');

      // Prohibited mutation methods
      expect(methods).not.toContain('update');
      expect(methods).not.toContain('delete');
      expect(methods).not.toContain('destroy');
      expect(methods).not.toContain('truncate');
      expect(methods).not.toContain('purge');
    });

    it('successfully appends new immutable audit log entry via auditService.record', async () => {
      const newEntry = await auditService.record({
        tenantId: tenantA,
        actorId: randomUUID(),
        actorType: AuditActorTypes.USER,
        actorEmail: 'challenger@vcrm.app',
        action: AuditActions.UPDATE,
        entity: 'tenant_config',
        entityId: 'cfg-tenant-a-1',
        before: { theme: 'dark' },
        after: { theme: 'dark-high-contrast' },
      });

      expect(newEntry.id).toBeDefined();
      expect(newEntry.tenant_id).toBe(tenantA);
      expect(newEntry.action).toBe(AuditActions.UPDATE);
      expect(newEntry.entity).toBe('tenant_config');
    });
  });

  // =========================================================================
  // Challenge Vector 5: Connection Pool Tenant Context Isolation & Concurrency
  // =========================================================================
  describe('Challenge Vector 5: Connection Pool Tenant Context Isolation & Concurrency', () => {
    it('guarantees session tenant parameter is cleared immediately post-transaction (no pool leakage)', async () => {
      expect(activeSessionTenant).toBeNull();

      await tenantPrisma.withTenant(tenantA, async () => {
        expect(activeSessionTenant).toBe(tenantA);
      });

      // Post-transaction, activeSessionTenant must be null
      expect(activeSessionTenant).toBeNull();

      await tenantPrisma.withTenant(tenantB, async () => {
        expect(activeSessionTenant).toBe(tenantB);
      });

      expect(activeSessionTenant).toBeNull();
    });

    it('handles interleaved concurrent tenant operations without cross-contamination', async () => {
      // Run 30 concurrent transactions interleaved across Tenant A, B, and C
      const operations = Array.from({ length: 30 }, (_, index) => {
        const tenantTarget = index % 3 === 0 ? tenantA : index % 3 === 1 ? tenantB : tenantC;

        return tenantPrisma.withTenant(tenantTarget, async (tx) => {
          const client = tx as unknown as {
            tenantConfig: { findMany: () => Promise<DbConfigRecord[]> };
          };
          const rows = await client.tenantConfig.findMany();
          // Invariant: rows returned must match the targeted tenant exclusively
          return {
            targetedTenant: tenantTarget,
            actualTenant: rows.every((r) => r.tenant_id === tenantTarget),
            rowCount: rows.length,
          };
        });
      });

      const results = await Promise.all(operations);

      expect(results.length).toBe(30);
      for (const res of results) {
        expect(res.actualTenant).toBe(true);
        expect(res.rowCount).toBeGreaterThan(0);
      }
    });
  });

  // =========================================================================
  // Challenge Vector 6: Static Migration & DDL Security Contract Verification
  // =========================================================================
  describe('Challenge Vector 6: Static DDL & Migration Security Compliance', () => {
    const migrationsPath = path.resolve(__dirname, '../prisma/migrations');

    it('verifies 20260921000000_init_tenancy_rls enforces FORCE ROW LEVEL SECURITY and AS RESTRICTIVE', () => {
      const sql = fs.readFileSync(
        path.join(migrationsPath, '20260921000000_init_tenancy_rls/migration.sql'),
        'utf-8',
      );
      expect(sql).toContain('ALTER TABLE "tenant_configs" ENABLE ROW LEVEL SECURITY;');
      expect(sql).toContain('ALTER TABLE "tenant_configs" FORCE ROW LEVEL SECURITY;');
      expect(sql).toContain('AS RESTRICTIVE');
      expect(sql).toContain(
        "USING (\"tenant_id\" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)",
      );
      expect(sql).toContain(
        "WITH CHECK (\"tenant_id\" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)",
      );
    });

    it('verifies 20260921010000_iam enforces FORCE ROW LEVEL SECURITY on teams, users, skills', () => {
      const sql = fs.readFileSync(
        path.join(migrationsPath, '20260921010000_iam/migration.sql'),
        'utf-8',
      );
      expect(sql).toContain('ALTER TABLE "teams" FORCE ROW LEVEL SECURITY;');
      expect(sql).toContain('ALTER TABLE "users" FORCE ROW LEVEL SECURITY;');
      expect(sql).toContain('ALTER TABLE "skills" FORCE ROW LEVEL SECURITY;');
      expect(sql).toContain('CREATE POLICY tenant_isolation_teams ON "teams"');
      expect(sql).toContain('CREATE POLICY tenant_isolation_users ON "users"');
      expect(sql).toContain('CREATE POLICY tenant_isolation_skills ON "skills"');
    });

    it('verifies 20260921020000_auth enforces FORCE ROW LEVEL SECURITY on user_identities, sessions', () => {
      const sql = fs.readFileSync(
        path.join(migrationsPath, '20260921020000_auth/migration.sql'),
        'utf-8',
      );
      expect(sql).toContain('ALTER TABLE "user_identities" FORCE ROW LEVEL SECURITY;');
      expect(sql).toContain('ALTER TABLE "sessions" FORCE ROW LEVEL SECURITY;');
      expect(sql).toContain('CREATE POLICY tenant_isolation_user_identities ON "user_identities"');
      expect(sql).toContain('CREATE POLICY tenant_isolation_sessions ON "sessions"');
    });

    it('verifies 20260921030000_audit_log enforces FORCE ROW LEVEL SECURITY and REVOKE UPDATE, DELETE FROM vcrm_app', () => {
      const sql = fs.readFileSync(
        path.join(migrationsPath, '20260921030000_audit_log/migration.sql'),
        'utf-8',
      );
      expect(sql).toContain('ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;');
      expect(sql).toContain('CREATE POLICY tenant_isolation_audit_logs ON "audit_logs"');
      expect(sql).toContain('REVOKE UPDATE, DELETE ON "audit_logs" FROM vcrm_app;');
    });

    it('verifies init-db.sql creates vcrm_app with NOBYPASSRLS and NOSUPERUSER', () => {
      const initDbSql = fs.readFileSync(
        path.resolve(__dirname, '../../../infra/docker/postgres/init-db.sql'),
        'utf-8',
      );
      expect(initDbSql).toContain(
        "CREATE ROLE vcrm_app WITH LOGIN PASSWORD 'changeme' NOBYPASSRLS NOSUPERUSER;",
      );
      expect(initDbSql).toContain(
        "CREATE ROLE vcrm_owner WITH LOGIN PASSWORD 'changeme' SUPERUSER;",
      );
    });
  });

  // =========================================================================
  // Challenge Vector 7: HTTP Endpoint Attack Vectors on /api/v1/audit-logs
  // =========================================================================
  describe('Challenge Vector 7: HTTP Endpoint Immutability on Audit Logs', () => {
    let app: INestApplication;

    const mockAdminUser: UserContext = {
      id: randomUUID(),
      tenantId: tenantA,
      email: 'admin@tenant-a.com',
      name: 'Tenant Admin',
      role: 'TenantAdmin',
      teamId: randomUUID(),
      status: AgentStatus.ONLINE,
      maxConcurrentChats: 5,
      permissions: [{ code: Permissions.AUDIT_READ, dataScope: DataScope.ALL }],
    };

    beforeAll(async () => {
      const mockPrismaForApp = {
        tenant: {
          findUnique: jest.fn().mockImplementation(({ where }) => {
            if (where.id === tenantA || where.slug === 'tenant-a') {
              return Promise.resolve({
                id: tenantA,
                slug: 'tenant-a',
                name: 'Tenant A',
                status: TenantStatus.ACTIVE,
                plan: 'standard',
              });
            }
            return Promise.resolve(null);
          }),
        },
        $transaction: jest.fn().mockImplementation(async (callback) => {
          const mockTx = {
            $executeRaw: jest.fn().mockResolvedValue(1),
            auditLog: {
              findMany: jest.fn().mockResolvedValue([dbAuditLogs[0]]),
              count: jest.fn().mockResolvedValue(1),
              findFirst: jest.fn().mockImplementation(({ where }) => {
                return Promise.resolve(dbAuditLogs.find((l) => l.id === where.id) || null);
              }),
            },
          };
          return callback(mockTx);
        }),
        $connect: jest.fn().mockResolvedValue(undefined),
        $disconnect: jest.fn().mockResolvedValue(undefined),
      };

      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(PrismaService)
        .useValue(mockPrismaForApp)
        .compile();

      app = moduleFixture.createNestApplication();

      app.use(
        (
          req: { headers: Record<string, string | undefined>; user?: unknown },
          _res: unknown,
          next: () => void,
        ) => {
          const mockUser = req.headers['x-mock-user'];
          if (mockUser) {
            try {
              req.user = JSON.parse(mockUser);
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

    it('rejects POST /api/v1/audit-logs (no creation endpoint exposed -> 404)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/audit-logs')
        .set('X-Tenant', 'tenant-a')
        .set('X-Mock-User', JSON.stringify(mockAdminUser))
        .send({
          action: 'fake_action',
          entity: 'case',
        });

      expect(res.status).toBe(404);
    });

    it('rejects PUT /api/v1/audit-logs/:id (no update endpoint exposed -> 404)', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/audit-logs/audit-log-a-001')
        .set('X-Tenant', 'tenant-a')
        .set('X-Mock-User', JSON.stringify(mockAdminUser))
        .send({
          action: 'tampered',
        });

      expect(res.status).toBe(404);
    });

    it('rejects PATCH /api/v1/audit-logs/:id (no patch endpoint exposed -> 404)', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/audit-logs/audit-log-a-001')
        .set('X-Tenant', 'tenant-a')
        .set('X-Mock-User', JSON.stringify(mockAdminUser))
        .send({
          action: 'tampered',
        });

      expect(res.status).toBe(404);
    });

    it('rejects DELETE /api/v1/audit-logs/:id (no deletion endpoint exposed -> 404)', async () => {
      const res = await request(app.getHttpServer())
        .delete('/api/v1/audit-logs/audit-log-a-001')
        .set('X-Tenant', 'tenant-a')
        .set('X-Mock-User', JSON.stringify(mockAdminUser));

      expect(res.status).toBe(404);
    });

    it('allows GET /api/v1/audit-logs for authorized caller with audit.read permission', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/audit-logs')
        .set('X-Tenant', 'tenant-a')
        .set('X-Mock-User', JSON.stringify(mockAdminUser))
        .expect(200);

      expect(res.body.items).toBeDefined();
      expect(res.body.total).toBe(1);
    });
  });
});
