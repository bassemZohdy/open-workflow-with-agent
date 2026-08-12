# Pattern 11: Supervisor / Orchestrator-Worker Router (`supervisor-agent.sw.yaml`)

## Overview
An Orchestrator-Worker supervisor pattern where a central supervisor inspects incoming task payloads and dynamically routes execution to specialized worker sub-agents based on payload state.

## Architecture
- **Sub-Flow**: `src/main/resources/supervisor-agent.sw.yaml` (id: `supervisor_agent`)
- **OpenAPI Catalog**: `src/main/resources/catalogs/a2a-catalog.yaml`
- **Switch Routing**: Evaluates `.task_type` (`research`, `code`, `review`) and dispatches to corresponding target worker.
