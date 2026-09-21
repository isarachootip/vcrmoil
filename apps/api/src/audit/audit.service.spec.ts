import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { AuditService } from './audit.service';
import { PrismaService } from '../database/prisma.service';
import { TenantPrismaService } from '../database/tenant-prisma.service';
import { AuditActions, AuditActorTypes } from './audit.constants';

describe('AuditService', () => {
  let service: AuditService;
  let tenantPrisma: TenantPrismaService;

  const mockAuditLogs: Array<Record<string, unknown>> = [];

  const mockTx = {
    auditLog: {
      create: jest.fn().mockImplementation(({ data }) => {
        const record = {
          id: randomUUID(),
          ...data,
          created_at: new Date(),
        };
        mockAuditLogs.push(record);
        return Promise.resolve(record);
      }),
      findMany: jest.fn().mockImplementation(({ where, skip = 0, take = 20 }) => {
        let results = mockAuditLogs.filter((l) => l.tenant_id === where.tenant_id);
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
          mockAuditLogs.find((l) => l.id === where.id && l.tenant_id === where.tenant_id) || null,
        );
      }),
      count: jest.fn().mockImplementation(({ where }) => {
        return Promise.resolve(mockAuditLogs.filter((l) => l.tenant_id === where.tenant_id).length);
      }),
    },
  };

  const mockTenantPrisma = {
    withTenant: jest.fn().mockImplementation((_tenantId, operation) => {
      return operation(mockTx);
    }),
  };

  beforeEach(async () => {
    mockAuditLogs.length = 0;
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        {
          provide: PrismaService,
          useValue: {},
        },
        {
          provide: TenantPrismaService,
          useValue: mockTenantPrisma,
        },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
    tenantPrisma = module.get<TenantPrismaService>(TenantPrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('record', () => {
    it('records an audit log entry within tenant isolation', async () => {
      const tenantId = randomUUID();
      const actorId = randomUUID();

      const result = await service.record({
        tenantId,
        actorId,
        actorEmail: 'admin@acme.com',
        action: AuditActions.CREATE,
        entity: 'user',
        entityId: 'user-123',
        before: null,
        after: { name: 'Somchai' },
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0',
      });

      expect(tenantPrisma.withTenant).toHaveBeenCalledWith(tenantId, expect.any(Function));
      expect(mockTx.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: tenantId,
          actor_id: actorId,
          actor_type: AuditActorTypes.USER,
          actor_email: 'admin@acme.com',
          action: AuditActions.CREATE,
          entity: 'user',
          entity_id: 'user-123',
          ip_address: '127.0.0.1',
          user_agent: 'Mozilla/5.0',
        }),
      });
      expect(result.id).toBeDefined();
      expect(result.entity).toBe('user');
    });
  });

  describe('findMany', () => {
    it('returns paginated audit logs filtered by tenant', async () => {
      const tenantA = randomUUID();
      const tenantB = randomUUID();

      await service.record({
        tenantId: tenantA,
        action: AuditActions.CREATE,
        entity: 'user',
        after: { name: 'Alice' },
      });
      await service.record({
        tenantId: tenantA,
        action: AuditActions.UPDATE,
        entity: 'team',
        after: { name: 'Support' },
      });
      await service.record({
        tenantId: tenantB,
        action: AuditActions.CREATE,
        entity: 'user',
        after: { name: 'Bob' },
      });

      const res = await service.findMany(tenantA, { page: 1, limit: 10 });
      expect(res.items).toHaveLength(2);
      expect(res.total).toBe(2);
      expect(res.items.every((i) => i.tenant_id === tenantA)).toBe(true);
    });

    it('filters by entity and action', async () => {
      const tenantId = randomUUID();

      await service.record({
        tenantId,
        action: AuditActions.CREATE,
        entity: 'user',
      });
      await service.record({
        tenantId,
        action: AuditActions.UPDATE,
        entity: 'user',
      });
      await service.record({
        tenantId,
        action: AuditActions.CREATE,
        entity: 'role',
      });

      const res = await service.findMany(tenantId, {
        entity: 'user',
        action: AuditActions.CREATE,
        page: 1,
        limit: 10,
      });

      expect(res.items).toHaveLength(1);
      expect(res.items[0].entity).toBe('user');
      expect(res.items[0].action).toBe(AuditActions.CREATE);
    });
  });

  describe('findById', () => {
    it('finds single audit log entry by ID', async () => {
      const tenantId = randomUUID();
      const created = await service.record({
        tenantId,
        action: AuditActions.DELETE,
        entity: 'skill',
        entityId: 'skill-456',
      });

      const found = await service.findById(tenantId, created.id);
      expect(found).toBeDefined();
      expect(found?.entity_id).toBe('skill-456');
    });

    it('returns null if audit log belongs to different tenant', async () => {
      const tenantA = randomUUID();
      const tenantB = randomUUID();

      const created = await service.record({
        tenantId: tenantA,
        action: AuditActions.CREATE,
        entity: 'user',
      });

      const found = await service.findById(tenantB, created.id);
      expect(found).toBeNull();
    });
  });
});
