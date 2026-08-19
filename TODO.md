# OpenWorkflow Studio Backlog

This backlog defines a browser-based studio for creating, editing, viewing, validating,
and testing the Open Workflow specification files in this repository. It also retains the
remaining maintenance work for the current reference implementation.

## Product outcome

Users can discover workflows, catalogs, and subflows; understand their relationships;
edit them safely in visual, form, and source views; validate references and schemas; and
run them with the existing Quarkus/SonataFlow test runner without hand-editing generated
resource copies.

## Delivery principles and scope

- `workflows/` remains the only canonical source directory. Files under
  `src/main/resources/` and generated SonataFlow deployment resources remain generated.
- The first supported authoring dialect is the repository's Serverless Workflow `0.8`
  YAML as executed by SonataFlow. The editor must never silently migrate it to a newer
  dialect.
- The document model must be version-aware. Unknown or unsupported specification versions
  open in protected source/read-only mode with a clear compatibility warning.
- The raw document is the source of truth. Forms and diagrams are projections of the same
  in-memory document and must preserve unknown extension fields.
- Comment, quoting, key-order, scalar-style, and formatting preservation is a release gate
  for visual/form editing. If exact round-trip preservation cannot be guaranteed, the UI
  must show the proposed diff and require explicit confirmation before normalization.
- The proposed architecture is a dedicated TypeScript frontend served at `/studio/` and a
  guarded Quarkus workspace API under `/api/studio/`. Record the final choice in an ADR
  before implementation.
- The current execution console remains available until the Studio provides equivalent
  run and async-monitoring capabilities.
- Persistent editing is enabled only for an explicitly configured workspace root. It must
  not expose arbitrary server files or provide Git commit/push controls.
- Quarkus/SonataFlow is the required development and acceptance environment. OpenShift
  Serverless Logic and Knative checks remain optional platform smoke tests.

Compatibility references:

- Existing files target the [Serverless Workflow 0.8 release line](https://github.com/serverlessworkflow/specification/releases).
- The upstream project is now [Open Workflow](https://github.com/open-workflow-specification/specification)
  and has a newer 1.x schema. Native 1.x authoring is a separate compatibility project.

## Priority and completion rules

- **P0**: required for the first usable release or to prevent data loss/security issues.
- **P1**: required for a complete team workflow after the MVP.
- **P2**: useful enhancement that can follow the first production-ready release.
- A task is complete only when its implementation, tests, documentation, and accessibility
  implications are addressed.
- A milestone is complete only when its acceptance criteria pass from a clean checkout.

## Existing project maintenance

### MAINT-001 — OWASP dependency-check verification (P0)

The CI workflow passes the repository `NVD_API_KEY` secret to OWASP Dependency-Check with
`nvdApiKeyEnvironmentVariable=NVD_API_KEY`. The wiring is confirmed, but NVD rejected the
currently configured key as invalid.

- [ ] Replace `NVD_API_KEY` with a valid, activated NVD API key and rerun CI.
- [ ] Confirm OWASP Dependency-Check completes with `-DfailBuildOnCVSS=7`.
- [ ] Remediate any CVSS >= 7 findings or add narrowly scoped, documented suppressions;
      never lower the threshold.

### MAINT-002 — Optional platform validation (P2)

- [ ] When an OpenShift Serverless Logic and Knative Eventing environment is available,
      verify delivery of the `agent_response` CloudEvent through the platform broker.
- [ ] Verify mounted `classpath:/catalogs/...` resources resolve in that environment.
- [ ] Document environment-specific setup and results without making this a gate for the
      Quarkus/SonataFlow test environment.

### MAINT-003 — Optional test optimization (P2)

- [ ] Parallelize async tests if suite duration becomes a bottleneck.
- [ ] Keep per-instance callback dispatch and correlation tests deterministic under
      concurrent execution.

## Milestone 0 — Product and architecture foundation

### STUDIO-001 — Confirm use cases and information architecture (P0)

- [ ] Define primary personas: workflow author, reviewer, tester, and platform operator.
- [ ] Document create, discover, edit, validate, compare, test-run, import, and export
      journeys.
- [ ] Define navigation for Workflows, Subflows, Catalogs, Validation, and Settings.
- [ ] Define empty, first-run, no-access, parse-error, unsupported-version, and offline
      experiences.
- [ ] Define MVP success measures, including time to locate a reference, produce a valid
      edit, and diagnose a validation error.

### STUDIO-002 — Record frontend and build architecture (P0)

- [ ] Write an ADR comparing a framework-based TypeScript application with extending the
      current static HTML console.
- [ ] Select and pin the frontend framework, package manager, Node.js version, build tool,
      test runner, and lint/format rules.
- [ ] Evaluate source editor components for YAML diagnostics, large-file performance,
      accessibility, theming, and bundle size.
- [ ] Evaluate diagram libraries for keyboard interaction, custom state nodes, ports,
      auto-layout, minimap, and rendering performance.
- [ ] Define how Maven builds and packages compiled frontend assets into the Quarkus JAR.
- [ ] Define development proxying and one-command local startup.
- [ ] Create a dependency upgrade and browser-support policy.

### STUDIO-003 — Define the version-aware document model (P0)

- [ ] Inventory every field, state type, action, transition, extension, and expression used
      by the current workflows, subflows, and catalogs.
- [ ] Define a lossless YAML concrete-syntax-tree layer and a typed workflow projection.
- [ ] Preserve comments, anchors, aliases, tags, scalar styles, ordering, quotes, and unknown
      fields through source/form/diagram round trips.
- [ ] Define stable internal node identities that do not leak into saved specifications.
- [ ] Define parse, schema, semantic, compatibility, and runtime diagnostic types.
- [ ] Define mappings between diagnostics and exact source ranges, form fields, and graph
      nodes.
- [ ] Define supported, partially supported, and read-only behaviors per specification
      version.
- [ ] Add golden round-trip fixtures before building mutating UI features.

### STUDIO-004 — Define workspace API and persistence behavior (P0)

- [ ] Specify APIs to list, read, create, validate, update, rename, and delete workflow and
      catalog documents.
- [ ] Specify content types, normalized error responses, request IDs, and API versioning.
- [ ] Use content hashes or ETags for optimistic concurrency and return a resolvable
      conflict response for stale saves.
- [ ] Define atomic-save behavior, temporary-file cleanup, backup/recovery, and deletion to
      a recoverable trash location.
- [ ] Define how canonical saves trigger or request runner-resource and SonataFlow manifest
      regeneration.
- [ ] Decide whether generated files update on every save, on explicit sync, or during the
      build; expose sync status in the UI.
- [ ] Define file naming, allowed extensions, maximum document size, and duplicate-name
      rules.
- [ ] Publish an OpenAPI contract for `/api/studio/`.

### STUDIO-005 — Establish UX and visual foundations (P1)

- [ ] Define page layouts for explorer, source editor, form editor, graph, details, issues,
      diff, and execution panels.
- [ ] Define reusable state, transition, catalog, operation, event, and error visual tokens.
- [ ] Add light/dark themes and a high-contrast-safe color palette.
- [ ] Define keyboard shortcuts without overriding browser or assistive-technology commands.
- [ ] Meet WCAG 2.2 AA for focus, contrast, semantics, labels, status announcements, and
      keyboard-only operation.
- [ ] Support desktop authoring and useful tablet/read-only layouts; document the minimum
      supported viewport.

### Milestone 0 acceptance criteria

- [ ] Architecture, persistence, security boundaries, version policy, and UX navigation are
      captured in approved ADRs or design notes.
- [ ] Lossless round-trip spikes pass against every repository workflow and catalog.
- [ ] API and UI package boundaries are agreed before production implementation starts.

## Milestone 1 — Read-only workspace and visualization

### STUDIO-101 — Scaffold and integrate the Studio application (P0)

- [ ] Create the frontend workspace with reproducible locked dependencies.
- [ ] Serve the production build at `/studio/` with correct history fallback and base paths.
- [ ] Add local development commands, Quarkus API proxying, and hot reload.
- [ ] Add global error handling, loading states, notifications, and a recoverable fatal-error
      screen.
- [ ] Preserve the existing root execution console and links between both interfaces.

### STUDIO-102 — Build the workspace explorer (P0)

- [ ] List canonical workflows, subflows, and catalogs from the workspace API.
- [ ] Group documents by type and directory without assuming only the current folder shape.
- [ ] Add search and filters for name, ID, version, state type, catalog, and validation state.
- [ ] Show modified time, file size, spec version, parse status, and generated-sync status.
- [ ] Add keyboard navigation, stable selection, refresh, and deep links to a document.
- [ ] Show unparseable and unsupported files instead of silently omitting them.

### STUDIO-103 — Add source and metadata views (P0)

- [ ] Render syntax-highlighted YAML/JSON with line numbers, search, folding, and copy.
- [ ] Display workflow ID, name, description, version, specification version, start state,
      timeouts, constants, annotations, and extensions when present.
- [ ] Display state counts, terminal states, functions, events, errors, catalogs, and subflow
      references.
- [ ] Link metadata and reference selections to exact source locations.
- [ ] Render unsupported fields safely in a generic details view.

### STUDIO-104 — Add workflow graph visualization (P0)

- [ ] Render start, state, transition, and end relationships from existing 0.8 workflows.
- [ ] Provide distinct nodes for inject, switch, operation, and callback states used by the
      repository.
- [ ] Render conditions, default branches, actions, event waits, and terminal outcomes.
- [ ] Add zoom, fit, pan, minimap, auto-layout, focus navigation, and a textual graph
      alternative.
- [ ] Highlight the selected source range and details when a graph element is selected.
- [ ] Represent unknown state types as generic nodes without dropping their transitions.
- [ ] Warn about disconnected and unreachable nodes without blocking display.

### STUDIO-105 — Add catalog and subflow viewers (P0)

- [ ] Parse local OpenAPI 3.x YAML/JSON catalog files.
- [ ] List service metadata, servers, paths, methods, `operationId` values, parameters,
      request bodies, responses, and schemas.
- [ ] Cross-link workflow functions such as `catalogAlias#operationId` to catalog operations.
- [ ] Show unresolved catalog aliases, files, operations, and local `$ref` targets.
- [ ] Identify subflow documents and show their metadata, inputs, outputs, start state, and
      workflow graph.
- [ ] Add a dependency panel for inbound/outbound catalog and subflow references.

### STUDIO-106 — Add read-only diagnostics (P0)

- [ ] Validate YAML/JSON syntax and show line/column diagnostics.
- [ ] Validate supported workflow versions with a pinned local schema.
- [ ] Validate OpenAPI catalog documents with a pinned local validator.
- [ ] Show errors and warnings in an issue panel with file, source range, rule, severity,
      explanation, and suggested resolution.
- [ ] Filter issues and navigate bidirectionally among issue, source, form, and graph views.
- [ ] Keep validation local and deterministic; viewing files must not fetch remote schemas.

### Milestone 1 acceptance criteria

- [ ] Every canonical repository workflow, subflow, and catalog opens without data mutation.
- [ ] Source, metadata, graph, catalog, dependency, and issue views cross-navigate correctly.
- [ ] Parse failures and unsupported versions are visible and recoverable.
- [ ] Read-only Studio E2E tests pass in the packaged Quarkus application.

## Milestone 2 — Safe workflow authoring

### STUDIO-201 — Implement the guarded workspace API (P0)

- [ ] Restrict all operations to configured roots under canonical `workflows/` directories.
- [ ] Reject absolute paths, traversal, encoded traversal, null bytes, disallowed extensions,
      symlinks escaping the root, and case-normalization bypasses.
- [ ] Add list/read/create/update/rename/delete endpoints matching the approved contract.
- [ ] Use atomic replacement and preserve file permissions where supported.
- [ ] Enforce ETag/content-hash preconditions on mutations.
- [ ] Return both server and client versions, or a three-way merge input, on save conflicts.
- [ ] Make deletion recoverable and prevent deletion while referenced unless the user
      explicitly resolves or accepts the dependency impact.
- [ ] Regenerate or mark stale all derived runner/deployment resources after canonical
      mutations.
- [ ] Emit structured audit events without document contents, credentials, or workflow
      input values.

### STUDIO-202 — Add source editing and document lifecycle (P0)

- [ ] Add Create Workflow, Create Subflow, Create Catalog, Import, Duplicate, Rename, Save,
      Save As, Export/Download, and Delete actions.
- [ ] Provide minimal valid templates derived from repository conventions.
- [ ] Add editable YAML/JSON source with live parse and schema diagnostics.
- [ ] Track dirty state per open tab and protect refresh, close, route changes, and document
      switches with unsaved edits.
- [ ] Add undo/redo, find/replace, format-on-request, and configurable autosave disabled by
      default.
- [ ] Show a source diff before save and a second warning when formatting/comments could
      change.
- [ ] Resolve optimistic-concurrency failures with reload, compare, merge, and save-copy
      choices.
- [ ] Restore recoverable drafts after browser or development-server interruption.

### STUDIO-203 — Add workflow metadata and start configuration forms (P0)

- [ ] Edit ID, name, description, workflow version, spec version, expression language,
      annotations, and extensions.
- [ ] Edit start-state configuration and prevent references to missing states.
- [ ] Edit constants, timeouts, keep-active behavior, and other supported top-level fields.
- [ ] Distinguish required, optional, inherited/defaulted, unsupported, and extension fields.
- [ ] Show inline help and examples based on the selected specification version.

### STUDIO-204 — Add core state and transition authoring (P0)

- [ ] Create, duplicate, rename, reorder, and delete states.
- [ ] Edit inject-state data and merge behavior.
- [ ] Edit operation-state actions, action data filters, retries, sleep intervals, and
      transition/end behavior supported by the runtime.
- [ ] Edit switch-state data conditions, event conditions where supported, default branch,
      transition, and end definitions.
- [ ] Edit callback-state action, callback event, event data filtering, timeouts, and
      transition/end behavior.
- [ ] Edit state error handlers and references to top-level errors.
- [ ] Add transition connections in the graph and edit their details in forms.
- [ ] Update all internal references when a state is renamed.
- [ ] Block or explicitly repair dangling references before destructive state changes.
- [ ] Preserve unsupported state fields during supported-field edits.

### STUDIO-205 — Add reusable definition authoring (P0)

- [ ] Create, edit, reorder, rename, and delete function definitions.
- [ ] Create, edit, reorder, rename, and delete event definitions.
- [ ] Create, edit, reorder, rename, and delete error definitions.
- [ ] Update references transactionally when a reusable definition is renamed.
- [ ] Show usage counts and navigate to every reference before deletion.
- [ ] Treat expressions as user-authored text while validating placement and expected
      expression result shape where possible.
- [ ] Provide safe expression examples without evaluating arbitrary code in the browser or
      server.

### STUDIO-206 — Add advanced 0.8 authoring (P1)

- [ ] Add supported event, sleep, foreach, parallel, and subflow state forms after verifying
      SonataFlow runtime compatibility.
- [ ] Add branch, iteration, completion, compensation, and timeout controls for each state
      type that supports them.
- [ ] Add generic property editing for valid 0.8 fields not yet represented in specialized
      forms.
- [ ] Document runtime limitations separately from schema validity.

### STUDIO-207 — Add visual editing ergonomics (P1)

- [ ] Add a palette filtered by the active specification/runtime compatibility profile.
- [ ] Support keyboard and pointer creation, connection, movement, multi-selection, and
      deletion.
- [ ] Add snap/alignment helpers and persist UI-only layout outside canonical specification
      semantics.
- [ ] Add collapse/expand for action-heavy states and large branch groups.
- [ ] Keep graph edits, forms, source, diagnostics, and undo history synchronized.
- [ ] Ensure every visual edit has an accessible non-graph equivalent.

### Milestone 2 acceptance criteria

- [ ] Users can create, source-edit, form-edit, graph-edit, rename, save, export, and recover
      a supported workflow without losing comments or unknown fields.
- [ ] Concurrent edits cannot silently overwrite newer workspace content.
- [ ] Path, symlink, content-size, extension, and write-mode controls have security tests.
- [ ] Generated resources are synchronized or clearly reported stale after every save.

## Milestone 3 — Catalogs and subflows

### STUDIO-301 — Implement catalog management (P0)

- [ ] Create and edit local OpenAPI catalog metadata, servers, paths, operations, parameters,
      request bodies, responses, schemas, and reusable components.
- [ ] Validate uniqueness and presence of `operationId` for callable operations.
- [ ] Add `workflow-uri-definitions` aliases and select local catalog files without typing
      fragile relative paths.
- [ ] Bind workflow functions to `catalogAlias#operationId` through a searchable operation
      picker.
- [ ] Preview request/response schemas and generate editable example payloads.
- [ ] Resolve and validate local `$ref` values while preserving unsupported OpenAPI fields.
- [ ] Update dependent workflow references when aliases, files, or operations are renamed.
- [ ] Show impact analysis before deleting a referenced alias, catalog, or operation.

### STUDIO-302 — Secure optional catalog imports (P1)

- [ ] Import uploaded OpenAPI YAML/JSON with size and content-type limits.
- [ ] Keep remote URL import disabled by default.
- [ ] If enabled, enforce HTTPS, host allowlists, DNS/IP rebinding defenses, private-address
      blocking, redirect limits, response-size limits, and short timeouts.
- [ ] Never forward Studio, workflow, or user credentials to imported URLs.
- [ ] Store imported content locally so normal viewing and validation remain deterministic.
- [ ] Display provenance and last-import metadata without exposing authentication material.

### STUDIO-303 — Implement subflow management (P0)

- [ ] Define how a file is classified as a workflow versus reusable subflow without relying
      only on its directory name.
- [ ] Create subflows from a minimal template and from a selected workflow-state range.
- [ ] Add a version-aware subflow invocation editor using only syntax verified against the
      0.8 schema and SonataFlow runtime.
- [ ] Select a target subflow from the workspace and navigate directly to it.
- [ ] Define and display input arguments, output mapping, errors, and timeout expectations.
- [ ] Build an inbound/outbound dependency graph across all workflows and subflows.
- [ ] Detect direct and indirect dependency cycles before save.
- [ ] Update references transactionally when a subflow ID or filename changes.
- [ ] Show impact analysis before deleting a referenced subflow.

### STUDIO-304 — Add extraction and reuse assistance (P2)

- [ ] Extract selected connected states into a new subflow while preserving behavior.
- [ ] Calculate required inputs, produced outputs, referenced functions/events/errors, and
      unresolved external dependencies.
- [ ] Replace the selected states with a subflow invocation and show the complete diff.
- [ ] Support copying reusable definitions or keeping explicit external dependencies.
- [ ] Abort the extraction without writes if behavior-preserving conversion is uncertain.

### Milestone 3 acceptance criteria

- [ ] Users can create a catalog, bind a workflow action to an operation, and navigate both
      directions without hand-editing reference strings.
- [ ] Users can create, reference, rename, inspect, and safely delete subflows.
- [ ] Missing operations, broken files, broken aliases, cycles, and incompatible contracts
      are detected before save or clearly marked as unresolved.

## Milestone 4 — Validation and Quarkus/SonataFlow testing

### STUDIO-401 — Implement semantic workflow validation (P0)

- [ ] Validate unique IDs/names and a valid start state.
- [ ] Validate transition targets, terminal behavior, unreachable states, dead ends, and
      accidental self-loops.
- [ ] Validate function, event, error, catalog alias, operation, and subflow references.
- [ ] Validate switch default/condition coverage and report obviously unreachable branches.
- [ ] Validate callback event correlation requirements used by the current runner.
- [ ] Validate input/output filters and expression placement without pretending to fully
      evaluate external runtime data.
- [ ] Validate repository-specific extensions and preserve unknown extensions as warnings
      or informational diagnostics.
- [ ] Assign stable rule IDs, severities, documentation, and suppressibility policies.

### STUDIO-402 — Add validation workflows and quick fixes (P1)

- [ ] Validate unsaved in-memory documents without writing them to disk.
- [ ] Validate the current document, related dependency closure, or the entire workspace.
- [ ] Add safe quick fixes for missing defaults, broken renames, duplicate names, and
      removable unreachable transitions.
- [ ] Preview every multi-location quick fix as a diff.
- [ ] Export diagnostics in a CI-friendly format such as SARIF or machine-readable JSON.
- [ ] Keep browser, backend, Maven, and CI validation rule versions aligned.

### STUDIO-403 — Integrate SonataFlow compile/runtime validation (P0)

- [ ] Add a guarded endpoint or process boundary for validating a saved workflow with the
      same Quarkus/SonataFlow version used by the project.
- [ ] Separate specification-valid, runtime-supported, deployment-valid, and execution-ready
      statuses.
- [ ] Map compiler/runtime messages back to document source and graph elements when possible.
- [ ] Prevent validation from mutating canonical files or executing workflow side effects.
- [ ] Add timeout, output-size, concurrency, and resource controls around runtime validation.

### STUDIO-404 — Integrate execution and debugging (P0)

- [ ] Move or integrate the current LLM chat, synchronous agent, and asynchronous agent
      execution presets into the Studio.
- [ ] Generate an input form from available schema hints and retain a raw JSON mode.
- [ ] Validate request payloads before execution.
- [ ] Display instance ID, state/status, start/end times, outputs, errors, and raw response.
- [ ] Support async callback monitoring and correlation without polling indefinitely.
- [ ] Add cancel/stop controls only when the runtime provides safe semantics.
- [ ] Link execution errors to source, state, function, catalog operation, or subflow where
      correlation is available.
- [ ] Never persist API keys, bearer tokens, or workflow input secrets in files, URLs,
      logs, analytics, or long-lived browser storage.

### Milestone 4 acceptance criteria

- [ ] Syntax, schema, semantic, catalog, subflow, and runtime diagnostics are clearly
      distinguished and navigable.
- [ ] Existing LLM, sync-agent, async-agent, callback, and validation scenarios run through
      the Studio against the Quarkus/SonataFlow runner.
- [ ] Runtime validation is bounded and cannot trigger normal workflow side effects.

## Milestone 5 — Security, quality, packaging, and release

### STUDIO-501 — Harden authentication and browser security (P0)

- [ ] Disable Studio write APIs by default outside explicit development/test configuration.
- [ ] Protect read and write APIs consistently with the configured utility API key or the
      project's future identity provider.
- [ ] Separate read, edit, execute, and administration authorization capabilities.
- [ ] Add CSRF defenses and strict Origin/Host validation for state-changing requests.
- [ ] Add a restrictive Content Security Policy and avoid unsafe inline script execution.
- [ ] Escape or sanitize workflow, Markdown, OpenAPI, expression, error, and runtime output
      before rendering.
- [ ] Add rate, concurrency, request-size, and execution-duration limits.
- [ ] Prevent secrets from entering browser history, telemetry, stack traces, or audit logs.
- [ ] Document reverse-proxy, TLS, same-origin, and production deployment requirements.

### STUDIO-502 — Build automated test coverage (P0)

- [ ] Add representative and malformed workflow, subflow, catalog, unsupported-version, and
      large-document fixtures.
- [ ] Add parser/projection/serializer property and golden round-trip tests.
- [ ] Add unit tests for every supported field editor and graph mutation.
- [ ] Add API tests for path traversal, symlink escapes, ETags, atomic writes, conflict
      handling, recovery, limits, authentication, and audit redaction.
- [ ] Add component tests for explorer, source editor, forms, graph, issues, diff, and
      execution views.
- [ ] Add Playwright E2E scenarios for view, create, edit, validate, save, reload, conflict,
      rename, import/export, catalog binding, subflow dependency, and execution.
- [ ] Add automated accessibility checks plus manual keyboard and screen-reader acceptance.
- [ ] Add performance budgets for initial bundle, workspace listing, parse/validation, graph
      layout, and editing a documented large-workflow size.
- [ ] Add visual regression tests only for stable, high-value layouts.
- [ ] Keep current Quarkus runner and legacy console scenarios as regression coverage until
      the console is formally retired.

### STUDIO-503 — Integrate CI, packaging, and supply-chain checks (P0)

- [ ] Run frontend formatting, lint, type checking, unit tests, production build, and E2E
      tests in CI.
- [ ] Verify frontend lockfile integrity and pin CI actions/tool versions.
- [ ] Package only production frontend assets and required schemas in the Quarkus artifact.
- [ ] Add a generated-asset drift check for Studio bundles and workflow runner resources.
- [ ] Include frontend dependencies in dependency, license, and vulnerability reporting.
- [ ] Generate a software bill of materials covering backend and frontend dependencies.
- [ ] Verify container images run as non-root with a read-only application filesystem except
      for explicitly mounted editable workspaces.
- [ ] Test the packaged JAR and container with Studio read-only and write-enabled profiles.

### STUDIO-504 — Complete documentation and release operations (P0)

- [ ] Update the README with the Studio feature matrix, quick start, supported versions,
      limitations, and links to detailed guides.
- [ ] Write user guides for browsing, authoring, catalogs, subflows, validation, diff/conflict
      resolution, and execution.
- [ ] Write administrator guidance for workspace mounts, read-only/write modes,
      authentication, limits, backups, reverse proxying, and OpenShift deployment.
- [ ] Document the workspace API and extension points for validators, state editors, catalog
      providers, and version adapters.
- [ ] Write contributor guidance for frontend setup, architecture, generated assets, tests,
      accessibility, and release checks.
- [ ] Add migration/recovery guidance and a compatibility matrix for Studio, specification,
      SonataFlow, Quarkus, Java, Node.js, and supported browsers.
- [ ] Define release versioning, changelog, deprecation, support, telemetry, and incident
      response policies.

### STUDIO-505 — Release readiness review (P0)

- [ ] Complete threat modeling for workspace access, document rendering, imports, runtime
      execution, secrets, and generated resources.
- [ ] Complete accessibility and supported-browser acceptance.
- [ ] Complete data-loss, concurrent-edit, backup, restore, and crash-recovery exercises.
- [ ] Verify all supported repository documents round-trip with no unintended semantic or
      formatting changes.
- [ ] Verify clean-checkout build, test, package, container, and documentation procedures.
- [ ] Resolve all P0 defects and document accepted residual risks.

### Milestone 5 acceptance criteria

- [ ] Security, accessibility, performance, data-integrity, and supply-chain gates pass.
- [ ] The packaged JAR and container expose a documented, secure, supportable Studio.
- [ ] Administrators can select disabled, read-only, or write-enabled behavior explicitly.
- [ ] A clean checkout can reproduce all generated assets and acceptance tests.

## Future compatibility and enhancements

### STUDIO-601 — Open Workflow 1.x compatibility (P1, separate project gate)

- [ ] Compare 0.8 and current 1.x document, task, flow-control, event, error, input/output,
      catalog, and subflow models.
- [ ] Add a 1.x parser/validator adapter without weakening 0.8 round-trip guarantees.
- [ ] Define explicit create/open/save behavior for 1.x documents.
- [ ] Prototype an opt-in 0.8-to-1.x migration with an irreversible-change report and full
      diff; never migrate on ordinary save.
- [ ] Verify SonataFlow support before presenting 1.x documents as executable.

### STUDIO-602 — Team and repository workflows (P2)

- [ ] Add optional read-only Git status, branch, and diff context without Git mutation.
- [ ] Add review annotations stored separately from workflow specifications.
- [ ] Evaluate real-time collaboration only after conflict-safe single-user editing is
      production-proven.
- [ ] Evaluate plugin points for organization-specific validators, templates, catalogs, and
      state forms.

## Explicitly out of scope for the first release

- Full BPMN modeling or import/export parity.
- Real-time multi-user collaborative editing.
- Git commit, push, branch, pull request, or credential management from the browser.
- Arbitrary filesystem browsing or editing outside configured workflow roots.
- Remote catalog fetching enabled by default.
- Automatic conversion of 0.8 documents to Open Workflow 1.x.
- Production workflow scheduling, administration, or replacement of SonataFlow consoles.

## Open decisions

- [ ] Decide the frontend framework, source editor, graph library, and YAML round-trip
      implementation through STUDIO-002 and STUDIO-003 spikes.
- [ ] Decide whether MVP writes regenerate derived resources immediately or expose an
      explicit sync action.
- [ ] Decide whether document layout metadata belongs in a sidecar file, browser profile,
      or a namespaced extension accepted by the runtime.
- [ ] Decide whether write-enabled Studio is development-only or supportable in controlled
      shared environments.
- [ ] Decide the minimum supported browsers and maximum supported workflow/catalog sizes.
- [ ] Decide when Open Workflow 1.x moves from read-only inspection to supported authoring.

## Current repository validation commands

```bash
mvn clean test
./deploy/generate-sonataflow.sh --check
./deploy/sync-runner-resources.sh --check
./deploy/validate-compose.sh
kubectl kustomize deploy --load-restrictor LoadRestrictionsNone
```
