import { Injectable, NestMiddleware } from '@nestjs/common';
import { Response, NextFunction } from 'express';
import { ConfigService } from '@nestjs/config';
import { TenantService } from './tenant.service';
import { TenantRequest } from './tenant.types';

const RESERVED_SUBDOMAINS = new Set(['www', 'api', 'admin', 'app', 'platform', 'localhost']);

@Injectable()
export class TenantResolutionMiddleware implements NestMiddleware {
  private readonly baseDomain: string;

  constructor(
    private readonly tenantService: TenantService,
    private readonly configService: ConfigService,
  ) {
    this.baseDomain = this.configService.get<string>('BASE_DOMAIN', 'localhost');
  }

  async use(req: TenantRequest, _res: Response, next: NextFunction): Promise<void> {
    let slug: string | null = null;

    // 1. Check X-Tenant header (supported in local dev / automated tests / integration)
    const headerTenant = req.headers['x-tenant'];
    if (typeof headerTenant === 'string' && headerTenant.trim().length > 0) {
      slug = headerTenant.trim().toLowerCase();
    }

    // 2. Resolve from subdomain if header is not present
    if (!slug) {
      const host = (req.headers.host || req.hostname || '').split(':')[0]!.toLowerCase();

      // Check if host matches <slug>.<baseDomain>
      if (host.endsWith(`.${this.baseDomain}`)) {
        const potentialSlug = host.slice(0, -(this.baseDomain.length + 1));
        if (potentialSlug && !RESERVED_SUBDOMAINS.has(potentialSlug)) {
          slug = potentialSlug;
        }
      }
    }

    // 3. Resolve tenant if slug was extracted
    if (slug) {
      try {
        const tenant = await this.tenantService.findBySlug(slug);
        if (tenant) {
          req.tenant = tenant;
        }
      } catch {
        // Silently continue; route-level guards will enforce requirement if needed
      }
    }

    next();
  }
}
