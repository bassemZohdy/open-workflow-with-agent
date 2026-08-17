# OpenWorkflow Minimal Reference Implementation (LLM + Agent Calls)

This project provides a **minimal reference implementation** for **OpenWorkflow** workflows that integrate AI capabilities the way a workflow orchestrator should: by *calling services*, not *being the agent*. It uses **SonataFlow** as the runtime engine and offers exactly two building blocks:

1. **LLM catalog call** - a single OpenAI-compatible `/v1/chat/completions` function call (`llm_chat`).
2. **Generic agent call** - a black-box REST call to an external agent (`agent_call`), synchronously or asynchronously (fire + resume on a response CloudEvent).

> The scope is intentionally narrow: the agent itself - its internals, tools, MCP, A2A,
> memory, planning, multi-provider fallback - is **out of scope** and delegated to the
> service behind `AGENT_BASE_URL`. Every workflow function resolves to an OpenAPI catalog
> operation (no Java custom functions), so the workflow package (`*.sw.yaml` + `catalogs/`)
> is portable to any platform that runs Serverless Workflow YAML/JSON - see
> [`deploy/`](deploy/README.md).
> See "Securing the endpoints" below before exposing it beyond localhost.

---

## Feature Matrix

| Feature | Description | Workflow | Catalog |
| :--- | :--- | :--- | :--- |
| **LLM Catalog Call** | Single chat completion with in-workflow guardrails (message caps, role restrictions, model allowlist, `max_tokens` clamping) | [`llm-chat.sw.yaml`](workflows/llm-chat.sw.yaml) | [`openai-compatible.yaml`](workflows/catalogs/openai-compatible.yaml) |
| **Agent Call (Sync)** | Blocking REST call to a generic agent API; response stored as `agent_response` | [`agent-call.sw.yaml`](workflows/agent-call.sw.yaml) | [`agent-rest.yaml`](workflows/catalogs/agent-rest.yaml) |
| **Agent Call (Async)** | Fire-and-continue `callback` state; instance suspends and resumes on the agent's `agent_response` CloudEvent (correlated via `kogitoprocrefid`) | [`agent-call.sw.yaml`](workflows/agent-call.sw.yaml) | [`agent-rest.yaml`](workflows/catalogs/agent-rest.yaml) |
| **Decision Subflows** | Strict typed AI decisions (yes/no, or one value from an option list) | [`boolean-decision.sw.yaml`](workflows/sub_flows/boolean-decision.sw.yaml), [`choice-decision.sw.yaml`](workflows/sub_flows/choice-decision.sw.yaml) | [`openai-compatible.yaml`](workflows/catalogs/openai-compatible.yaml) |

---

## Architecture Overview

```text
llm_chat (public entry point)
 └── openaiCatalog#chatCompletions            <- OpenAI-compatible provider (OPENAI_BASE_URL)

agent_call (public entry point)
 ├── mode: sync  -> agentCatalog#agentSyncCall            (operation state, waits for HTTP)
 └── mode: async -> agentCatalog#agentAsyncCall           (callback state)
                      fire {callback_url, $WORKFLOW.instanceId, payload} -> agent answers 202
                      ... instance suspends ...
                      agent POSTs agent_response CloudEvent -> /agent/response-event
                      ... instance resumes, event data becomes .agent_response ...
```

The agent is a **black box**: the workflows only speak the two-operation contract in
[`agent-rest.yaml`](workflows/catalogs/agent-rest.yaml). This repo bundles a mock
implementation ([`AgentResource`](src/main/java/org/acme/functions/AgentResource.java)) so the
demos and tests are self-contained - point `AGENT_BASE_URL` at any real agent implementing
the same contract and nothing else changes.

---

## Repository Layout: Specs First, Runner Second

The **main deliverable is the OpenWorkflow spec package** - pure Serverless Workflow
YAML/JSON plus its OpenAPI catalogs, portable to any platform that runs the spec
(OpenShift Serverless Logic, plain SonataFlow, ...):

```text
workflows/                  <- THE deliverable: spec YAML/JSON + catalogs
  llm-chat.sw.yaml             public LLM catalog call
  agent-call.sw.yaml           public generic agent call (sync/async)
  sub_flows/                   reusable decision sub-flows
  catalogs/                    OpenAPI catalogs (workflow-uri-definitions)
src/main/java/              <- reference runner only: mock agent + endpoint glue
src/main/resources/         <- runner config (application.properties, console)
deploy/                     <- gitops packaging of the spec package
```

The Java sources are only the **reference runner** that executes the specs locally;
`deploy/` packages the same spec files for a YAML-only platform. Nothing in the
workflows references Java - every function resolves to a catalog operation.

One SonataFlow constraint shapes the layout: the Kogito codegen discovers workflow
definitions only under `src/main/resources/` (hardcoded in `AppPaths`, the Maven
`<resources>` model is not consulted). The runner therefore keeps a **generated
mirror** of the canonical package there - `deploy/sync-runner-resources.sh` copies
`workflows/` -> `src/main/resources/` byte-for-byte, and CI fails on drift
(`--check`). Edit specs only in `workflows/`, run the sync script, commit both.

`deploy/sonataflow.yaml` embeds `agent-call.sw.yaml` as `spec.flow` (required by the
SonataFlow CR); it is **regenerated** from the canonical file by
[`deploy/generate-sonataflow.sh`](deploy/generate-sonataflow.sh) - CI fails on drift.

---

## Core Components

* **LLM Chat Workflow** ([`llm-chat.sw.yaml`](workflows/llm-chat.sw.yaml)): public HTTP entry point enforcing server-side request guardrails (message count/length caps, `user`/`assistant`-only roles, model allowlist) around a single catalog LLM call.
* **Agent Call Workflow** ([`agent-call.sw.yaml`](workflows/agent-call.sw.yaml)): input validation, sync path (operation state), async path (callback state with `$WORKFLOW.instanceId` correlation), and structured error states for agent HTTP failures.
* **Decision Sub-Flows** ([`boolean-decision.sw.yaml`](workflows/sub_flows/boolean-decision.sw.yaml) and [`choice-decision.sw.yaml`](workflows/sub_flows/choice-decision.sw.yaml)): strict typed AI decisions returning yes/no or one value from a caller-provided option list.
* **Mock Agent** ([`AgentResource`](src/main/java/org/acme/functions/AgentResource.java)): reference implementation of the generic agent contract (`/agent/sync`, `/agent/async` + CloudEvent completion). Swap it for a real agent via `AGENT_BASE_URL`.

### Java source policy (workflow portability)

The Java sources are deliberately reduced to **platform glue and a callable mock tool** - none of them participate in workflow execution semantics:

| Class | Role | Needed on a YAML-only platform? |
| :--- | :--- | :--- |
| `AgentResource` | Bundled mock agent (a *tool the workflow calls*) | No - replaced by the real agent behind `AGENT_BASE_URL` |
| `ApiKeyAuthFilter`, `RateLimitFilter`, `ProdSecurityDefaults` | Optional endpoint security for the bundled Quarkus app | No - the platform provides its own authn/authz |
| `OpenAiBearerTokenFilter`, `AgentBearerTokenFilter` | Per-client bearer credentials for the bundled app's REST clients | No - the platform wires catalog credentials itself |
| `LogSanitizer` | Log-injection guard used by the mock agent | No |

All workflow logic - validation, routing, LLM calls, agent calls, async suspension/resumption,
error mapping - lives in the YAML and runs unchanged on any Serverless Workflow platform.

---

## OpenWorkflow Specification Extensions

### Catalog Functions (`workflow-uri-definitions`)

Standard OpenWorkflow specs are extended to support URI-based catalog imports. Catalogs declare external OpenAPI operations outside the workflow definition, avoiding hardcoded endpoint URLs inside states:

```yaml
extensions:
  - extensionid: workflow-uri-definitions
    definitions:
      openaiCatalog: classpath:/catalogs/openai-compatible.yaml
      agentCatalog: classpath:/catalogs/agent-rest.yaml
```

---

## Running Locally

### Prerequisites

* JDK 17+
* Apache Maven 3.9+

### Environment Setup

The application is provider-agnostic: the LLM is called through a generic OpenAI-compatible `/v1/chat/completions` endpoint, the agent through its generic REST API. Both are configured via environment variables:

```bash
export OPENAI_BASE_URL=http://localhost:4000/v1
export OPENAI_API_KEY=your-openai-key
# Optional - defaults to the bundled mock agent:
# export AGENT_BASE_URL=http://my-real-agent:8080
```

For a self-contained local stack (LiteLLM in front of Ollama, PostgreSQL) with no external account needed, use `docker compose` instead - see [`docs/13-docker-and-compose.md`](docs/13-docker-and-compose.md). Copy [`.env.example`](.env.example) to `.env` and fill in the **required** secrets (`POSTGRES_PASSWORD`, `OPENWORKFLOW_DB_PASSWORD`, `LITELLM_DB_PASSWORD`, `LITELLM_MASTER_KEY`, `UTILITY_API_KEY`) - compose fails fast if any is unset. The stack binds every port to `127.0.0.1`, pins all image tags, provisions dedicated non-superuser roles for the application and LiteLLM, and provisions a **scoped LiteLLM virtual key** (model allowlist + budget cap) for the application, so it never authenticates to the proxy with the master key.

#### Securing the endpoints

The async callback ingress (/agent/response-event) is a Reactive Messaging HTTP endpoint,
not a JAX-RS resource, so it is protected by a Vert.x HTTP filter as well as the normal
JAX-RS API-key filter. Callback URLs are limited to http/https, capped at 2,048 characters,
and rejected when they resolve to private, loopback, link-local, or reserved addresses
unless the destination is explicitly listed in AGENT_CALLBACK_ALLOWED_HOSTS. The bundled
local mock uses the localhost allowlist in dev/test; packaged deployments should set an
explicit callback allowlist only when an internal callback destination is intentional.

The debug console includes an optional API-key field stored in sessionStorage and sends it
on workflow and agent requests when supplied.

By default every endpoint (`/agent/*`, the workflow entry points, the debug console) is open - fine for local development, not for anything reachable beyond localhost. Two knobs:

| Variable | Effect when set |
| :--- | :--- |
| `UTILITY_API_KEY` | Requires `Authorization: Bearer <key>` on every request except `/q/*` management endpoints |
| `UTILITY_RATE_LIMIT_REQUESTS_PER_MINUTE` | Caps total request throughput (a global, not per-client, fixed 60s window) |

Both default to disabled in dev/test so the curl examples, debug console, and tests below keep working unchanged. In the **`%prod` profile** (what the container image and OpenShift Serverless Logic run) the defaults are flipped: `UTILITY_API_KEY` is **required** - the application refuses to start without it ([`ProdSecurityDefaults`](src/main/java/org/acme/functions/ProdSecurityDefaults.java)) - and a 600 req/min rate cap applies unless overridden. The `docker compose` stack enforces the same via required `.env` variables. Set both before exposing this service beyond your own machine.

### Start Quarkus Dev Mode

```bash
mvn clean quarkus:dev
```

### Invoke the Workflows

LLM chat completion:

```bash
curl -X POST http://localhost:8080/llm_chat \
  -H 'Content-Type: application/json' \
  -d '{
    "messages": [{"role": "user", "content": "Say hello in one short sentence."}],
    "temperature": 0,
    "max_tokens": 64
  }'
```

Agent call - synchronous:

```bash
curl -X POST http://localhost:8080/agent_call \
  -H 'Content-Type: application/json' \
  -d '{"mode": "sync", "agent_request": {"task": "Summarize the weather on Mars."}}'
```

Agent call - asynchronous (returns immediately while the instance is suspended; the agent's
response CloudEvent resumes it - see [`docs/02-agent-rest-call.md`](docs/02-agent-rest-call.md)):

```bash
curl -X POST http://localhost:8080/agent_call \
  -H 'Content-Type: application/json' \
  -d '{
    "mode": "async",
    "agent_request": {"task": "Summarize the weather on Mars."},
    "callback_url": "http://localhost:8080/agent/response-event"
  }'
```

---

## Testing

Execute unit and integration tests:

```bash
mvn clean test
```

The test suite covers:

* [`LlmChatWorkflowTest`](src/test/java/org/acme/functions/LlmChatWorkflowTest.java): end-to-end coverage of `llm_chat` using [`OpenAiMockApiResource`](src/test/java/org/acme/functions/OpenAiMockApiResource.java) - completion flow, bearer-token regression, entry-point guardrail rejection, and provider HTTP-error mapping.
* [`AgentCallTest`](src/test/java/org/acme/functions/AgentCallTest.java): sync/async `agent_call` coverage against the bundled mock agent - sync response flow, input validation, agent HTTP-error mapping, and the full async round-trip (fire -> suspension -> `agent_response` CloudEvent -> resume).
* [`DecisionSubflowContractTest`](src/test/java/org/acme/functions/DecisionSubflowContractTest.java): Contract coverage for strict boolean and constrained-choice subflow inputs, outputs, and invalid-answer handling.
* [`ApiKeyAuthFilterTest`](src/test/java/org/acme/functions/ApiKeyAuthFilterTest.java): Verifies the `UTILITY_API_KEY` gate behaves correctly when enabled, never blocks `/q/*` management endpoints, and blocks traversal/encoded/double-slash path variants.
* [`RateLimitFilterTest`](src/test/java/org/acme/functions/RateLimitFilterTest.java): Verifies the `UTILITY_RATE_LIMIT_REQUESTS_PER_MINUTE` gate behaves correctly when enabled and never blocks `/q/*` management endpoints.

CI runs the Maven suite, packages the application, validates the Kubernetes/OpenShift Kustomize package, builds the Docker image, runs the Playwright E2E suite, and blocks on Trivy/gitleaks/OWASP dependency-check security scans. Test reports are uploaded as workflow artifacts when available.

> The OWASP dependency-check job requires an `NVD_API_KEY` repository secret; without it the job can be rate-limited or fail.

---

## Feature Documentation & Infrastructure

Documentation and container infrastructure guides are available under [`docs/`](docs/README.md):

* [**Standalone Pattern Documentation Index**](docs/README.md)
* [**Docker Container Build & PostgreSQL / LiteLLM Stack Guide**](docs/13-docker-and-compose.md)
* [**Docker Compose Manifest**](docker-compose.yml)

---

## Kubernetes & OpenShift Deployment

Deployments target OpenShift Serverless Logic / Kubernetes using the SonataFlow GitOps profile. See [`deploy/README.md`](deploy/README.md) for manifest packaging, secrets, and deployment commands.
