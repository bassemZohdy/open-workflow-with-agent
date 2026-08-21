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

### Studio design notes

1. [**Studio use cases and information architecture**](studio/01-use-cases-and-information-architecture.md)
   * Personas, core journeys, navigation, non-happy-path states, and MVP success measures for the browser-based Studio.

2. [**Studio frontend and build architecture DAR**](studio/02-frontend-and-build-architecture-dar.md)
   * Formal comparison of the static console, React/Vite, and Vue/Vite approaches, with editor, graph, Maven, development, browser, and dependency decisions.

3. [**Studio version-aware document model**](studio/03-version-aware-document-model.md)
   * Canonical workflow/catalog inventory, lossless CST and typed projections, preservation rules, diagnostics, compatibility modes, identities, and golden fixtures.

4. [**Studio workspace API and persistence**](studio/04-workspace-api-and-persistence.md)
   * Versioned CRUD/validation API, ETags and conflict recovery, atomic saves, recoverable trash, generated-artifact synchronization, and naming limits. The published contract is [`openapi/studio-api.yaml`](studio/openapi/studio-api.yaml).

5. [**Studio UX and visual foundations**](studio/05-ux-and-visual-foundations.md)
   * Shared shell and page layouts, semantic visual tokens, Light/Dark/High Contrast behavior, keyboard interaction, WCAG 2.2 AA gates, and desktop/tablet/read-only layouts.

6. [**Studio 0.8 runtime capability profile**](studio/06-runtime-capability-profile.md)
   * Advanced state authoring coverage and the boundary between schema validity, runtime compatibility, and execution verification.

The first frontend scaffold lives in [`frontend/studio/`](../frontend/studio/README.md). It
is packaged into the Quarkus application under `/studio/` while the existing execution
console remains at `/`. The workspace explorer uses the first implemented slice of
`GET /api/studio/v1/documents` and never lists generated runner resources. The STUDIO-103
document view reads canonical source through `GET /api/studio/v1/documents/{kind}/{documentId}`
and exposes source-preserving metadata and generic extension details. STUDIO-202 adds the
editable source lifecycle: repository-derived templates, import/duplicate/rename/save/export/
delete actions, per-document recoverable drafts, dirty-navigation guards, live draft validation,
save previews, and ETag conflict recovery. Autosave is intentionally disabled.
STUDIO-203 adds the source-preserving workflow metadata form for identity, versions, expression
language, declared start states, keep-active behavior, timeouts, constants, annotations, and
extensions; required values and missing start-state references are guarded before save. The form
also classifies preserved unsupported fields and provides version-specific inline examples.
STUDIO-104 adds the workflow graph projection, including branch semantics, source links,
reachability warnings, a text-accessible outline, and source-preserving direct transition
editing with a Form handoff for transition details. STUDIO-105 adds local OpenAPI
catalog operations and schema views, operation backlinks, subflow contract details, and
inbound/outbound dependency navigation. STUDIO-106 adds deterministic local syntax, workflow
0.8 profile, and OpenAPI 3.x profile diagnostics with source ranges and the filterable issue
panel; browsing never fetches remote schemas. STUDIO-201 adds a guarded workspace mutation API
with canonical-root path checks, atomic ETag-protected writes, recoverable trash, dependency
impact checks, stale-generation status, and metadata-only audit events.

### Existing reference implementation

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
