# OpenWorkflow Technical Documentation Index

This directory contains documentation for the **orchestrator-only reference implementation**: workflows that call an LLM (catalog function) and an external agent (generic REST, sync and async). The agent itself - its internals, tools, MCP, A2A - is out of scope by design.

Reusable workflow definitions are organized under `workflows/sub_flows/`; the public
`llm_chat` and `agent_call` entry points live at the `workflows/` package root. The
whole package (`*.sw.yaml` + `catalogs/`) is the project's main deliverable - the
Java sources are only the reference runner that executes it (see the README's
"Repository Layout").

> **Scope note**: this implementation keeps only the two integration building blocks a
> workflow orchestrator needs - an OpenAI-compatible LLM catalog call, and a generic
> agent REST call (sync `operation` state + async `callback` state resumed by an
> `agent_response` CloudEvent). Everything about the agent's internals (tools, MCP, A2A,
> memory, planning, multi-provider fallback) is delegated to the agent service behind
> `AGENT_BASE_URL`.

> **YAML-only portability**: every workflow function resolves to an OpenAPI catalog
> operation - there are no Java custom functions - so the workflow package
> (`*.sw.yaml` + `catalogs/`) runs on any Serverless Workflow platform that consumes
> YAML/JSON definitions (see `deploy/`).

---

## Technical Documentation Modules

1. [**Pattern 1: LLM Catalog Call**](01-llm-catalog-call.md)
   * Single OpenAI-compatible chat completion through a catalog function, with guardrails living in the workflow (`llm-chat.sw.yaml`).

2. [**Pattern 2: Generic Agent Call (Sync & Async over REST)**](02-agent-rest-call.md)
   * Black-box agent invocation: blocking REST call, and the fire-and-resume async pattern using a `callback` state plus an `agent_response` CloudEvent correlated via `kogitoprocrefid` (`agent-call.sw.yaml`).

3. [**Infrastructure Integration: Docker, PostgreSQL & LiteLLM**](13-docker-and-compose.md)
   * Container image build (`Dockerfile`) and Docker Compose orchestration (`docker-compose.yml`) with PostgreSQL state persistence and a self-contained LiteLLM + Ollama LLM stack.

4. [**Playwright E2E Testing & Feature Recording**](14-playwright-e2e.md)
   * Automated Playwright E2E test runner, video recording (`video: 'on'`), trace zip artifacts, and UI preset assertions.

5. [**Reusable Decision Subflows**](15-decision-subflows.md)
   * Strict yes/no and constrained option-selection decisions with typed validation.
