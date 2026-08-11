# SonataFlow LLM Tool Agent

This project is a YAML-first SonataFlow application for an OpenAI-compatible LLM agent. It
keeps atomic integrations in reusable OpenAPI catalogs and models the multi-step agent loop as
a YAML subflow.

## Architecture

```text
llm_tool_agent workflow
└── agent_loop subflow
    ├── openaiChatCompletion     OpenAI-compatible catalog function
    ├── getCurrentTime            Utility catalog function
    ├── calculate                 Utility catalog function
    ├── inspect and route tool calls
    ├── append tool results
    └── enforce the five-iteration limit
```

The parent workflow is the public HTTP entry point. The [agent loop subflow](src/main/resources/agent-loop.sw.yaml)
owns orchestration and state transitions. The [OpenAI catalog](src/main/resources/catalogs/openai-compatible.yaml)
and [utility catalog](src/main/resources/catalogs/utility-functions.yaml) own reusable API contracts.

The utility APIs are implemented locally by `UtilityResource` at `/functions/time` and
`/functions/calculator`; they can be deployed as separate services without changing the workflow.

## Run locally

Configure the LiteLLM-compatible endpoint and API key:

```bash
export LITELLM_BASE_URL=http://localhost:4000/v1
export LITELLM_API_KEY=your-litellm-key
```

Start Quarkus Dev Mode:

```bash
mvn clean quarkus:dev
```

The default model is `kimi-k2.5`. Invoke the parent workflow:

```bash
curl -X POST http://localhost:8080/llm_tool_agent \
  -H 'Content-Type: application/json' \
  -d '{
    "messages": [{"role": "user", "content": "Calculate 7 * 6 and reply with only the result."}],
    "temperature": 0,
    "max_tokens": 64
  }'
```

The debug console is available at [http://localhost:8080/](http://localhost:8080/). Swagger UI
is available at [http://localhost:8080/q/swagger-ui/](http://localhost:8080/q/swagger-ui/).

When using the packaged runner, stop the JVM before running `mvn clean` or rebuilding the
package. Quarkus loads application and dependency JARs by path; replacing `target/quarkus-app`
while it is running can cause `NoSuchFileException` errors.

## Testing

Run the complete test suite:

```bash
mvn clean test
```

The unit tests cover calculator and time behavior. The integration test starts the real parent
workflow, `agent_loop` subflow, and utility endpoint while mocking only the external LLM API.
Runtime diagnostics are written to `logs/application.log`.

SonataFlow does not provide an import mechanism for an external `functions:` array or expression
functions. Therefore, the subflow keeps only its function aliases and message-assembly
expressions locally, while reusable HTTP APIs remain in external catalogs.

## OpenShift Serverless Logic

The deployment targets the OpenShift Serverless Logic 1.38.0 GitOps profile. The platform
builder/runtime remains authoritative for Quarkus and KIE versions. Configure `LITELLM_BASE_URL`
and `LITELLM_API_KEY` through the `litellm-credentials` Secret.

See [deploy/README.md](deploy/README.md) for image build, credentials, subflow resource
packaging, and deployment commands.
