# Version-aware document model

Status: proposed implementation contract for `STUDIO-003`; read-only source, metadata, graph,
catalog, subflow, and dependency slices are implemented by `STUDIO-102` through `STUDIO-105`  
Scope: the first OpenWorkflow Studio authoring and diagnostics model

This document defines how the Studio reads the repository's canonical YAML/JSON
documents, projects them into typed workflow/catalog views, and writes changes without
silently losing source information. The raw document remains authoritative. A form or
graph is never serialized independently of the source representation.

## 1. Current repository inventory

The inventory below is derived from the six canonical files under `workflows/` and is the
minimum model coverage required before enabling mutating UI features.

### Document families and top-level fields

| Family | Files | Version marker | Top-level fields observed |
| --- | --- | --- | --- |
| Serverless Workflow 0.8 | `agent-call.sw.yaml`, `llm-chat.sw.yaml`, `sub_flows/boolean-decision.sw.yaml`, `sub_flows/choice-decision.sw.yaml` | `specVersion: '0.8'` | `id`, `version`, `specVersion`, `name`, `description`, `start`, `events`, `extensions`, `errors`, `functions`, `states` |
| OpenAPI catalog 3.0.3 | `catalogs/agent-rest.yaml`, `catalogs/openai-compatible.yaml` | `openapi: 3.0.3` | `openapi`, `info`, `servers`, `paths`, `components` |

### Reusable-subflow classification

Workflow documents remain `kind: workflow` in the API, with a separate `reusableSubflow` flag.
The flag is true for the repository convention `sub_flows/` and for any workflow that explicitly
declares `x-studio-reusable-subflow: true` at the document root. The explicit marker permits a
reusable subflow to live outside that directory without guessing from its filename; unknown
fields are preserved by source editing. The Studio uses this semantic flag for navigation,
contract views, and dependency relationships, with the directory convention retained as a
backward-compatible fallback for older API responses.

All six files use block YAML and the workflow files include comments, folded block
scalars, quoted and plain scalars, inline arrays, `${ ... }` expressions, extension
definitions, and nested objects. The catalogs include `$ref`, component schemas,
security schemes, callbacks, `oneOf`, enums, defaults, and `additionalProperties`.

### Workflow state inventory

| File | State names | Types | State fields observed |
| --- | --- | --- | --- |
| `agent-call.sw.yaml` | Validate Request; Validate Payload; Route Mode; Call Agent Sync; Call Agent Async; Invalid Request; Agent Call Failed | `switch` ×3, `operation`, `callback`, `inject` ×2 | `name`, `type`, `dataConditions`, `condition`, `transition`, `defaultCondition`, `actions`, `action`, `functionRef`, `refName`, `arguments`, `actionDataFilter`, `toStateData`, `useResults`, `onErrors`, `errorRef`, `end`, `eventRef`, `eventDataFilter`, `data` |
| `llm-chat.sw.yaml` | Validate Request; Call LLM; Invalid Request; LLM Call Failed | `switch`, `operation`, `inject` ×2 | Same switch/operation/inject fields; operation arguments include nested arrays and expressions |
| `boolean-decision.sw.yaml` | Validate Input; Ask Boolean Question; Evaluate Boolean Answer; Invalid Model Answer; Return Yes; Return No; Invalid Input | `switch` ×2, `operation`, `inject` ×4 | `dataConditions`, `defaultCondition`, `actions`, `functionRef`, `arguments`, `messages`, `actionDataFilter`, `toStateData`, `data`, `end`, expression-valued scalars |
| `choice-decision.sw.yaml` | Validate Input; Ask Choice Question; Validate Selected Option; Return Selected Option; Invalid Input; Invalid Model Answer | `switch` ×2, `operation`, `inject` ×3 | Same fields as Boolean Decision, plus `results` in `actionDataFilter` and `selected_option` projection |

The model must not restrict `type` to these observed values. These are the known 0.8
types for specialized views. Unknown state types are retained as generic nodes with
source editing and diagnostics.

### Definitions, transitions, and expressions

| File | Events | Extensions | Errors | Functions | Transition coverage |
| --- | --- | --- | --- | --- | --- |
| `agent-call.sw.yaml` | `agentResponseEvent`: `source`, `type` | `workflow-uri-definitions`, `definitions.agentCatalog` | `AgentHttpError`/`400`, `AgentServerError`/`500` | `agentSyncCall`, `agentAsyncCall` with `operation` | Conditional/default transitions, terminal states, error transitions, callback event reference |
| `llm-chat.sw.yaml` | None | `workflow-uri-definitions`, `definitions.openaiCatalog` | `LlmHttpError`/`400`, `LlmServerError`/`500` | `openaiChatCompletion` | Conditional/default transitions, error transitions, terminal states |
| `boolean-decision.sw.yaml` | None | `workflow-uri-definitions`, `definitions.openaiCatalog` | None | `openaiChatCompletion` | Conditional yes/no transitions, default/plain transitions, terminal states |
| `choice-decision.sw.yaml` | None | `workflow-uri-definitions`, `definitions.openaiCatalog` | None | `openaiChatCompletion` | Conditional selected-option transition, default/plain transitions, terminal states |

Observed expression sites are:

- Agent Call: mode validation, payload/callback validation, async routing, callback URL
  fallback, `$WORKFLOW.instanceId`, and `.agent_request // {}` payload forwarding.
- LLM Chat: message guardrails, model fallback, message truncation, temperature default,
  and `max_tokens` clamp.
- Boolean Decision: question validation, question prompt insertion, exact `yes`/`no`
  answer matching, and raw-answer extraction.
- Choice Decision: question/options validation, prompt composition, selected-option
  membership, and raw-answer extraction.

Expressions are user-authored text, not JavaScript. The model stores the original scalar
including its quote/style and a separately parsed representation only when the active
expression-language adapter supports it. The Studio must never evaluate an expression
merely to display a form or graph.

### Catalog inventory

`catalogs/agent-rest.yaml` contains OpenAPI 3.0.3 metadata, relative server `/`,
`POST /agent/sync` (`agentSyncCall`), `POST /agent/async` (`agentAsyncCall`), a callback
with CloudEvents media type, `AgentSyncRequest`, `AgentAsyncRequest`, and 200/202/400/500
responses. The request schemas use `payload`, `callback_url`, and
`workflow_instance_id`, with opaque object payloads.

`catalogs/openai-compatible.yaml` contains OpenAPI 3.0.3 metadata, relative server `/`,
`POST /chat/completions` (`chatCompletions`), `POST /embeddings` (`createEmbeddings`),
bearer security, and schemas `ChatCompletionRequest`, `ChatMessage`,
`ChatCompletionResponse`, `EmbeddingRequest`, and `EmbeddingResponse`. It uses required
fields, enum roles, `oneOf` input, defaults, open objects, and `$ref` links.

The catalog projection must retain callbacks, schemas, local references, security
requirements, and unknown OpenAPI fields even when the first form exposes only the
fields listed above.

## 2. Model layers and authority

```text
raw bytes/text
    -> lossless YAML CST + token index  (source and formatting authority)
    -> typed document projection       (forms, graph, dependencies, issues)
    -> UI-only indexes and layout      (never serialized into specifications)
```

### Source document and CST

```ts
type DocumentKind = 'workflow' | 'catalog'
type CompatibilityMode = 'editable' | 'partial' | 'source-readonly'

interface SourceDocument {
  uri: CanonicalDocumentUri
  kind: DocumentKind
  format: 'yaml' | 'json'
  rawText: string
  newline: 'lf' | 'crlf' | 'mixed'
  hasBom: boolean
  hasFinalNewline: boolean
  cst: LosslessCstDocument
  projection: WorkflowDocument | CatalogDocument | null
  compatibility: CompatibilityProfile
  diagnostics: Diagnostic[]
  revision: { contentHash: string; loadedAt: string }
}
```

The first YAML implementation uses `yaml@2`'s `parseDocument` plus its CST/token APIs.
The library documents comments and blank lines, node ranges, scalar styles, anchors,
aliases, tags, source tokens, line counters, and a CST retaining source whitespace. See
the [YAML documentation](https://eemeli.org/yaml/), [parse options](https://github.com/eemeli/yaml/blob/main/docs/03_options.md),
and [CST API](https://jsr.io/@eemeli/yaml/doc).

The adapter parses with `keepSourceTokens: true`, a `LineCounter`, strict error
collection, and the original source text. Each CST node wrapper stores its kind, exact
source range, raw slice, key/value children, comment tokens, anchor, tag, scalar style,
flow style, and unknown-field flag.

For an untouched document, export returns `rawText` exactly. For a supported edit, a
source-edit planner applies non-overlapping token/range patches from right to left. Whole
document stringify is never silently used as a save fallback. If the planner cannot
prove preservation, save is blocked behind an explicit proposed diff.

### Typed projections

The workflow projection contains `id`, `version`, `specVersion`, `name`, `description`,
`start`, events, extensions, errors, functions, states, and ordered unknown top-level
fields. Each known field is a `Field<T>` carrying missing/null/default/present state,
its CST source link, and its original scalar style.

Each state projection contains an opaque UI node ID, `name`, `type`, specialized kind,
conditions, default condition, actions, callback action, event references, data filters,
error handlers, transition/end/data fields, ordered unknown fields, and a source link.
Known specialized kinds are `switch`, `operation`, `callback`, and `inject`; all other
types are `generic` and remain visible without being mutated by specialized forms.

The catalog projection contains `openapi`, `info`, `servers`, `paths`, `components`,
optional `security`/`tags`/`externalDocs`, and ordered unknown fields. An operation keeps
method/path, `operationId`, parameters, request body, responses, callbacks, security,
unknown fields, and source links. `$ref` is a reference node, not an eagerly substituted
copy; local resolution is for navigation and validation only.

## 3. Preservation and identity rules

| Source feature | Required behavior |
| --- | --- |
| Comments and blank lines | Retain leading/trailing comments and inter-node spacing; show a diff if ownership becomes ambiguous |
| Key order | Preserve existing pair order; never sort on save |
| Quotes and scalar style | Preserve plain, single/double quote, literal, and folded style; warn before normalization |
| Anchors, aliases, tags, directives | Preserve names, tokens, `%YAML`, `%TAG`, `---`, and `...`; unsupported tags become generic read-only nodes |
| Unknown fields | Retain the raw subtree and relative order through every supported edit |
| Expressions | Preserve exact scalar text and quoting; validate placement but never evaluate in-browser |
| EOL/BOM/final newline | Preserve original newline style, BOM, and final-newline state |
| JSON | Keep JSON source mode separate; never convert JSON to YAML during save |

Identity round trip means parse then export without a mutation returns exactly the original
bytes. Mutation-preserving round trip means only the intended source range changes and all
unrelated tokens survive. If either claim cannot be proven, the UI requires explicit diff
confirmation.

UI identities are opaque and never written into specifications. Reconciliation uses
existing CST object identity, then document URI/document index/collection kind/sequence
occurrence, then a structural fingerprint, and finally a new ID. Rename operations carry
an old-to-new identity map so graph selection, diagnostics, forms, and undo history
survive. Reopening a file may create new UI IDs.

## 4. Diagnostics and exact mappings

```ts
type DiagnosticPhase = 'parse' | 'schema' | 'semantic' | 'compatibility' | 'runtime'
type DiagnosticSeverity = 'error' | 'warning' | 'info' | 'hint'

interface SourceRange {
  start: { offset: number; line: number; column: number }
  end: { offset: number; line: number; column: number }
  encoding: 'utf-16-code-units'
}

interface Diagnostic {
  id: string
  ruleId: string
  phase: DiagnosticPhase
  severity: DiagnosticSeverity
  message: string
  explanation?: string
  suggestedResolution?: string
  documentUri: CanonicalDocumentUri
  primaryRange?: SourceRange
  relatedRanges: { message?: string; range: SourceRange }[]
  fieldPath?: DocumentPath
  nodeId?: UiNodeId
  runtimeInstanceId?: string
  version?: string
  fixes?: SafeFix[]
  provenance: 'local-parser' | 'local-schema' | 'local-analyzer' | 'sonataflow'
}
```

Parse diagnostics use parser offsets and the smallest recoverable token. Schema
diagnostics point to the invalid key/value. Semantic diagnostics point to the broken
reference and relate the target definition when available. Compatibility diagnostics
point to `specVersion`, `openapi`, or the unsupported field. Runtime diagnostics retain
backend text and map to a state/function/operation only when the runtime supplies a
trustworthy identifier; they must not invent an exact range.

The read-only Studio implementation pins validation to `workflow-0.8-local-1` and
`openapi-3.x-local-1`. These profiles check required structure, state/start/transition
references, catalog operation responses, and local `$ref` targets. They inspect the parsed
canonical source tree only; external references are reported as unresolved and never fetched.
The shared rule-set manifest is [`validation-profile.json`](validation-profile.json); the
browser source, backend diagnostics, Maven properties, and CI drift gate all contain the same
profile and rule-set values.

The view index maps CST nodes to field paths and graph nodes, and maps diagnostics to one
or more source links. Source → form/graph focuses the linked field/node. Form/graph →
source selects the exact range. A graph element with multiple ranges uses the state or
action key as primary and transitions, conditions, and function references as related
ranges.

## 5. Version-aware behavior

| Document/version | Parse/view | Form/graph | Save |
| --- | --- | --- | --- |
| Serverless Workflow 0.8, known fields | Supported/full | Specialized 0.8 views | Enabled only through preservation/diff gates |
| Serverless Workflow 0.8, unknown fields/types | Supported/generic details | Known fields editable; unknown subtree retained; unknown state generic | Partial; block if edit may affect unknown semantics |
| Serverless Workflow 1.x or unknown major | YAML parse/source view | No normal mutation; compatibility warning | Read-only export; never migrate on ordinary save |
| OpenAPI 3.0.x | Supported/catalog view | Known operation/schema forms; extensions retained | Enabled only through preservation/diff gates |
| OpenAPI 3.1.x before a pinned validator | Parse/source/generic details | No schema-authoring guarantees | Source-read-only except explicit raw export |
| Invalid YAML/JSON or unsupported tags | Recovery source/diagnostics | No form/graph mutation | Copy/export original source only |

`specVersion` and `openapi` are never normalized or migrated automatically. A compatibility
profile identifies parser, schema, semantic-rule, and runtime-support versions. Forms and
graph controls are enabled only when that profile says the operation is supported.

## 6. Golden round-trip fixtures

The fixture baseline is under [`fixtures/round-trip/`](fixtures/round-trip/) and contains
exact copies of every current canonical workflow and catalog:

```text
0.8/agent-call.sw.yaml
0.8/llm-chat.sw.yaml
0.8/boolean-decision.sw.yaml
0.8/choice-decision.sw.yaml
openapi-3.0/agent-rest.yaml
openapi-3.0/openai-compatible.yaml
```

These are identity-round-trip inputs and expected outputs. The future parser harness must
read each file without normalization, parse it into the CST/model, export without a
mutation, compare bytes, and report the first differing offset. Mutation fixtures must
then cover scalar edit, state rename, state insertion, transition edit, catalog operation
edit, and unknown-field preservation. No mutating UI feature may be enabled until the
identity fixtures pass.

## 7. Acceptance traceability

This document covers the `STUDIO-003` requirements: repository inventory, a lossless CST
and typed projections, preservation rules, non-leaking identities, diagnostic types and
exact-range mappings, and version-specific supported/partial/read-only modes. The six
golden baseline fixtures are added before any mutating Studio UI exists. The parser
implementation and mutation assertions are explicit follow-up gates for `STUDIO-101` and
the source-editor spike.
