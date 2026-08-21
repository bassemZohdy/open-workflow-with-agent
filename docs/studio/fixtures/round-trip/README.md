# Studio round-trip fixture baseline

These files are byte-for-byte copies of the canonical documents under `workflows/` as
of the `STUDIO-003` model decision. They are golden inputs and expected identity outputs
for the future TypeScript CST parser.

| Fixture family | Canonical source | Fixture |
| --- | --- | --- |
| Serverless Workflow 0.8 | `workflows/agent-call.sw.yaml` | `0.8/agent-call.sw.yaml` |
| Serverless Workflow 0.8 | `workflows/llm-chat.sw.yaml` | `0.8/llm-chat.sw.yaml` |
| Serverless Workflow 0.8 | `workflows/sub_flows/boolean-decision.sw.yaml` | `0.8/boolean-decision.sw.yaml` |
| Serverless Workflow 0.8 | `workflows/sub_flows/choice-decision.sw.yaml` | `0.8/choice-decision.sw.yaml` |
| OpenAPI 3.0.3 | `workflows/catalogs/agent-rest.yaml` | `openapi-3.0/agent-rest.yaml` |
| OpenAPI 3.0.3 | `workflows/catalogs/openai-compatible.yaml` | `openapi-3.0/openai-compatible.yaml` |

The fixture test harness must compare raw bytes for identity round trips and add mutation
fixtures only after the source patch planner exists. Do not reformat these files while
updating the canonical workflow package; regenerate the fixture copy and review the full
diff when a canonical source intentionally changes.
