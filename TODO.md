# OpenWorkflow Reference Implementation — Task Tracker

The scope reduction to an orchestrator-only implementation (LLM catalog call + generic
agent call, sync/async) is **complete, merged to `main`, and pushed**. The CI security
backlog and the spec-first restructure are also complete (2026-08-17). This file now
tracks (1) the completed work for the record and (2) the remaining backlog with full
context so any session can pick it up cold.

---

## Completed: scope reduction (2026-08-16)

- [x] Research SonataFlow async mechanism (callback state + CloudEvent over quarkus-http
      connector) — verified against apache/incubator-kie-kogito-examples 10.1.x
- [x] Add generic agent REST catalog (`catalogs/agent-rest.yaml`: `/agent/sync`,
      `/agent/async` + CloudEvent callback contract)
- [x] Add `llm_chat` public workflow (single catalog LLM call, guardrails preserved)
- [x] Add `agent_call` workflow: sync (operation state) + async (callback state fired with
      `$WORKFLOW.instanceId`, resumed by the `agent_response` CloudEvent correlated via
      `kogitoprocrefid`)
- [x] Add minimal mock agent (`AgentResource`: `/agent/sync`, `/agent/async`) for demo/tests
- [x] Tests: LLM chat (happy/auth/guardrails/provider-error), agent sync/async (incl.
      correlation + structured errors) — 20/20 green
- [x] Remove agent-loop, tool-executor, utility/MCP catalogs, Time/Calculator/Mcp
      resources and their tests
- [x] Prune config, add agentCatalog + incoming CloudEvent channel
      (`mp.messaging.incoming.agent_response` — channel key MUST equal the event type)
- [x] Update README, docs (01/02 replaced), console presets, e2e spec, deploy manifests
- [x] docker-compose: remove vestigial Redis, update .env.example
- [x] Java-source minimization for YAML/JSON-only platforms: no Java custom functions
      anywhere; remaining Java = mock agent + optional platform glue (README "Java source
      policy"); portable artifact packaged via `deploy/kustomization.yaml`
- [x] Merge to `main`, full gate green (tests 20/20, kustomize, e2e 6/6), pushed
- [x] Fix pre-existing CI breakage: unresolvable action pins (`trivy-action@0.36.0` →
      `v0.36.0`; `gitleaks-action@v2.1.7` → `v2.3.9`)
- [x] Per-instance dispatch statuses in the mock agent (`DISPATCH_STATUSES` map +
      `dispatchStatusFor(id)`) — async tests can be parallelized later
- [x] CVE remediation pass 1 (commit `fd7c2a5`): quarkus 3.27.2 → 3.27.5.1
      (quarkus-vertx-http authz bypasses), netty-bom 4.1.136.Final, jackson-bom 2.21.4
      imported before quarkus-bom (first-import-wins) — all HIGH findings cleared

---

## Completed: CI security backlog + spec-first restructure (2026-08-17)

### Security-scan (Trivy) CI job — fixed (was HIGH priority)

Root cause found in the CI log: `trivy-action@v0.36.0` with `format: sarif` **unsets the
severity filter** for SARIF output ("Building SARIF report with all severities") unless
`limit-severities-for-sarif: true` is set — so `exit-code: 1` fired on the 7 MEDIUM/LOW
findings. Secondary: the action defaulted to Trivy **0.70.0** while 0.74.0 (locally
verified) reports 0 findings at HIGH/CRITICAL.

Fixes (`.github/workflows/ci.yml`, `trivy.yaml`, `pom.xml`):

- [x] `limit-severities-for-sarif: true` — SARIF + exit code now gated on HIGH,CRITICAL
- [x] `version: v0.74.0` — pin the Trivy binary to the locally verified version
- [x] `skip-version-check: true` in `trivy.yaml` (silences the version notice)
- [x] jackson-bom 2.21.4 → **2.21.5** — removes 3 of the 7 open alerts
      (GHSA-mhm7-754m-9p8w, CVE-2026-59889, CVE-2026-54515)
- [x] `org.mozilla:rhino` override **1.7.7.2 → 1.8.1** in `<dependencyManagement>`
      (transitive via swagger-parser → json-schema-core; CVE-2025-66453 LOW) — tests 20/20
- [x] `trivy.yaml` committed with documented `ignore` entries (id + `expired_at` 2027-06-30
      + reason) for the Kogito/Quarkus-pinned MEDIUMs that cannot be fixed on this platform
      line: CVE-2026-42333, CVE-2026-40180 (quarkus-openapi-generator 2.11.0-lts),
      CVE-2026-45292 (opentelemetry-api 1.44.1) — re-evaluate on the next platform upgrade
- [x] Verified locally with Trivy 0.74.0: HIGH/CRITICAL scan exits 0; the remaining
      MEDIUM/LOW findings are suppressed only via the documented ignores

The 7 existing GitHub code-scanning alerts should auto-close after the next green run
uploads a SARIF without them (verify via `gh api .../code-scanning/alerts?state=open`).

### gitleaks + OWASP steps — first-ever execution (was HIGH priority)

- [x] gitleaks-action **v2.3.9 → v3.0.0** (Node 24 runtime). Verified locally with the
      action's bundled gitleaks **8.24.3** (and 8.30.1): `no leaks found` across all 35
      commits — the intentional test fixtures (`test-secret-123`, `e2e-test-key`,
      `dummy-key`, `replace-with-a-secret`) are NOT matched by default rules, so **no
      `.gitleaksignore` was needed**
- [x] OWASP dependency-check step is now **gated on the `NVD_API_KEY` repo secret**
      (`if: env.NVD_API_KEY != ''`): without the key the NVD API rate-limits and the step
      hangs/fails spuriously. Add the secret in repo Settings → Secrets and variables →
      Actions to enable it (blocking on CVSS >= 7). Has never run — see "Remaining".

### CI modernization (was LOW priority)

- [x] `github/codeql-action/upload-sarif@v3` → **@v4** (v3 deprecated Dec 2026)
- [x] `actions/upload-artifact@v4` → **@v7** (Node 24 runtime), both jobs
- [x] `actions/setup-node@v4` → **@v7** (Node 24 runtime), e2e job
- [x] `gitleaks-action` v2.3.9 → v3.0.0 (see above)
- [x] Trivy version notice silenced via `trivy.yaml` (see above)

### Spec-first restructure: the OpenWorkflow YAML/JSON specs are the main project (2026-08-17)

The deliverable is the spec package; Java is only the reference runner. Restructured to
make that structural, not just documented:

- [x] Canonical spec package moved from `src/main/resources/` to a top-level **`workflows/`**
      (`llm-chat.sw.yaml`, `agent-call.sw.yaml`, `sub_flows/`, `catalogs/`) — the repo
      layout now *shows* spec-first
- [x] Discovered hard constraint: the Kogito codegen scans **only**
      `<module>/src/main/resources` for `*.sw.yaml` (AppPaths hardcodes it; the Maven
      `<resources>` model is NOT consulted — verified by bytecode inspection and by the
      404s a pure `<resources>` move produced). The runner therefore keeps a **generated
      mirror** there, byte-identical to `workflows/`
- [x] **`deploy/sync-runner-resources.sh`** — copies `workflows/` → `src/main/resources/`;
      `--check` mode fails on drift; wired into the CI `validate-deployment` job
- [x] **`deploy/generate-sonataflow.sh`** — regenerates `deploy/sonataflow.yaml`'s inline
      `spec.flow` from `workflows/agent-call.sw.yaml` (the CR previously carried a
      hand-mirrored copy with zero sync guard — 273 diff lines of silent drift);
      `--check` mode wired into CI. Embedded flow verified byte-identical (4872/4872 chars)
- [x] `deploy/kustomization.yaml` configMap now sources `../workflows/` and documents why
      `agent-call.sw.yaml` is embedded in the CR rather than mounted
- [x] README gained a "Repository Layout: Specs First, Runner Second" section; all docs
      links updated to `workflows/`
- [x] Dockerfile no longer needs `COPY workflows` (the mirror ships in the jar)
- [x] e2e webServer: POSIX env-prefix command → Playwright `env` option (the old form
      could not start the app on Windows cmd); added `@types/node` to e2e devDependencies
- [x] Verified: `mvn clean test` 20/20, `mvn package`, kustomize render, both sync checks,
      e2e 6/6 — all green locally

### Cleanup (was LOW priority)

- [x] Merged `feature/reduce-to-llm-and-agent-call` branch: already deleted (local +
      remote) — nothing to do
- [ ] Optional: parallelize async tests now that `DISPATCH_STATUSES` is per-instance
      (currently sequential; not a bottleneck at 5 tests) — deliberately left

---

## Remaining tasks

### 1. OWASP dependency-check has never run — MEDIUM priority (needs repo secret)

The step is in place and gated on the `NVD_API_KEY` secret; it will only execute once the
secret exists. First run will tell us whether `-DfailBuildOnCVSS=7` passes on this
dependency set (expect it to: Trivy shows nothing >= HIGH). If it flags CVSS >= 7
findings that Trivy's DB does not cover, suppress with the plugin's `suppression.xml`
(same documentation discipline as `trivy.yaml`) — do NOT weaken the CVSS threshold.

### 2. OpenShift / Knative callback smoke test — MEDIUM priority (needs a cluster)

The async `agent_call` callback path is verified locally only over the `quarkus-http`
channel. On OpenShift Serverless Logic, callback states resume via Knative Eventing
brokers instead. The event contract is identical (type `agent_response`, `kogitoprocrefid`
= workflow instance id — see `docs/02-agent-rest-call.md`), but it has never been exercised
against a real cluster. Requires: an OpenShift cluster with Serverless Logic + Eventing,
`deploy/` applied via kustomize, an agent reachable at `AGENT_BASE_URL` implementing
`workflows/catalogs/agent-rest.yaml`. Also verify there that the `classpath:/catalogs/...`
URIs resolve against the mounted workflow resources (the `workflow-uri-definitions`
extension) — untested on the platform.

### 3. Optional cleanup

- Parallelize async tests (`DISPATCH_STATUSES` is per-instance since `4b1f67e`) when the
  suite grows.

### 4. Post-pivot review findings (2026-08-17) — security audit + code-quality pass

Full review of `3559d53..4384470` plus working tree. All findings verified against source
(the async-agent trust boundary items are the gate for any non-loopback deployment).
Local verification after review: `mvnw clean test` 20/20, sync/sonataflow `--check` OK,
`kubectl kustomize` OK, CI green at `4384470` (all 5 jobs).

**HIGH — fix before exposing beyond localhost**

- [x] **R1: Unauthenticated CloudEvent resume channel.** `mp.messaging.incoming.agent_response`
  (`application.properties:34-35`, path `/agent/response-event`) is served by the
  reactive-messaging `quarkus-http` connector as an extension endpoint — NOT a JAX-RS
  resource — so `ApiKeyAuthFilter`/`RateLimitFilter` never see it. Anyone who can reach
  the port can POST a forged `agent_response` CloudEvent with `kogitoprocrefid=<id>` and
  resume a suspended `agent_call` instance with attacker-controlled `data` (lands in
  `.agent_response` output, `agent-call.sw.yaml:116-118`); also unthrottled. Fix: front
  the channel with an authenticating JAX-RS endpoint (validate the existing
  `utility.api-key`, then emit to the channel), or HMAC-sign `kogitoprocrefid`, or at
  minimum block `/agent/response-event` at the ingress/network level. Add a regression
  test: with `UTILITY_API_KEY` set, a forged CloudEvent POST must be rejected.
- [x] **R2: SSRF via caller-controlled `callback_url`.** `agent-call.sw.yaml:109` forwards
  any string to the agent; `AgentResource.java:119-132,180` POSTs to
  `URI.create(callbackUrl)` with no scheme/host validation — a full server-side-request
  primitive in dev (unauthenticated) and authenticated SSRF in prod. Amplifier: the
  callback target's response body is logged raw at `AgentResource.java:193-194`
  (log injection + internal-endpoint info disclosure into `logs/application.log`).
  Fix: allowlist http/https, resolve and reject loopback/private/link-local ranges
  (configurable allowlist), wrap `response.body()` in `LogSanitizer.safe(...)`, pin
  `followRedirects(NEVER)`, and cap `callback_url` length in workflow validation.

**MEDIUM**

- [x] **R3: CI OWASP dependency-check step can never execute.** `ci.yml:190` gates the
  step on `if: env.NVD_API_KEY != ''`, but a step-level `if` cannot see the step's own
  `env:` block (only workflow/job-level env) — the condition is always false, so the SCA
  gate silently never runs even once the secret exists (supersedes the premise of
  item 1 above). Fix: `if: env.NVD_API_KEY != ''` with NVD_API_KEY exposed at the security-job level (the secrets context cannot be used directly
  available in step `if`) or move the env to job level. Consider an else-branch that
  fails on `main` when the key is absent so drift is visible.
- [x] **R4: `ProdSecurityDefaults` fails open on non-"prod" profile names.** The guard
  enforces only when `quarkus.profile == "prod"` literally; running the prod image with
  `QUARKUS_PROFILE=dev` (or any custom name) skips the API-key requirement AND the
  `%prod` rate-limit default — unauthenticated, unthrottled deployment from one env var.
  Fix: invert to a blocklist (skip only `dev`/`test`/`test-with-reload`), or key off
  `LaunchMode.current()` with an explicit opt-out config.
- [x] **R5: Outbound agent credential defaults to the front-door key for external
  agents.** `application.properties:25` (`agent.api-key=${AGENT_API_KEY:${UTILITY_API_KEY:}}`)
  sends the app's own inbound master key as bearer to ANY `AGENT_BASE_URL` that doesn't
  set `AGENT_API_KEY` — one compromised third-party agent endpoint = full API access to
  this app. Fix: apply the `UTILITY_API_KEY` fallback only when the agent resolves to
  this app's own origin; otherwise require `AGENT_API_KEY` explicitly (fail fast).
- [x] **R6: Mock agent `HttpClient` has no timeouts.** `AgentResource.java:74,180-187` —
  no `connectTimeout`, no request `.timeout()`: a black-holing callback target hangs
  dispatch futures indefinitely (5 retries compound it). Fix:
  `connectTimeout(Duration.ofSeconds(5))` + `request.timeout(Duration.ofSeconds(10))`,
  plus a unit test that a never-responding target completes within budget.
- [x] **R7: `sync-runner-resources.sh` misses stale mirror files.** The check only
  iterates `workflows/` → `src/main/resources/`; a file deleted from `workflows/` but
  left in the mirror passes CI silently (Kogito would still discover the stale copy).
  Fix: also diff the reverse direction (or compare sorted file listings) and fail on
  extras.

**LOW**

- [x] **R8: Debug console sends no `Authorization` header** (`index.html:152`) — every
  console action 401s in `%prod`, nudging operators to disable auth. Add an optional
  API-key field (sessionStorage) that attaches the header.
- [x] **R9: Bearer filters resolve tokens `static final` at class-load**
  (`AgentBearerTokenFilter.java:31-35`, `OpenAiBearerTokenFilter.java`) — credential
  rotation requires an app restart. Resolve per-request (cheap in a
  `ClientRequestFilter`) or document the restart requirement.
- [x] **R10: Compose credential hygiene.** Replaced the shared Postgres runtime credential
  with an idempotent `postgres-bootstrap` service that creates/updates dedicated
  `openworkflow_app` and `litellm` non-superuser roles, assigns separate database ownership,
  and revokes public database access. `litellm-keygen` now reuses an existing scoped key file
  and writes new keys atomically, preventing duplicate virtual keys on repeated starts.
  `deploy/validate-compose.sh` and CI validate the complete Compose graph.
- [x] **R11: `AgentResource.java:178` formatting glitch** — method brace and first
  statement share one line in `dispatchWithRetry`; split it.
- [x] **R12: CI efficiency + hygiene.** `mvn package -DskipTests` runs in both `test`
  and `e2e` jobs — upload `target/quarkus-app/` as an artifact and download it in `e2e`
  (saves ~1-2 min); add `trivy-results.sarif` + `gitleaks-results.sarif` to
  `.gitignore`; consider a Maven enforcer/dependency:tree assertion that the resolved
  netty ≥ 4.1.136 / jackson ≥ 2.21.5 floors hold (the first-import-wins BOM override in
  `pom.xml` silently stops working if BOM order changes).
- [x] **R13: Test gaps.** `DecisionSubflowContractTest` only asserts YAML string
  presence — add runtime tests through `OpenAiMockApiResource` (valid yes/no answer,
  invalid/ambiguous answer → `valid:false`); the e2e async test verifies suspension but
  not the resume round-trip (poll for completion with `agent_response`); bump
  surefire `3.0.0-M7` (2022 milestone) to a stable `3.5.x`.

Reviewed-and-fine (no action): CI action pins (`@v7` etc. resolve — CI green at
`4384470`); workflow `onErrors` coverage on both flows; `llm_chat` input guardrails
(messages ≤ 20 × 8192 chars, role allowlist, model allowlist, `max_tokens` ≤ 4096 —
confirmed active in test logs); compose loopback bindings + fail-fast secrets + non-root
image; LogSanitizer applied at all call sites except R2's one; constant-time key compare;
Maven wrapper; kustomize/generate/sync CI gates.

---

## Verification results (2026-08-17, after CI security fixes + spec-first restructure)

## Follow-up hardening verification (cleanup branch)

- Protected the Reactive Messaging CloudEvent ingress with a Vert.x HTTP filter, including
  API-key authentication and rate limiting.
- Added callback URL scheme/length/DNS/private-network validation, redirect disabling,
  request/connect timeouts, bounded retries, and sanitized error-body logging.
- Made packaged/custom profiles secure by default, prevented external-agent credential
  fallback, fixed dynamic credential rotation, and added stale-mirror detection.
- Added runtime decision-subflow tests, callback timeout tests, authenticated CloudEvent
  regression coverage, and E2E async resume polling.
- Maven/CI execution remains the authoritative validation for these changes; the local
  environment could not resolve Maven Central, so the new suite must be confirmed by CI.

- `mvn clean test` — 20/20 passed (AgentCallTest 5, LlmChatWorkflowTest 3,
  ApiKeyAuthFilterTest 8, RateLimitFilterTest 2, DecisionSubflowContractTest 2)
- `mvn package -DskipTests` — success
- `kubectl kustomize deploy --load-restrictor LoadRestrictionsNone` — valid
- `./deploy/generate-sonataflow.sh --check` — OK (spec.flow byte-identical to
  workflows/agent-call.sw.yaml)
- `./deploy/sync-runner-resources.sh --check` — OK (src/main/resources mirrors workflows/)
- e2e: `npx playwright test` — 6/6 passed (Windows + CI-ready webServer config)
- Trivy 0.74.0 (`--scanners vuln,secret --severity HIGH,CRITICAL`) — 0 findings;
  full-severity scan shows only the 3 documented `trivy.yaml` suppressions
- gitleaks 8.24.3 (action-bundled version) — `no leaks found` over all 35 commits

## TODO follow-up verification (2026-08-17)

- R10 Compose credential hygiene implemented: dedicated database roles, idempotent bootstrap,
  and idempotent LiteLLM key provisioning.
- `sh -n postgres-init/bootstrap.sh` and `sh -n deploy/validate-compose.sh` passed.
- Compose validation is wired into CI; local execution is unavailable in this environment
  because Docker Compose is not installed.
- GitHub Actions run 55 passed tests/package, Playwright E2E, container build, deployment
  manifest validation, Trivy, and gitleaks. OWASP dependency-check remained skipped because
  the repository has no `NVD_API_KEY` secret.
- The OpenShift/Knative callback smoke test remains blocked until a Serverless Logic/Eventing
  cluster and reachable agent endpoint are available; no `oc` or `kubectl` context is present
  in this environment.
