# Pattern 8: Self-Reflection & Critique Loop (`reflection-agent.sw.yaml`)

## Overview
Implements a recursive self-improvement loop: candidate answer generation -> guardrail/critic evaluation -> iterative refinement until quality score threshold is met (max 3 iterations).

## Architecture
- **Sub-Flow**: `src/main/resources/sub_flows/reflection-agent.sw.yaml` (id: `reflection_agent`)
- **OpenAPI Catalogs**: `guardrails-catalog.yaml` & `a2a-catalog.yaml`
- **State Flow**: Candidate Generation -> Critique Validation -> Bounded Iteration Switch

## Orchestration-only demonstration
This sub-flow demonstrates the *orchestration* pattern only: it never invokes the LLM. Candidate generation calls the mock A2A `coder_agent` endpoint and critique calls the mock guardrails endpoint - both stubbed REST endpoints returning canned responses. In a production deployment, `delegateToAgent` would be wired to a real LLM-backed agent and `validateOutput` to a real schema/content validator.
