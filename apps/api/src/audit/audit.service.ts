import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../database/tenant-prisma.service';
import { CreateAuditLogDto } from './dto/create-audit-log.dto';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';
import { AuditActorTypes } from './audit.constants';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /**
   * Record a new audit log entry inside the tenant's RLS transaction.
   */
  async record(dto: CreateAuditLogDto) {
    try {
      return await this.tenantPrisma.withTenant(dto.tenantId, async (tx) => {
        return tx.auditLog.create({
          data: {
            tenant_id: dto.tenantId,
            actor_id: dto.actorId,
            actor_type: dto.actorType || AuditActorTypes.USER,
            actor_email: dto.actorEmail,
            action: dto.action,
            entity: dto.entity,
            entity_id: dto.entityId,
            before: (dto.before as Prisma.InputJsonValue) ?? Prisma.JsonNull,
            after: (dto.after as Prisma.InputJsonValue) ?? Prisma.JsonNull,
            ip_address: dto.ipAddress,
            user_agent: dto.userAgent,
            metadata: (dto.metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          },
        });
      });
    } catch (err) {
      const error = err as Error;
      this.logger.error(`Failed to record audit log: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Query audit logs with pagination and filters for the specific tenant.
   */
  async findMany(tenantId: string, query: QueryAuditLogsDto) {
    return this.tenantPrisma.withTenant(tenantId, async (tx) => {
      const where: Prisma.AuditLogWhereInput = {
        tenant_id: tenantId,
      };

      if (query.entity) {
        where.entity = query.entity;
      }
      if (query.entityId) {
        where.entity_id = query.entityId;
      }
      if (query.actorId) {
        where.actor_id = query.actorId;
      }
      if (query.action) {
        where.action = query.action;
      }
      if (query.startDate || query.endDate) {
        where.created_at = {};
        if (query.startDate) {
          where.created_at.gte = new Date(query.startDate);
        }
        if (query.endDate) {
          where.created_at.lte = new Date(query.endDate);
        }
      }

      const page = query.page || 1;
      const limit = query.limit || 20;
      const skip = (page - 1) * limit;

      const [items, total] = await Promise.all([
        tx.auditLog.findMany({
          where,
          orderBy: { created_at: 'desc' },
          skip,
          take: limit,
        }),
        tx.auditLog.count({ where }),
      ]);

      return {
        items,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    });
  }

  /**
   * Find a single audit log entry by ID within tenant isolation.
   */
  async findById(tenantId: string, id: string) {
    return this.tenantPrisma.withTenant(tenantId, async (tx) => {
      return tx.auditLog.findFirst({
        where: {
          id,
          tenant_id: tenantId,
        },
      });
    });
  }
}
