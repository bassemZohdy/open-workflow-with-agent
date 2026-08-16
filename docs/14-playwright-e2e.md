# Playwright E2E Testing & Video Recording Suite

## Overview
This document describes the automated Playwright End-to-End (E2E) testing framework. The suite exercises the debug console, the bundled mock agent endpoints, and the `agent_call` workflow in both sync and async modes (no LLM provider required).

---

## E2E Test Project Structure (`e2e/`)

```text
e2e/
 ├── package.json                   # Playwright dependencies
 ├── playwright.config.ts           # E2E runner config: webServer, auth header, video/trace/screenshots
 └── tests/
     └── agentic-console-e2e.spec.ts # Automated test spec for the debug console presets
```

---

## Test Configuration (`playwright.config.ts`)

- **Browser**: Chromium (headless / desktop mode)
- **Base URL**: `http://localhost:8080` (override with `PLAYWRIGHT_BASE_URL`)
- **Auto-starting the app**: Playwright's `webServer` starts the packaged Quarkus app
  (`target/quarkus-app/quarkus-run.jar`) before the suite and waits for `/q/health`; set
  `PLAYWRIGHT_SKIP_WEBSERVER=1` to reuse an already-running instance.
- **Auth**: the `%prod` profile gates every endpoint behind `UTILITY_API_KEY`; the webServer starts
  the app with `PLAYWRIGHT_API_KEY` (default `e2e-test-key`) and the suite sends it as a Bearer
  header on every request. Override with `PLAYWRIGHT_API_KEY` when testing an externally-managed app.
- **Artifact Recordings**: `video: 'on'`, `trace: 'on'`, `screenshot: 'on'`.

---

## Running Playwright E2E Tests

### 1. Package the application first (the webServer starts the packaged jar)
```bash
mvn clean package
```

### 2. Install Dependencies
```bash
cd e2e
npm install
npx playwright install chromium
```

### 3. Execute Headless E2E Test Suite & Record Features
```bash
npm run test:e2e
```

### 4. Inspect Test Artifacts & HTML Report
```bash
npm run test:e2e:report
```

All generated recordings (video, screenshots, traces) are persisted in `e2e/test-results/`.

---

## CI Integration

The GitHub Actions pipeline runs a dedicated Playwright job (`.github/workflows/ci.yml`) that
packages the app, installs Chromium with `--with-deps`, and runs the suite - so the E2E suite
(which previously only ran locally) now blocks merges like the Maven suite.
