# Pattern 11: Supervisor / Orchestrator-Worker Router (`supervisor-agent.sw.yaml`)

## Overview
An Orchestrator-Worker supervisor pattern where a central supervisor inspects incoming task payloads and dynamically routes execution to specialized worker sub-agents based on payload state.

## Architecture
- **Sub-Flow**: `src/main/resources/sub_flows/supervisor-agent.sw.yaml` (id: `supervisor_agent`)
- **OpenAPI Catalog**: `src/main/resources/catalogs/a2a-catalog.yaml`
- **Switch Routing**: Evaluates `.task_type` (`research`, `code`, `review`) and dispatches to corresponding target worker.

## Orchestration-only demonstration
This sub-flow demonstrates the *orchestration* pattern only: it never invokes the LLM. Delegation calls the mock A2A endpoint (`/functions/a2a/delegate`), a stubbed REST endpoint returning a canned `delegation_result`. In a production deployment, `delegateToAgent` would be wired to a real LLM-backed A2A worker runtime.
