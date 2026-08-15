# Pattern 10: Sequential Pipeline Chaining (`chain-agent.sw.yaml`)

## Overview
Executes sequential multi-agent pipelines where output from Step N passes as context prompt to Step N+1 (Research -> Code Generation -> Architecture Review).

## Architecture
- **Sub-Flow**: `src/main/resources/sub_flows/chain-agent.sw.yaml` (id: `chain_agent`)
- **OpenAPI Catalog**: `src/main/resources/catalogs/a2a-catalog.yaml`
- **Execution Order**: Step 1 (`researcher_agent`) -> Step 2 (`coder_agent`) -> Step 3 (`reviewer_agent`)

## Orchestration-only demonstration
This sub-flow demonstrates the *orchestration* pattern only: it never invokes the LLM. Each step calls the mock A2A delegation endpoint (`/functions/a2a/delegate`), which is a stubbed REST endpoint returning a canned `delegation_result` (that result is passed to the next step as its prompt). In a production deployment, `delegateToAgent` would be wired to a real LLM-backed A2A sub-agent runtime.
