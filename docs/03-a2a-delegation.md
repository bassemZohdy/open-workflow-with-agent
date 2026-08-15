# Pattern 3: Agent-to-Agent (A2A) Multi-Agent Delegation

## Overview
The Agent-to-Agent (A2A) protocol enables a primary workflow coordinator to discover registered peer sub-agents and delegate sub-task prompts dynamically.

## Architecture
- **OpenAPI Catalog**: `src/main/resources/catalogs/a2a-catalog.yaml` (exposes `delegateToAgent`; the agent *directory* is served by the local REST endpoint for the debug console/e2e suite but is not a workflow-called catalog operation)
- **Tool Executor State**: `Execute A2A Delegation` in `src/main/resources/sub_flows/tool-executor.sw.yaml`
- **REST Endpoints**: `@GET /functions/a2a/agents` and `@POST /functions/a2a/delegate` in [`A2aResource.java`](../src/main/java/org/acme/functions/A2aResource.java)

## Registered Sub-Agents
- `researcher_agent`: Specialized sub-agent for web and codebase research.
- `coder_agent`: Specialized sub-agent for code generation and refactoring.
- `reviewer_agent`: Specialized sub-agent for code review and verification.

## Security note
`delegateToAgent` deliberately does **not** echo the delegated `prompt` back into `delegation_result` - the result is fed into later prompts by the chaining/parallel/supervisor sub-flows, so echoing untrusted prompt text would model the exact indirect prompt-injection (OWASP LLM01/ASI06) this reference implementation defends against.
