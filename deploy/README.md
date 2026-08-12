# OpenShift Serverless Logic & Kubernetes Deployment

This deployment runs the **Agentic OpenWorkflow Specification Reference Implementation** on OpenShift Serverless Logic (SonataFlow engine version 10.0.0 GitOps profile).

---

## Deployment Architecture

The OpenWorkflow spec components are mapped to Kubernetes resources as follows:

* **Parent Workflow Entry Point** ([`llm-tool-agent.sw.yaml`](../src/main/resources/llm-tool-agent.sw.yaml)): Defined in [`sonataflow.yaml`](sonataflow.yaml) as the primary SonataFlow Custom Resource (CR).
* **Agentic Sub-Flows** ([`agent-loop.sw.yaml`](../src/main/resources/agent-loop.sw.yaml) & [`tool-executor.sw.yaml`](../src/main/resources/tool-executor.sw.yaml)): Packaged dynamically into the `llm-tool-agent-resources` ConfigMap using [`kustomization.yaml`](kustomization.yaml).
* **Catalog Functions**: OpenAPI catalogs ([`openai-compatible.yaml`](../src/main/resources/catalogs/openai-compatible.yaml) and [`utility-functions.yaml`](../src/main/resources/catalogs/utility-functions.yaml)) are bundled inside the runtime image under `src/main/resources/catalogs` so the workflow engine resolves catalog definitions natively.

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

Copy [`openai-credentials.example.yaml`](openai-credentials.example.yaml) to `openai-credentials.yaml`, populate `OPENAI_BASE_URL` and `OPENAI_API_KEY`, and apply the Secret:

```bash
oc apply -f deploy/openai-credentials.yaml -n "$NAMESPACE"
```

> [!WARNING]
> Do not commit populated `openai-credentials.yaml` secrets to version control.

---

## Deploy and Verify

Apply the Kustomize package to deploy the workflow CR and subflow resources:

```bash
oc apply -k deploy -n "$NAMESPACE"
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
  -d '{
    "messages": [{"role": "user", "content": "Reply with exactly: sonataflow-openshift-ok"}],
    "temperature": 0,
    "max_tokens": 16
  }'
```
