# Agentic OpenWorkflow Specification Reference Implementation

This project provides the **Reference Implementation** for extending the **OpenWorkflow specification** (formerly CNCF Serverless Workflow standard) to natively support **all Canonical Agentic AI Patterns**. It leverages **SonataFlow** as the concrete production runtime engine to validate, execute, and deliver these OpenWorkflow specification extensions.

## OpenWorkflow Specification Extensions & Implementation Architecture

| Feature Category | Description | Implementation Mechanism |
| :--- | :--- | :--- |
| **Catalog Functions** | Modular, externalized OpenAPI registries for LLM providers, domain tools, MCP, A2A, Memory, HITL, Guardrails, Fallback, and Planning | `workflow-uri-definitions` extension referencing OpenAPI specs (`classpath:/catalogs/*.yaml`) |
| **Agentic Reasoning Sub-Flows** | Autonomous multi-turn reasoning loop with safety guardrails and tool iteration limits | Modular `subFlowRef` delegation ([`agent-loop.sw.yaml`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/src/main/resources/agent-loop.sw.yaml)) |
| **Dynamic Tool Router Sub-Flow** | Generic dispatching of function calls to OpenAPI catalog operations | Modular `subFlowRef` routing state ([`tool-executor.sw.yaml`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/src/main/resources/tool-executor.sw.yaml)) |
| **Model Context Protocol (MCP)** | Open protocol for JSON-RPC / OpenAPI tool discovery and execution | MCP Catalog (`mcpCatalog#listMcpTools`, `mcpCatalog#callMcpTool`) + REST service endpoints |
| **Agent-to-Agent (A2A) Communication** | Peer and sub-agent directory lookup and task delegation | A2A Catalog (`a2aCatalog#listAgents`, `a2aCatalog#delegateToAgent`) + sub-agent routing |
| **Short & Long-Term Memory** | Context buffer storage, key-value retrieval, and vector memory search | Memory Catalog (`memoryCatalog#getMemory`, `memoryCatalog#setMemory`, `memoryCatalog#searchMemory`) |
| **Human-in-the-Loop (HITL) Gating** | Pausing workflow execution pending human review and approval | HITL Gate Sub-Flow ([`hitl-gate.sw.yaml`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/src/main/resources/hitl-gate.sw.yaml)) + HITL Catalog |
| **Output Guardrails & Validation** | Structured JSON schema validation and response safety checks | Guardrails Catalog (`guardrailsCatalog#validateOutput`) |
| **Parallel Multi-Agent Fan-Out** | Concurrent multi-agent task execution across sub-agents | Parallel Sub-Flow ([`parallel-agent.sw.yaml`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/src/main/resources/parallel-agent.sw.yaml)) using `parallel` states |
| **Self-Reflection & Critique Loop** | Recursive generation, guardrail evaluation, and self-refinement | Reflection Sub-Flow ([`reflection-agent.sw.yaml`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/src/main/resources/reflection-agent.sw.yaml)) with critique switch states |
| **Planning & Task Decomposition** | Goal decomposition into ordered sub-task plans | Planning Sub-Flow ([`plan-agent.sw.yaml`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/src/main/resources/plan-agent.sw.yaml)) + Planner Catalog |
| **Sequential Chaining Pipeline** | Step-by-step multi-agent pipeline (Research -> Code -> Review) | Chaining Sub-Flow ([`chain-agent.sw.yaml`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/src/main/resources/chain-agent.sw.yaml)) |
| **Supervisor / Worker Router** | Dynamic supervisor routing tasks to specialized worker sub-agents | Supervisor Sub-Flow ([`supervisor-agent.sw.yaml`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/src/main/resources/supervisor-agent.sw.yaml)) |
| **Multi-Provider Fallback** | Provider failover routing across primary and backup LLM providers | Fallback Catalog (`fallbackCatalog#fallbackChatCompletions`) |
| **Generic Message Appender** | Universal formatting of tool outputs into LLM prompt state history | Reusable expression function (`appendToolResult`) |

---

## Architecture Overview

```text
OpenWorkflow Entry Point (llm_tool_agent)
 ├── Reusable Reasoning Sub-Flow (agent_loop)
 │   ├── OpenAI Catalog: openaiChatCompletion
 │   ├── Generic Appender: appendToolResult
 │   └── Tool Executor Sub-Flow (tool_executor)
 │       ├── Utility Catalog: getCurrentTime, calculate
 │       ├── MCP Catalog: callMcpTool, listMcpTools
 │       ├── A2A Catalog: delegateToAgent, listAgents
 │       ├── Memory Catalog: getMemory, setMemory, searchMemory
 │       ├── HITL Catalog: requestApproval, approveRequest, getApprovalStatus
 │       └── Guardrails Catalog: validateOutput
 ├── Human-in-the-Loop Approval Gate (hitl_gate)
 ├── Parallel Multi-Agent Fan-Out Sub-Flow (parallel_agent)
 ├── Self-Reflection & Critique Loop Sub-Flow (reflection_agent)
 ├── Planning & Task Decomposition Sub-Flow (plan_agent)
 ├── Sequential Chaining Pipeline Sub-Flow (chain_agent)
 └── Supervisor / Orchestrator-Worker Router (supervisor_agent)
```

---

## Canonical Agentic Design Patterns

| Pattern | Description | Workflow Sub-Flow | OpenAPI Catalog |
| :--- | :--- | :--- | :--- |
| **1. Autonomous Reasoning Loop** | Multi-turn tool execution loop with iteration limits | [`agent-loop.sw.yaml`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/src/main/resources/agent-loop.sw.yaml) | [`openai-compatible.yaml`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/src/main/resources/catalogs/openai-compatible.yaml) |
| **2. Dynamic Tool Execution** | Generic catalog tool router | [`tool-executor.sw.yaml`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/src/main/resources/tool-executor.sw.yaml) | [`utility-functions.yaml`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/src/main/resources/catalogs/utility-functions.yaml) |
| **3. Model Context Protocol (MCP)** | JSON-RPC/OpenAPI tool discovery & call | [`tool-executor.sw.yaml`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/src/main/resources/tool-executor.sw.yaml) | [`mcp-catalog.yaml`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/src/main/resources/catalogs/mcp-catalog.yaml) |
| **4. Agent-to-Agent (A2A)** | Peer & sub-agent delegation | [`tool-executor.sw.yaml`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/src/main/resources/tool-executor.sw.yaml) | [`a2a-catalog.yaml`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/src/main/resources/catalogs/a2a-catalog.yaml) |
| **5. Short & Long-Term Memory** | Context buffer, KV store & vector search | [`tool-executor.sw.yaml`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/src/main/resources/tool-executor.sw.yaml) | [`memory-catalog.yaml`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/src/main/resources/catalogs/memory-catalog.yaml) |
| **6. Human-in-the-Loop (HITL)** | Approval gating for sensitive actions | [`hitl-gate.sw.yaml`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/src/main/resources/hitl-gate.sw.yaml) | [`hitl-catalog.yaml`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/src/main/resources/catalogs/hitl-catalog.yaml) |
| **7. Output Guardrails** | Schema validation & output safety checks | [`reflection-agent.sw.yaml`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/src/main/resources/reflection-agent.sw.yaml) | [`guardrails-catalog.yaml`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/src/main/resources/catalogs/guardrails-catalog.yaml) |
| **8. Parallel Fan-Out / Fan-In** | Concurrent multi-agent execution | [`parallel-agent.sw.yaml`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/src/main/resources/parallel-agent.sw.yaml) | [`a2a-catalog.yaml`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/src/main/resources/catalogs/a2a-catalog.yaml) |
| **9. Self-Reflection & Critique** | Generation -> Critique -> Refinement | [`reflection-agent.sw.yaml`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/src/main/resources/reflection-agent.sw.yaml) | [`guardrails-catalog.yaml`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/src/main/resources/catalogs/guardrails-catalog.yaml) |
| **10. Planning & Decomposition** | Goal decomposition into task plans | [`plan-agent.sw.yaml`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/src/main/resources/plan-agent.sw.yaml) | [`planner-catalog.yaml`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/src/main/resources/catalogs/planner-catalog.yaml) |
| **11. Sequential Pipeline** | Step-by-step agent chaining | [`chain-agent.sw.yaml`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/src/main/resources/chain-agent.sw.yaml) | [`a2a-catalog.yaml`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/src/main/resources/catalogs/a2a-catalog.yaml) |
| **12. Supervisor / Worker Router** | Dynamic worker agent task routing | [`supervisor-agent.sw.yaml`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/src/main/resources/supervisor-agent.sw.yaml) | [`a2a-catalog.yaml`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/src/main/resources/catalogs/a2a-catalog.yaml) |
| **13. Multi-Provider Fallback** | Provider failover routing | [`agent-loop.sw.yaml`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/src/main/resources/agent-loop.sw.yaml) | [`fallback-catalog.yaml`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/src/main/resources/catalogs/fallback-catalog.yaml) |

---

## Core Components

* **Parent Workflow** ([`llm-tool-agent.sw.yaml`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/src/main/resources/llm-tool-agent.sw.yaml)): Serves as the public HTTP entry point delegating directly to `agent_loop`.
* **Agent Loop Sub-Flow** ([`agent-loop.sw.yaml`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/src/main/resources/agent-loop.sw.yaml)): Manages prompt assembly, LLM execution, generic message formatting, and iteration limits.
* **Tool Executor Sub-Flow** ([`tool-executor.sw.yaml`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/src/main/resources/tool-executor.sw.yaml)): Dedicated sub-flow routing execution across Utility, MCP, A2A, Memory, HITL, and Guardrails catalog functions.
* **Local REST Utility Service** ([`UtilityResource`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/src/main/java/org/acme/functions/UtilityResource.java)): JAX-RS endpoints providing local execution for all catalog operations.

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
      mcpCatalog: classpath:/catalogs/mcp-catalog.yaml
      a2aCatalog: classpath:/catalogs/a2a-catalog.yaml
      memoryCatalog: classpath:/catalogs/memory-catalog.yaml
      hitlCatalog: classpath:/catalogs/hitl-catalog.yaml
      guardrailsCatalog: classpath:/catalogs/guardrails-catalog.yaml
      fallbackCatalog: classpath:/catalogs/fallback-catalog.yaml
      plannerCatalog: classpath:/catalogs/planner-catalog.yaml
```

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

```bash
curl -X POST http://localhost:8080/llm_tool_agent \
  -H 'Content-Type: application/json' \
  -d '{
    "messages": [{"role": "user", "content": "Calculate 7 * 6 and reply with only the result."}],
    "temperature": 0,
    "max_tokens": 64
  }'
```

---

## Testing

Execute unit and integration tests:

```bash
mvn clean test
```

The test suite covers:
* [`UtilityResourceTest`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/src/test/java/org/acme/functions/UtilityResourceTest.java): Comprehensive unit tests (44 test runs) covering arithmetic operator precedence, negative/decimal numbers, whitespace handling, null/blank validation, multi-timezone resolution, MCP tool discovery/execution, A2A sub-agent delegation, Memory storage/retrieval/search, HITL approval requests/decisions, Output Guardrails JSON validation, Multi-Provider LLM Fallback chat completions, and Task Planning/Decomposition.
* [`AgentLoopSubflowTest`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/src/test/java/org/acme/functions/AgentLoopSubflowTest.java): End-to-end integration tests using [`OpenAiMockApiResource`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/src/test/java/org/acme/functions/OpenAiMockApiResource.java) supporting multi-turn tool call handling (`calculate`, `get_current_time`) and direct text completions.

---

## Kubernetes & OpenShift Deployment

Deployments target OpenShift Serverless Logic / Kubernetes using the SonataFlow GitOps profile. See [`deploy/README.md`](file:///C:/Users/Bassem/Code/open-workflow-with-agent/deploy/README.md) for manifest packaging, secrets, and deployment commands.
