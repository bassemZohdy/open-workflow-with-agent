# SonataFlow LLM Tool Agent

Minimal Quarkus workflow project based on the [SonataFlow getting-started guide](https://sonataflow.org/serverlessworkflow/latest/use-cases/advanced-developer-use-cases/getting-started/create-your-first-workflow-project.html). The workflow is authored in YAML and uses a reusable OpenAI-compatible API resource catalog.

## Run

Configure the LiteLLM-compatible endpoint and API key in the shell used to start Quarkus:

```bash
export LITELLM_BASE_URL=http://localhost:4000/v1
export LITELLM_API_KEY=your-litellm-key
```

Start the workflow service:

```bash
mvn clean quarkus:dev
```

When using the packaged runner, stop the running JVM before `mvn clean` or rebuilding the
package, then start `target/quarkus-app/quarkus-run.jar` again. Quarkus loads the application
and dependency JARs by path, so replacing `target/quarkus-app` while it is running can cause
`NoSuchFileException` errors for workflow function calls.

The workflow uses model `kimi-k2.5` by default. Invoke the generated `llm_tool_agent` workflow endpoint with the messages to send:

```bash
curl -X POST http://localhost:8080/llm_tool_agent \
  -H 'Content-Type: application/json' \
  -d '{
    "messages": [{"role": "user", "content": "Say hello"}],
    "temperature": 0.2,
    "max_tokens": 64
  }'
```

The workflow is named `llm_tool_agent` (display name: `LLM Tool Agent`) and delegates to the reusable [agent-loop.sw.yaml](src/main/resources/agent-loop.sw.yaml) subflow. The external catalogs are [catalogs/openai-compatible.yaml](src/main/resources/catalogs/openai-compatible.yaml) and [catalogs/utility-functions.yaml](src/main/resources/catalogs/utility-functions.yaml). They are imported through the `workflow-uri-definitions` extension inside the subflow. The utility catalog exposes time and calculator operations, implemented locally at `/functions/time` and `/functions/calculator`. The bounded agent loop is now a YAML state machine: it calls the LLM, dispatches approved tool calls to the utility catalog, appends tool results, and repeats until a final response. `LITELLM_BASE_URL` selects the compatible provider endpoint and `LITELLM_API_KEY` supplies the bearer credential.

The response includes the workflow data and the OpenAI-compatible chat-completion payload returned by LiteLLM.

The YAML workflow owns the complete tool loop. It supports the approved `calculate` and
`get_current_time` tools, limits execution to five iterations, and returns a final LLM response
after tool results are appended to the conversation.

Run the fail-fast test suite with:

```bash
mvn clean test
```

Unit tests cover the utility controller, while the workflow integration test starts the real
Quarkus parent workflow, agent-loop subflow, and utility endpoint and mocks only the external
LLM API. Runtime diagnostics are written to `logs/application.log`.

The subflow references `openaiChatCompletion`, `getCurrentTime`, and `calculate` from the external catalogs; the same API resources can be reused by additional workflows without duplicating their contracts. SonataFlow does not define an import mechanism for an external `functions` array or expression functions, so the small aliases and two message-assembly expressions remain local to the subflow while the reusable HTTP APIs stay catalog-backed.

Swagger UI is available at http://localhost:8080/q/swagger-ui/ while the application is running.

The lightweight debug console is available at http://localhost:8080/. It can invoke the
workflow, display the response or error, check runtime health, and open the OpenAPI/Swagger
diagnostic views. It does not display or manage API keys.

## OpenShift Serverless Logic deployment

The target platform is Red Hat OpenShift Serverless Logic 1.38.0. Deploy this project as a
`SonataFlow` workflow through the OpenShift Serverless Logic Operator; the platform-managed
builder/runtime is authoritative for the Quarkus and KIE versions.

The 1.38 workflow runtime is aligned with the Quarkus 3.20.1 configuration format. Do not
replace the platform builder with the latest upstream Quarkus release. Use the builder image
configured by the installed 1.38.0 Operator, typically:

```text
registry.redhat.io/openshift-serverless-1/logic-swf-builder-rhel9:1.38.0
```

The workflow remains YAML and the external OpenAPI catalog remains a reusable project resource.
Configure `LITELLM_BASE_URL` and `LITELLM_API_KEY` as workflow environment values or secrets in
the target `SonataFlow` deployment.
