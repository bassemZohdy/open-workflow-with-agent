# Pattern 4: Short & Long-Term Agent Memory (`memory-catalog.yaml`)

## Overview
Provides key-value context storage, memory retrieval, and semantic vector search for maintaining long-term memory across workflow executions.

## Architecture
- **OpenAPI Catalog**: `src/main/resources/catalogs/memory-catalog.yaml`
- **Tool Router States**: `Execute Memory Get`, `Execute Memory Set`, `Execute Memory Search` in `src/main/resources/sub_flows/tool-executor.sw.yaml`
- **REST Endpoints**: `@GET /functions/memory/get`, `@POST /functions/memory/set`, `@POST /functions/memory/search` in [`MemoryResource.java`](../src/main/java/org/acme/functions/MemoryResource.java)

## Hardening
- The backing store is a size-capped (10k entries), TTL-evicting (1h) `BoundedCache`.
- Individual entries are additionally bounded: keys ≤ 256 bytes and values ≤ 4 KB, rejected with HTTP 413 - so the aggregate footprint cannot balloon to ~10k × multi-MB bodies.
- `memory/search` consumes the advertised `top_k` parameter (clamped to 1..10, default 3) and returns that many fabricated matches.
