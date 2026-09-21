#!/bin/sh
set -e

echo "========================================="
echo "   Starting vCRM API Container          "
echo "========================================="

# Fallback DATABASE_MIGRATION_URL to DATABASE_URL and vice-versa
MIGRATION_DB_URL="${DATABASE_MIGRATION_URL:-$DATABASE_URL}"
export DATABASE_URL="${DATABASE_URL:-$DATABASE_MIGRATION_URL}"

# Apply database migrations if database URL is configured
if [ -n "$MIGRATION_DB_URL" ]; then
  echo "Applying database migrations..."
  run_prisma_migrate() {
    if [ -f "./apps/api/node_modules/.bin/prisma" ]; then
      DATABASE_URL="$MIGRATION_DB_URL" ./apps/api/node_modules/.bin/prisma migrate deploy --schema=apps/api/prisma/schema.prisma
    elif [ -f "./node_modules/.bin/prisma" ]; then
      DATABASE_URL="$MIGRATION_DB_URL" ./node_modules/.bin/prisma migrate deploy --schema=apps/api/prisma/schema.prisma
    else
      DATABASE_URL="$MIGRATION_DB_URL" npx --yes prisma@6.4.1 migrate deploy --schema=apps/api/prisma/schema.prisma
    fi
  }

  run_prisma_migrate || {
    echo "Database migration failed or database warming up, retrying in 5 seconds..."
    sleep 5
    run_prisma_migrate || {
      echo "WARNING: Could not apply database migrations automatically on startup."
      echo "Continuing container startup so API service and healthcheck can respond..."
    }
  }
  echo "Database migrations step completed."
fi

# =========================================================================
# Security Hardening: Purge superuser migration credentials from runtime
# =========================================================================
echo "Sanitizing runtime environment: purging superuser migration credentials..."
DATABASE_MIGRATION_URL=""
unset DATABASE_MIGRATION_URL
MIGRATION_DB_URL=""
unset MIGRATION_DB_URL

echo "Starting NestJS API server on port ${PORT:-4000}..."
exec node apps/api/dist/main.js
