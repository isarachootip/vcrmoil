import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TenantContext } from '@vcrm/shared';
import { TenantRequest } from './tenant.types';

export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext | undefined => {
    const request = ctx.switchToHttp().getRequest<TenantRequest>();
    return request.tenant;
  },
);
