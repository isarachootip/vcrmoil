import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthService } from '../auth.service';
import { AgentStatus, DataScope, UserContext } from '@vcrm/shared';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: Reflector;
  let authService: Partial<AuthService>;

  const mockUser: UserContext = {
    id: 'user-123',
    tenantId: 'tenant-456',
    email: 'user@vcrm.local',
    name: 'Test User',
    role: 'Agent',
    status: AgentStatus.ONLINE,
    maxConcurrentChats: 3,
    permissions: [{ code: 'case.read', dataScope: DataScope.ALL }],
  };

  beforeEach(() => {
    reflector = new Reflector();
    authService = {
      verifyToken: jest.fn().mockResolvedValue(mockUser),
    };
    guard = new JwtAuthGuard(reflector, authService as AuthService);
  });

  function createMockContext(headers: Record<string, string> = {}, user?: UserContext) {
    const request: Record<string, unknown> = { headers, user };
    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;

    return { context, request };
  }

  it('allows access if route is decorated with @Public()', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    const { context } = createMockContext({});

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('allows access if request already has authenticated user attached', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    const { context } = createMockContext({}, mockUser);

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('throws UnauthorizedException when authorization header is missing', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    const { context } = createMockContext({});

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    await expect(guard.canActivate(context)).rejects.toThrow('Bearer token is required');
  });

  it('throws UnauthorizedException when authorization header does not start with Bearer', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    const { context } = createMockContext({ authorization: 'Basic 123456' });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('verifies token and attaches user to request on valid Bearer token', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    const { context, request } = createMockContext({
      authorization: 'Bearer valid.jwt.token',
    });

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(authService.verifyToken).toHaveBeenCalledWith('valid.jwt.token');
    expect(request.user).toEqual(mockUser);
  });
});
