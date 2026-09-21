import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { DataScope, UserContext } from '@vcrm/shared';

export interface AuthenticatedRequest extends Request {
  user?: UserContext;
  dataScope?: DataScope | string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserContext | undefined => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user;
  },
);

export const CurrentDataScope = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): DataScope | undefined => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return (request.dataScope as DataScope) || DataScope.ALL;
  },
);
