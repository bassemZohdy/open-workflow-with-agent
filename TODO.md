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

---

## 4. Hardening & Bug Backlog

Re-populated from the full project review (security audit + code-quality pass) and reconciled with Steps 24-26. Prioritized: fix in top-down order.

### Correctness Bugs (fix first)

- [ ] **Step 27**: Fix the HITL approval state machine — `requestApproval` stores requests pre-approved (`status: "approved"`, `UtilityResource.java:196`) and `approveRequest` never writes back to `hitlRequests`, so a deny decision is a no-op and `GET /hitl/status` always reports the original status; the workflow's deny branch in `sub_flows/hitl-gate.sw.yaml` is unreachable. Store requests as `pending`, make `approve` transition state (404 on unknown `request_id`, default `approved=false`, record approver + timestamp), and fix `UtilityResourceTest.java:206` which currently asserts the buggy behavior (`"approved"` after a deny).
- [ ] **Step 28**: Replace the `catch (StackOverflowError)` in `UtilityResource.calculate` (`UtilityResource.java:60-61`) with a pre-parse nesting-depth check (reject unmatched/total paren depth > ~50). Catching a `VirtualMachineError` and continuing is explicitly unreliable per the JLS — the JVM makes no guarantee the thread is in a recoverable state.
- [ ] **Step 29**: Align catalog contracts with implementation: `hitl-catalog.yaml` declares `description` as required but the code defaults it; `fallback-catalog.yaml` advertises `fallback_provider` and `guardrails-catalog.yaml` advertises `expected_format` — neither is consumed by `UtilityResource`. Remove the unused params from the catalogs or implement them.
- [ ] **Step 30**: Document that Patterns 8-12 (`parallel-agent`, `chain-agent`, `supervisor-agent`, `reflection-agent`) demonstrate orchestration only and never invoke the LLM (they call mock A2A endpoints) — clarify in README/docs so readers don't assume LLM-driven behavior.

### Security & Deployment Defaults

- [ ] **Step 31**: Bind all `docker-compose.yml` services to loopback (`127.0.0.1:8080:8080`, `127.0.0.1:5432:5432`, `127.0.0.1:6379:6379`, `127.0.0.1:11434:11434`, `127.0.0.1:4000:4000`) — as shipped, `docker compose up` exposes unauthenticated Redis/Ollama, default-password Postgres, and LiteLLM to the whole LAN.
- [ ] **Step 32**: Drop the `:-` fallback defaults for credentials in `docker-compose.yml`/`.env.example` (fail if unset instead of silently using `sk-litellm-local-dev` / `openworkflow_secret`), and add `--requirepass` to Redis.
- [ ] **Step 33**: Stop authenticating the app to LiteLLM with the master key (`OPENAI_API_KEY == LITELLM_MASTER_KEY` in `.env.example`) — provision a LiteLLM virtual key with model allowlist + budget cap; the app never needs key-management/spend privileges.
- [ ] **Step 34**: Enable `UTILITY_API_KEY` and `UTILITY_RATE_LIMIT_REQUESTS_PER_MINUTE` by default in the `%prod` Quarkus profile (keep dev opt-out) — the container image currently ships fully open.
- [ ] **Step 35**: Add server-side guardrails to the workflow entry: model allowlist, `max_tokens` clamp (e.g. ≤ 4096), and `messages` count/length caps in `sub_flows/agent-loop.sw.yaml`/`llm-tool-agent.sw.yaml` — today any caller controls model selection, unbounded token consumption, and can inject `role:"system"` messages.
- [ ] **Step 36**: Cap memory key/value sizes in `setMemory` (e.g. key ≤ 256 B, value ≤ 4 KB, reject with 413) — `BoundedCache` caps entry *count* (10k) but not bytes; ~10k × 10 MB bodies ≈ 100 GB retainable for 1h → OOM.
- [ ] **Step 37**: Sanitize CR/LF in logged user/LLM-controlled strings (log injection via `%0a`) and truncate/hash prompt payloads — raw prompts are persisted to `logs/application.log*` at INFO (`UtilityResource.java:68,98,129,274`).
- [ ] **Step 38**: Pin mutable image tags in `docker-compose.yml`: `ollama/ollama:latest` → specific version, `ghcr.io/berriai/litellm:main-latest` → version tag.

### Robustness & Architecture

- [ ] **Step 39**: Add `onErrors` error handling to `sub_flows/agent-loop.sw.yaml` (at minimum) — no workflow YAML defines error transitions today, so any tool HTTP 400/500 propagates and crashes the parent workflow instead of feeding the error back to the LLM as a tool result.
- [ ] **Step 40**: Mark tool/memory output as untrusted at the tool→LLM boundary in the reference patterns: delimit and length-cap `tool_result` content appended by `appendToolResult`, and stop echoing raw arguments/prompts into loop-back content (`UtilityResource.java:99-103,130-134`) — demonstrates basic indirect prompt-injection defense (OWASP LLM01/ASI06).
- [ ] **Step 41**: Split the 376-line `UtilityResource` god-class into domain-scoped resources (`TimeResource`, `CalculatorResource`, `McpResource`, `A2aResource`, `MemoryResource`, `HitlResource`, `GuardrailsResource`, `FallbackResource`, `PlannerResource`) behind the shared `/functions` prefix — enables per-domain validation and test classes.
- [ ] **Step 42**: Remove or wire the dead catalog operations: `listMcpTools` (`mcp-catalog.yaml`) and `listAgents` (`a2a-catalog.yaml`) are declared but no workflow state calls them.
- [ ] **Step 43**: Factor the duplicated tool-argument extraction expression in `sub_flows/tool-executor.sw.yaml` (the `fromjson-else identity` pipeline is copy-pasted 10×) into a reusable expression function.

### Test & CI Gaps

- [ ] **Step 44**: Expand `AgentLoopSubflowTest` beyond the single `7 * 6` calculator scenario — the mock already supports `get_current_time` (`OpenAiMockApiResource.java:49`) but no test exercises it. Add the time-tool path, a multi-step tool-call sequence, the iteration-limit guard, and a tool-HTTP-error propagation case. Add subflow tests for `parallel_agent`/`chain_agent`/`supervisor_agent` (currently zero coverage).
- [ ] **Step 45**: Add regression tests: HITL deny→status flow (after Step 27), calculator nesting-depth rejection, `Infinity`/`NaN` results, `BoundedCache` size-eviction + TTL expiry, memory oversize-value rejection (after Step 36), and an auth-filter path-bypass matrix (traversal/encoded/double-slash variants asserting 401).
- [ ] **Step 46**: Extend CI (`.github/workflows/ci.yml`): add `timeout-minutes` to jobs, a Playwright e2e job (the suite exists in `e2e/` but only runs locally), and blocking Trivy/OWASP dependency-check + gitleaks steps (Dependabot alerts today but nothing blocks merges on CVEs; concurrency group already added in Step 26).
- [ ] **Step 47**: Add the Maven wrapper (`mvnw` + `.mvn/`) for reproducible contributor builds.

### Known Accepted Limitations (documented, not scheduled)

- `RateLimitFilter` is global, per-JVM, and best-effort under concurrent bursts (fixed-window CAS) — documented as a backstop; use a Redis-backed counter if clustered.
- `BoundedCache` TTL eviction is lazy (read-triggered); expired-but-unread entries linger until LRU eviction — acceptable for a mock store.
- `memory/search` is a stub returning one fabricated match and ignores `top_k` — intentional mock behavior once catalog params are aligned (Step 29).
- The debug console (`index.html`) is ungated by design when `UTILITY_API_KEY` is set (static resources bypass JAX-RS); uses `textContent` only (no XSS found).
