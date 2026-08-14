# Agentic OpenWorkflow Technical Documentation Index

This directory contains standalone, dedicated documentation for each **Canonical Agentic AI Pattern** and **Infrastructure Integration** supported by the OpenWorkflow Specification Reference Implementation.

Reusable workflow definitions are organized under `src/main/resources/sub_flows/`; the public `llm-tool-agent.sw.yaml` entry point remains at the resources root.

The reusable decision subflows [boolean-decision.sw.yaml](../src/main/resources/sub_flows/boolean-decision.sw.yaml) and [choice-decision.sw.yaml](../src/main/resources/sub_flows/choice-decision.sw.yaml) provide strict typed decisions for workflows that need a yes/no answer or one value from an allowed list.

---

## Technical Documentation Modules

1. [**Pattern 1: Autonomous Agent Reasoning Loop**](01-agent-loop.md)
   * Multi-turn LLM execution, function tool selection, output message formatting, and iteration limits (`agent-loop.sw.yaml`).

2. [**Pattern 2: Model Context Protocol (MCP) Integration**](02-mcp-protocol.md)
   * Open protocol for JSON-RPC / OpenAPI tool discovery (`mcp/tools`) and execution (`mcp/call`).

3. [**Pattern 3: Agent-to-Agent (A2A) Multi-Agent Delegation**](03-a2a-delegation.md)
   * Sub-agent directory lookup (`a2a/agents`) and task prompt delegation (`a2a/delegate`).

4. [**Pattern 4: Short & Long-Term Agent Memory**](04-agent-memory.md)
   * KV context storage, memory retrieval, and vector memory search (`memory-catalog.yaml`).

5. [**Pattern 5: Human-in-the-Loop (HITL) Approval Gating**](05-hitl-approval.md)
   * Pausing workflow execution pending human review and approval (`hitl-gate.sw.yaml`).

6. [**Pattern 6: Output Guardrails & Validation**](06-guardrails.md)
   * Structured JSON schema validation and response safety checks (`guardrails-catalog.yaml`).

7. [**Pattern 7: Parallel Multi-Agent Fan-Out**](07-parallel-fanout.md)
   * Concurrent multi-agent execution across sub-agents using OpenWorkflow `parallel` states (`parallel-agent.sw.yaml`).

8. [**Pattern 8: Self-Reflection & Critique Loop**](08-self-reflection.md)
   * Recursive generation -> Critique -> Refinement self-improvement loops (`reflection-agent.sw.yaml`).

9. [**Pattern 9: Dynamic Task Planning & Goal Decomposition**](09-task-planning.md)
   * Decomposing high-level goals into ordered sub-task plans (`plan-agent.sw.yaml`).

10. [**Pattern 10: Sequential Pipeline Chaining**](10-sequential-chaining.md)
    * Step-by-step multi-agent pipeline (Research -> Code -> Review) (`chain-agent.sw.yaml`).

11. [**Pattern 11: Supervisor / Orchestrator-Worker Router**](11-supervisor-routing.md)
    * Dynamic supervisor routing tasks to specialized worker sub-agents (`supervisor-agent.sw.yaml`).

12. [**Pattern 12: Multi-Provider LLM Fallback & Failover**](12-multi-provider-fallback.md)
    * Failover routing across primary and backup LLM providers (`fallback-catalog.yaml`).

13. [**Infrastructure Integration: Docker, PostgreSQL & Redis**](13-docker-and-compose.md)
    * Container image build (`Dockerfile`) and Docker Compose orchestration (`docker-compose.yml`) with PostgreSQL state persistence and Redis agent memory cache.

14. [**Playwright E2E Testing & Feature Recording**](14-playwright-e2e.md)
    * Automated Playwright E2E test runner, video recording (`video: 'on'`), trace zip artifacts, and UI preset assertions.

15. [**Reusable Decision Subflows**](15-decision-subflows.md)
    * Strict yes/no and constrained option-selection decisions with typed validation.
