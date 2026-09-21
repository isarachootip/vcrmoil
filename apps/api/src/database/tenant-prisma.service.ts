import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

@Injectable()
export class TenantPrismaService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Execute an operation inside an isolated transaction with `SET LOCAL app.tenant_id`.
   * Row-Level Security ensures that queries cannot see or modify other tenants' rows.
   */
  async withTenant<T>(
    tenantId: string,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (!tenantId) {
      throw new Error('Tenant ID is required to execute tenant-scoped queries');
    }

    return this.prisma.$transaction(async (tx) => {
      // Set session variable app.tenant_id locally for this transaction
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return operation(tx);
    });
  }

  /**
   * Helper to set tenant context and run raw queries safely
   */
  async executeRawWithTenant(tenantId: string, query: Prisma.Sql): Promise<unknown> {
    return this.withTenant(tenantId, async (tx) => {
      return tx.$queryRaw(query);
    });
  }
}
