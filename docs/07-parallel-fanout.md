# Pattern 7: Parallel Multi-Agent Fan-Out (`parallel-agent.sw.yaml`)

## Overview
Executes independent multi-agent tasks concurrently across parallel branches (Researcher + Coder + Reviewer) using OpenWorkflow `parallel` states and aggregates results upon completion.

## Architecture
- **Sub-Flow**: `src/main/resources/sub_flows/parallel-agent.sw.yaml` (id: `parallel_agent`)
- **OpenAPI Catalog**: `src/main/resources/catalogs/a2a-catalog.yaml`
- **State Type**: OpenWorkflow `parallel` state with `completionType: allOf`

## Orchestration-only demonstration
This sub-flow demonstrates the *orchestration* pattern only: it never invokes the LLM. Each branch calls the mock A2A delegation endpoint (`/functions/a2a/delegate`), which is a stubbed REST endpoint returning a canned `delegation_result`. In a production deployment, `delegateToAgent` would be wired to a real A2A sub-agent runtime (or the branches would call LLM-backed agents).
