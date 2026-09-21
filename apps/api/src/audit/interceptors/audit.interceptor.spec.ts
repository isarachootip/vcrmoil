import { ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import { randomUUID } from 'crypto';
import { AuditInterceptor } from './audit.interceptor';
import { AuditService } from '../audit.service';
import { AUDIT_PII_VIEW_KEY, AuditActions } from '../audit.constants';

describe('AuditInterceptor', () => {
  let interceptor: AuditInterceptor;
  let reflector: Reflector;
  let auditService: jest.Mocked<AuditService>;

  const tenantId = randomUUID();
  const userId = randomUUID();

  beforeEach(() => {
    reflector = new Reflector();
    auditService = {
      record: jest.fn().mockResolvedValue({} as never),
    } as unknown as jest.Mocked<AuditService>;

    interceptor = new AuditInterceptor(reflector, auditService);
  });

  function createMockExecutionContext(req: unknown): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => ({}),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  }

  function createMockCallHandler(responseData: unknown): CallHandler {
    return {
      handle: () => of(responseData),
    };
  }

  it('automatically audits POST mutation requests as create action', (done) => {
    const req = {
      method: 'POST',
      url: '/api/v1/iam/users',
      originalUrl: '/api/v1/iam/users',
      tenant: { id: tenantId },
      user: { id: userId, email: 'admin@acme.com' },
      headers: {
        'user-agent': 'JestTestRunner/1.0',
        'x-forwarded-for': '203.0.113.195',
      },
      params: {},
      body: { name: 'New User' },
    };

    const resData = { id: 'usr-999', name: 'New User' };
    const context = createMockExecutionContext(req);
    const next = createMockCallHandler(resData);

    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    interceptor.intercept(context, next).subscribe({
      next: (val) => {
        expect(val).toEqual(resData);
      },
      complete: () => {
        expect(auditService.record).toHaveBeenCalledWith(
          expect.objectContaining({
            tenantId,
            actorId: userId,
            actorEmail: 'admin@acme.com',
            action: AuditActions.CREATE,
            entity: 'user',
            entityId: 'usr-999',
            ipAddress: '203.0.113.195',
            userAgent: 'JestTestRunner/1.0',
          }),
        );
        done();
      },
    });
  });

  it('audits PII read requests decorated with @AuditPiiView', (done) => {
    const req = {
      method: 'GET',
      url: '/api/v1/iam/users/usr-123',
      originalUrl: '/api/v1/iam/users/usr-123',
      tenant: { id: tenantId },
      user: { id: userId, email: 'officer@acme.com' },
      headers: {
        'user-agent': 'Chrome/120',
      },
      params: { id: 'usr-123' },
    };

    const resData = { id: 'usr-123', name: 'Confidential Person', email: 'secret@acme.com' };
    const context = createMockExecutionContext(req);
    const next = createMockCallHandler(resData);

    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === AUDIT_PII_VIEW_KEY) {
        return {
          entity: 'user',
          piiFields: ['name', 'email'],
          purpose: 'Customer identity verification',
        };
      }
      return undefined;
    });

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        expect(auditService.record).toHaveBeenCalledWith(
          expect.objectContaining({
            tenantId,
            actorId: userId,
            actorEmail: 'officer@acme.com',
            action: AuditActions.READ_PII,
            entity: 'user',
            entityId: 'usr-123',
            metadata: {
              piiFields: ['name', 'email'],
              purpose: 'Customer identity verification',
            },
          }),
        );
        done();
      },
    });
  });

  it('skips GET requests that have no audit decorators', (done) => {
    const req = {
      method: 'GET',
      url: '/api/v1/health',
      originalUrl: '/api/v1/health',
      headers: {},
      params: {},
    };

    const context = createMockExecutionContext(req);
    const next = createMockCallHandler({ status: 'ok' });

    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        expect(auditService.record).not.toHaveBeenCalled();
        done();
      },
    });
  });
});
