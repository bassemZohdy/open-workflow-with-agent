# OpenShift Serverless Logic deployment

This deployment uses the OpenShift Serverless Logic 1.38.0 GitOps profile.

## Build and push

The `Dockerfile` uses the platform builder and Java 17 runtime:

```bash
export WORKFLOW_IMAGE=quay.io/your-org/llm-tool-agent:1.0.0
docker build -t "$WORKFLOW_IMAGE" .
docker push "$WORKFLOW_IMAGE"
```

Before applying the workflow, replace the example image in `sonataflow.yaml` with the
image that was pushed to the registry.

## Configure credentials

Copy `litellm-credentials.example.yaml`, replace both values, and apply it to the
workflow namespace. Do not commit the populated Secret:

```bash
oc apply -f deploy/litellm-credentials.yaml -n "$NAMESPACE"
```

## Deploy and test

```bash
oc apply -k deploy -n "$NAMESPACE"
oc get sonataflow,sonataflowbuild,pods -n "$NAMESPACE"
oc expose svc/llm-tool-agent -n "$NAMESPACE"
WORKFLOW_SVC=$(oc get route/llm-tool-agent -n "$NAMESPACE" -o jsonpath='{.spec.host}')
curl -X POST "http://${WORKFLOW_SVC}/llm_tool_agent" \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"Reply with exactly: sonataflow-openshift-ok"}],"temperature":0,"max_tokens":16}'
```

The parent flow is defined in `sonataflow.yaml`; the reusable `agent_loop` subflow is packaged
into the `llm-tool-agent-resources` ConfigMap by `kustomization.yaml`. The external OpenAPI
catalogs are included in the image under `src/main/resources/catalogs`, so the runtime can
resolve both the LLM and utility catalog references. The tool loop itself is managed by the
SonataFlow YAML subflow; no Java agent service is required.
