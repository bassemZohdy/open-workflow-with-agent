# Pattern 7: Parallel Multi-Agent Fan-Out (`parallel-agent.sw.yaml`)

## Overview
Executes independent multi-agent tasks concurrently across parallel branches (Researcher + Coder + Reviewer) using OpenWorkflow `parallel` states and aggregates results upon completion.

## Architecture
- **Sub-Flow**: `src/main/resources/parallel-agent.sw.yaml` (id: `parallel_agent`)
- **OpenAPI Catalog**: `src/main/resources/catalogs/a2a-catalog.yaml`
- **State Type**: OpenWorkflow `parallel` state with `completionType: allOf`
