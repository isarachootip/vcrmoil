export const AUDIT_METADATA_KEY = 'audit:metadata';
export const AUDIT_PII_VIEW_KEY = 'audit:pii_view';

export const AuditActions = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  READ_PII: 'read_pii',
  LOGIN: 'login',
  LOGOUT: 'logout',
} as const;

export type AuditAction = (typeof AuditActions)[keyof typeof AuditActions] | string;

export const AuditActorTypes = {
  USER: 'user',
  SYSTEM: 'system',
  API_KEY: 'api_key',
} as const;

export type AuditActorType = (typeof AuditActorTypes)[keyof typeof AuditActorTypes];
