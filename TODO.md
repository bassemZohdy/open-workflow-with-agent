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
- [x] **Step 12**: Update the utility unit test suite and verify a clean build.
- [x] **Step 13**: Update documentation & push to GitHub.
- [x] **Step 14**: Fix broken debug console script (`index.html` had literal `\n` escapes outside string literals, breaking the entire `<script>` block).
- [x] **Step 15**: Bound the calculator expression parser (`UtilityResource.calculate`) against unbounded recursion (`StackOverflowError`) and non-finite (`Infinity`/`NaN`) results.
- [x] **Step 16**: Fix the native Windows `mvn clean test` failure by aligning the workflow dependencies and copying catalog resources before Quarkus code generation.
- [x] **Step 17**: Stop `agent-loop.sw.yaml`'s `Inject Agent Defaults` state from unconditionally overwriting a caller-supplied `model` - default now applies only via `(.model // "default-model")` in the `Call LLM` action, so any request or LiteLLM alias can pick the model.
- [x] **Step 18**: Add optional `UTILITY_API_KEY` bearer-auth filter (`ApiKeyAuthFilter`) and optional `UTILITY_RATE_LIMIT_REQUESTS_PER_MINUTE` global rate limiter (`RateLimitFilter`) - both off by default, gating `/functions/*` and workflow endpoints while leaving `/q/*` management endpoints open.
- [x] **Step 19**: Bound `memoryStore`/`hitlRequests` in `UtilityResource` with a size-capped, TTL-evicting `BoundedCache` (10k entries, 1h TTL) instead of unbounded `ConcurrentHashMap`s.
- [x] **Step 20**: Add `.github/dependabot.yml` (maven/docker/github-actions/npm ecosystems) for ongoing dependency/CVE alerts.
- [x] **Step 21**: Add `.env.example`, `litellm-config.yaml`, and `ollama`/`ollama-pull`/`litellm` services to `docker-compose.yml` for a self-contained local LLM stack. Validated end-to-end (real completion returned through agent → LiteLLM (authenticated) → Ollama → workflow).
- [x] **Step 22**: Fix a pre-existing bug where the OpenAI-compatible client never actually sent its bearer token: `quarkus-openapi-generator`'s own auth wiring matches the OpenAPI operation's declared path against the fully-resolved request URI, which never holds once the base URL contributes a path segment (e.g. `/v1`) - so it silently never applied `OPENAI_API_KEY` to real providers. Replaced with `OpenAiBearerTokenFilter`, a small `ClientRequestFilter` registered via `quarkus.rest-client.openaiCatalog.providers`, with a regression test (`AgentLoopSubflowTest`) asserting the header is actually sent.
- [x] **Step 23**: Add `README.md`/`docs/13-docker-and-compose.md` disclaimers and a "Securing the endpoints" section covering `UTILITY_API_KEY`/`UTILITY_RATE_LIMIT_REQUESTS_PER_MINUTE`.
- [x] **Step 24**: Align Quarkus 3.27.2 with the SonataFlow/Kogito 10.2.0 BOM to prevent a runtime `ReflectiveClassBuildItem` linkage failure during Quarkus test startup.
- [x] **Step 25**: Add reusable boolean and constrained-choice decision subflows with strict response validation.
- [x] **Step 26**: Clean up test/build configuration, expand boundary and decision contract coverage, and add CI stages for tests, packaging, deployment validation, and container builds.
- [x] **Steps 27-47**: Complete the full hardening backlog (see section 4 below): HITL state-machine fix, calculator depth guard, catalog-contract alignment, orchestration-only documentation, loopback-bound compose stack with no default credentials, scoped LiteLLM virtual key, prod-profile auth/rate-limit defaults with fail-fast startup, workflow-native entry guardrails and clamps, memory size caps, log sanitization, pinned image tags, `onErrors` tool-error handling, untrusted tool-output boundary, resource split, dead catalog operations removed, `toolArgs` expression refactor, expanded unit/integration/E2E coverage, extended CI with Playwright + Trivy/gitleaks/OWASP scans, and the Maven wrapper.

---

## 4. Hardening & Bug Backlog

All backlog items from the full project review (security audit + code-quality pass) have been implemented. Summary of each fix and the files involved:

### Correctness Bugs

- [x] **Step 27**: Fix the HITL approval state machine — `HitlResource.requestApproval` now stores requests as `pending` (`approved: false`, `created_at`); `approveRequest` transitions to `approved`/`denied` (404 on unknown `request_id`, **fail-closed** default `approved=false`, records `approved_by` + `decided_at`, writes back to the store); `getApprovalStatus` reports the real record. The deny branch of `sub_flows/hitl-gate.sw.yaml` is now reachable, and `UtilityResourceTest` asserts the corrected behavior. (See also `docs/05-hitl-approval.md`.)
- [x] **Step 28**: Replace the `catch (StackOverflowError)` in the calculator with a pre-parse nesting-depth check (`CalculatorResource.rejectExcessiveNesting`, max 50 paren levels) — catching a `VirtualMachineError` and continuing is explicitly unreliable per the JLS. Covered by `UtilityResourceTest` (depth 50 accepted, depth 51 rejected).
- [x] **Step 29**: Align catalog contracts with implementation: `hitl-catalog.yaml` no longer requires `description` (the code defaults it); `fallback-catalog.yaml`'s `fallback_provider` is now consumed (mock failover via the `unavailable` sentinel); `guardrails-catalog.yaml`'s `expected_format` is now consumed (`json` requires parseable JSON); `memory-catalog.yaml`'s `top_k` is now consumed (clamped 1..10, default 3).
- [x] **Step 30**: Document that `parallel-agent`, `chain-agent`, `supervisor-agent`, and `reflection-agent` demonstrate orchestration only and never invoke the LLM (they call mock A2A endpoints) — README + `docs/07..11` now carry explicit "Orchestration-only demonstration" notes. (`plan_agent` and `agent_loop`/`llm_tool_agent` ARE LLM-driven.)

### Security & Deployment Defaults

- [x] **Step 31**: Bind all `docker-compose.yml` services to loopback (`127.0.0.1:8080:8080`, `127.0.0.1:5432:5432`, `127.0.0.1:6379:6379`, `127.0.0.1:11434:11434`, `127.0.0.1:4000:4000`).
- [x] **Step 32**: Drop `:-` fallback defaults for credentials in `docker-compose.yml`/`.env.example` — `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `LITELLM_MASTER_KEY`, `UTILITY_API_KEY` now use `${VAR:?}` and `docker compose up` fails fast when unset; Redis runs with `--requirepass` (and the app's `QUARKUS_REDIS_HOSTS` carries the password).
- [x] **Step 33**: Stop authenticating the app to LiteLLM with the master key — `litellm-keygen` (one-shot service) provisions a scoped virtual key (`models=[default-model]`, `max_budget=5.0`) via LiteLLM's `/key/generate` against the Postgres-backed `litellm_db` (see `postgres-init/`, `litellm-config.yaml`), writing it to a shared volume that `docker-entrypoint.sh` injects as `OPENAI_API_KEY`. The app never holds key-management/spend privileges.
- [x] **Step 34**: Enable `UTILITY_API_KEY` and `UTILITY_RATE_LIMIT_REQUESTS_PER_MINUTE` by default in the `%prod` Quarkus profile — `ProdSecurityDefaults` refuses to start prod without a key (fail-fast; the container image no longer ships fully open) and the default rate cap is 600 req/min; dev/test keep the opt-out behavior.
- [x] **Step 35**: Add server-side guardrails to the workflow entry — `llm-tool-agent.sw.yaml` validates messages (1..20 entries, content ≤ 8192 chars), restricts roles to `user`/`assistant` (no `role:"system"` injection), and enforces a model allowlist; `agent-loop.sw.yaml` clamps `max_tokens` ≤ 4096 and truncates history to the last 20 messages. The same validation is mirrored in `deploy/sonataflow.yaml`.
- [x] **Step 36**: Cap memory key/value sizes in `setMemory` (key ≤ 256 B, value ≤ 4 KB, HTTP 413) — `MemoryResource` bounds bytes on top of `BoundedCache`'s entry-count cap.
- [x] **Step 37**: Sanitize CR/LF in logged user/LLM-controlled strings and truncate prompt payloads (`LogSanitizer.safe` applied to every INFO log across all resources) — no more raw prompt persistence / `%0a` log injection.
- [x] **Step 38**: Pin mutable image tags in `docker-compose.yml`: `ollama/ollama:0.32.13`, `ghcr.io/berriai/litellm:v1.96.2`, `postgres:16.15-alpine`, `redis:7.4.10-alpine`, `curlimages/curl:8.21.0`.

### Robustness & Architecture

- [x] **Step 39**: Add `onErrors` error handling — `tool-executor.sw.yaml` converts catalog HTTP errors (codes `400`/`500`, surfaced as `WorkItemExecutionException` with the HTTP status as its code) into a structured `tool_result.error` at the point of failure; `agent-loop.sw.yaml` adds defense-in-depth `onErrors` (Handle Tool Error) and an `LLM Call Failed` terminal state. Verified by the tool-HTTP-error propagation test.
- [x] **Step 40**: Mark tool/memory output as untrusted at the tool→LLM boundary — `appendToolResult` wraps content in `<untrusted_tool_output>` markers and length-caps at 2000 chars; `McpResource`/`A2aResource` no longer echo raw arguments/prompts into loop-back content (OWASP LLM01/ASI06), with regression tests.
- [x] **Step 41**: Split the 376-line `UtilityResource` god-class into domain-scoped resources (`TimeResource`, `CalculatorResource`, `McpResource`, `A2aResource`, `MemoryResource`, `HitlResource`, `GuardrailsResource`, `FallbackResource`, `PlannerResource`) behind the shared `/functions` prefix, with shared `BoundedCache`/`LogSanitizer` helpers.
- [x] **Step 42**: Remove the dead catalog operations — `listMcpTools` (`mcp-catalog.yaml`) and `listAgents` (`a2a-catalog.yaml`) are no longer declared as workflow-callable catalog operations (the REST endpoints remain for the debug console/e2e suite).
- [x] **Step 43**: Factor the duplicated tool-argument extraction in `tool-executor.sw.yaml` — the 10× copy-pasted `fromjson-else identity` pipeline is now a single `toolArgs` expression function; each execute state runs it first into `.tool_args`.

### Test & CI Gaps

- [x] **Step 44**: Expand `AgentLoopSubflowTest` — time-tool path, multi-step tool-call sequence, iteration-limit guard, tool-HTTP-error propagation, entry-guardrail rejection, plus new subflow tests for `parallel_agent`/`chain_agent`/`supervisor_agent` (previously zero coverage). `OpenAiMockApiResource` supports the new scenarios.
- [x] **Step 45**: Add regression tests — HITL deny→status flow, calculator nesting-depth rejection, `Infinity`/`NaN` results, `BoundedCache` size-eviction + TTL expiry (`BoundedCacheTest`), memory oversize-value rejection (413), prompt-echo regressions, and an auth-filter path-bypass matrix (traversal/encoded/double-slash variants + workflow endpoints, all blocked).
- [x] **Step 46**: Extend CI (`.github/workflows/ci.yml`) — `timeout-minutes` on all jobs, a Playwright e2e job (auto-starts the packaged app via `webServer`), and a blocking security job (Trivy fs scan with SARIF upload, gitleaks, OWASP dependency-check at `failBuildOnCVSS=7`).
- [x] **Step 47**: Add the Maven wrapper (`mvnw` + `.mvn/wrapper/`) for reproducible contributor builds.

### Known Accepted Limitations (documented, not scheduled)

- `RateLimitFilter` is global, per-JVM, and best-effort under concurrent bursts (fixed-window CAS) — documented as a backstop; use a Redis-backed counter if clustered.
- `BoundedCache` TTL eviction is lazy (read-triggered); expired-but-unread entries linger until LRU eviction — acceptable for a mock store.
- `memory/search` is a mock that fabricates up to `top_k` matches (a single hardcoded "context" corpus); it does not perform real vector retrieval.
- The debug console (`index.html`) is ungated by design when `UTILITY_API_KEY` is set (static resources bypass JAX-RS); uses `textContent` only (no XSS found).
