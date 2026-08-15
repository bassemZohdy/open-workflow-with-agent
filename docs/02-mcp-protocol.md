# Pattern 2: Model Context Protocol (MCP) Tool Integration

## Overview
Model Context Protocol (MCP) standardizes tool discovery (`tools/list`) and execution (`tools/call`) across external tool servers using OpenAPI catalogs inside OpenWorkflow engines.

## Architecture
- **OpenAPI Catalog**: `src/main/resources/catalogs/mcp-catalog.yaml` (exposes `callMcpTool`; tool *discovery* is served by the local REST endpoint for the debug console/e2e suite but is not a workflow-called catalog operation)
- **Tool Executor State**: `Execute MCP Tool` in `src/main/resources/sub_flows/tool-executor.sw.yaml`
- **REST Endpoints**: `@GET /functions/mcp/tools` and `@POST /functions/mcp/call` in [`McpResource.java`](../src/main/java/org/acme/functions/McpResource.java)

## Supported MCP Tools
- `web_search`: Live web search query execution.
- `read_resource`: Fetch external URI resource or document content.
- `database_query`: Execute structured SQL database queries.

## Security note
`callMcpTool` deliberately does **not** echo the caller-supplied `arguments` back into the returned tool result, because that content flows straight into the LLM context as a tool result - echoing untrusted input verbatim would model the exact indirect prompt-injection (OWASP LLM01/ASI06) this reference implementation defends against.
