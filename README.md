# Agentic OpenWorkflow Minimal Reference Implementation

This project provides a **minimal reference implementation** for an **OpenWorkflow** agent loop that delegates tool execution to local tools exposed through APIs and the Model Context Protocol (MCP). It uses **SonataFlow** as the runtime engine and a generic OpenAI-compatible `/v1/chat/completions` endpoint as the LLM back end.

> The scope is intentionally narrow: the only Java-implemented tools are the utility tools
> (`time`, `calculator`) and the MCP tool dispatcher. Higher-order agentic patterns
> (A2A delegation, memory, HITL, guardrails, planning, multi-provider fallback, orchestration
> sub-flows) have been removed so the codebase focuses on the core workflow-driven agent loop.
> See "Securing the endpoints" below before exposing it beyond localhost.

---

## Feature Matrix

| Feature | Description | Workflow | Catalog |
| :--- | :--- | :--- | :--- |
| **Autonomous Reasoning Loop** | Bounded multi-turn tool execution loop with iteration guardrails | [`agent-loop.sw.yaml`](src/main/resources/sub_flows/agent-loop.sw.yaml) | [`openai-compatible.yaml`](src/main/resources/catalogs/openai-compatible.yaml) |
| **Dynamic Tool Execution** | Generic OpenAPI catalog tool router | [`tool-executor.sw.yaml`](src/main/resources/sub_flows/tool-executor.sw.yaml) | [`utility-functions.yaml`](src/main/resources/catalogs/utility-functions.yaml) |
| **Model Context Protocol (MCP)** | MCP tool discovery and call dispatch | [`tool-executor.sw.yaml`](src/main/resources/sub_flows/tool-executor.sw.yaml) | [`mcp-catalog.yaml`](src/main/resources/catalogs/mcp-catalog.yaml) |
| **Generic Message Appender** | Universal formatting of tool outputs into prompt state history | Expression (`appendToolResult`) | N/A |

---

## Architecture Overview

```text
OpenWorkflow Entry Point (llm_tool_agent)
 ├── [server-side guardrails: model allowlist, message caps, role restrictions]
 ├── Reusable Reasoning Sub-Flow (agent_loop)
 │   ├── OpenAI Catalog: openaiChatCompletion
 │   ├── Generic Appender: appendToolResult (untrusted-delimited, length-capped)
 │   └── Tool Executor Sub-Flow (tool_executor) - onErrors: 400/500 -> structured tool_result.error
 │       ├── Utility Catalog: getCurrentTime, calculate
 │       └── MCP Catalog: callMcpTool
 └── Reusable Decision Sub-Flows (boolean_decision, choice_decision)
```

---

## Core Components

* **Parent Workflow** ([`llm-tool-agent.sw.yaml`](src/main/resources/llm-tool-agent.sw.yaml)): Public HTTP entry point, enforcing server-side request guardrails (message count/length caps, `user`/`assistant`-only roles, and a model allowlist) before delegating to `agent_loop`.
* **Agent Loop Sub-Flow** ([`agent-loop.sw.yaml`](src/main/resources/sub_flows/agent-loop.sw.yaml)): Prompt assembly, LLM execution (with `max_tokens` clamping and history truncation), generic message formatting, tool-error handling via `onErrors`, and iteration limits.
* **Tool Executor Sub-Flow** ([`tool-executor.sw.yaml`](src/main/resources/sub_flows/tool-executor.sw.yaml)): Routes tool calls to the local utility and MCP catalogs; converts HTTP errors into structured `tool_result.error`s.
* **Decision Sub-Flows** ([`boolean-decision.sw.yaml`](src/main/resources/sub_flows/boolean-decision.sw.yaml) and [`choice-decision.sw.yaml`](src/main/resources/sub_flows/choice-decision.sw.yaml)): Strict typed AI decisions returning yes/no or one value from a caller-provided option list.
* **Local REST Tool Services** ([`TimeResource`](src/main/java/org/acme/functions/TimeResource.java), [`CalculatorResource`](src/main/java/org/acme/functions/CalculatorResource.java), [`McpResource`](src/main/java/org/acme/functions/McpResource.java)): Java-implemented tools exposed through `/functions/*` and consumable via APIs or MCP.

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
```

---

## Running Locally

### Prerequisites
* JDK 17+
* Apache Maven 3.9+

### Environment Setup
The application is fully provider-agnostic: it only ever calls a generic OpenAI-compatible `/v1/chat/completions` endpoint, configured via two environment variables. Point them at any OpenAI-compatible endpoint (LiteLLM, Ollama, vLLM, a hosted API, etc.):

```bash
export OPENAI_BASE_URL=http://localhost:4000/v1
export OPENAI_API_KEY=your-openai-key
```

For a self-contained local stack (LiteLLM in front of Ollama, PostgreSQL, Redis) with no external account needed, use `docker compose` instead - see [`docs/13-docker-and-compose.md`](docs/13-docker-and-compose.md). Copy [`.env.example`](.env.example) to `.env` and fill in the **required** secrets (`POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `LITELLM_MASTER_KEY`, `UTILITY_API_KEY`) - compose fails fast if any is unset. The stack binds every port to `127.0.0.1`, pins all image tags, runs Redis with `--requirepass`, and provisions a **scoped LiteLLM virtual key** (model allowlist + budget cap) for the application, so it never authenticates to the proxy with the master key.

#### Securing the endpoints
By default every endpoint (`/functions/*`, the workflow entry points, the debug console) is open - fine for local development, not for anything reachable beyond localhost. Two knobs:

| Variable | Effect when set |
| :--- | :--- |
| `UTILITY_API_KEY` | Requires `Authorization: Bearer <key>` on every request except `/q/*` management endpoints |
| `UTILITY_RATE_LIMIT_REQUESTS_PER_MINUTE` | Caps total request throughput (a global, not per-client, fixed 60s window) |

Both default to disabled in dev/test so the curl examples, debug console, and tests below keep working unchanged. In the **`%prod` profile** (what the container image and OpenShift Serverless Logic run) the defaults are flipped: `UTILITY_API_KEY` is **required** - the application refuses to start without it ([`ProdSecurityDefaults`](src/main/java/org/acme/functions/ProdSecurityDefaults.java)) - and a 600 req/min rate cap applies unless overridden. The `docker compose` stack enforces the same via required `.env` variables. Set both before exposing this service beyond your own machine.

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
* [`UtilityResourceTest`](src/test/java/org/acme/functions/UtilityResourceTest.java): Unit tests for arithmetic (including nesting-depth rejection and non-finite results), timezone handling, MCP tool dispatch, and prompt-injection echo regression checks.
* [`DecisionSubflowContractTest`](src/test/java/org/acme/functions/DecisionSubflowContractTest.java): Contract coverage for strict boolean and constrained-choice subflow inputs, outputs, and invalid-answer handling.
* [`AgentLoopSubflowTest`](src/test/java/org/acme/functions/AgentLoopSubflowTest.java): End-to-end integration tests using [`OpenAiMockApiResource`](src/test/java/org/acme/functions/OpenAiMockApiResource.java) covering the calculator, time tool, multi-step tool sequences, the iteration-limit guard, tool-HTTP-error propagation (errors fed back to the LLM as tool results), entry-point guardrail rejection, and bearer-token regression.
* [`ApiKeyAuthFilterTest`](src/test/java/org/acme/functions/ApiKeyAuthFilterTest.java): Verifies the `UTILITY_API_KEY` gate behaves correctly when enabled, never blocks `/q/*` management endpoints, and blocks traversal/encoded/double-slash path variants.
* [`RateLimitFilterTest`](src/test/java/org/acme/functions/RateLimitFilterTest.java): Verifies the `UTILITY_RATE_LIMIT_REQUESTS_PER_MINUTE` gate behaves correctly when enabled and never blocks `/q/*` management endpoints.

CI runs the Maven suite, packages the application, validates the Kubernetes/OpenShift Kustomize package, builds the Docker image, runs the Playwright E2E suite, and blocks on Trivy/gitleaks/OWASP dependency-check security scans. Test reports are uploaded as workflow artifacts when available.

> The OWASP dependency-check job requires an `NVD_API_KEY` repository secret; without it the job can be rate-limited or fail.

---

## Feature Documentation & Infrastructure

Documentation and container infrastructure guides are available under [`docs/`](docs/README.md):

* [**Standalone Pattern Documentation Index**](docs/README.md)
* [**Docker Container Build & PostgreSQL / Redis Stack Guide**](docs/13-docker-and-compose.md)
* [**Docker Compose Manifest**](docker-compose.yml)

---

## Kubernetes & OpenShift Deployment

Deployments target OpenShift Serverless Logic / Kubernetes using the SonataFlow GitOps profile. See [`deploy/README.md`](deploy/README.md) for manifest packaging, secrets, and deployment commands.
