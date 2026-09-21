import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { IamService } from './iam.service';
import { RequirePermission } from './decorators/require-permission.decorator';
import { CurrentTenant } from '../tenant/tenant-context.decorator';
import { ActiveTenantGuard } from '../tenant/guards/active-tenant.guard';
import { PermissionGuard } from './guards/permission.guard';
import { Permissions } from './iam.constants';
import { TenantContext } from '@vcrm/shared';

@ApiTags('IAM — Roles')
@ApiBearerAuth('bearer')
@Controller('iam/roles')
@UseGuards(ActiveTenantGuard, PermissionGuard)
export class RolesController {
  constructor(private readonly iamService: IamService) {}

  @Get()
  @RequirePermission(Permissions.ROLE_MANAGE)
  @ApiOperation({ summary: 'List all available system and tenant-specific roles with permissions' })
  @ApiResponse({ status: 200, description: 'List of roles' })
  @ApiResponse({ status: 403, description: 'Forbidden: Insufficient permissions' })
  async listRoles(@CurrentTenant() tenant: TenantContext) {
    return this.iamService.listRoles(tenant?.id);
  }
}
