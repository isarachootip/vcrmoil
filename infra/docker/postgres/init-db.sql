-- Initialize vCRM PostgreSQL database and roles for Tenant Row-Level Security

-- Create extensions in default database if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create migration owner role (has full ownership of schema & tables)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'vcrm_owner') THEN
    CREATE ROLE vcrm_owner WITH LOGIN PASSWORD 'changeme' SUPERUSER;
  END IF;
END
$$;

-- Create application runtime role (CANNOT bypass RLS, restricted permissions)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'vcrm_app') THEN
    CREATE ROLE vcrm_app WITH LOGIN PASSWORD 'changeme' NOBYPASSRLS NOSUPERUSER;
  END IF;
END
$$;

-- Grant database permissions
GRANT ALL PRIVILEGES ON DATABASE vcrm TO vcrm_owner;
GRANT CONNECT ON DATABASE vcrm TO vcrm_app;

-- Configure public schema permissions
\connect vcrm;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

GRANT ALL ON SCHEMA public TO vcrm_owner;
GRANT USAGE ON SCHEMA public TO vcrm_app;

-- Ensure vcrm_app can read/write future tables created by vcrm_owner
ALTER DEFAULT PRIVILEGES FOR ROLE vcrm_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO vcrm_app;
ALTER DEFAULT PRIVILEGES FOR ROLE vcrm_owner IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO vcrm_app;
ALTER DEFAULT PRIVILEGES FOR ROLE vcrm_owner IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO vcrm_app;
