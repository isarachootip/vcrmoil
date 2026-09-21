-- Enable UUID extensions (safely ignore if non-superuser or extension already handled)
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- CreateTable tenants
CREATE TABLE IF NOT EXISTS "tenants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" VARCHAR(63) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'trial',
    "plan" VARCHAR(64) NOT NULL DEFAULT 'standard',
    "settings" JSONB NOT NULL DEFAULT '{"timezone": "Asia/Bangkok", "locale": "th"}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "tenants_slug_key" ON "tenants"("slug");

-- CreateTable tenant_configs
CREATE TABLE IF NOT EXISTS "tenant_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "key" VARCHAR(128) NOT NULL,
    "value" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(64),

    CONSTRAINT "tenant_configs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tenant_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_configs_tenant_id_key_key" ON "tenant_configs"("tenant_id", "key");
CREATE INDEX IF NOT EXISTS "tenant_configs_tenant_id_idx" ON "tenant_configs"("tenant_id");

-- Enable Row-Level Security on tenant-scoped tables
ALTER TABLE "tenant_configs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_configs" FORCE ROW LEVEL SECURITY;

-- Create policy for tenant isolation using app.tenant_id
DROP POLICY IF EXISTS tenant_isolation_policy ON "tenant_configs";
CREATE POLICY tenant_isolation_policy ON "tenant_configs"
    AS RESTRICTIVE
    FOR ALL
    USING ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    WITH CHECK ("tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
