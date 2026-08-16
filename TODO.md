# Scope Reduction: LLM Catalog Call + Generic Agent Call

Track the reduction from the agent-loop/tool/MCP implementation to the minimal
orchestrator-only scope. The agent itself, its tools, MCP, and A2A are explicitly
out of scope; workflows only call an LLM (catalog function) and an external agent
(generic REST, sync and async).

## Tasks

- [x] Research SonataFlow async mechanism (callback state + CloudEvent over quarkus-http connector) — verified against apache/incubator-kie-kogito-examples 10.1.x callback example
- [x] Add generic agent REST catalog (sync + async operations)
- [x] Add `llm_chat` public workflow (single catalog LLM call, guardrails preserved)
- [x] Add `agent_call` workflow: sync (operation state) + async (callback state, fired with instance id + callback URL, resumed by `agent_response` CloudEvent)
- [x] Add minimal mock agent (`/agent/sync`, `/agent/async` posting the response CloudEvent) for local demo and tests
- [x] Tests: LLM chat (happy/auth/guardrails/provider-error), agent sync/async (incl. correlation + structured errors)
- [x] Remove agent-loop, tool-executor, utility/MCP catalogs, Time/Calculator/Mcp resources and their tests
- [x] Prune config (utilityCatalog/mcpCatalog), add agentCatalog + incoming CloudEvent channel
- [x] Update README, docs (01/02 replaced), debug console presets, e2e spec, deploy manifest
- [x] docker-compose: remove vestigial Redis (no consumer in app), update .env.example
- [x] Full verification: mvn clean test (20/20) + kustomize + e2e (6/6)

## Java source minimization (YAML/JSON-only platform portability)

- [x] Verify no workflow depends on Java custom functions — every functionRef resolves to an
      OpenAPI catalog operation (`openai-compatible.yaml`, `agent-rest.yaml`); all workflow
      logic (validation, routing, sync/async call, suspend/resume, error mapping) is pure YAML
- [x] Reduce Java sources to two clearly-separated groups (documented in README "Java source policy"):
      - Callable mock tool: `AgentResource` (+ `LogSanitizer`) — replaced by the real agent behind `AGENT_BASE_URL`
      - Optional platform glue: `ApiKeyAuthFilter`, `RateLimitFilter`, `ProdSecurityDefaults`,
        `OpenAiBearerTokenFilter`, `AgentBearerTokenFilter` — security/config for the bundled
        Quarkus app only; a YAML-only platform supplies its own
- [x] Package the portable artifact (`*.sw.yaml` + `catalogs/`) via `deploy/kustomization.yaml`
      (catalogs added to the ConfigMap so `classpath:/catalogs/...` imports resolve on-platform)

## Verification results (2026-08-16)

- `mvn clean test` — 20/20 passed (AgentCallTest 5, LlmChatWorkflowTest 3, ApiKeyAuthFilterTest 8, RateLimitFilterTest 2, DecisionSubflowContractTest 2)
- `mvn package -DskipTests` — success
- `kubectl kustomize deploy --load-restrictor LoadRestrictionsNone` — valid
- `e2e: npx playwright test` — 6/6 passed
