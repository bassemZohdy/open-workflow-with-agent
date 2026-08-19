# OpenWorkflow Task Tracker

The core orchestrator-only reference implementation is complete: the repository contains
the portable OpenWorkflow spec package, the Quarkus/SonataFlow reference runner, sync and
async generic agent calls, the LLM catalog call, decision subflows, hardened endpoints,
deployment packaging, and CI validation.

## Current acceptance scope

The required test environment is the plain Quarkus/SonataFlow runner. Maven integration
tests and Playwright E2E tests cover workflow execution, catalog calls, async callback
correlation, CloudEvent authentication, validation, and the packaged application. A real
OpenShift Serverless Logic cluster is not required for the project gate.

## Remaining work

### OWASP dependency-check verification

The repository `NVD_API_KEY` secret is configured. The CI workflow now passes it to OWASP
Dependency-Check through `nvdApiKeyEnvironmentVariable=NVD_API_KEY`, which avoids exposing
the secret as a Maven command-line value.

- [ ] Push the workflow configuration and rerun CI.
- [ ] Confirm the OWASP scan completes and passes with `-DfailBuildOnCVSS=7`.
- [ ] If CVSS >= 7 findings appear, remediate them or add narrowly scoped, documented
      suppressions; never lower the threshold.

### Optional platform validation

If an OpenShift Serverless Logic and Knative Eventing environment becomes available,
optionally verify that the same `agent_response` CloudEvent is delivered through the
platform broker and that the mounted `classpath:/catalogs/...` resources resolve. This is
platform-specific smoke testing, not a blocker for the Quarkus/SonataFlow acceptance gate.

### Optional test optimization

Parallelize the async tests when the suite grows. Per-instance callback dispatch tracking
already makes concurrent async scenarios safe, but the current sequential suite is small
and is not a performance bottleneck.

## Validation commands

```bash
mvn clean test
./deploy/generate-sonataflow.sh --check
./deploy/sync-runner-resources.sh --check
./deploy/validate-compose.sh
kubectl kustomize deploy --load-restrictor LoadRestrictionsNone
```
