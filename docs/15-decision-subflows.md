# Reusable Decision Subflows

The decision subflows use the existing OpenAI-compatible catalog and keep the AI response contract narrow and validated.

## Boolean decision

Use `boolean_decision` from `workflows/sub_flows/boolean-decision.sw.yaml` with input like:

```json
{
  "question": "Should this deployment proceed?"
}
```

Successful output:

```json
{
  "valid": true,
  "decision": true,
  "answer": "yes"
}
```

The model must return exactly `yes` or `no`, ignoring case and surrounding whitespace. Any other response returns `valid: false`. (The workflow emits the answer as a JSON string.)

## Constrained choice

Use `choice_decision` from `workflows/sub_flows/choice-decision.sw.yaml` with input like:

```json
{
  "question": "Which rollout strategy should be used?",
  "options": ["canary", "blue-green", "rolling"]
}
```

Successful output:

```json
{
  "valid": true,
  "selected_option": "canary"
}
```

The selected value must exactly match one of the supplied options. Missing questions, empty option lists, and out-of-list model responses return `valid: false`.

Both subflows hardcode `model: default-model` and use the configured OpenAI-compatible client. They intentionally return a validation result rather than silently coercing an invalid answer; callers can retry, fall back, or route to HITL approval.

## CI coverage

The Maven test suite includes contract tests for both workflow definitions. CI also builds the application, validates the deployment Kustomize package, and builds the Docker image so resource moves and packaging errors are caught before merge.
