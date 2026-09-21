import { Module } from '@nestjs/common';
import { IamService } from './iam.service';
import { UsersController } from './users.controller';
import { TeamsController } from './teams.controller';
import { RolesController } from './roles.controller';
import { SkillsController } from './skills.controller';
import { PermissionGuard } from './guards/permission.guard';
import { DataScopeHelper } from './helpers/data-scope.helper';

@Module({
  controllers: [UsersController, TeamsController, RolesController, SkillsController],
  providers: [IamService, PermissionGuard, DataScopeHelper],
  exports: [IamService, PermissionGuard, DataScopeHelper],
})
export class IamModule {}
