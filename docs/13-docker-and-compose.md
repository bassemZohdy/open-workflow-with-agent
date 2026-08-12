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

### Docker Compose Commands

Start the full stack:
```bash
docker compose up -d
```

View container logs:
```bash
docker compose logs -f openworkflow-agent
```

Stop the stack:
```bash
docker compose down
```

---

## 3. Environment Variables Configuration

| Variable | Description | Default Value |
| :--- | :--- | :--- |
| `OPENAI_BASE_URL` | Base URL for OpenAI-compatible LLM provider | `http://localhost:4000/v1` |
| `OPENAI_API_KEY` | Authentication API key | `dummy-key` |
| `QUARKUS_DATASOURCE_JDBC_URL` | PostgreSQL JDBC connection URL | `jdbc:postgresql://postgres:5432/openworkflow_db` |
| `QUARKUS_REDIS_HOSTS` | Redis connection URL | `redis://redis:6379` |
