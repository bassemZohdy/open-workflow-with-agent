#!/bin/sh
set -eu

: "${POSTGRES_ADMIN_USER:?POSTGRES_ADMIN_USER is required}"
: "${POSTGRES_ADMIN_PASSWORD:?POSTGRES_ADMIN_PASSWORD is required}"
: "${OPENWORKFLOW_DB_NAME:?OPENWORKFLOW_DB_NAME is required}"
: "${OPENWORKFLOW_DB_USER:?OPENWORKFLOW_DB_USER is required}"
: "${OPENWORKFLOW_DB_PASSWORD:?OPENWORKFLOW_DB_PASSWORD is required}"
: "${LITELLM_DB_NAME:?LITELLM_DB_NAME is required}"
: "${LITELLM_DB_USER:?LITELLM_DB_USER is required}"
: "${LITELLM_DB_PASSWORD:?LITELLM_DB_PASSWORD is required}"

if [ "$POSTGRES_ADMIN_USER" = "$OPENWORKFLOW_DB_USER" ] || [ "$POSTGRES_ADMIN_USER" = "$LITELLM_DB_USER" ]; then
    echo "Bootstrap admin and application roles must be different" >&2
    exit 1
fi

export PGPASSWORD="$POSTGRES_ADMIN_PASSWORD"

psql \
    --host=postgres \
    --username="$POSTGRES_ADMIN_USER" \
    --dbname=postgres \
    --set=ON_ERROR_STOP=1 \
    --set=app_db="$OPENWORKFLOW_DB_NAME" \
    --set=app_user="$OPENWORKFLOW_DB_USER" \
    --set=app_password="$OPENWORKFLOW_DB_PASSWORD" \
    --set=llm_db="$LITELLM_DB_NAME" \
    --set=llm_user="$LITELLM_DB_USER" \
    --set=llm_password="$LITELLM_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'app_user', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user') \gexec
SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L', :'app_user', :'app_password') \gexec

SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'llm_user', :'llm_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'llm_user') \gexec
SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L', :'llm_user', :'llm_password') \gexec

SELECT format('CREATE DATABASE %I OWNER %I', :'app_db', :'app_user')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'app_db') \gexec
SELECT format('ALTER DATABASE %I OWNER TO %I', :'app_db', :'app_user') \gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', :'app_db') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'app_db', :'app_user') \gexec

SELECT format('CREATE DATABASE %I OWNER %I', :'llm_db', :'llm_user')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'llm_db') \gexec
SELECT format('ALTER DATABASE %I OWNER TO %I', :'llm_db', :'llm_user') \gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', :'llm_db') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'llm_db', :'llm_user') \gexec
SQL

echo "PostgreSQL application and LiteLLM roles/databases are ready"
