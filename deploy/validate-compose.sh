#!/bin/sh
set -eu

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
    echo "docker compose is required to validate docker-compose.yml" >&2
    exit 1
fi

env_file="$(mktemp)"
trap 'rm -f "$env_file"' EXIT

sed \
    -e 's/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=compose-validation-admin-password/' \
    -e 's/^OPENWORKFLOW_DB_PASSWORD=.*/OPENWORKFLOW_DB_PASSWORD=compose-validation-app-password/' \
    -e 's/^LITELLM_DB_PASSWORD=.*/LITELLM_DB_PASSWORD=compose-validation-litellm-password/' \
    -e 's/^LITELLM_MASTER_KEY=.*/LITELLM_MASTER_KEY=compose-validation-master-key/' \
    -e 's/^UTILITY_API_KEY=.*/UTILITY_API_KEY=compose-validation-utility-key/' \
    .env.example >"$env_file"

docker compose --file docker-compose.yml --env-file "$env_file" config --quiet

services="$(docker compose --file docker-compose.yml --env-file "$env_file" config --services)"
for required_service in postgres postgres-bootstrap openworkflow-agent litellm litellm-keygen; do
    printf '%s\n' "$services" | grep -qx "$required_service" || {
        echo "Missing required compose service: $required_service" >&2
        exit 1
    }
done

echo "OK: docker-compose.yml is valid and includes the dedicated database bootstrap flow"
