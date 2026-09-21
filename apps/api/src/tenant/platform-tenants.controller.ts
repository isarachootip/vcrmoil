import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { TenantService } from './tenant.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantStatusDto } from './dto/update-tenant-status.dto';
import { TenantContext } from '@vcrm/shared';

@ApiTags('Platform Tenants (SuperAdmin)')
@ApiBearerAuth('bearer')
@Controller('platform/tenants')
export class PlatformTenantsController {
  constructor(private readonly tenantService: TenantService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Provision a new tenant organization' })
  @ApiResponse({ status: 201, description: 'Tenant successfully provisioned' })
  @ApiResponse({ status: 409, description: 'Tenant slug already exists' })
  async createTenant(@Body() dto: CreateTenantDto): Promise<TenantContext> {
    return this.tenantService.createTenant(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all provisioned tenants with pagination' })
  @ApiResponse({ status: 200, description: 'List of tenants' })
  async listTenants(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ): Promise<{ items: TenantContext[]; total: number }> {
    return this.tenantService.listTenants(page, limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get tenant details by ID' })
  @ApiResponse({ status: 200, description: 'Tenant details' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  async getTenant(@Param('id') id: string): Promise<TenantContext> {
    return this.tenantService.findById(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update tenant status (active, trial, suspended)' })
  @ApiResponse({ status: 200, description: 'Tenant status successfully updated' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTenantStatusDto,
  ): Promise<TenantContext> {
    return this.tenantService.updateStatus(id, dto.status);
  }
}
