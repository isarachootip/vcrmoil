import { TenantStatus } from '@vcrm/shared';

export const API_VERSION = 'v1';

export function getApiStatus(): { status: string; tenantStatusSample: TenantStatus } {
  return {
    status: 'ok',
    tenantStatusSample: TenantStatus.ACTIVE,
  };
}
