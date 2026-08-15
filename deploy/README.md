# OpenShift Serverless Logic & Kubernetes Deployment

This deployment runs the **Agentic OpenWorkflow Specification Reference Implementation** on OpenShift Serverless Logic (SonataFlow engine version 10.2.0 GitOps profile).

---

## Deployment Architecture

The OpenWorkflow spec components are mapped to Kubernetes resources as follows:

* **Parent Workflow Entry Point** ([`llm-tool-agent.sw.yaml`](../src/main/resources/llm-tool-agent.sw.yaml)): Defined in [`sonataflow.yaml`](sonataflow.yaml) as the primary SonataFlow Custom Resource (CR).
* **Agentic Sub-Flows** ([`llm-tool-agent.sw.yaml`](../src/main/resources/llm-tool-agent.sw.yaml), [`agent-loop.sw.yaml`](../src/main/resources/sub_flows/agent-loop.sw.yaml), [`tool-executor.sw.yaml`](../src/main/resources/sub_flows/tool-executor.sw.yaml), [`boolean-decision.sw.yaml`](../src/main/resources/sub_flows/boolean-decision.sw.yaml), and [`choice-decision.sw.yaml`](../src/main/resources/sub_flows/choice-decision.sw.yaml)): Packaged dynamically into the `llm-tool-agent-resources` ConfigMap using [`kustomization.yaml`](kustomization.yaml).
* **Catalog Functions**: OpenAPI catalogs ([`openai-compatible.yaml`](../src/main/resources/catalogs/openai-compatible.yaml), [`utility-functions.yaml`](../src/main/resources/catalogs/utility-functions.yaml), and [`mcp-catalog.yaml`](../src/main/resources/catalogs/mcp-catalog.yaml)) are bundled inside the runtime image under `src/main/resources/catalogs` so the workflow engine resolves catalog definitions natively.

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

Copy [`openai-credentials.example.yaml`](openai-credentials.example.yaml) to `openai-credentials.yaml`, populate `OPENAI_BASE_URL`, `OPENAI_API_KEY`, and `UTILITY_API_KEY`, and apply the Secret:

```bash
oc apply -f deploy/openai-credentials.yaml -n "$NAMESPACE"
```

> [!WARNING]
> Do not commit populated `openai-credentials.yaml` secrets to version control.

Notes:
- `UTILITY_API_KEY` is **required** by the `%prod` profile (the app refuses to start without it) - generate one with `openssl rand -hex 24`.
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

curl -X POST "http://${WORKFLOW_SVC}/llm_tool_agent" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $UTILITY_API_KEY" \
  -d '{
    "messages": [{"role": "user", "content": "Reply with exactly: sonataflow-openshift-ok"}],
    "temperature": 0,
    "max_tokens": 16
  }'
```
