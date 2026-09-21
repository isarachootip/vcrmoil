import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  BASE_DOMAIN: z.string().default('localhost'),
  API_PORT: z.coerce.number().default(4000),
  WEB_URL: z.string().default('http://localhost:3000'),
  API_URL: z.string().default('http://localhost:4000'),
  DEFAULT_TIMEZONE: z.string().default('Asia/Bangkok'),
  DEFAULT_LOCALE: z.string().default('th'),
  DATABASE_URL: z.string().default('postgresql://vcrm_app:changeme@localhost:5432/vcrm'),
  DATABASE_MIGRATION_URL: z
    .string()
    .default('postgresql://vcrm_owner:changeme@localhost:5432/vcrm'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  AUTH_MODE: z.enum(['oidc', 'local']).default('oidc'),
  OIDC_ISSUER_URL: z.string().default('http://localhost:8080/realms/vcrm'),
  OIDC_CLIENT_ID: z.string().default('vcrm-web'),
  OIDC_CLIENT_SECRET: z.string().optional().default(''),
  JWT_LOCAL_SECRET: z.string().default('dev-only-change-me'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const errorDetails = result.error.format();
    throw new Error(`Configuration validation error: ${JSON.stringify(errorDetails, null, 2)}`);
  }
  return result.data;
}
