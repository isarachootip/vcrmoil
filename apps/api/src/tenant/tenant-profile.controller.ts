import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { ActiveTenantGuard } from './guards/active-tenant.guard';
import { CurrentTenant } from './tenant-context.decorator';
import { TenantContext } from '@vcrm/shared';

@ApiTags('Tenant Profile')
@ApiHeader({
  name: 'X-Tenant',
  description: 'Optional tenant slug header override (for testing and local dev)',
  required: false,
})
@Controller('tenant/profile')
@UseGuards(ActiveTenantGuard)
export class TenantProfileController {
  @Get()
  @ApiOperation({ summary: 'Get current resolved tenant profile' })
  @ApiResponse({ status: 200, description: 'Current tenant profile' })
  @ApiResponse({ status: 403, description: 'Tenant is suspended' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  getProfile(@CurrentTenant() tenant: TenantContext): TenantContext {
    return tenant;
  }
}
