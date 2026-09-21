import { Injectable, ConflictException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { TenantStatus, TenantContext } from '@vcrm/shared';

@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createTenant(dto: CreateTenantDto): Promise<TenantContext> {
    const existing = await this.prisma.tenant.findUnique({
      where: { slug: dto.slug },
    });

    if (existing) {
      throw new ConflictException(`Tenant slug '${dto.slug}' is already taken`);
    }

    const defaultSettings = {
      timezone: 'Asia/Bangkok',
      locale: 'th',
      ...dto.settings,
    };

    const tenant = await this.prisma.tenant.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        plan: dto.plan || 'standard',
        status: TenantStatus.TRIAL,
        settings: defaultSettings,
        configs: {
          create: [
            {
              key: 'general.timezone',
              value: defaultSettings.timezone,
              created_by: dto.adminEmail,
            },
            {
              key: 'general.locale',
              value: defaultSettings.locale,
              created_by: dto.adminEmail,
            },
          ],
        },
      },
    });

    this.logger.log(`Tenant '${tenant.name}' (${tenant.slug}) successfully provisioned`);

    return {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      status: tenant.status as TenantStatus,
      plan: tenant.plan,
      settings: tenant.settings as Record<string, unknown>,
    };
  }

  async findBySlug(slug: string): Promise<TenantContext | null> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
    });

    if (!tenant) {
      return null;
    }

    return {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      status: tenant.status as TenantStatus,
      plan: tenant.plan,
      settings: tenant.settings as Record<string, unknown>,
    };
  }

  async findById(id: string): Promise<TenantContext> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID '${id}' not found`);
    }

    return {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      status: tenant.status as TenantStatus,
      plan: tenant.plan,
      settings: tenant.settings as Record<string, unknown>,
    };
  }

  async listTenants(page = 1, limit = 20): Promise<{ items: TenantContext[]; total: number }> {
    const skip = (page - 1) * limit;

    const [tenants, total] = await Promise.all([
      this.prisma.tenant.findMany({
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.tenant.count(),
    ]);

    return {
      items: tenants.map((t) => ({
        id: t.id,
        slug: t.slug,
        name: t.name,
        status: t.status as TenantStatus,
        plan: t.plan,
        settings: t.settings as Record<string, unknown>,
      })),
      total,
    };
  }

  async updateStatus(id: string, status: TenantStatus): Promise<TenantContext> {
    const tenant = await this.prisma.tenant.update({
      where: { id },
      data: { status },
    });

    this.logger.log(`Tenant '${tenant.slug}' status updated to '${status}'`);

    return {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      status: tenant.status as TenantStatus,
      plan: tenant.plan,
      settings: tenant.settings as Record<string, unknown>,
    };
  }
}
