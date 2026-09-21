import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TenantStatus } from '@vcrm/shared';
import { TenantRequest } from '../tenant.types';

@Injectable()
export class ActiveTenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<TenantRequest>();

    if (!request.tenant) {
      throw new NotFoundException(
        'Tenant could not be resolved. Please specify a valid tenant subdomain or X-Tenant header.',
      );
    }

    if (request.tenant.status === TenantStatus.SUSPENDED) {
      throw new ForbiddenException(
        `Tenant '${request.tenant.slug}' is currently suspended. Access is forbidden.`,
      );
    }

    return true;
  }
}
