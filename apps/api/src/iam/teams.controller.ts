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
import { CreateTeamDto } from './dto/create-team.dto';
import { RequirePermission } from './decorators/require-permission.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { CurrentTenant } from '../tenant/tenant-context.decorator';
import { ActiveTenantGuard } from '../tenant/guards/active-tenant.guard';
import { PermissionGuard } from './guards/permission.guard';
import { Permissions } from './iam.constants';
import { TenantContext, UserContext } from '@vcrm/shared';

@ApiTags('IAM — Teams')
@ApiBearerAuth('bearer')
@Controller('iam/teams')
@UseGuards(ActiveTenantGuard, PermissionGuard)
export class TeamsController {
  constructor(private readonly iamService: IamService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission(Permissions.TEAM_MANAGE)
  @ApiOperation({ summary: 'Create a new team' })
  @ApiResponse({ status: 201, description: 'Team created' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async createTeam(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() currentUser: UserContext,
    @Body() dto: CreateTeamDto,
  ) {
    return this.iamService.createTeam(tenant.id, dto, currentUser?.email);
  }

  @Get()
  @RequirePermission(Permissions.USER_READ)
  @ApiOperation({ summary: 'List teams in current tenant' })
  @ApiResponse({ status: 200, description: 'List of teams' })
  async listTeams(@CurrentTenant() tenant: TenantContext) {
    return this.iamService.listTeams(tenant.id);
  }

  @Get(':id')
  @RequirePermission(Permissions.USER_READ)
  @ApiOperation({ summary: 'Get team details' })
  @ApiResponse({ status: 200, description: 'Team details' })
  async getTeam(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.iamService.getTeam(tenant.id, id);
  }

  @Patch(':id')
  @RequirePermission(Permissions.TEAM_MANAGE)
  @ApiOperation({ summary: 'Update team details' })
  @ApiResponse({ status: 200, description: 'Team updated' })
  async updateTeam(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: Partial<CreateTeamDto>,
  ) {
    return this.iamService.updateTeam(tenant.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(Permissions.TEAM_MANAGE)
  @ApiOperation({ summary: 'Delete team' })
  @ApiResponse({ status: 204, description: 'Team deleted' })
  async deleteTeam(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    await this.iamService.deleteTeam(tenant.id, id);
  }
}
