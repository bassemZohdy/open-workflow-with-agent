# OpenShift Serverless Logic & Kubernetes Deployment

This deployment runs the **orchestrator-only OpenWorkflow reference implementation** on OpenShift Serverless Logic (SonataFlow engine version 10.2.0 GitOps profile).

---

## Deployment Architecture

The workflows are **pure YAML**: every function reference resolves to an OpenAPI catalog operation (`openai-compatible.yaml`, `agent-rest.yaml`) - there are no Java custom functions. That makes the workflow package portable to any platform that consumes Serverless Workflow YAML/JSON.

* **Primary workflow** ([`agent-call.sw.yaml`](../workflows/agent-call.sw.yaml)): defined inline in [`sonataflow.yaml`](sonataflow.yaml) as the SonataFlow Custom Resource (CR) - generic REST agent call, sync (`operation` state) and async (`callback` state resumed by an `agent_response` CloudEvent).

  > The inline `spec.flow` is **generated** from the canonical file - never edit it by hand. After changing `../workflows/agent-call.sw.yaml`, run `./deploy/generate-sonataflow.sh` and commit the regenerated CR; CI (`./deploy/generate-sonataflow.sh --check`) fails on drift.

* **Additional workflows** ([`llm-chat.sw.yaml`](../workflows/llm-chat.sw.yaml), [`boolean-decision.sw.yaml`](../workflows/sub_flows/boolean-decision.sw.yaml), [`choice-decision.sw.yaml`](../workflows/sub_flows/choice-decision.sw.yaml)): packaged into the `llm-tool-agent-resources` ConfigMap by [`kustomization.yaml`](kustomization.yaml).
* **Catalog Functions**: the OpenAPI catalogs are bundled into the same ConfigMap under `catalogs/`, matching the `classpath:/catalogs/...` URIs the workflows import via `workflow-uri-definitions` (on the platform the URIs resolve against the mounted workflow resources).

> [!NOTE]
> On OpenShift Serverless Logic, a `callback` state is resumed by a CloudEvent delivered through the platform eventing fabric (Knative Eventing broker), not the local `quarkus-http` channel the plain-Quarkus app uses. The event contract is identical: type `agent_response` with the `kogitoprocrefid` extension attribute carrying the workflow instance id - see [`agent-rest.yaml`](../workflows/catalogs/agent-rest.yaml).

---

## Build and Push Container Image

The container build uses [`Dockerfile`](../Dockerfile) with the platform builder and Java 17 runtime:

```bash
export WORKFLOW_IMAGE=quay.io/your-org/llm-tool-agent:1.0.0
docker build -t "$WORKFLOW_IMAGE" .
docker push "$WORKFLOW_IMAGE"
```

Before applying manifests, update `spec.podTemplate.container.image` in [`sonataflow.yaml`](sonataflow.yaml) with your pushed image URI.

---

## Configure Credentials

Copy [`openai-credentials.example.yaml`](openai-credentials.example.yaml) to `openai-credentials.yaml`, populate `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `AGENT_BASE_URL`, and `UTILITY_API_KEY`, and apply the Secret:

```bash
oc apply -f deploy/openai-credentials.yaml -n "$NAMESPACE"
```

> [!WARNING]
> Do not commit populated `openai-credentials.yaml` secrets to version control.

Notes:
- `UTILITY_API_KEY` is **required** by the `%prod` profile (the app refuses to start without it) - generate one with `openssl rand -hex 24`.
- `AGENT_BASE_URL` must point at an agent implementing the two operations in [`agent-rest.yaml`](../workflows/catalogs/agent-rest.yaml). This repo's bundled mock agent (`AgentResource`, same container) implements them; on the platform it is typically an external service.
- When `OPENAI_BASE_URL` points at a LiteLLM proxy, provision a **scoped virtual key** (model allowlist + budget cap) via LiteLLM's `/key/generate` endpoint and use that as `OPENAI_API_KEY` - never the proxy's master key, which carries key-management/spend privileges (see the `litellm-keygen` service in `docker-compose.yml` for the same pattern).

---

## Deploy and Verify

Apply the Kustomize package to deploy the workflow CR and subflow resources:

```bash
oc kustomize deploy --load-restrictor LoadRestrictionsNone | oc apply -f - -n "$NAMESPACE"
```

Monitor deployment status:

```bash
oc get sonataflow,sonataflowbuild,pods -n "$NAMESPACE"
```

Expose the HTTP service and trigger a test request:

```bash
oc expose svc/llm-tool-agent -n "$NAMESPACE"
WORKFLOW_SVC=$(oc get route/llm-tool-agent -n "$NAMESPACE" -o jsonpath='{.spec.host}')

curl -X POST "http://${WORKFLOW_SVC}/agent_call" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $UTILITY_API_KEY" \
  -d '{
    "mode": "sync",
    "agent_request": {"task": "Reply with exactly: sonataflow-openshift-ok"}
  }'
```

The synchronous LLM catalog call works the same way via `POST /llm_chat` with a `messages` array (see the main [README](../README.md)).
