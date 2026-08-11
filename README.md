# Agentic OpenWorkflow Specification Proof-of-Concept

This project demonstrates extending the **OpenWorkflow specification** (CNCF Serverless Workflow standard) to natively support **Agentic AI capabilities**. It uses **SonataFlow** purely as a concrete reference implementation to validate and prove these OpenWorkflow spec extensions.

The architecture introduces two key extensions to standard serverless workflow engines:
1. **Catalog Functions**: Modular, externalized OpenAPI specification registries (`catalogs`) for LLM providers and domain utility endpoints.
2. **Agentic Sub-Flows**: Modular workflow subflows (`subFlowRef`) that encapsulate autonomous tool reasoning loops, prompt state management, function call routing, and iteration guardrails.

---

## Architecture Overview

```text
OpenWorkflow Entry Point (llm_tool_agent)
 └── Reusable Agent Sub-Flow (agent_loop)
     ├── Catalog Function: openaiChatCompletion (OpenAPI Catalog)
     ├── Generic Appender: appendToolResult     (Unified Expression Function)
     ├── Tool Executor Sub-Flow (tool_executor)
     │   ├── Utility Catalog Functions: getCurrentTime, calculate
     │   ├── MCP Catalog Functions: callMcpTool, listMcpTools
     │   └── A2A Catalog Functions: delegateToAgent, listAgents
     ├── State Machine & Tool Call Router
     └── Safety Guardrails: Bounded Loop (max 5 tool iterations)
```

### Core Components

* **Parent Workflow** ([`llm-tool-agent.sw.yaml`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/src/main/resources/llm-tool-agent.sw.yaml)): Serves as the public HTTP entry point delegating directly to `agent_loop`.
* **Agent Loop Sub-Flow** ([`agent-loop.sw.yaml`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/src/main/resources/agent-loop.sw.yaml)): Manages prompt assembly, LLM execution, generic message formatting, and iteration limits.
* **Tool Executor Sub-Flow** ([`tool-executor.sw.yaml`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/src/main/resources/tool-executor.sw.yaml)): Dedicated sub-flow routing execution across Utility, MCP, and A2A catalog functions.
* **OpenAI Catalog** ([`openai-compatible.yaml`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/src/main/resources/catalogs/openai-compatible.yaml)): OpenAPI specification defining chat completions and embeddings endpoints.
* **Utility Catalog** ([`utility-functions.yaml`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/src/main/resources/catalogs/utility-functions.yaml)): OpenAPI specification defining utility tool operations (`/functions/time`, `/functions/calculator`).
* **MCP Catalog** ([`mcp-catalog.yaml`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/src/main/resources/catalogs/mcp-catalog.yaml)): OpenAPI specification for Model Context Protocol (MCP) tool discovery (`/functions/mcp/tools`) and execution (`/functions/mcp/call`).
* **A2A Catalog** ([`a2a-catalog.yaml`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/src/main/resources/catalogs/a2a-catalog.yaml)): OpenAPI specification for Agent-to-Agent sub-agent task delegation (`/functions/a2a/delegate`) and directory lookup (`/functions/a2a/agents`).
* **Local Utility Service** ([`UtilityResource`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/src/main/java/org/acme/functions/UtilityResource.java)): JAX-RS endpoints providing local execution for Utility, MCP, and A2A catalog operations.


---

## OpenWorkflow Specification Extensions

### 1. Catalog Functions (`workflow-uri-definitions`)
Standard OpenWorkflow specs are extended to support URI-based catalog imports. Catalogs declare external OpenAPI operations outside the workflow definition, avoiding hardcoded endpoint URLs inside states:

```yaml
extensions:
  - extensionid: workflow-uri-definitions
    definitions:
      openaiCatalog: classpath:/catalogs/openai-compatible.yaml
      utilityCatalog: classpath:/catalogs/utility-functions.yaml

functions:
  - name: openaiChatCompletion
    operation: openaiCatalog#chatCompletions
  - name: getCurrentTime
    operation: utilityCatalog#getCurrentTime
  - name: calculate
    operation: utilityCatalog#calculate
```

### 2. Sub-Flow Agent Reasoning Loop
Autonomous agent loops are packaged as reusable OpenWorkflow sub-flows. The parent workflow invokes the sub-flow, which executes a bounded execution loop:

1. **Inject Agent Defaults**: Initializes tool schemas, max tool iteration limits, and default parameters.
2. **Call LLM**: Dispatches the conversation payload to the model endpoint configured in the OpenAI Catalog.
3. **Inspect LLM Response**: Evaluates tool calls returned by the model (`choices[0].message.tool_calls`).
4. **Execute Tool & Append Result**: Invokes target catalog functions, formats tool output into OpenAI message format, appends to prompt history, and increments iteration counter.
5. **Termination Guardrails**: Automatically terminates when the LLM outputs a final response (`tool_calls` empty) or reaches `max_tool_iterations` (default: 5).

---

## SonataFlow Reference Implementation

[SonataFlow](https://sonataflow.org/) (formerly Kogito Serverless Workflow) is utilized as the reference execution engine to prove this OpenWorkflow specification model. SonataFlow resolves OpenAPI definitions, compiles declarative YAML states, and executes Quarkus-backed microservice containers without requiring custom Java orchestration code.

---

## Running Locally

### Prerequisites
* JDK 17+
* Apache Maven 3.9+

### Environment Setup
Configure your OpenAI-compatible endpoint (such as LiteLLM, Ollama, or vLLM) and API key:

```bash
export OPENAI_BASE_URL=http://localhost:4000/v1
export OPENAI_API_KEY=your-openai-key
```

### Start Quarkus Dev Mode

```bash
mvn clean quarkus:dev
```

### Invoke the Agent Workflow

Invoke the public parent workflow endpoint with a prompt requiring tool execution:

```bash
curl -X POST http://localhost:8080/llm_tool_agent \
  -H 'Content-Type: application/json' \
  -d '{
    "messages": [{"role": "user", "content": "Calculate 7 * 6 and reply with only the result."}],
    "temperature": 0,
    "max_tokens": 64
  }'
```

### Management Endpoints
* **SonataFlow Management Console**: [http://localhost:8080/](http://localhost:8080/)
* **Swagger UI**: [http://localhost:8080/q/swagger-ui/](http://localhost:8080/q/swagger-ui/)

---

## Testing

Execute unit and integration tests:

```bash
mvn clean test
```

The test suite covers:
* [`UtilityResourceTest`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/src/test/java/org/acme/functions/UtilityResourceTest.java): Comprehensive unit tests (42 test runs) covering arithmetic operator precedence, negative/decimal numbers, whitespace handling, null/blank validation, multi-timezone resolution (`Asia/Dubai`, `America/New_York`, `Europe/London`, `UTC`, `GMT`, `UTC+4`, `UTC-5`), MCP tool discovery/execution (`web_search`, `read_resource`, `database_query`), A2A sub-agent delegation (`researcher_agent`, `coder_agent`, `reviewer_agent`), Memory storage/retrieval/search, Human-in-the-Loop approval requests/decisions, Output Guardrails JSON validation, and Multi-Provider LLM Fallback chat completions.
* [`AgentLoopSubflowTest`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/src/test/java/org/acme/functions/AgentLoopSubflowTest.java): End-to-end integration tests using [`OpenAiMockApiResource`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/src/test/java/org/acme/functions/OpenAiMockApiResource.java) supporting multi-turn tool call handling (`calculate`, `get_current_time`) and direct text completions.

---

## Kubernetes & OpenShift Deployment

Deployments target OpenShift Serverless Logic / Kubernetes using the SonataFlow GitOps profile. See [`deploy/README.md`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/deploy/README.md) for manifest packaging, secrets, and deployment commands.

