# Pattern 1: Autonomous Agent Reasoning Loop (`agent-loop.sw.yaml`)

## Overview
The Autonomous Reasoning Loop encapsulates multi-turn LLM execution, function tool selection, output message state formatting, and loop termination guardrails within a reusable OpenWorkflow sub-flow.

## Architecture
- **Sub-Flow**: `src/main/resources/sub_flows/agent-loop.sw.yaml` (id: `agent_loop`)
- **OpenAPI Catalog**: `src/main/resources/catalogs/openai-compatible.yaml`
- **Generic Appender Expression**: `appendToolResult`

## Workflow States
1. **Inject Agent Defaults**: Initializes model (`kimi-k2.5`), max tool iterations (`5`), and function schemas (`get_current_time`, `calculate`, `mcp_tool_call`, `a2a_delegate`).
2. **Call LLM**: Dispatches request to `openaiCatalog#chatCompletions`.
3. **Inspect LLM Response**: Evaluates returned tool calls (`choices[0].message.tool_calls`).
4. **Execute Tool Subflow**: Dispatches tool call to `tool_executor` sub-flow.
5. **Append Tool Result**: Formats tool output into prompt history using expression function `appendToolResult`.
6. **Termination**: Ends execution when `tool_calls` is empty or `max_tool_iterations` limit is reached.
