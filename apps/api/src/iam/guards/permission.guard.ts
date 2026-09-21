import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY, PermissionCode } from '../iam.constants';
import { AuthenticatedRequest } from '../decorators/current-user.decorator';
import { DataScope } from '@vcrm/shared';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermission = this.reflector.getAllAndOverride<PermissionCode>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If endpoint has no @RequirePermission, allow access
    if (!requiredPermission) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Access denied: Authenticated user identity is required');
    }

    // SuperAdmin has global access across all modules
    if (user.role === 'SuperAdmin') {
      request.dataScope = DataScope.ALL;
      return true;
    }

    // Check user permissions
    const permission = user.permissions.find((p) => p.code === requiredPermission);

    if (!permission) {
      throw new ForbiddenException(
        `Access denied: Missing required permission '${requiredPermission}'`,
      );
    }

    // Attach resolved data scope to request for subsequent service querying
    request.dataScope = permission.dataScope || DataScope.ALL;
    return true;
  }
}
