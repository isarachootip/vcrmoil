import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserContext } from '@vcrm/shared';

export interface AuthenticatedRequest {
  user?: UserContext;
  dataScope?: string;
  [key: string]: unknown;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserContext | undefined => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user;
  },
);
