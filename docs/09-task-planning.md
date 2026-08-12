# Pattern 9: Dynamic Task Planning & Goal Decomposition (`plan-agent.sw.yaml`)

## Overview
Decomposes high-level user goals into ordered sub-task execution plans using `plannerCatalog#decomposeGoal` and executes plan steps via sub-flow delegation.

## Architecture
- **Sub-Flow**: `src/main/resources/plan-agent.sw.yaml` (id: `plan_agent`)
- **OpenAPI Catalog**: `src/main/resources/catalogs/planner-catalog.yaml`
- **REST Endpoint**: `@POST /functions/planner/decompose` in `UtilityResource.java`
