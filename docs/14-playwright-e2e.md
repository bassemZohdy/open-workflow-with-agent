# Playwright E2E Testing & Video Recording Suite

## Overview
This document describes the automated Playwright End-to-End (E2E) testing framework designed to test, verify, and record all 14 Agentic Patterns and OpenAPI Catalog endpoints.

---

## E2E Test Project Structure (`e2e/`)

```text
e2e/
 ├── package.json                   # Playwright dependencies
 ├── playwright.config.ts           # E2E test runner configuration (video, trace, screenshots)
 └── tests/
     └── agentic-console-e2e.spec.ts # Automated test spec for all 12 console presets
```

---

## Test Configuration (`playwright.config.ts`)

- **Browser**: Chromium (headless / desktop mode)
- **Base URL**: `http://localhost:9090` (or `http://localhost:8080`)
- **Artifact Recordings**:
  - `video: 'on'`: Records MP4/WebM video walkthrough for every feature test execution.
  - `trace: 'on'`: Generates full Playwright ZIP trace for DOM and network analysis.
  - `screenshot: 'on'`: Captures viewport screenshots upon test completion.

---

## Running Playwright E2E Tests

### 1. Install Dependencies
```bash
cd e2e
npm install
npx playwright install chromium
```

### 2. Execute Headless E2E Test Suite & Record Features
```bash
npm run test:e2e
```

### 3. Inspect Test Artifacts & HTML Report
```bash
npm run test:e2e:report
```

All generated recordings (video, screenshots, traces) are persisted in `e2e/test-results/`.
