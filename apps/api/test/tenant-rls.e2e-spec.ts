import { Test, TestingModule } from '@nestjs/testing';
import { TenantPrismaService } from '../src/database/tenant-prisma.service';
import { PrismaService } from '../src/database/prisma.service';

interface MockTenantConfigDelegate {
  findUnique: (args: { where: { id: string } }) => Promise<{
    id: string;
    tenant_id: string;
    key: string;
    value: string;
  } | null>;
  findMany: (args?: {
    where?: { key?: string };
  }) => Promise<Array<{ id: string; tenant_id: string; key: string; value: string }>>;
  update: (args: { where: { id: string }; data: { value: string } }) => Promise<{
    id: string;
    tenant_id: string;
    key: string;
    value: string;
  }>;
}

interface MockTransactionClient {
  $executeRaw: jest.Mock;
  tenantConfig: MockTenantConfigDelegate;
}

describe('Tenant Row-Level Security (RLS)', () => {
  let tenantPrisma: TenantPrismaService;
  let mockPrisma: Partial<PrismaService>;

  const tenantA = '11111111-1111-1111-1111-111111111111';
  const tenantB = '22222222-2222-2222-2222-222222222222';

  // In-memory data store simulating Postgres table with RLS applied
  const databaseRows: Array<{ id: string; tenant_id: string; key: string; value: string }> = [
    { id: 'cfg-1', tenant_id: tenantA, key: 'theme', value: 'dark' },
    { id: 'cfg-2', tenant_id: tenantB, key: 'theme', value: 'light' },
  ];

  beforeAll(async () => {
    mockPrisma = {
      $transaction: jest.fn().mockImplementation(async (callback) => {
        let currentTenantId: string | null = null;

        const txMock: MockTransactionClient = {
          $executeRaw: jest
            .fn()
            .mockImplementation((_strings: TemplateStringsArray, ...values: unknown[]) => {
              // Emulate SELECT set_config('app.tenant_id', $1, true)
              if (values[0] && typeof values[0] === 'string') {
                currentTenantId = values[0];
              }
              return Promise.resolve(1);
            }),
          tenantConfig: {
            findUnique: jest.fn().mockImplementation(({ where }) => {
              const row = databaseRows.find((r) => r.id === where.id);
              // Postgres RLS: if row.tenant_id !== currentTenantId, row is invisible
              if (!row || row.tenant_id !== currentTenantId) {
                return Promise.resolve(null);
              }
              return Promise.resolve(row);
            }),
            findMany: jest.fn().mockImplementation(({ where } = {}) => {
              // Postgres RLS filter applied automatically at kernel level
              const rows = databaseRows.filter((r) => {
                if (r.tenant_id !== currentTenantId) return false;
                if (where?.key && r.key !== where.key) return false;
                return true;
              });
              return Promise.resolve(rows);
            }),
            update: jest.fn().mockImplementation(({ where, data }) => {
              const index = databaseRows.findIndex(
                (r) => r.id === where.id && r.tenant_id === currentTenantId,
              );
              if (index === -1) {
                throw new Error('Record not found or access denied by RLS');
              }
              databaseRows[index] = { ...databaseRows[index]!, ...data };
              return Promise.resolve(databaseRows[index]!);
            }),
          },
        };

        return callback(txMock);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantPrismaService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    tenantPrisma = module.get<TenantPrismaService>(TenantPrismaService);
  });

  it('allows Tenant A to read its own configuration', async () => {
    const result = await tenantPrisma.withTenant(tenantA, async (tx) => {
      const client = tx as unknown as MockTransactionClient;
      return client.tenantConfig.findUnique({
        where: { id: 'cfg-1' },
      });
    });

    expect(result).not.toBeNull();
    expect(result?.tenant_id).toBe(tenantA);
    expect(result?.key).toBe('theme');
    expect(result?.value).toBe('dark');
  });

  it('strictly prevents Tenant A from reading Tenant B row even with forged ID', async () => {
    const result = await tenantPrisma.withTenant(tenantA, async (tx) => {
      // Tenant A attempts to access Tenant B record 'cfg-2'
      const client = tx as unknown as MockTransactionClient;
      return client.tenantConfig.findUnique({
        where: { id: 'cfg-2' },
      });
    });

    // Invisible to Tenant A due to RLS
    expect(result).toBeNull();
  });

  it('strictly prevents Tenant A from updating Tenant B row even with forged ID', async () => {
    await expect(
      tenantPrisma.withTenant(tenantA, async (tx) => {
        const client = tx as unknown as MockTransactionClient;
        return client.tenantConfig.update({
          where: { id: 'cfg-2' },
          data: { value: 'hacked' },
        });
      }),
    ).rejects.toThrow('Record not found or access denied by RLS');

    // Verify row remained unchanged
    const bRecord = databaseRows.find((r) => r.id === 'cfg-2');
    expect(bRecord?.value).toBe('light');
  });

  it('throws an error if tenantId is missing', async () => {
    await expect(
      tenantPrisma.withTenant('', async () => {
        return Promise.resolve();
      }),
    ).rejects.toThrow('Tenant ID is required to execute tenant-scoped queries');
  });
});
