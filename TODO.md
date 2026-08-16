# OpenWorkflow Reference Implementation — Task Tracker

The scope reduction to an orchestrator-only implementation (LLM catalog call + generic
agent call, sync/async) is **complete, merged to `main`, and pushed**. This file now
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

## Remaining tasks

### 1. Finish the security-scan (Trivy) CI job — HIGH priority

Current state: 4 of 5 CI jobs pass on `main` (test/package, manifests, container, e2e);
the security job's Trivy step still exits 1 even though only MEDIUM/LOW findings remain
(GitHub Security tab shows 7 open alerts, all < HIGH, despite `severity: HIGH,CRITICAL`).

Remaining findings (from `gh api repos/…/code-scanning/alerts?state=open`):

| Package | Installed | Finding(s) | Fixed in | Suggested action |
| :--- | :--- | :--- | :--- | :--- |
| `com.fasterxml.jackson.core:jackson-databind` | 2.21.4 | GHSA-mhm7-754m-9p8w, CVE-2026-59889, CVE-2026-54515 (MEDIUM) | **2.21.5** | Bump `jackson.bom.version` in `pom.xml` — trivial, removes 3 of 7 |
| `org.mozilla:rhino` (Kogito transitive) | 1.7.7.2 | CVE-2025-66453 (LOW) | 1.8.1 | Override via `<dependencyManagement>` entry in `pom.xml` |
| `io.quarkiverse.openapi.generator:quarkus-openapi-generator` | 2.11.0-lts | CVE-2026-42333, CVE-2026-40180 (MEDIUM) | 2.16.0-lts / 2.17.0 | Pinned by Kogito 10.2 — prefer documented suppression (see below) over override |
| `io.opentelemetry:opentelemetry-api` | 1.44.1 | CVE-2026-45292 (MEDIUM) | 1.62.0 | Managed by Quarkus/Kogito — prefer documented suppression |

Notes from local reproduction (2026-08-16): Trivy **0.74.0** with the same filters
(`--scanners vuln,secret --severity HIGH,CRITICAL`) reports **0 findings** on this repo;
CI runs Trivy **0.70.0** via the action and exits 1. Suspects, in order:
1. Version behavior difference — pin the action's Trivy to a current release by adding
   `version: v0.74.0` (or latest) to the `aquasecurity/trivy-action` step in
   `.github/workflows/ci.yml`.
2. `exit-code: '1'` firing on the unfiltered finding set under SARIF format.
3. For the Kogito/Quarkus-pinned MEDIUMs, add a committed `trivy.yaml` at repo root with
   documented `ignore` entries (CVE id + expiry + reason) rather than weakening filters.

### 2. First-ever execution of gitleaks + OWASP steps — HIGH priority (unknown risk)

The security job has never gotten past Trivy, so these steps have **never run**:
- **gitleaks** (`gitleaks/gitleaks-action@v2.3.9`): may flag the intentional test fixtures
  (`test-secret-123`, `e2e-test-key`, `dummy-key`, `replace-with-a-secret`). If it does,
  add a `.gitleaksignore` with those exact findings (they are documented placeholders,
  not live secrets).
- **OWASP dependency-check** (blocking on CVSS >= 7): needs the `NVD_API_KEY` repo secret;
  without it the NVD API rate-limits and the step can fail/time out. Either add the secret
  (repo Settings → Secrets → Actions) or gate the step on its presence.

### 3. CI modernization / deprecation warnings — LOW priority

- `github/codeql-action/upload-sarif@v3` is deprecated (Dec 2026) → bump to `@v4`.
- Node 20 deprecation warnings from `actions/upload-artifact@v4`, `actions/setup-node@v4`
  (informational; resolve as actions publish Node 24 builds).
- Consider `--skip-version-check` for Trivy to silence the version notice in logs.

### 4. OpenShift / Knative callback smoke test — MEDIUM priority (needs a cluster)

The async `agent_call` callback path is verified locally only over the `quarkus-http`
channel. On OpenShift Serverless Logic, callback states resume via Knative Eventing
brokers instead. The event contract is identical (type `agent_response`, `kogitoprocrefid`
= workflow instance id — see `docs/02-agent-rest-call.md`), but it has never been exercised
against a real cluster. Requires: an OpenShift cluster with Serverless Logic + Eventing,
`deploy/` applied via kustomize, an agent reachable at `AGENT_BASE_URL` implementing
`catalogs/agent-rest.yaml`.

### 5. Cleanup — LOW priority

- Delete the merged `feature/reduce-to-llm-and-agent-call` branch (local + remote).
- Optional: parallelize async tests now that `DISPATCH_STATUSES` is per-instance
  (currently sequential; not a bottleneck at 5 tests).

---

## Verification results (2026-08-16, after CVE pass 1)

- `mvn clean test` — 20/20 passed (AgentCallTest 5, LlmChatWorkflowTest 3,
  ApiKeyAuthFilterTest 8, RateLimitFilterTest 2, DecisionSubflowContractTest 2)
- `mvn package -DskipTests` — success
- `kubectl kustomize deploy --load-restrictor LoadRestrictionsNone` — valid
- `e2e: npx playwright test` — 6/6 passed
- `docker compose config` (dummy secrets) — valid
- Local Trivy 0.74.0 (`--scanners vuln,secret --severity HIGH,CRITICAL`) — 0 findings
