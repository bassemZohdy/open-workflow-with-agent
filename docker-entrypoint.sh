#!/bin/sh
# Runtime entrypoint for the OpenWorkflow agent container.
#
# When deployed via docker-compose, the `litellm-keygen` one-shot service provisions a scoped
# LiteLLM virtual key (model allowlist + budget cap) and mounts it at /keys/openai_api_key.
# If that file exists and no explicit OPENAI_API_KEY was supplied (e.g. when pointing at an
# external provider), the container authenticates to the LLM proxy with the scoped key - never
# with the LiteLLM master key.
if [ -f /keys/openai_api_key ] && [ -z "${OPENAI_API_KEY:-}" ]; then
  export OPENAI_API_KEY="$(cat /keys/openai_api_key)"
fi

exec java ${JAVA_OPTS} -jar /deployments/quarkus-run.jar
