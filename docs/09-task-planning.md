# Pattern 9: Dynamic Task Planning & Goal Decomposition (`plan-agent.sw.yaml`)

## Overview
Decomposes high-level user goals into ordered sub-task execution plans using `plannerCatalog#decomposeGoal` and executes plan steps via sub-flow delegation.

## Architecture
- **Sub-Flow**: `src/main/resources/sub_flows/plan-agent.sw.yaml` (id: `plan_agent`)
- **OpenAPI Catalog**: `src/main/resources/catalogs/planner-catalog.yaml`
- **REST Endpoint**: `@POST /functions/planner/decompose` in [`PlannerResource.java`](../src/main/java/org/acme/functions/PlannerResource.java)

## Note
Unlike the parallel/chain/supervisor/reflection sub-flows (which are orchestration-only), `plan_agent` DOES drive the real agent loop (`agent_loop`), which invokes the LLM through the OpenAI-compatible catalog.
