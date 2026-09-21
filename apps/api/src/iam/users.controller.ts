import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { IamService } from './iam.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { RequirePermission } from './decorators/require-permission.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { CurrentTenant } from '../tenant/tenant-context.decorator';
import { ActiveTenantGuard } from '../tenant/guards/active-tenant.guard';
import { PermissionGuard } from './guards/permission.guard';
import { Permissions } from './iam.constants';
import { TenantContext, UserContext } from '@vcrm/shared';
import { AuditPiiView } from '../audit/decorators/audit.decorator';

@ApiTags('IAM — Users')
@ApiBearerAuth('bearer')
@Controller('iam/users')
@UseGuards(ActiveTenantGuard, PermissionGuard)
export class UsersController {
  constructor(private readonly iamService: IamService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission(Permissions.USER_CREATE)
  @ApiOperation({ summary: 'Create a new user within tenant' })
  @ApiResponse({ status: 201, description: 'User successfully created' })
  @ApiResponse({ status: 403, description: 'Forbidden: Insufficient permissions' })
  @ApiResponse({ status: 409, description: 'User email already exists' })
  async createUser(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() currentUser: UserContext,
    @Body() dto: CreateUserDto,
  ) {
    return this.iamService.createUser(tenant.id, dto, currentUser?.email);
  }

  @Get()
  @RequirePermission(Permissions.USER_READ)
  @ApiOperation({ summary: 'List all users in current tenant' })
  @ApiResponse({ status: 200, description: 'List of users' })
  async listUsers(@CurrentTenant() tenant: TenantContext) {
    return this.iamService.listUsers(tenant.id);
  }

  @Get(':id')
  @RequirePermission(Permissions.USER_READ)
  @AuditPiiView({
    entity: 'user',
    piiFields: ['name', 'email'],
    purpose: 'View user profile and PII',
  })
  @ApiOperation({ summary: 'Get user details by ID' })
  @ApiResponse({ status: 200, description: 'User details' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUser(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.iamService.getUser(tenant.id, id);
  }

  @Patch(':id')
  @RequirePermission(Permissions.USER_UPDATE)
  @ApiOperation({ summary: 'Update user attributes' })
  @ApiResponse({ status: 200, description: 'User updated' })
  async updateUser(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.iamService.updateUser(tenant.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(Permissions.USER_DELETE)
  @ApiOperation({ summary: 'Delete user from tenant' })
  @ApiResponse({ status: 204, description: 'User deleted' })
  async deleteUser(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    await this.iamService.deleteUser(tenant.id, id);
  }
}
