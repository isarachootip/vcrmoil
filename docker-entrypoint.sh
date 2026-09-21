#!/bin/sh
set -e

echo "========================================="
echo "   Starting vCRM API Container          "
echo "========================================="

# Apply database migrations if database URL is configured
if [ -n "$DATABASE_MIGRATION_URL" ] || [ -n "$DATABASE_URL" ]; then
  echo "Applying database migrations..."
  run_prisma_migrate() {
    if [ -f "./apps/api/node_modules/.bin/prisma" ]; then
      ./apps/api/node_modules/.bin/prisma migrate deploy --schema=apps/api/prisma/schema.prisma
    elif [ -f "./node_modules/.bin/prisma" ]; then
      ./node_modules/.bin/prisma migrate deploy --schema=apps/api/prisma/schema.prisma
    else
      npx --yes prisma@6.4.1 migrate deploy --schema=apps/api/prisma/schema.prisma
    fi
  }

  run_prisma_migrate || {
    echo "Database migration failed or database warming up, retrying in 5 seconds..."
    sleep 5
    run_prisma_migrate || {
      echo "Fatal: Could not apply database migrations."
      exit 1
    }
  }
  echo "Database migrations applied successfully."
fi

echo "Starting NestJS API server on port ${PORT:-4000}..."
exec node apps/api/dist/main.js
