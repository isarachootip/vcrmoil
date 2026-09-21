#!/bin/sh
set -e

# =========================================================================
# vCRM PostgreSQL Role Password Synchronization Script
# Synchronizes vcrm_owner and vcrm_app passwords with environment variables
# =========================================================================

APP_PWD="${POSTGRES_APP_PASSWORD:-changeme}"
OWNER_PWD="${POSTGRES_OWNER_PASSWORD:-changeme}"

echo ">> Synchronizing vCRM database role passwords from container environment..."

# Safely escape single quotes for PostgreSQL string literal format
ESCAPED_OWNER_PWD=$(printf '%s' "$OWNER_PWD" | sed "s/'/''/g")
ESCAPED_APP_PWD=$(printf '%s' "$APP_PWD" | sed "s/'/''/g")

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  DO \$\$
  BEGIN
    EXECUTE format('ALTER ROLE vcrm_owner WITH PASSWORD %L', '$ESCAPED_OWNER_PWD');
    EXECUTE format('ALTER ROLE vcrm_app WITH PASSWORD %L', '$ESCAPED_APP_PWD');
  END
  \$\$;
EOSQL

echo ">> vCRM database role passwords synchronized successfully."
