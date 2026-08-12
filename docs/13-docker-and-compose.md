# Container Image Build & Infrastructure Integration (PostgreSQL & Redis)

## Overview
This document describes containerizing the **Agentic OpenWorkflow Reference Implementation** using multi-stage Docker builds and orchestrating runtime infrastructure with **PostgreSQL** (workflow state persistence) and **Redis** (agent short-term memory & caching).

---

## 1. Container Image Build (`Dockerfile`)

The container build uses a multi-stage `Dockerfile`:
- **Stage 1 (Builder)**: Uses `maven:3.9.6-eclipse-temurin-17` to compile the Java microservice and package the Quarkus Fast-JAR bundle.
- **Stage 2 (Runtime)**: Uses lightweight `eclipse-temurin:17-jre-alpine` runtime image exposed on port `8080`.

### Build Command
```bash
docker build . --file Dockerfile --tag llm-tool-agent:latest
```

---

## 2. Infrastructure Integration (`docker-compose.yml`)

The runtime stack is defined in [`docker-compose.yml`](../docker-compose.yml) and includes:

1. **`openworkflow-agent`**: The compiled microservice container.
2. **`postgres` (PostgreSQL 16)**: Relational database providing durable state persistence for long-running workflows (`QUARKUS_DATASOURCE_*`).
3. **`redis` (Redis 7)**: In-memory cache providing sub-millisecond agent short-term memory retrieval (`QUARKUS_REDIS_*`).
4. **`ollama`**: Local model runtime, purely so the stack is runnable end-to-end with no external account. Swap it out for any other OpenAI-compatible provider without touching workflow code.
5. **`ollama-pull`**: One-shot job that pulls `OLLAMA_MODEL` into `ollama` on first start, then exits.
6. **`litellm`**: Generic OpenAI-compatible proxy in front of `ollama` (or any other backend - see [`litellm-config.yaml`](../litellm-config.yaml)). This is the single integration point the workflows talk to via `OPENAI_BASE_URL`/`OPENAI_API_KEY`; the application and workflow YAML never hardcode a provider or model.

### Configuration

Copy [`.env.example`](../.env.example) to `.env` and adjust values - `docker compose` reads `.env` automatically. See that file for every variable and its default.

### Docker Compose Commands

Start the full stack:
```bash
cp .env.example .env
docker compose up -d
```

View container logs:
```bash
docker compose logs -f openworkflow-agent
```

Stop the stack (and remove volumes):
```bash
docker compose down -v
```

### Swapping the LLM backend

To point at a different provider instead of the bundled Ollama/LiteLLM pair:
- **Direct**: set `OPENAI_BASE_URL`/`OPENAI_API_KEY` in `.env` to the provider's own OpenAI-compatible endpoint and drop the `litellm`/`ollama`/`ollama-pull` services from `docker-compose.yml`.
- **Via LiteLLM**: keep `OPENAI_BASE_URL=http://litellm:4000/v1` and edit [`litellm-config.yaml`](../litellm-config.yaml)'s `model_list` to route the `default-model` alias at any LiteLLM-supported backend (vLLM, a hosted API, etc.).

---

## 3. Environment Variables Configuration

| Variable | Description | Default Value |
| :--- | :--- | :--- |
| `OPENAI_BASE_URL` | Base URL for OpenAI-compatible LLM provider | `http://litellm:4000/v1` |
| `OPENAI_API_KEY` | Bearer token sent to that provider. Must equal `LITELLM_MASTER_KEY` when routing through the bundled LiteLLM (it has no key-management database, so it only accepts its own master key) | `sk-litellm-local-dev` |
| `LITELLM_MASTER_KEY` | LiteLLM's own admin/API key | `sk-litellm-local-dev` |
| `OLLAMA_MODEL` | Model pulled into `ollama` on first start; must match `litellm-config.yaml`'s backend model | `llama3.1` |
| `UTILITY_API_KEY` | Optional bearer key gating this app's own `/functions/*` and workflow endpoints. Blank disables auth | *(blank)* |
| `UTILITY_RATE_LIMIT_REQUESTS_PER_MINUTE` | Optional global request-rate cap. `0` disables it | `0` |
| `QUARKUS_DATASOURCE_JDBC_URL` | PostgreSQL JDBC connection URL | `jdbc:postgresql://postgres:5432/openworkflow_db` |
| `QUARKUS_REDIS_HOSTS` | Redis connection URL | `redis://redis:6379` |
