# Pattern 1: Autonomous Agent Reasoning Loop (`agent-loop.sw.yaml`)

## Overview
The Autonomous Reasoning Loop encapsulates multi-turn LLM execution, function tool selection, output message state formatting, loop termination guardrails, and tool-error handling within a reusable OpenWorkflow sub-flow.

## Architecture
- **Sub-Flow**: `src/main/resources/sub_flows/agent-loop.sw.yaml` (id: `agent_loop`)
- **OpenAPI Catalog**: `src/main/resources/catalogs/openai-compatible.yaml`
- **Generic Appender Expression**: `appendToolResult`

## Workflow States
1. **Inject Agent Defaults**: Initializes max tool iterations (`5`), the iteration counter, and the function schemas (`get_current_time`, `calculate`, `mcp_tool_call`, `a2a_delegate`).
2. **Call LLM**: Dispatches request to `openaiCatalog#chatCompletions`. Server-side clamps are applied in the workflow itself: `max_tokens` is capped at 4096 (default 512) and the message history is truncated to the most recent 20 messages. The caller-supplied `model` wins (subject to the entry workflow's allowlist), with `default-model` as the provider-agnostic fallback alias.
3. **Inspect LLM Response**: Evaluates returned tool calls (`choices[0].message.tool_calls`) and the iteration guard (`tool_iterations >= max_tool_iterations`).
4. **Execute Tool Subflow**: Dispatches tool calls to the `tool_executor` sub-flow. `onErrors` (codes `400`/`500`) provide defense in depth: anything escaping the sub-flow transitions to **Handle Tool Error** instead of crashing.
5. **Handle Tool Error**: Converts a workflow-level tool failure into a structured `tool_result.error` and appends it to the conversation via `appendToolResult`, so the LLM can retry or explain.
6. **Append Tool Result**: Formats tool output into prompt history using `appendToolResult`. Tool output is treated as **untrusted** at the tool→LLM boundary: it is wrapped in `<untrusted_tool_output>` markers and truncated to 2000 chars (indirect prompt-injection defense, OWASP LLM01/ASI06).
7. **Termination**: Ends with `Complete` when `tool_calls` is empty, `Tool Limit Reached` when the iteration cap is hit, or `LLM Call Failed` when the provider returns an HTTP error.

> The public `llm_tool_agent` entry workflow enforces server-side request guardrails in the workflow itself (message count/length caps, `user`/`assistant`-only roles, and a model allowlist) - see [`llm-tool-agent.sw.yaml`](../src/main/resources/llm-tool-agent.sw.yaml).
