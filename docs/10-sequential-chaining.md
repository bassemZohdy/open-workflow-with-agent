# Pattern 10: Sequential Pipeline Chaining (`chain-agent.sw.yaml`)

## Overview
Executes sequential multi-agent pipelines where output from Step N passes as context prompt to Step N+1 (Research -> Code Generation -> Architecture Review).

## Architecture
- **Sub-Flow**: `src/main/resources/sub_flows/chain-agent.sw.yaml` (id: `chain_agent`)
- **OpenAPI Catalog**: `src/main/resources/catalogs/a2a-catalog.yaml`
- **Execution Order**: Step 1 (`researcher_agent`) -> Step 2 (`coder_agent`) -> Step 3 (`reviewer_agent`)
