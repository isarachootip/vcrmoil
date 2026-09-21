import { z } from 'zod';

export enum TenantStatus {
  TRIAL = 'trial',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
}

export enum AgentStatus {
  ONLINE = 'online',
  AWAY = 'away',
  OFFLINE = 'offline',
}

export enum UserRole {
  SUPER_ADMIN = 'SuperAdmin',
  TENANT_ADMIN = 'TenantAdmin',
  SUPERVISOR = 'Supervisor',
  AGENT = 'Agent',
  QA_EVALUATOR = 'QAEvaluator',
  KB_EDITOR = 'KBEditor',
  VIEWER = 'Viewer',
}

export enum ChannelType {
  VOICE = 'voice',
  LINE = 'line',
  FACEBOOK = 'facebook',
  LIVECHAT = 'livechat',
  EMAIL = 'email',
  FORM = 'form',
  SURVEY = 'survey',
}

export interface ProblemDetails {
  type?: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  code?: string;
  errors?: Record<string, string[]>;
  timestamp?: string;
}

export const tenantContextSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1),
  name: z.string(),
  status: z.nativeEnum(TenantStatus),
  plan: z.string(),
  settings: z.record(z.unknown()).default({}),
});

export type TenantContext = z.infer<typeof tenantContextSchema>;

export const createTenantSchema = z.object({
  name: z.string().min(2).max(255),
  slug: z
    .string()
    .min(2)
    .max(63)
    .regex(/^[a-z0-9-]+$/, 'Slug must only contain lowercase alphanumeric characters and hyphens'),
  plan: z.string().optional().default('standard'),
  adminEmail: z.string().email(),
  adminName: z.string().min(2).optional(),
  settings: z
    .object({
      timezone: z.string().default('Asia/Bangkok'),
      locale: z.string().default('th'),
    })
    .optional(),
});

export type CreateTenantDto = z.infer<typeof createTenantSchema>;
