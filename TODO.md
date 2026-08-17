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

---

## Verification results (2026-08-17, after CI security fixes + spec-first restructure)

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
