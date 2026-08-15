# Pattern 6: Output Guardrails & Schema Validation

## Overview
Validates generated LLM responses against expected JSON schemas and checks content moderation rules to ensure output safety.

## Architecture
- **OpenAPI Catalog**: `src/main/resources/catalogs/guardrails-catalog.yaml`
- **REST Endpoint**: `@POST /functions/guardrails/validate` in [`GuardrailsResource.java`](../src/main/java/org/acme/functions/GuardrailsResource.java)
- **Integration**: Used inside `reflection-agent.sw.yaml` for critique evaluation.

## Behavior
- Content containing `INVALID_SCHEMA` or `FORBIDDEN` is rejected.
- The advertised `expected_format` parameter is consumed: when it is `json` (the default), content must additionally parse as valid JSON.
