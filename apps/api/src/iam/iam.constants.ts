export const PERMISSION_KEY = 'require_permission';

export const Permissions = {
  USER_CREATE: 'user.create',
  USER_READ: 'user.read',
  USER_UPDATE: 'user.update',
  USER_DELETE: 'user.delete',
  TEAM_MANAGE: 'team.manage',
  ROLE_MANAGE: 'role.manage',
  SKILL_MANAGE: 'skill.manage',
  CASE_READ: 'case.read',
  CASE_UPDATE: 'case.update',
  CONTACT_PII_VIEW: 'contact.pii.view',
} as const;

export type PermissionCode = (typeof Permissions)[keyof typeof Permissions] | string;
