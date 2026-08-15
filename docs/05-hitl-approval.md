# Pattern 5: Human-in-the-Loop (HITL) Approval Gating

## Overview
Pauses workflow execution to request human review and approval for sensitive tool actions (such as production deployments or external database mutations).

## Architecture
- **Sub-Flow**: `src/main/resources/sub_flows/hitl-gate.sw.yaml` (id: `hitl_gate`)
- **OpenAPI Catalog**: `src/main/resources/catalogs/hitl-catalog.yaml`
- **REST Endpoints**: `@POST /functions/hitl/request`, `@POST /functions/hitl/approve`, `@GET /functions/hitl/status` in [`HitlResource.java`](../src/main/java/org/acme/functions/HitlResource.java)

## State machine (corrected)
- `requestApproval` stores a request as **`pending`** (with `approved: false` and a `created_at` timestamp).
- `approveRequest` transitions the request to **`approved`** or **`denied`**, recording `approved_by` and `decided_at`. Unknown `request_id`s return **404**, and a decision without an explicit `approved` flag **fails closed** (denied).
- `getApprovalStatus` reports the current record (`pending` for unknown ids).

Because requests start `pending`, the `Approval Denied` branch of `hitl-gate.sw.yaml` is reachable, and a deny decision is actually written back to the store instead of being a no-op.
