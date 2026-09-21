import { Controller, Get, Param, Query, UseGuards, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';
import { CurrentTenant } from '../tenant/tenant-context.decorator';
import { ActiveTenantGuard } from '../tenant/guards/active-tenant.guard';
import { PermissionGuard } from '../iam/guards/permission.guard';
import { RequirePermission } from '../iam/decorators/require-permission.decorator';
import { Permissions } from '../iam/iam.constants';
import { TenantContext } from '@vcrm/shared';

@ApiTags('Audit Logs')
@ApiBearerAuth('bearer')
@Controller('audit-logs')
@UseGuards(ActiveTenantGuard, PermissionGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @RequirePermission(Permissions.AUDIT_READ)
  @ApiOperation({ summary: 'Query audit logs for current tenant' })
  @ApiResponse({ status: 200, description: 'Paginated audit logs' })
  @ApiResponse({ status: 403, description: 'Forbidden: Insufficient permissions' })
  async findMany(@CurrentTenant() tenant: TenantContext, @Query() query: QueryAuditLogsDto) {
    return this.auditService.findMany(tenant.id, query);
  }

  @Get(':id')
  @RequirePermission(Permissions.AUDIT_READ)
  @ApiOperation({ summary: 'Get audit log details by ID' })
  @ApiResponse({ status: 200, description: 'Audit log details' })
  @ApiResponse({ status: 403, description: 'Forbidden: Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Audit log not found' })
  async findById(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    const log = await this.auditService.findById(tenant.id, id);
    if (!log) {
      throw new NotFoundException(`Audit log entry '${id}' not found`);
    }
    return log;
  }
}
