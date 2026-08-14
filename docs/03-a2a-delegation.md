# Pattern 3: Agent-to-Agent (A2A) Multi-Agent Delegation

## Overview
The Agent-to-Agent (A2A) protocol enables a primary workflow coordinator to discover registered peer sub-agents and delegate sub-task prompts dynamically.

## Architecture
- **OpenAPI Catalog**: `src/main/resources/catalogs/a2a-catalog.yaml`
- **Tool Executor State**: `Execute A2A Delegation` in `src/main/resources/sub_flows/tool-executor.sw.yaml`
- **REST Endpoints**: `@GET /functions/a2a/agents` and `@POST /functions/a2a/delegate` in `UtilityResource.java`

## Registered Sub-Agents
- `researcher_agent`: Specialized sub-agent for web and codebase research.
- `coder_agent`: Specialized sub-agent for code generation and refactoring.
- `reviewer_agent`: Specialized sub-agent for code review and verification.
