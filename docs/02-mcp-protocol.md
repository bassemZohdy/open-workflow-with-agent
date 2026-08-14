# Pattern 2: Model Context Protocol (MCP) Tool Integration

## Overview
Model Context Protocol (MCP) standardizes tool discovery (`tools/list`) and execution (`tools/call`) across external tool servers using OpenAPI catalogs inside OpenWorkflow engines.

## Architecture
- **OpenAPI Catalog**: `src/main/resources/catalogs/mcp-catalog.yaml`
- **Tool Executor State**: `Execute MCP Tool` in `src/main/resources/sub_flows/tool-executor.sw.yaml`
- **REST Endpoints**: `@GET /functions/mcp/tools` and `@POST /functions/mcp/call` in `UtilityResource.java`

## Supported MCP Tools
- `web_search`: Live web search query execution.
- `read_resource`: Fetch external URI resource or document content.
- `database_query`: Execute structured SQL database queries.
