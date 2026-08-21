# Studio validation rule policy

Studio diagnostics have stable `ruleId` values, an ordered phase, severity, source range,
explanation, suggested resolution, provenance, a documentation URL, and a `suppressible`
policy flag. Errors are not suppressible. Warnings and informational compatibility findings
are candidates for project-approved suppression, although the suppression workflow itself is
tracked separately in `TODO.md`.

The packaged UI exposes the same rule reference at `/studio/validation-rules.html`; diagnostic
links use the individual rule ID as their anchor. The local validator never evaluates authored
expressions or executes workflows as part of these rules.

Core semantic rule groups include:

- `studio.workflow.*`: identity, state graph, switch/callback behavior, references, extensions,
  and expression placement.
- `studio.openapi.*`: operation IDs, local JSON pointers, and external-reference policy.
- `studio.required-field`: required document shape.

Rule additions must preserve the existing ID, phase, severity, source-range, provenance, and
documentation/suppression contract, or be recorded as an intentional compatibility change.
