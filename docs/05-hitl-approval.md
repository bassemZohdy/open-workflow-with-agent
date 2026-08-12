# Pattern 5: Human-in-the-Loop (HITL) Approval Gating

## Overview
Pauses workflow execution to request human review and approval for sensitive tool actions (such as production deployments or external database mutations).

## Architecture
- **Sub-Flow**: `src/main/resources/hitl-gate.sw.yaml` (id: `hitl_gate`)
- **OpenAPI Catalog**: `src/main/resources/catalogs/hitl-catalog.yaml`
- **REST Endpoints**: `@POST /functions/hitl/request`, `@POST /functions/hitl/approve`, `@GET /functions/hitl/status` in `UtilityResource.java`
