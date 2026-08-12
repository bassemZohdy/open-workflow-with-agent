# Pattern 6: Output Guardrails & Schema Validation

## Overview
Validates generated LLM responses against expected JSON schemas and checks content moderation rules to ensure output safety.

## Architecture
- **OpenAPI Catalog**: `src/main/resources/catalogs/guardrails-catalog.yaml`
- **REST Endpoint**: `@POST /functions/guardrails/validate` in `UtilityResource.java`
- **Integration**: Used inside `reflection-agent.sw.yaml` for critique evaluation.
