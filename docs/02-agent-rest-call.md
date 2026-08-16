# Pattern 2: Generic Agent Call (Sync & Async over REST)

Treat the agent as a **black box** invoked through a generic REST contract. The workflow
never inspects the agent's internals (tools, MCP, A2A, memory, planning - all out of scope);
it only knows two operations defined in an OpenAPI catalog.

* Workflow: [`agent-call.sw.yaml`](../src/main/resources/agent-call.sw.yaml)
* Catalog: [`agent-rest.yaml`](../src/main/resources/catalogs/agent-rest.yaml)
* Reference agent: [`AgentResource`](../src/main/java/org/acme/functions/AgentResource.java) (bundled mock, `/agent/sync` + `/agent/async`)

---

## The contract

| Operation | Semantics |
| :--- | :--- |
| `POST /agent/sync` | Workflow blocks; the HTTP response body becomes `agent_response` |
| `POST /agent/async` | Fire-and-continue: the agent answers `202`, performs the work later, and POSTs a completion CloudEvent to `callback_url` |

The request payload (`{"payload": {...}}` sync; `{callback_url, workflow_instance_id, payload}` async)
is opaque - the agent defines its own schema.

### Async completion event

The agent POSTs a structured CloudEvent (content-type `application/cloudevents+json`):

```json
{
  "specversion": "1.0",
  "type": "agent_response",
  "source": "",
  "kogitoprocrefid": "<workflow_instance_id>",
  "data": { "...agent response..." }
}
```

`kogitoprocrefid` is what SonataFlow uses to correlate the event with the **suspended**
workflow instance - no polling, no correlation tables in the workflow.

---

## How the workflow expresses both modes

```text
agent_call (public entry point)
  └── Validate Request / Validate Payload (switch)
      ├── Route Mode
      │   ├── sync  -> Call Agent Sync (operation)
      │   │             └── agentCatalog#agentSyncCall   -> .agent_response
      │   └── async -> Call Agent Async (callback)
      │                 ├── action: agentCatalog#agentAsyncCall
      │                 │     (callback_url + $WORKFLOW.instanceId + payload)
      │                 └── eventRef: agentResponseEvent  <- instance suspends here and
      │                                                     resumes when the event arrives
      ├── Invalid Request / Agent Call Failed (inject)   <- structured errors
```

Key fragments:

```yaml
- name: Call Agent Async
  type: callback
  action:
    functionRef:
      refName: agentAsyncCall
      arguments:
        callback_url: '(.callback_url // "http://localhost:8080/agent/response-event")'
        workflow_instance_id: '$WORKFLOW.instanceId'
        payload: '(.agent_request // {})'
  eventRef: agentResponseEvent
  eventDataFilter:
    toStateData: '.agent_response'
```

* `$WORKFLOW.instanceId` is the built-in handle the engine substitutes with the running
  instance's id - the agent echoes it back as `kogitoprocrefid`.
* `eventDataFilter.toStateData` stores the event's `data` into the workflow model, so the
  resumed instance outputs it as `agent_response`.

### Event transport

On plain Quarkus, the incoming channel is the `quarkus-http` connector (ships with
`sonataflow-quarkus` - no Kafka needed):

```properties
mp.messaging.incoming.agent_response.connector=quarkus-http
mp.messaging.incoming.agent_response.path=/agent/response-event
```

> [!IMPORTANT]
> The channel key (`agent_response`) must equal the workflow event definition's `type`.
> SonataFlow generates the message trigger against that name; a mismatched key silently
> skips the trigger at build time ("Skipping trigger ... as there is no default channel").

On OpenShift Serverless Logic the same event arrives through the platform's Knative Eventing
broker - the workflow YAML is identical, only the platform config differs.

---

## Try it

Synchronous:

```bash
curl -X POST http://localhost:8080/agent_call \
  -H 'Content-Type: application/json' \
  -d '{"mode": "sync", "agent_request": {"task": "summarize X"}}'
```

Asynchronous (returns while suspended; the event resumes it):

```bash
curl -X POST http://localhost:8080/agent_call \
  -H 'Content-Type: application/json' \
  -d '{
    "mode": "async",
    "agent_request": {"task": "summarize X"},
    "callback_url": "http://localhost:8080/agent/response-event"
  }'
```

To integrate a **real** agent, implement the two operations from
[`agent-rest.yaml`](../src/main/resources/catalogs/agent-rest.yaml) and point
`AGENT_BASE_URL` at it - the workflows need no changes.
