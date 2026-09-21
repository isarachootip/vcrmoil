import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { IamService } from './iam.service';
import { CreateSkillDto } from './dto/create-skill.dto';
import { AssignSkillDto } from './dto/assign-skill.dto';
import { RequirePermission } from './decorators/require-permission.decorator';
import { CurrentTenant } from '../tenant/tenant-context.decorator';
import { ActiveTenantGuard } from '../tenant/guards/active-tenant.guard';
import { PermissionGuard } from './guards/permission.guard';
import { Permissions } from './iam.constants';
import { TenantContext } from '@vcrm/shared';

@ApiTags('IAM — Skills')
@ApiBearerAuth('bearer')
@Controller('iam/skills')
@UseGuards(ActiveTenantGuard, PermissionGuard)
export class SkillsController {
  constructor(private readonly iamService: IamService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission(Permissions.SKILL_MANAGE)
  @ApiOperation({ summary: 'Create a new skill in tenant' })
  @ApiResponse({ status: 201, description: 'Skill created' })
  @ApiResponse({ status: 403, description: 'Forbidden: Insufficient permissions' })
  @ApiResponse({ status: 409, description: 'Skill name already exists' })
  async createSkill(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateSkillDto) {
    return this.iamService.createSkill(tenant.id, dto);
  }

  @Get()
  @RequirePermission(Permissions.USER_READ)
  @ApiOperation({ summary: 'List skills in tenant' })
  @ApiResponse({ status: 200, description: 'List of skills' })
  async listSkills(@CurrentTenant() tenant: TenantContext) {
    return this.iamService.listSkills(tenant.id);
  }

  @Post(':userId/assign')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(Permissions.SKILL_MANAGE)
  @ApiOperation({ summary: 'Assign a skill with level (1-5) to a user' })
  @ApiResponse({ status: 200, description: 'Skill assigned to user' })
  @ApiResponse({ status: 403, description: 'Forbidden: Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'User or skill not found' })
  async assignSkill(
    @CurrentTenant() tenant: TenantContext,
    @Param('userId') userId: string,
    @Body() dto: AssignSkillDto,
  ) {
    return this.iamService.assignSkill(tenant.id, userId, dto);
  }
}
