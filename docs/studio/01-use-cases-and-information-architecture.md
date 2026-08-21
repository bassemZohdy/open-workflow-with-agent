# Studio use cases and information architecture

Status: proposed foundation for `STUDIO-001`  
Scope: first release of the browser-based OpenWorkflow Studio

This document defines who the Studio serves, the journeys it must support, and the
navigation and states required before implementation begins. It is grounded in the
repository's canonical `workflows/` package: public workflows, reusable decision
subflows, and OpenAPI catalogs executed by the Quarkus/SonataFlow reference runner.

## Product boundary

The Studio is an authoring and diagnostics surface for workflow specifications. It
does not replace the SonataFlow runtime, deploy workflows, manage production schedules,
or provide Git mutation controls. The current execution console remains available
until the Studio supplies equivalent run and asynchronous monitoring capabilities.

`workflows/` is the only editable source boundary. The files mirrored under
`src/main/resources/` and generated deployment resources are derived artifacts and are
shown as synchronization status, not as separate authoring locations.

## Primary personas

| Persona | Goal | Core tasks | Needs to trust |
| --- | --- | --- | --- |
| Workflow author | Build or safely change a workflow | Create, edit, rename, connect states, bind catalog operations, validate, export | Edits preserve unsupported fields and do not silently rewrite YAML |
| Reviewer | Understand and assess a proposed workflow change | Discover references, inspect source and graph, compare versions, review diagnostics, export a diff | The graph and forms are projections of the same source document |
| Tester | Prove a workflow behaves as expected | Prepare an input, run sync/async scenarios, monitor callbacks, inspect output and errors | Runtime results are clearly separated from specification validity |
| Platform operator | Keep the workspace usable and safe | Configure the workspace root, inspect validation/sync status, control read-only or write-enabled mode | The Studio cannot browse arbitrary files or expose credentials |

The first release optimizes for a single active editor at a time. Concurrent edits are
handled with explicit conflict resolution; real-time collaboration is out of scope.

## Core journeys

### Create

1. The author selects **Create** and chooses Workflow, Subflow, or Catalog.
2. The Studio presents a minimal valid template for the selected Serverless Workflow
   `0.8` or OpenAPI version and asks for the canonical filename and identifier.
3. The author edits source or supported form fields; live diagnostics identify missing
   required values and invalid references.
4. Before saving, the Studio shows the exact proposed diff and any formatting or comment
   preservation warning.
5. Save writes only beneath the configured canonical workspace root and reports derived
   resource status separately.

### Discover

1. The author opens **Workspaces** and sees grouped Workflows, Subflows, and Catalogs,
   including files with parse errors or unsupported versions.
2. Search and filters narrow results by name, ID, specification version, state type,
   catalog operation, and validation state.
3. Selecting a document opens a stable deep link with metadata, source, relationships,
   and current issues.
4. A reference link navigates to the target document and exact source range without
   losing the originating context.

### Edit

1. The author opens a document in Source, Form, or Graph view.
2. All views operate on one in-memory document. Unknown extension fields remain visible
   in a generic section and are retained during supported edits.
3. Dirty state is shown per tab. Route changes, refresh, close, and document switches
   require an explicit choice when edits are unsaved.
4. Rename and delete actions show inbound and outbound references before applying a
   change; destructive actions are blocked or require explicit dependency resolution.

### Validate

1. The Studio parses the document locally and reports syntax, schema, semantic,
   compatibility, and runtime-support diagnostics as distinct categories.
2. Each issue includes severity, stable rule ID, explanation, suggested resolution,
   file, and source range when available.
3. Selecting an issue focuses the corresponding source range, form field, or graph node.
4. The author can validate the current document, its dependency closure, or the complete
   workspace without writing files or fetching remote schemas.

### Compare

1. The reviewer chooses **Compare** from a document's actions or a dirty editor.
2. The Studio presents a source diff and a structured summary of changed metadata,
   states, transitions, catalog bindings, and references.
3. If serialization could normalize comments, quotes, key order, scalar styles, anchors,
   aliases, tags, or unknown fields, the diff includes that impact and requires explicit
   confirmation before save.
4. A stale-save conflict offers reload, compare, merge, or save-copy choices.

### Test-run

1. The tester opens **Run** from a valid workflow and selects an input form or raw JSON.
2. The Studio validates the payload, displays the target workflow and execution mode,
   then hands execution to the existing Quarkus/SonataFlow runner.
3. The execution panel shows instance ID, status, timestamps, output, errors, and raw
   response. Async runs show callback correlation and suspension/resumption state.
4. Runtime failures link back to the relevant state, function, catalog operation, or
   subflow when the runner provides enough information.

### Import

1. The author selects **Import** and supplies an uploaded YAML or JSON document within
   configured size and type limits.
2. The Studio parses it in an isolated draft and displays provenance, detected document
   type, version, and diagnostics.
3. The author chooses a canonical destination and reviews the complete create diff.
4. Import never fetches remote references by default and never forwards Studio or
   workflow credentials.

### Export

1. The author selects **Export/Download** for the current source document or a selected
   workspace package.
2. The Studio exports the canonical document bytes currently represented by the source
   view and identifies any generated resources as derived, not part of the source
   package unless explicitly requested.
3. Unsupported-version documents can be exported from protected source mode without
   being normalized or migrated.

## Navigation model

The global shell has a workspace switcher, mode indicator, search, issue count, and
user/help actions. The primary navigation is:

| Area | Purpose | First-release routes |
| --- | --- | --- |
| Workflows | Discover and edit executable workflow documents | `/studio/workflows`, `/studio/workflows/:path` |
| Subflows | Discover and edit reusable subflow documents | `/studio/subflows`, `/studio/subflows/:path` |
| Catalogs | Inspect and edit local OpenAPI catalogs and operations | `/studio/catalogs`, `/studio/catalogs/:path` |
| Validation | Review document, dependency, or workspace diagnostics | `/studio/validation` |
| Settings | Workspace root, access mode, compatibility profile, and display preferences | `/studio/settings` |

Document routes open a shared workspace layout:

```text
Global shell
├── Explorer / document list
├── Context header: identity, version, dirty state, sync status, actions
├── Main view: Source | Form | Graph | Details
├── Issues panel: diagnostics and navigation
└── Execution panel: Run | history | async monitoring
```

Catalogs use Source, Operations, Schemas, Dependencies, and Issues tabs. Subflows use
Source, Metadata, Graph, Dependencies, and Issues. Unsupported or unparseable files
open with Source and Details only; edit controls are disabled until compatibility or
parse problems are resolved.

## Required non-happy-path states

| State | Entry condition | User experience | Allowed actions |
| --- | --- | --- | --- |
| Empty workspace | No canonical documents are found | Explain the workspace boundary and offer Create or Import | Create, Import, Settings |
| First run | Studio has no saved local preferences or workspace context | Short orientation covering canonical source, views, validation, and access mode | Continue, open Settings |
| No access | User or server policy denies workspace access | Explain whether the workspace is disabled, read-only, or unavailable; do not reveal paths or contents | Retry, view permitted documents, Settings if authorized |
| Parse error | YAML/JSON cannot be parsed | Preserve the original source, show line/column diagnostics, and offer download/copy | Source view, copy, export; no form/graph mutation |
| Unsupported version | Document version is outside the active compatibility profile | Show a clear version warning and protected source view; never migrate on open or save | Inspect, compare, export; no normal save |
| Offline/unavailable API | Browser cannot reach the workspace API or runner | Preserve open in-memory content and explain which actions are unavailable; never imply a save succeeded | Inspect cached content, copy/export draft, retry |
| Unsaved changes | A document or draft differs from its last loaded/saved version | Identify affected tab and show Save, Discard, Compare, and Cancel choices | Resolve explicitly before navigation or reload |
| Stale save conflict | Workspace content changed since the editor loaded it | Show server/client versions or hashes and a three-way comparison | Reload, Compare, Merge, Save copy, Cancel |
| Derived resources stale | Canonical source changed but generated mirror/manifest is not synchronized | Show the canonical save as successful and derived status as stale with remediation | Sync/request regeneration, inspect status |

## MVP success measures

These measures are evaluated in a clean packaged Quarkus/SonataFlow environment using
representative repository workflows, subflows, and catalogs. A baseline is recorded
before usability testing; the targets below define MVP readiness.

| Measure | Target | Evidence |
| --- | --- | --- |
| Locate a reference | At least 90% of representative users locate the target catalog operation or subflow in 60 seconds or less | Timed task test using `catalogAlias#operationId` and subflow references |
| Produce a valid edit | At least 90% of users complete a specified safe edit and reach a schema/semantic-valid document without hand-editing generated copies | Task completion plus validator result and canonical/derived drift checks |
| Diagnose a validation error | At least 80% of users identify the cause and next action within 90 seconds | Issue-to-source navigation task with seeded syntax, reference, and version errors |
| Preserve source fidelity | 100% of golden round-trip fixtures retain required comments, unknown fields, and supported formatting characteristics, or the UI blocks save behind an explicit diff confirmation | Automated fixture comparison and manual warning assertion |
| Protect workspace boundaries | 100% of traversal, absolute-path, disallowed-extension, and unauthorized-mode tests are rejected without writes | API security test suite and audit event review |
| Keep runtime distinction clear | 100% of test tasks label specification validity separately from runtime/deployment/execution status | E2E assertions and usability review |

## Acceptance traceability

This document satisfies the design deliverables for `STUDIO-001`: personas are defined
above; all create, discover, edit, validate, compare, test-run, import, and export
journeys are documented; navigation covers Workflows, Subflows, Catalogs, Validation,
and Settings; required empty/first-run/no-access/parse-error/unsupported-version/offline
states are specified; and measurable MVP success targets are recorded.
