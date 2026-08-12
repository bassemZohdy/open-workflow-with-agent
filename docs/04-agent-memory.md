# Pattern 4: Short & Long-Term Agent Memory (`memory-catalog.yaml`)

## Overview
Provides key-value context storage, memory retrieval, and semantic vector search for maintaining long-term memory across workflow executions.

## Architecture
- **OpenAPI Catalog**: `src/main/resources/catalogs/memory-catalog.yaml`
- **Tool Router States**: `Execute Memory Get`, `Execute Memory Set`, `Execute Memory Search` in `src/main/resources/tool-executor.sw.yaml`
- **REST Endpoints**: `@GET /functions/memory/get`, `@POST /functions/memory/set`, `@POST /functions/memory/search` in `UtilityResource.java`
