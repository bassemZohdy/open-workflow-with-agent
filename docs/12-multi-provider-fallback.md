# Pattern 12: Multi-Provider LLM Fallback & Failover (`fallback-catalog.yaml`)

## Overview
Implements multi-provider failover routing across primary and backup LLM providers (e.g. OpenAI -> LiteLLM / Ollama fallback) to guarantee agent availability.

## Architecture
- **OpenAPI Catalog**: `src/main/resources/catalogs/fallback-catalog.yaml`
- **REST Endpoint**: `@POST /functions/fallback/chatCompletions` in `UtilityResource.java`
