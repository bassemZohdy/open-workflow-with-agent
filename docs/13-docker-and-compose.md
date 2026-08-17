# Container Image Build & Infrastructure Integration (PostgreSQL, LiteLLM, Ollama)

## Overview
This document describes containerizing the **OpenWorkflow Reference Implementation** using multi-stage Docker builds and orchestrating runtime infrastructure with **PostgreSQL** (workflow state persistence) and a self-contained **LiteLLM + Ollama** LLM stack. The agent itself is external to the workflow app: it is called over its generic REST API (`AGENT_BASE_URL`).

---

## 1. Container Image Build (`Dockerfile`)

The container build uses a multi-stage `Dockerfile`:
- **Stage 1 (Builder)**: Uses `maven:3.9.6-eclipse-temurin-17` to compile the Java microservice and package the Quarkus Fast-JAR bundle.
- **Stage 2 (Runtime)**: Uses lightweight `eclipse-temurin:17-jre-alpine` runtime image exposed on port `8080`.

The runtime entrypoint is [`docker-entrypoint.sh`](../docker-entrypoint.sh), which injects the scoped LiteLLM virtual key (see below) before starting Quarkus.

### Build Command
```bash
docker build --file Dockerfile --tag llm-tool-agent:latest .
```

> [!IMPORTANT]
> The `%prod` Quarkus profile (used by this image) **refuses to start without `UTILITY_API_KEY`**
> (fail-fast, enforced by `ProdSecurityDefaults`) and enables a default 600 req/min rate cap. See
> "Securing the endpoints" in the README.

---

## 2. Infrastructure Integration (`docker-compose.yml`)

The runtime stack is defined in [`docker-compose.yml`](../docker-compose.yml) and includes:

1. **`openworkflow-agent`**: The compiled microservice container.
2. **`postgres` (PostgreSQL 16.15)**: Durable state persistence for long-running workflows (`QUARKUS_DATASOURCE_*`) - essential for `agent_call`'s async mode, where instances stay suspended in a callback state until the response CloudEvent arrives. Also hosts a separate `litellm_db` database (created by [`postgres-init/01-create-litellm-db.sql`](../postgres-init/01-create-litellm-db.sql)) for LiteLLM's virtual-key store.
3. **`ollama` (pinned 0.32.13)**: Local model runtime, purely so the stack is runnable end-to-end with no external account.
4. **`ollama-pull`**: One-shot job that pulls `OLLAMA_MODEL` into `ollama` on first start, then exits.
5. **`litellm` (pinned v1.96.2)**: Generic OpenAI-compatible proxy in front of `ollama` (or any other backend - see [`litellm-config.yaml`](../litellm-config.yaml)). Backed by `litellm_db` for key management and spend tracking.
6. **`litellm-keygen`**: One-shot job that provisions a **scoped virtual key** (`models=[default-model]`, `max_budget=5.0`) and writes it to the shared `litellm_keys` volume, which the agent container reads at startup.

### Network exposure & credentials (hardened defaults)
- **Every published port is bound to loopback** (`127.0.0.1`): `8080`, `5432`, `11434`, `4000`. Nothing is exposed to the LAN.
- **No insecure default credentials exist.** `POSTGRES_PASSWORD`, `LITELLM_MASTER_KEY`, and `UTILITY_API_KEY` are REQUIRED: `docker compose up` fails fast with a clear message when any is unset.
- **The application never authenticates to LiteLLM with the master key.** `litellm-keygen` uses the master key once to create a scoped virtual key (model allowlist + budget cap); the app only ever holds that scoped key.
- **Image tags are pinned** to specific versions (no `latest`/`main-latest` drift).

### Configuration

Copy [`.env.example`](../.env.example) to `.env` and fill in the REQUIRED values - `docker compose` reads `.env` automatically. See that file for every variable and its meaning.

### Docker Compose Commands

Start the full stack:
```bash
cp .env.example .env
# ... edit .env and set the required secrets ...
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
- **Direct**: set `OPENAI_BASE_URL`/`OPENAI_API_KEY` in `.env` to the provider's own OpenAI-compatible endpoint and drop the `litellm`/`ollama`/`ollama-pull`/`litellm-keygen` services from `docker-compose.yml`.
- **Via LiteLLM**: keep `OPENAI_BASE_URL=http://litellm:4000/v1` and edit [`litellm-config.yaml`](../litellm-config.yaml)'s `model_list` to route the `default-model` alias at any LiteLLM-supported backend (vLLM, a hosted API, etc.).

### Swapping the agent

The bundled mock agent (same container, `/agent/sync` + `/agent/async`) exists only for demos and tests. To integrate a real agent, set `AGENT_BASE_URL` (and optionally `AGENT_API_KEY`) in `.env` to any service implementing the contract in [`catalogs/agent-rest.yaml`](../workflows/catalogs/agent-rest.yaml) - the workflows need no changes.

---

## 3. Environment Variables Configuration

| Variable | Required? | Description |
| :--- | :--- | :--- |
| `OPENAI_BASE_URL` | no | Base URL for OpenAI-compatible LLM provider (default `http://litellm:4000/v1`) |
| `OPENAI_API_KEY` | no | Optional explicit provider key. When unset, the app reads the scoped LiteLLM virtual key generated by `litellm-keygen` from `/keys/openai_api_key` |
| `LITELLM_MASTER_KEY` | **yes** | LiteLLM admin/master key - required by the `litellm` service itself and also used by `litellm-keygen` to provision the scoped virtual key; never given to the app |
| `AGENT_BASE_URL` | no | Base URL of the external agent implementing `catalogs/agent-rest.yaml` (default: the bundled mock agent) |
| `AGENT_API_KEY` | no | Optional bearer credential for an external agent API; self-calls use `UTILITY_API_KEY` only for the same origin |
| `AGENT_CALLBACK_ALLOWED_HOSTS` | no | Explicit host allowlist for internal/private async callback destinations; dev/test allow localhost automatically |
| `UTILITY_API_KEY` | **yes** | Bearer key gating this app's agent and workflow endpoints; the %prod profile fails startup without it |
| `UTILITY_RATE_LIMIT_REQUESTS_PER_MINUTE` | no | Global request-rate cap (default `600` outside dev/test; `0` disables) |
| `POSTGRES_PASSWORD` | **yes** | PostgreSQL password (also used for the `litellm_db` database) |
| `POSTGRES_USER` | no | PostgreSQL user (default `openworkflow`) |
| `OLLAMA_MODEL` | no | Model pulled into `ollama` on first start (default `llama3.1`); must match `litellm-config.yaml`'s backend model |
| `QUARKUS_DATASOURCE_JDBC_URL` | no | PostgreSQL JDBC connection URL (compose default `jdbc:postgresql://postgres:5432/openworkflow_db`) |
