# Agentic OpenWorkflow Technical Documentation Index

This directory contains documentation for the **minimal agent-loop reference implementation** and its infrastructure.

Reusable workflow definitions are organized under `src/main/resources/sub_flows/`; the public `llm-tool-agent.sw.yaml` entry point remains at the resources root.

The reusable decision subflows [boolean-decision.sw.yaml](../src/main/resources/sub_flows/boolean-decision.sw.yaml) and [choice-decision.sw.yaml](../src/main/resources/sub_flows/choice-decision.sw.yaml) provide strict typed decisions for workflows that need a yes/no answer or one value from an allowed list.

> **Scope note**: this minimized implementation keeps only the core agent loop and the local
> tools exposed through APIs or MCP (`time`, `calculator`, `mcp_tool_call`). Higher-order
> agentic patterns (A2A delegation, memory, HITL, guardrails, planning, multi-provider fallback,
> parallel/chain/supervisor/reflection orchestration) have been removed.

> **Server-side guardrails**: the public `llm_tool_agent` entry validates messages (count/length),
> restricts roles to `user`/`assistant`, and enforces a model allowlist in the workflow itself;
> `agent_loop` clamps `max_tokens` and truncates history. Tool HTTP errors are converted into
> tool-result errors (fed back to the LLM) via `onErrors` in `tool-executor.sw.yaml`/`agent-loop.sw.yaml`.

---

## Technical Documentation Modules

1. [**Pattern 1: Autonomous Agent Reasoning Loop**](01-agent-loop.md)
   * Multi-turn LLM execution, function tool selection, output message formatting, and iteration limits (`agent-loop.sw.yaml`).

2. [**Pattern 2: Model Context Protocol (MCP) Integration**](02-mcp-protocol.md)
   * Open protocol for JSON-RPC / OpenAPI tool discovery (`mcp/tools`) and execution (`mcp/call`).

3. [**Infrastructure Integration: Docker, PostgreSQL & Redis**](13-docker-and-compose.md)
   * Container image build (`Dockerfile`) and Docker Compose orchestration (`docker-compose.yml`) with PostgreSQL state persistence and Redis agent memory cache.

4. [**Playwright E2E Testing & Feature Recording**](14-playwright-e2e.md)
   * Automated Playwright E2E test runner, video recording (`video: 'on'`), trace zip artifacts, and UI preset assertions.

5. [**Reusable Decision Subflows**](15-decision-subflows.md)
   * Strict yes/no and constrained option-selection decisions with typed validation.
