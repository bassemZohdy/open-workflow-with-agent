# OpenWorkflow Studio frontend

This is the isolated React/TypeScript/Vite frontend mounted at `/studio/`. The root
execution console remains at `/`.

## Commands

```bash
npm ci
npm run dev                 # Vite at http://localhost:5173/studio/
npm run typecheck
npm run lint
npm run test:unit -- --run
npm run build              # writes ../../target/studio-dist/ (without source maps)
```

From the repository root, `npm run dev:studio` starts Vite and `mvn quarkus:dev` together.
The development proxy forwards Studio, health, workflow, and execution requests to the
Quarkus server on `http://localhost:8080`; it does not proxy credentials to another host.
The Maven package copies only the production bundle into the Quarkus classpath. Run
`bash scripts/check-studio-bundle.sh` from the repository root after packaging to verify
that the copied bundle has no source maps or authored source files and has not drifted from
the generated `target/studio-dist/` output.

STUDIO-102 loads canonical documents through `GET /api/studio/v1/documents`, groups them by
kind and directory, and exposes client-side search/filter/deep-link behavior. STUDIO-103 adds
the selected-document source endpoint and viewer, with syntax-highlighted YAML/JSON, line
navigation, search, folding, copy, typed workflow metadata, state/function/event/error
summaries, generic extension details, and metadata-to-source links. STUDIO-202 adds an editable
source surface backed by per-document drafts, browser recovery, dirty-route guards, find/replace,
undo/redo, format-on-request, create/import/duplicate/rename/save/export/delete actions, save
diffs, live draft validation, and ETag conflict recovery. Autosave is configurable per browser
profile, remains disabled by default, validates drafts before saving, and uses the same ETag
conflict path. The response contract is documented in
`docs/studio/openapi/studio-api.yaml`; the server scans only the configured
`STUDIO_WORKSPACE_ROOT/workflows/` boundary and excludes generated resources. STUDIO-104 adds
a dependency-free SVG graph projection for 0.8 workflows with typed state nodes, labeled
branch/error/terminal edges, pan/zoom/fit controls, minimap, keyboard navigation, warnings,
selection details, source links, and a structured text alternative. The graph derives its state
inventory and basic relationships from the active in-memory draft, so graph and source edits do
not retain deleted or newly added canonical nodes. Form state selectors and draft validation also
observe that same source handoff. Draft validation returns the server-parsed `sourceTree`, allowing
advanced graph details to follow YAML actions, conditions, callbacks, and branches without a
second browser-side YAML parser.
The text outline exposes state selection, shared deletion, per-state Form actions, source links,
and relationship-to-Form handoff without requiring the SVG canvas.
STUDIO-105 adds an OpenAPI catalog projection with service metadata, servers, operations,
parameters, request/response schemas, callbacks, security, local-reference warnings, and
workflow operation backlinks. Subflow paths expose their contract fields and reuse the graph;
the dependency panel shows local inbound/outbound catalog and subflow references; canonical
workflow IDs are included in the workspace summary so `subFlowRef` links resolve reliably.
STUDIO-106
adds deterministic read-only validation: Jackson parser locations for YAML/JSON syntax, pinned
workflow 0.8 and OpenAPI 3.x local profiles, and an issue panel with severity/phase/search
filters and links into source, form, graph, and details views. No remote schema or catalog is
fetched while browsing. The semantic workflow pass also reports graph dead ends, self-loops,
unreachable states, switch coverage gaps, callback correlation gaps, unresolved local function/
event/error/catalog/subflow references, and preserved unknown extensions without evaluating
expressions or executing workflow side effects.
STUDIO-203 adds a source-preserving workflow metadata form for identity, versions, expression
language, start-state selection, keep-active behavior, timeouts, constants, annotations, and
extensions. Required fields and missing start-state references are blocked in the form, field
classification badges preserve unsupported top-level fields, and the selected specification
version provides inline examples and guidance. STUDIO-204 begins core state authoring with a
source-preserving state list: create, duplicate, rename, reorder, and reference-safe delete,
plus state type, direct transition, and terminal-state editing. Type-specific controls now edit
inject data and filters, operation actions/action modes, switch conditions and defaults, callback
actions/events/filters, timeouts, action retry/sleep definitions, and state error handlers while
preserving unsupported fields. The Graph view can add direct state connections against the active
draft and hands selected transition details to the Form view.
STUDIO-205 adds the same source-preserving lifecycle for reusable function, event, and error
definitions, including direct field editing, reference-aware rename, usage counts, and blocked
deletion when a definition is still referenced. Expression values remain authored text; the
backend validates supported expression-field placement and string shape without evaluating user
code.
STUDIO-206 adds profile-shaped controls for event, sleep, foreach, and parallel states, shared
timeout and compensation fields, and explicit guidance distinguishing schema validity from
SonataFlow runtime compatibility. Runtime support remains deployment-specific until exercised
against the target runner. The state form also exposes a guarded generic property editor for
valid 0.8 fields and preserved extensions that do not yet have specialized controls.
STUDIO-207 adds a compatibility-filtered Graph palette for the local 0.8 state types; palette
creation uses the same draft-preserving state patch path as Form authoring. Graph nodes can be
dragged or nudged with arrow keys on a 24px grid; positions are stored as browser-only Studio
layout metadata and never serialized into workflow specifications. Shift-click supports
multi-selection, while the Delete button or Delete key removes selected states through a
reference-safe transactional patch. Action, condition, error, and large relationship groups use
keyboard-accessible collapse/expand controls.
The state Form also exposes a version-aware 0.8 subflow action editor for operation and foreach
states. It selects locally discovered subflows by workflow id, preserves nested action filters and
neighboring source fields, previews declared inputs and outputs, and can navigate to the selected
target document. The target contract preview covers declared inputs, outputs, errors, and
timeouts, and labels each undeclared contract section explicitly. Existing unresolved references
remain visible for repair.
STUDIO-301 begins catalog authoring with a source-preserving Form projection for OpenAPI
`info.title`, `info.version`, `info.description`, and `servers`. Servers are edited as a JSON
array of objects for both YAML and JSON catalogs. The same Form can create an operation and edit
its path method metadata (`operationId`, summary, and description), enforcing unique operation
IDs while retaining request/response data. Parameters, request bodies, and responses now have
source-fragment editors (JSON values are type-checked). All OpenAPI reusable component
categories (schemas, responses, parameters, examples, request bodies, headers, security schemes,
links, and callbacks) have source-fragment editors and create controls. Workflow function definitions receive a searchable local operation datalist derived
from their `workflow-uri-definitions` aliases, while unresolved references remain editable.
Catalog validation now reports missing or blank operation IDs as schema warnings and duplicate
operation IDs as semantic errors, with source-linked diagnostics.
Workflow Forms can also create or retarget `workflow-uri-definitions` aliases from discovered
local catalog files without requiring fragile relative-path entry. Catalog operation details and
the catalog Form resolve local component `$ref` targets in memory to preview request/response
schemas and generate editable JSON example payloads; the generated examples remain draft-local
until deliberately added to canonical source.
Canonical catalog validation resolves local JSON pointers, reports missing local targets with
source-linked diagnostics, and marks external references as unresolved without fetching them;
unknown OpenAPI fields remain in the authored source.
When a catalog `operationId` or file path is renamed, the guarded workspace service updates
matching workflow bindings and URI definitions transactionally while preserving authored source;
renaming a workflow alias similarly updates its local operation bindings.
Deleting a referenced canonical document now opens a dependency-impact review with the concrete
inbound document paths returned by the workspace service before impact can be accepted.
Deleting a referenced workflow alias or catalog operation likewise lists the affected workflow
references before a user can accept the breaking draft change.
Subflow ID edits and filename renames rewrite inbound `subFlowRef` values transactionally, while
preserving dependent workflow comments and authored formatting.
The workspace save gate also rejects direct and indirect subflow dependency cycles before any
canonical bytes are replaced; validation reports the cycle as a semantic diagnostic.
The Graph view can extract a Shift-click-selected contiguous linear range into a new reusable
subflow, report function/event/error/subflow and expression dependencies, replace the range with
a versioned invocation, and refuse branching or data-filtered selections whose behavior needs
explicit input/output mapping. The caller and extracted source are written with rollback of the
new document if the caller save fails.
Catalog imports are local-file-only, limited to 2 MiB with extension/content-type checks, stored
under the configured workspace root, and shown with last-import provenance; remote URL imports
are not exposed.
