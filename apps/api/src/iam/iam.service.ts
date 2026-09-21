import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantPrismaService } from '../database/tenant-prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateTeamDto } from './dto/create-team.dto';
import { CreateSkillDto } from './dto/create-skill.dto';
import { AssignSkillDto } from './dto/assign-skill.dto';
import { AgentStatus, DataScope, UserContext } from '@vcrm/shared';

@Injectable()
export class IamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  // ==================== USERS ====================

  async createUser(tenantId: string, dto: CreateUserDto, createdBy?: string) {
    return this.tenantPrisma.withTenant(tenantId, async (tx) => {
      const existing = await tx.user.findUnique({
        where: {
          tenant_id_email: {
            tenant_id: tenantId,
            email: dto.email,
          },
        },
      });

      if (existing) {
        throw new ConflictException(`User with email '${dto.email}' already exists in this tenant`);
      }

      return tx.user.create({
        data: {
          tenant_id: tenantId,
          email: dto.email,
          name: dto.name,
          role_id: dto.roleId,
          team_id: dto.teamId,
          status: dto.status || AgentStatus.OFFLINE,
          max_concurrent_chats: dto.maxConcurrentChats ?? 3,
          created_by: createdBy,
        },
        include: {
          role: true,
          team: true,
          skills: {
            include: {
              skill: true,
            },
          },
        },
      });
    });
  }

  async listUsers(tenantId: string, _user?: UserContext, _scope?: DataScope) {
    return this.tenantPrisma.withTenant(tenantId, async (tx) => {
      return tx.user.findMany({
        where: { tenant_id: tenantId },
        include: {
          role: true,
          team: true,
          skills: {
            include: {
              skill: true,
            },
          },
        },
        orderBy: { name: 'asc' },
      });
    });
  }

  async getUser(tenantId: string, id: string) {
    return this.tenantPrisma.withTenant(tenantId, async (tx) => {
      const user = await tx.user.findUnique({
        where: { id },
        include: {
          role: {
            include: {
              permissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
          team: true,
          skills: {
            include: {
              skill: true,
            },
          },
        },
      });

      if (!user || user.tenant_id !== tenantId) {
        throw new NotFoundException(`User with ID '${id}' not found in this tenant`);
      }

      return user;
    });
  }

  async updateUser(tenantId: string, id: string, dto: UpdateUserDto) {
    return this.tenantPrisma.withTenant(tenantId, async (tx) => {
      await this.getUser(tenantId, id);

      return tx.user.update({
        where: { id },
        data: {
          email: dto.email,
          name: dto.name,
          role_id: dto.roleId,
          team_id: dto.teamId,
          status: dto.status,
          max_concurrent_chats: dto.maxConcurrentChats,
        },
        include: {
          role: true,
          team: true,
        },
      });
    });
  }

  async deleteUser(tenantId: string, id: string) {
    return this.tenantPrisma.withTenant(tenantId, async (tx) => {
      await this.getUser(tenantId, id);

      return tx.user.delete({
        where: { id },
      });
    });
  }

  // ==================== TEAMS ====================

  async createTeam(tenantId: string, dto: CreateTeamDto, createdBy?: string) {
    return this.tenantPrisma.withTenant(tenantId, async (tx) => {
      const existing = await tx.team.findUnique({
        where: {
          tenant_id_name: {
            tenant_id: tenantId,
            name: dto.name,
          },
        },
      });

      if (existing) {
        throw new ConflictException(`Team with name '${dto.name}' already exists`);
      }

      return tx.team.create({
        data: {
          tenant_id: tenantId,
          name: dto.name,
          description: dto.description,
          created_by: createdBy,
        },
      });
    });
  }

  async listTeams(tenantId: string) {
    return this.tenantPrisma.withTenant(tenantId, async (tx) => {
      return tx.team.findMany({
        where: { tenant_id: tenantId },
        include: {
          _count: {
            select: { users: true },
          },
        },
        orderBy: { name: 'asc' },
      });
    });
  }

  async getTeam(tenantId: string, id: string) {
    return this.tenantPrisma.withTenant(tenantId, async (tx) => {
      const team = await tx.team.findUnique({
        where: { id },
        include: {
          users: true,
        },
      });

      if (!team || team.tenant_id !== tenantId) {
        throw new NotFoundException(`Team with ID '${id}' not found`);
      }

      return team;
    });
  }

  async updateTeam(tenantId: string, id: string, dto: Partial<CreateTeamDto>) {
    return this.tenantPrisma.withTenant(tenantId, async (tx) => {
      await this.getTeam(tenantId, id);

      return tx.team.update({
        where: { id },
        data: {
          name: dto.name,
          description: dto.description,
        },
      });
    });
  }

  async deleteTeam(tenantId: string, id: string) {
    return this.tenantPrisma.withTenant(tenantId, async (tx) => {
      await this.getTeam(tenantId, id);

      return tx.team.delete({
        where: { id },
      });
    });
  }

  // ==================== ROLES ====================

  async listRoles(tenantId?: string) {
    return this.prisma.role.findMany({
      where: {
        OR: [{ is_system: true }, tenantId ? { tenant_id: tenantId } : {}],
      },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  // ==================== SKILLS ====================

  async createSkill(tenantId: string, dto: CreateSkillDto) {
    return this.tenantPrisma.withTenant(tenantId, async (tx) => {
      const existing = await tx.skill.findUnique({
        where: {
          tenant_id_name: {
            tenant_id: tenantId,
            name: dto.name,
          },
        },
      });

      if (existing) {
        throw new ConflictException(`Skill with name '${dto.name}' already exists`);
      }

      return tx.skill.create({
        data: {
          tenant_id: tenantId,
          name: dto.name,
          description: dto.description,
        },
      });
    });
  }

  async listSkills(tenantId: string) {
    return this.tenantPrisma.withTenant(tenantId, async (tx) => {
      return tx.skill.findMany({
        where: { tenant_id: tenantId },
        orderBy: { name: 'asc' },
      });
    });
  }

  async assignSkill(tenantId: string, userId: string, dto: AssignSkillDto) {
    return this.tenantPrisma.withTenant(tenantId, async (tx) => {
      await this.getUser(tenantId, userId);

      const skill = await tx.skill.findUnique({
        where: { id: dto.skillId },
      });

      if (!skill || skill.tenant_id !== tenantId) {
        throw new NotFoundException(`Skill '${dto.skillId}' not found in this tenant`);
      }

      return tx.userSkill.upsert({
        where: {
          user_id_skill_id: {
            user_id: userId,
            skill_id: dto.skillId,
          },
        },
        update: {
          level: dto.level,
        },
        create: {
          user_id: userId,
          skill_id: dto.skillId,
          level: dto.level,
        },
        include: {
          skill: true,
        },
      });
    });
  }
}
