# Pattern 1: LLM Catalog Call

The simplest agentic building block: a workflow calls an LLM exactly like any other REST
service, through an OpenAPI **catalog function**. No agent internals, no tools, no MCP -
just a declarative service call the workflow engine can express natively.

* Workflow: [`llm-chat.sw.yaml`](../src/main/resources/llm-chat.sw.yaml)
* Catalog: [`openai-compatible.yaml`](../src/main/resources/catalogs/openai-compatible.yaml)

---

## How it works

```text
llm_chat (public entry point)
  └── Validate Request (switch)        <- server-side guardrails in the workflow itself
      ├── Call LLM (operation)
      │     └── openaiCatalog#chatCompletions   <- OpenAPI catalog function
      │           model / messages / temperature / max_tokens (clamped)
      ├── Invalid Request (inject)     <- structured validation error
      └── LLM Call Failed (inject)     <- onErrors: 400/500 mapped to a structured error
```

### Catalog import (`workflow-uri-definitions`)

The OpenWorkflow spec extension lets workflows reference external OpenAPI operations without
hardcoding endpoint URLs in states:

```yaml
extensions:
  - extensionid: workflow-uri-definitions
    definitions:
      openaiCatalog: classpath:/catalogs/openai-compatible.yaml

functions:
  - name: openaiChatCompletion
    operation: openaiCatalog#chatCompletions
```

The runtime resolves `openaiCatalog` to a REST client whose base URL comes from environment
config (`OPENAI_BASE_URL`), so the same workflow targets LiteLLM, Ollama, vLLM, or a hosted
provider with zero YAML changes.

### Server-side guardrails (deploy with the workflow)

Because validation lives in the workflow (a `switch` state), it travels with the YAML to any
platform:

* `messages`: array of 1..20 entries, string content of at most 8192 chars
* roles: only `user` and `assistant` (callers cannot inject `system` prompts)
* `model`: allowlist enforced server-side
* `max_tokens` clamped to 4096, history truncated to the last 20 messages

### Error handling

The catalog's HTTP status is surfaced as a workflow error (`400`/`500`); `onErrors` maps
provider failures to a structured `error` field instead of an aborted instance.

---

## Try it

```bash
curl -X POST http://localhost:8080/llm_chat \
  -H 'Content-Type: application/json' \
  -d '{
    "messages": [{"role": "user", "content": "Say hello in one short sentence."}],
    "temperature": 0,
    "max_tokens": 64
  }'
```

Response (abridged):

```json
{
  "workflowdata": {
    "llm_response": {
      "choices": [{"message": {"role": "assistant", "content": "..."}}]
    }
  }
}
```
