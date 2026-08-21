# Studio 0.8 runtime capability profile

This note records the boundary between what Studio can represent from the pinned
Serverless Workflow 0.8 document profile and what has been verified against a
particular SonataFlow deployment. A document can be schema-valid while still
depending on a runtime version, extension, or deployment configuration that has
not been exercised here.

## Current authoring coverage

The source-preserving state form currently provides specialized controls for:

- `inject`: injected state data.
- `operation`: action mode, actions, action data filters, retry references, and
  action sleep intervals.
- `switch`: data conditions, event conditions, and the default condition.
- `callback`: callback action, event reference, event data filter, and timeout
  definitions.
- `event`: event subscriptions and exclusive waiting behavior.
- `sleep`: duration.
- `foreach`: input/output collections, iteration parameter, execution mode,
  batch size, and actions.
- `parallel`: branches, completion type, and the number of completed branches.

Shared controls include state data filters, timeout definitions, error handlers,
terminal/end behavior, and compensation metadata. The form edits only the
selected field and preserves fields it does not understand.

The **Other state properties** editor provides a guarded direct-property escape hatch for valid
0.8 fields that do not yet have a specialized control, as well as extension or future fields.
Property names are constrained to safe YAML/JSON keys; values are edited as authored JSON/YAML
text, and clearing a value removes only that direct property. State names, types, transitions,
and specialized fields continue to use their dedicated controls so reference updates and
validation safeguards cannot be bypassed.

The Graph palette exposes the same eight state types as the local 0.8 authoring profile. It is
hidden for unsupported specification versions or source-read-only documents, and adding a state
uses the same guarded source patcher as the Form view.

Graph node positions are UI-only metadata under a document-scoped browser storage key. They can
be reset with Auto-layout, are snapped to a 24px grid, and are never written to canonical YAML or
JSON. This keeps visual arrangement separate from workflow semantics. Multi-selection and deletion
are also draft-only interactions; deletion is rejected transactionally when a selected state is
still referenced by a transition.

## Compatibility boundary

The controls above are derived from the local 0.8 profile and are intended to
make valid document fields discoverable. They are not a claim that every
SonataFlow runtime version accepts every combination. Runtime verification must
be performed against the target runner image and its enabled extensions,
including event transport configuration, callback correlation, action retry and
timeout behavior, branch completion semantics, and compensation behavior.

Studio therefore keeps these statuses distinct:

1. **Schema validity** — the document parses and its fields have the expected
   profile shape.
2. **Compatibility** — the selected runtime profile supports the state/action
   combination.
3. **Runtime behavior** — an actual runner execution confirms the configured
   event, timeout, branch, retry, or compensation behavior.

No runtime execution claim is made by the form alone. Unsupported or deployment-
specific fields remain available through source editing and are preserved during
specialized edits. A standalone subflow-state editor is not exposed until its
representation and target-runtime behavior are verified; this does not prevent
editing an existing document's unknown fields in source view.

## Verification checklist

Before enabling a capability as runtime-supported, test it with the target
SonataFlow image and record the result separately from the schema fixture:

- Parse and validate representative YAML and JSON documents locally.
- Start the target runner with its real event and catalog configuration.
- Exercise event wait/resume and callback correlation paths.
- Exercise sleep, retry, timeout, foreach, and parallel completion paths.
- Exercise compensation only where the target runtime explicitly enables it.
- Record unsupported combinations as compatibility diagnostics rather than
  silently hiding their source fields.
