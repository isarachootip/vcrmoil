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
  tenantId: z.string().uuid(),
  slug: z.string().min(1),
  status: z.nativeEnum(TenantStatus),
});

export type TenantContext = z.infer<typeof tenantContextSchema>;
