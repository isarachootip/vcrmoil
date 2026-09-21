#!/bin/sh
set -e

echo "========================================="
echo "   Starting vCRM API Container          "
echo "========================================="

# Apply database migrations if database URL is configured
if [ -n "$DATABASE_MIGRATION_URL" ] || [ -n "$DATABASE_URL" ]; then
  echo "Applying database migrations..."
  npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma || {
    echo "Database migration failed or database warming up, retrying in 5 seconds..."
    sleep 5
    npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma || {
      echo "Fatal: Could not apply database migrations."
      exit 1
    }
  }
  echo "Database migrations applied successfully."
fi

echo "Starting NestJS API server on port ${PORT:-4000}..."
exec node apps/api/dist/main.js
