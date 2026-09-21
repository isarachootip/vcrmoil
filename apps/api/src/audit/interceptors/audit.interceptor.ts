import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';
import { AuditService } from '../audit.service';
import {
  AUDIT_METADATA_KEY,
  AUDIT_PII_VIEW_KEY,
  AuditActions,
  AuditActorTypes,
} from '../audit.constants';
import { AuditOptions, AuditPiiViewOptions } from '../decorators/audit.decorator';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<
      Request & {
        user?: Record<string, unknown>;
        tenant?: Record<string, unknown>;
        tenantId?: string;
      }
    >();

    const auditedOptions = this.reflector.getAllAndOverride<AuditOptions | undefined>(
      AUDIT_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    const piiViewOptions = this.reflector.getAllAndOverride<AuditPiiViewOptions | undefined>(
      AUDIT_PII_VIEW_KEY,
      [context.getHandler(), context.getClass()],
    );

    const method = req.method?.toUpperCase();
    const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

    // If not audited, not pii view, and not a mutation, do not intercept
    if (!auditedOptions && !piiViewOptions && !isMutation) {
      return next.handle();
    }

    const rawTenantId =
      req.tenant?.id ||
      req.tenantId ||
      req.user?.tenantId ||
      (req.headers['x-tenant-id'] as string);

    // If no tenant context is resolved, skip audit logging
    if (!rawTenantId) {
      return next.handle();
    }
    const tenantId = String(rawTenantId);

    const rawActorId = req.user?.id || req.user?.userId || req.user?.sub;
    const actorId = rawActorId ? String(rawActorId) : undefined;
    const actorEmail = req.user?.email ? String(req.user.email) : undefined;
    const actorType = req.user ? AuditActorTypes.USER : AuditActorTypes.SYSTEM;

    const rawIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      req.ip;
    const ipAddress = rawIp ? String(rawIp).substring(0, 45) : undefined;
    const userAgent = (req.headers['user-agent'] as string) || undefined;

    return next.handle().pipe(
      tap({
        next: (res) => {
          // 1. Audit PII View if annotated
          if (piiViewOptions) {
            const entityId = piiViewOptions.extractEntityId
              ? piiViewOptions.extractEntityId(req, res)
              : req.params?.id || (res as Record<string, unknown> | null | undefined)?.id;

            this.auditService
              .record({
                tenantId,
                actorId,
                actorType,
                actorEmail,
                action: AuditActions.READ_PII,
                entity: piiViewOptions.entity,
                entityId: entityId ? String(entityId) : undefined,
                metadata: {
                  piiFields: piiViewOptions.piiFields,
                  purpose: piiViewOptions.purpose,
                },
                ipAddress,
                userAgent,
              })
              .catch((err) => {
                this.logger.warn(`Failed to record PII audit log: ${err.message}`);
              });
          }

          // 2. Audit Mutations or @Audited operations
          if (auditedOptions || isMutation) {
            const action = auditedOptions?.action || this.inferActionFromMethod(method);
            const entity =
              auditedOptions?.entity || this.inferEntityFromUrl(req.originalUrl || req.url);

            const entityId = auditedOptions?.extractEntityId
              ? auditedOptions.extractEntityId(req, res)
              : req.params?.id || (res as Record<string, unknown> | null | undefined)?.id;

            const before = req.body?.__beforeState || null;
            const after = this.sanitizeAuditState(res);

            this.auditService
              .record({
                tenantId,
                actorId,
                actorType,
                actorEmail,
                action,
                entity,
                entityId: entityId ? String(entityId) : undefined,
                before,
                after,
                ipAddress,
                userAgent,
              })
              .catch((err) => {
                this.logger.warn(`Failed to record mutation audit log: ${err.message}`);
              });
          }
        },
      }),
    );
  }

  private inferActionFromMethod(method: string): string {
    switch (method) {
      case 'POST':
        return AuditActions.CREATE;
      case 'PATCH':
      case 'PUT':
        return AuditActions.UPDATE;
      case 'DELETE':
        return AuditActions.DELETE;
      default:
        return method.toLowerCase();
    }
  }

  private inferEntityFromUrl(url: string): string {
    if (!url) return 'unknown';
    // Matches e.g. /api/v1/iam/users -> user, /api/v1/cases -> case
    const cleanUrl = url.split('?')[0];
    const segments = cleanUrl.split('/').filter(Boolean);
    const lastOrSecondLast = segments[segments.length - 1];

    // If last segment is UUID/ID, take the one before it
    const isId = /^[0-9a-fA-F-]{36}$/.test(lastOrSecondLast) || /^\d+$/.test(lastOrSecondLast);
    const targetSegment =
      isId && segments.length > 1 ? segments[segments.length - 2] : lastOrSecondLast;

    // Convert plural to singular if simple (e.g. users -> user)
    if (targetSegment.endsWith('s')) {
      return targetSegment.slice(0, -1);
    }
    return targetSegment;
  }

  private sanitizeAuditState(data: unknown): Record<string, unknown> | null {
    if (!data || typeof data !== 'object') {
      return null;
    }
    // Omit sensitive fields like passwordHash, tokens
    const {
      password_hash: _ph,
      password: _p,
      token: _t,
      refreshToken: _rt,
      ...sanitized
    } = data as Record<string, unknown>;
    return sanitized;
  }
}
