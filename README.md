# Agentic OpenWorkflow Specification Reference Implementation

This project provides the **Reference Implementation** for extending the **OpenWorkflow specification** (formerly CNCF Serverless Workflow standard) to natively support **all Canonical Agentic AI Patterns**. It leverages **SonataFlow** as the concrete production runtime engine to validate, execute, and deliver these OpenWorkflow specification extensions.

> This is a reference implementation demonstrating the specification extensions - most catalog
> endpoints (MCP, A2A, memory, HITL, guardrails) are illustrative mocks, not production
> integrations, and the `parallel-agent`/`chain-agent`/`supervisor-agent`/`reflection-agent`
> sub-flows demonstrate orchestration only (they call mock A2A endpoints, never the LLM).
> See "Securing the endpoints" below before exposing it beyond localhost, and
> [`TODO.md`](TODO.md) for the tracked hardening backlog.

---

## Agentic Feature & Implementation Matrix

| Pattern / Feature Category | Description | Workflow Sub-Flow Implementation | OpenAPI Catalog Registry |
| :--- | :--- | :--- | :--- |
| **1. Autonomous Reasoning Loop** | Bounded multi-turn tool execution loop with iteration guardrails | [`agent-loop.sw.yaml`](src/main/resources/sub_flows/agent-loop.sw.yaml) | [`openai-compatible.yaml`](src/main/resources/catalogs/openai-compatible.yaml) |
| **2. Dynamic Tool Execution** | Generic OpenAPI catalog tool router | [`tool-executor.sw.yaml`](src/main/resources/sub_flows/tool-executor.sw.yaml) | [`utility-functions.yaml`](src/main/resources/catalogs/utility-functions.yaml) |
| **3. Model Context Protocol (MCP)** | Open protocol for JSON-RPC / OpenAPI tool discovery & call | [`tool-executor.sw.yaml`](src/main/resources/sub_flows/tool-executor.sw.yaml) | [`mcp-catalog.yaml`](src/main/resources/catalogs/mcp-catalog.yaml) |
| **4. Agent-to-Agent (A2A)** | Peer & sub-agent directory lookup and task delegation | [`tool-executor.sw.yaml`](src/main/resources/sub_flows/tool-executor.sw.yaml) | [`a2a-catalog.yaml`](src/main/resources/catalogs/a2a-catalog.yaml) |
| **5. Short & Long-Term Memory** | Context buffer storage, key-value retrieval & vector memory search | [`tool-executor.sw.yaml`](src/main/resources/sub_flows/tool-executor.sw.yaml) | [`memory-catalog.yaml`](src/main/resources/catalogs/memory-catalog.yaml) |
| **6. Human-in-the-Loop (HITL)** | Pausing workflow execution pending human approval for sensitive actions | [`hitl-gate.sw.yaml`](src/main/resources/sub_flows/hitl-gate.sw.yaml) | [`hitl-catalog.yaml`](src/main/resources/catalogs/hitl-catalog.yaml) |
| **7. Output Guardrails** | Structured JSON schema validation and response safety verification | [`reflection-agent.sw.yaml`](src/main/resources/sub_flows/reflection-agent.sw.yaml) | [`guardrails-catalog.yaml`](src/main/resources/catalogs/guardrails-catalog.yaml) |
| **8. Parallel Fan-Out / Fan-In** | Concurrent multi-agent task execution across sub-agents | [`parallel-agent.sw.yaml`](src/main/resources/sub_flows/parallel-agent.sw.yaml) | [`a2a-catalog.yaml`](src/main/resources/catalogs/a2a-catalog.yaml) |
| **9. Self-Reflection & Critique** | Recursive generation -> Critique -> Refinement self-improvement loop | [`reflection-agent.sw.yaml`](src/main/resources/sub_flows/reflection-agent.sw.yaml) | [`guardrails-catalog.yaml`](src/main/resources/catalogs/guardrails-catalog.yaml) |
| **10. Planning & Decomposition** | High-level goal decomposition into ordered sub-task plans | [`plan-agent.sw.yaml`](src/main/resources/sub_flows/plan-agent.sw.yaml) | [`planner-catalog.yaml`](src/main/resources/catalogs/planner-catalog.yaml) |
| **11. Sequential Pipeline** | Step-by-step multi-agent pipeline (Research -> Code -> Review) | [`chain-agent.sw.yaml`](src/main/resources/sub_flows/chain-agent.sw.yaml) | [`a2a-catalog.yaml`](src/main/resources/catalogs/a2a-catalog.yaml) |
| **12. Supervisor / Worker Router** | Dynamic supervisor routing tasks to specialized worker sub-agents | [`supervisor-agent.sw.yaml`](src/main/resources/sub_flows/supervisor-agent.sw.yaml) | [`a2a-catalog.yaml`](src/main/resources/catalogs/a2a-catalog.yaml) |
| **13. Multi-Provider Fallback** | Provider failover routing across primary and backup LLM services | [`agent-loop.sw.yaml`](src/main/resources/sub_flows/agent-loop.sw.yaml) | [`fallback-catalog.yaml`](src/main/resources/catalogs/fallback-catalog.yaml) |
| **14. Generic Message Appender** | Universal formatting of tool outputs into prompt state history | Expression (`appendToolResult`) | N/A |

---

## Architecture Overview

```text
OpenWorkflow Entry Point (llm_tool_agent)
 ├── [server-side guardrails: model allowlist, message caps, role restrictions]
 ├── Reusable Reasoning Sub-Flow (agent_loop)
 │   ├── OpenAI Catalog: openaiChatCompletion
 │   ├── Generic Appender: appendToolResult (untrusted-delimited, length-capped)
 │   ├── Tool Executor Sub-Flow (tool_executor) - onErrors: 400/500 -> structured tool_result.error
 │   │   ├── Utility Catalog: getCurrentTime, calculate
 │   │   ├── MCP Catalog: callMcpTool
 │   │   ├── A2A Catalog: delegateToAgent
 │   │   ├── Memory Catalog: getMemory, setMemory, searchMemory
 │   │   ├── HITL Catalog: requestApproval, approveRequest, getApprovalStatus
 │   │   └── Guardrails Catalog: validateOutput
 ├── Human-in-the-Loop Approval Gate (hitl_gate)
 ├── Parallel Multi-Agent Fan-Out Sub-Flow (parallel_agent) [orchestration-only]
 ├── Self-Reflection & Critique Loop Sub-Flow (reflection_agent) [orchestration-only]
 ├── Planning & Task Decomposition Sub-Flow (plan_agent)
 ├── Sequential Chaining Pipeline Sub-Flow (chain_agent) [orchestration-only]
 └── Supervisor / Orchestrator-Worker Router (supervisor_agent) [orchestration-only]
```

---

## Core Components

* **Parent Workflow** ([`llm-tool-agent.sw.yaml`](src/main/resources/llm-tool-agent.sw.yaml)): Serves as the public HTTP entry point, enforcing server-side request guardrails in the workflow itself (message count/length caps, `user`/`assistant`-only roles, and a model allowlist) before delegating to `agent_loop`.
* **Agent Loop Sub-Flow** ([`agent-loop.sw.yaml`](src/main/resources/sub_flows/agent-loop.sw.yaml)): Manages prompt assembly, LLM execution (with `max_tokens` clamping and history truncation), generic message formatting, tool-error handling via `onErrors`, and iteration limits.
* **Tool Executor Sub-Flow** ([`tool-executor.sw.yaml`](src/main/resources/sub_flows/tool-executor.sw.yaml)): Dedicated sub-flow routing execution across Utility, MCP, A2A, Memory, HITL, and Guardrails catalog functions; converts catalog HTTP errors into structured `tool_result.error`s.
* **Decision Sub-Flows** ([`boolean-decision.sw.yaml`](src/main/resources/sub_flows/boolean-decision.sw.yaml) and [`choice-decision.sw.yaml`](src/main/resources/sub_flows/choice-decision.sw.yaml)): Strict typed AI decisions returning either yes/no or one value from a caller-provided option list.
* **Local REST Utility Services** ([`TimeResource`](src/main/java/org/acme/functions/TimeResource.java), [`CalculatorResource`](src/main/java/org/acme/functions/CalculatorResource.java), [`McpResource`](src/main/java/org/acme/functions/McpResource.java), [`A2aResource`](src/main/java/org/acme/functions/A2aResource.java), [`MemoryResource`](src/main/java/org/acme/functions/MemoryResource.java), [`HitlResource`](src/main/java/org/acme/functions/HitlResource.java), [`GuardrailsResource`](src/main/java/org/acme/functions/GuardrailsResource.java), [`FallbackResource`](src/main/java/org/acme/functions/FallbackResource.java), [`PlannerResource`](src/main/java/org/acme/functions/PlannerResource.java)): Domain-scoped JAX-RS resources providing local execution for all catalog operations.

---

## OpenWorkflow Specification Extensions

### Catalog Functions (`workflow-uri-definitions`)
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
The application is fully provider-agnostic: it only ever calls a generic OpenAI-compatible
`/v1/chat/completions` endpoint, configured via two environment variables. Point them at any
OpenAI-compatible endpoint (LiteLLM, Ollama, vLLM, a hosted API, etc.):

```bash
export OPENAI_BASE_URL=http://localhost:4000/v1
export OPENAI_API_KEY=your-openai-key
```

For a self-contained local stack (LiteLLM in front of Ollama, PostgreSQL, Redis) with no
external account needed, use `docker compose` instead - see
[`docs/13-docker-and-compose.md`](docs/13-docker-and-compose.md). Copy
[`.env.example`](.env.example) to `.env` and fill in the **required** secrets
(`POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `LITELLM_MASTER_KEY`, `UTILITY_API_KEY`) - compose fails
fast if any is unset. The stack binds every port to `127.0.0.1`, pins all image tags, runs Redis
with `--requirepass`, and provisions a **scoped LiteLLM virtual key** (model allowlist + budget
cap) for the application, so it never authenticates to the proxy with the master key.

#### Securing the endpoints
By default every endpoint (`/functions/*`, the workflow entry points, the debug console) is
open - fine for local development, not for anything reachable beyond localhost. Two knobs:

| Variable | Effect when set |
| :--- | :--- |
| `UTILITY_API_KEY` | Requires `Authorization: Bearer <key>` on every request except `/q/*` management endpoints |
| `UTILITY_RATE_LIMIT_REQUESTS_PER_MINUTE` | Caps total request throughput (a global, not per-client, fixed 60s window) |

Both default to disabled in dev/test so the curl examples, debug console, and tests below keep
working unchanged. In the **`%prod` profile** (what the container image and OpenShift Serverless
Logic run) the defaults are flipped: `UTILITY_API_KEY` is **required** - the application refuses
to start without it ([`ProdSecurityDefaults`](src/main/java/org/acme/functions/ProdSecurityDefaults.java))
- and a 600 req/min rate cap applies unless overridden. The `docker compose` stack enforces the
same via required `.env` variables. Set both before exposing this service beyond your own machine.

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
* [`UtilityResourceTest`](src/test/java/org/acme/functions/UtilityResourceTest.java): Comprehensive unit tests covering arithmetic (including nesting-depth rejection and non-finite results), timezone handling, MCP, A2A, memory (incl. oversized key/value 413s and `top_k` clamping), HITL (pending->approved/denied state machine, 404 on unknown ids, fail-closed default), guardrails (`expected_format`), fallback (incl. failover), planning, and prompt-injection echo regression checks.
* [`BoundedCacheTest`](src/test/java/org/acme/functions/BoundedCacheTest.java): Size-cap LRU eviction and TTL expiry coverage.
* [`DecisionSubflowContractTest`](src/test/java/org/acme/functions/DecisionSubflowContractTest.java): Contract coverage for strict boolean and constrained-choice subflow inputs, outputs, and invalid-answer handling.
* [`AgentLoopSubflowTest`](src/test/java/org/acme/functions/AgentLoopSubflowTest.java): End-to-end integration tests using [`OpenAiMockApiResource`](src/test/java/org/acme/functions/OpenAiMockApiResource.java) covering the calculator, time tool, multi-step tool sequences, the iteration-limit guard, tool-HTTP-error propagation (errors fed back to the LLM as tool results), entry-point guardrail rejection, bearer-token regression, and the `parallel_agent`/`chain_agent`/`supervisor_agent` orchestration sub-flows.
* [`ApiKeyAuthFilterTest`](src/test/java/org/acme/functions/ApiKeyAuthFilterTest.java) & [`RateLimitFilterTest`](src/test/java/org/acme/functions/RateLimitFilterTest.java): Verify the `UTILITY_API_KEY` and `UTILITY_RATE_LIMIT_REQUESTS_PER_MINUTE` gates behave correctly when enabled, never block `/q/*` management endpoints, and block traversal/encoded/double-slash path variants.

CI runs the Maven suite, packages the application, validates the Kubernetes/OpenShift Kustomize package, builds the Docker image, runs the Playwright E2E suite, and blocks on Trivy/gitleaks/OWASP dependency-check security scans. Test reports are uploaded as workflow artifacts when available.

---

## Feature Documentation & Infrastructure

Detailed standalone technical guides for each Agentic pattern and container infrastructure are available under [`docs/`](docs/README.md):

* [**Standalone Pattern Documentation Index**](docs/README.md)
* [**Docker Container Build & PostgreSQL / Redis Stack Guide**](docs/13-docker-and-compose.md)
* [**Docker Compose Manifest**](docker-compose.yml)

---

## Kubernetes & OpenShift Deployment

Deployments target OpenShift Serverless Logic / Kubernetes using the SonataFlow GitOps profile. See [`deploy/README.md`](deploy/README.md) for manifest packaging, secrets, and deployment commands.
