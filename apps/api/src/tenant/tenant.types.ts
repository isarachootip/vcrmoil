import { Request } from 'express';
import { TenantContext } from '@vcrm/shared';

export interface TenantRequest extends Request {
  tenant?: TenantContext;
}
