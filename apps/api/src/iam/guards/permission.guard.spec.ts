import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionGuard } from './permission.guard';
import { Permissions } from '../iam.constants';
import { AgentStatus, DataScope, UserContext } from '@vcrm/shared';

describe('PermissionGuard', () => {
  let guard: PermissionGuard;
  let reflector: Reflector;

  const agentUser: UserContext = {
    id: 'user-agent-1',
    tenantId: 'tenant-1',
    email: 'agent@vcrm.local',
    name: 'Agent Somchai',
    role: 'Agent',
    teamId: 'team-support',
    status: AgentStatus.ONLINE,
    maxConcurrentChats: 3,
    permissions: [
      { code: Permissions.CASE_READ, dataScope: DataScope.TEAM },
      { code: Permissions.CASE_UPDATE, dataScope: DataScope.OWN },
    ],
  };

  const superAdminUser: UserContext = {
    id: 'user-admin-1',
    tenantId: 'tenant-1',
    email: 'admin@vcrm.local',
    name: 'Super Admin',
    role: 'SuperAdmin',
    status: AgentStatus.ONLINE,
    maxConcurrentChats: 10,
    permissions: [],
  };

  beforeEach(() => {
    reflector = new Reflector();
    guard = new PermissionGuard(reflector);
  });

  function createMockContext(user?: UserContext): {
    context: ExecutionContext;
    request: Record<string, unknown>;
  } {
    const request: Record<string, unknown> = { user };
    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;

    return { context, request };
  }

  it('allows access if route has no @RequirePermission', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const { context } = createMockContext(agentUser);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows access and grants ALL scope to SuperAdmin unconditionally', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(Permissions.USER_DELETE);
    const { context, request } = createMockContext(superAdminUser);

    expect(guard.canActivate(context)).toBe(true);
    expect(request.dataScope).toBe(DataScope.ALL);
  });

  it('allows access and attaches correct dataScope when user has required permission', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(Permissions.CASE_READ);
    const { context, request } = createMockContext(agentUser);

    expect(guard.canActivate(context)).toBe(true);
    expect(request.dataScope).toBe(DataScope.TEAM);
  });

  it('throws ForbiddenException when user lacks the required permission (Agent calling admin endpoint)', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(Permissions.USER_CREATE);
    const { context } = createMockContext(agentUser);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context)).toThrow(
      "Access denied: Missing required permission 'user.create'",
    );
  });

  it('throws ForbiddenException when request has no authenticated user', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(Permissions.CASE_READ);
    const { context } = createMockContext(undefined);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
