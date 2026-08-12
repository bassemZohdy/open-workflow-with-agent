# OpenWorkflow Specification & Agentic Capabilities Roadmap

This document outlines the full feature matrix for extending the **OpenWorkflow specification** (formerly CNCF Serverless Workflow standard) to natively support all **Canonical Agentic Design Patterns**.

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
- [x] **Planning & Task Decomposition Catalog (`planner-catalog.yaml`)**: Goal decomposition into structured sub-task plans (`/functions/planner/decompose`).

### 2. Canonical Agentic Design Patterns (Sub-Flow Implementations)
- [x] **Pattern 1: Autonomous Reasoning Loop (`agent-loop.sw.yaml`)**: Bounded multi-turn LLM tool execution loop with safety guardrails.
- [x] **Pattern 2: Dynamic Tool Execution (`tool-executor.sw.yaml`)**: Generic OpenAPI catalog dispatching across Utilities, MCP, A2A, Memory, HITL, Guardrails.
- [x] **Pattern 3: Human-in-the-Loop Approval Gating (`hitl-gate.sw.yaml`)**: Pauses and gates sensitive tool executions pending human approval.
- [x] **Pattern 4: Parallel Multi-Agent Fan-Out (`parallel-agent.sw.yaml`)**: Concurrent multi-agent execution (Researcher + Coder + Reviewer) using `parallel` states.
- [x] **Pattern 5: Self-Reflection & Critique Loop (`reflection-agent.sw.yaml`)**: Recursive candidate generation, guardrail critique, and iterative self-refinement.
- [x] **Pattern 6: Planning & Task Decomposition (`plan-agent.sw.yaml`)**: High-level goal decomposition into ordered sub-task plans.
- [x] **Pattern 7: Sequential Chaining Pipeline (`chain-agent.sw.yaml`)**: Sequential multi-agent pipeline (Research -> Code -> Review).
- [x] **Pattern 8: Supervisor / Orchestrator-Worker (`supervisor-agent.sw.yaml`)**: Dynamic supervisor routing tasks to specialized worker sub-agents based on task payload.

### 3. Reusable Expressions & Generic Appenders
- [x] **Generic Tool Result Appender (`appendToolResult`)**: Single reusable expression function dynamically formatting tool results for any tool call (`name`, `tool_call_id`, `tool_result`).

---

## Implementation Status

- [x] **Step 1**: Implement Memory Catalog (`memory-catalog.yaml`) & REST endpoints (`/functions/memory/*`).
- [x] **Step 2**: Implement Human-in-the-Loop (HITL) Catalog (`hitl-catalog.yaml`) & REST endpoints (`/functions/hitl/*`).
- [x] **Step 3**: Implement Output Guardrails Catalog (`guardrails-catalog.yaml`) & REST endpoints (`/functions/guardrails/*`).
- [x] **Step 4**: Implement Multi-Provider Fallback Catalog (`fallback-catalog.yaml`) & REST endpoint (`/functions/fallback/*`).
- [x] **Step 5**: Implement Task Decomposition Catalog (`planner-catalog.yaml`) & REST endpoint (`/functions/planner/*`).
- [x] **Step 6**: Implement HITL Approval Gate Sub-Flow (`hitl-gate.sw.yaml`).
- [x] **Step 7**: Implement Parallel Multi-Agent Sub-Flow (`parallel-agent.sw.yaml`).
- [x] **Step 8**: Implement Self-Reflection & Critique Sub-Flow (`reflection-agent.sw.yaml`).
- [x] **Step 9**: Implement Planning Sub-Flow (`plan-agent.sw.yaml`).
- [x] **Step 10**: Implement Sequential Pipeline Sub-Flow (`chain-agent.sw.yaml`).
- [x] **Step 11**: Implement Supervisor Router Sub-Flow (`supervisor-agent.sw.yaml`).
- [x] **Step 12**: Update unit test suite (`UtilityResourceTest.java` - 44 test runs) and verify clean build.
- [x] **Step 13**: Update documentation & push to GitHub.
- [x] **Step 14**: Fix broken debug console script (`index.html` had literal `\n` escapes outside string literals, breaking the entire `<script>` block).
- [x] **Step 15**: Bound the calculator expression parser (`UtilityResource.calculate`) against unbounded recursion (`StackOverflowError`) and non-finite (`Infinity`/`NaN`) results.
- [x] **Step 16**: Fix native Windows `mvn clean test` failure - bumped Quarkus 3.8.4→3.15.1 and Kogito/SonataFlow 10.0.0→10.1.0 (fixes an upstream `URI.create()` crash on Windows paths) and added an explicit `maven-resources-plugin` execution before Quarkus codegen (the newer codegen needs catalog YAML already copied to `target/classes`). Verified with two clean native builds, 45/45 tests passing.
- [x] **Step 17**: Stop `agent-loop.sw.yaml`'s `Inject Agent Defaults` state from unconditionally overwriting a caller-supplied `model` - default now applies only via `(.model // "default-model")` in the `Call LLM` action, so any request or LiteLLM alias can pick the model.
- [x] **Step 18**: Add optional `UTILITY_API_KEY` bearer-auth filter (`ApiKeyAuthFilter`) and optional `UTILITY_RATE_LIMIT_REQUESTS_PER_MINUTE` global rate limiter (`RateLimitFilter`) - both off by default, gating `/functions/*` and workflow endpoints while leaving `/q/*` management endpoints open.
- [x] **Step 19**: Bound `memoryStore`/`hitlRequests` in `UtilityResource` with a size-capped, TTL-evicting `BoundedCache` (10k entries, 1h TTL) instead of unbounded `ConcurrentHashMap`s.
- [x] **Step 20**: Add `.github/dependabot.yml` (maven/docker/github-actions/npm ecosystems) for ongoing dependency/CVE alerts.
- [x] **Step 21**: Add `.env.example`, `litellm-config.yaml`, and `ollama`/`ollama-pull`/`litellm` services to `docker-compose.yml` for a self-contained local LLM stack. Validated end-to-end (real completion returned through agent → LiteLLM (authenticated) → Ollama → workflow).
- [x] **Step 22**: Fix a pre-existing bug where the OpenAI-compatible client never actually sent its bearer token: `quarkus-openapi-generator`'s own auth wiring matches the OpenAPI operation's declared path against the fully-resolved request URI, which never holds once the base URL contributes a path segment (e.g. `/v1`) - so it silently never applied `OPENAI_API_KEY` to real providers. Replaced with `OpenAiBearerTokenFilter`, a small `ClientRequestFilter` registered via `quarkus.rest-client.openaiCatalog.providers`, with a regression test (`AgentLoopSubflowTest`) asserting the header is actually sent.
- [x] **Step 23**: Add `README.md`/`docs/13-docker-and-compose.md` disclaimers and a "Securing the endpoints" section covering `UTILITY_API_KEY`/`UTILITY_RATE_LIMIT_REQUESTS_PER_MINUTE`.

---

## 4. Hardening & Bug Backlog

Everything identified in the last review pass is resolved (see Steps 16-23 above). Nothing open at the moment; re-populate this section as new gaps are found.
