# OpenWorkflow Specification & Agentic Capabilities Roadmap

This document outlines the full feature matrix for extending the **OpenWorkflow specification** (CNCF Serverless Workflow standard) to natively support **Agentic AI capabilities**.

---

## Specification & Feature Matrix

### 1. Reusable Catalog Function Registries
- [x] **OpenAI-Compatible Catalog (`openai-compatible.yaml`)**: Standardized chat completions and embeddings endpoints.
- [x] **Domain Utility Catalog (`utility-functions.yaml`)**: Local/remote tool operations (`/functions/time`, `/functions/calculator`).
- [x] **Model Context Protocol (MCP) Catalog (`mcp-catalog.yaml`)**: Standardized MCP tool discovery (`/functions/mcp/tools`) and execution (`/functions/mcp/call`).
- [x] **Agent-to-Agent (A2A) Catalog (`a2a-catalog.yaml`)**: Sub-agent directory lookup (`/functions/a2a/agents`) and task delegation (`/functions/a2a/delegate`).
- [x] **Agent Memory Catalog (`memory-catalog.yaml`)**: Context storage, key-value memory retrieval, and vector memory operations (`/functions/memory/get`, `/functions/memory/set`, `/functions/memory/search`).
- [x] **Human-in-the-Loop (HITL) Catalog (`hitl-catalog.yaml`)**: Human approval gates and review requests for critical actions (`/functions/hitl/request`, `/functions/hitl/approve`, `/functions/hitl/status`).
- [x] **Output Guardrails Catalog (`guardrails-catalog.yaml`)**: JSON Schema validation and output safety checks (`/functions/guardrails/validate`).
- [x] **Multi-Provider Fallback Catalog (`fallback-catalog.yaml`)**: Provider failover routing and fallback chat completions (`/functions/fallback/chatCompletions`).

### 2. Sub-Flow Reasoning Loops & Patterns
- [x] **Reusable Agent Reasoning Sub-Flow (`agent-loop.sw.yaml`)**: Encapsulates multi-turn LLM reasoning loops, iteration guardrails, and message state updates.
- [x] **Modular Tool Executor Sub-Flow (`tool-executor.sw.yaml`)**: Decouples catalog tool dispatching (Utilities, MCP, A2A, Memory, HITL, Guardrails).
- [x] **Human-in-the-Loop Approval Gate Sub-Flow (`hitl-gate.sw.yaml`)**: Pauses and gates sensitive tool executions pending human approval.
- [x] **Parallel Multi-Agent Fan-Out Sub-Flow (`parallel-agent.sw.yaml`)**: Executes concurrent multi-agent tasks (Researcher + Coder + Reviewer) in parallel and aggregates results.
- [x] **Self-Reflection & Critique Loop Sub-Flow (`reflection-agent.sw.yaml`)**: Recursive candidate generation, guardrail validation critique, and iterative self-refinement.

### 3. Reusable Expressions & Generic Appenders
- [x] **Generic Tool Result Appender (`appendToolResult`)**: Single reusable expression function dynamically formatting tool results for any tool call (`name`, `tool_call_id`, `tool_result`).

---

## Implementation Status

- [x] **Step 1**: Implement Memory Catalog (`memory-catalog.yaml`) & REST endpoints (`/functions/memory/*`).
- [x] **Step 2**: Implement Human-in-the-Loop (HITL) Catalog (`hitl-catalog.yaml`) & REST endpoints (`/functions/hitl/*`).
- [x] **Step 3**: Implement Output Guardrails Catalog (`guardrails-catalog.yaml`) & REST endpoints (`/functions/guardrails/*`).
- [x] **Step 4**: Implement Multi-Provider Fallback Catalog (`fallback-catalog.yaml`) & REST endpoint (`/functions/fallback/*`).
- [x] **Step 5**: Implement HITL Approval Gate Sub-Flow (`hitl-gate.sw.yaml`).
- [x] **Step 6**: Implement Parallel Multi-Agent Sub-Flow (`parallel-agent.sw.yaml`).
- [x] **Step 7**: Implement Self-Reflection & Critique Sub-Flow (`reflection-agent.sw.yaml`).
- [x] **Step 8**: Update `tool-executor.sw.yaml` & `agent-loop.sw.yaml` for generic catalog tool routing.
- [x] **Step 9**: Update unit test suite (`UtilityResourceTest.java` - 42 test runs) and verify clean build.
- [x] **Step 10**: Update documentation & push to GitHub.
