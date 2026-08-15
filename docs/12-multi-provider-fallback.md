# Pattern 12: Multi-Provider LLM Fallback & Failover (`fallback-catalog.yaml`)

## Overview
Implements multi-provider failover routing across primary and backup LLM providers (e.g. OpenAI -> LiteLLM / Ollama fallback) to guarantee agent availability.

## Architecture
- **OpenAPI Catalog**: `src/main/resources/catalogs/fallback-catalog.yaml`
- **REST Endpoint**: `@POST /functions/fallback/chatCompletions` in [`FallbackResource.java`](../src/main/java/org/acme/functions/FallbackResource.java)

## Behavior
The advertised `fallback_provider` parameter is consumed: known-healthy providers (`openai`, `anthropic`, `ollama`, `litellm`, `azure`) serve the request directly; the sentinel `unavailable` primary simulates an outage and triggers failover to `fallback_provider` (default `litellm`), which is then reported as the serving provider. This is a mock endpoint - wire it to a real failover router (or the `agent_loop` retry path) for production.
