# Decision Analysis and Resolution (DAR)

**Document ID:** DAR-2026-08-19-studio-frontend  
**Date:** 2026-08-19  
**Mode:** Formal  
**Status:** Proposed  
**Related backlog item:** `STUDIO-002`

## 1. Decision frame

### Decision statement

We need to decide how to build, test, serve, and package the browser-based OpenWorkflow
Studio while preserving the existing static execution console and Quarkus/SonataFlow
runtime.

### Scope

In scope:

- The application architecture for `/studio/`.
- TypeScript framework, package manager, Node.js baseline, build tool, test runner,
  linting, and formatting.
- Source-editor and graph-library choices for YAML diagnostics, visualization, and
  accessibility.
- Maven packaging, local development proxying, hot reload, browser support, and
  dependency-upgrade policy.

Out of scope:

- The workspace API contract and persistence implementation (`STUDIO-004` and
  `STUDIO-201`).
- The lossless YAML document model (`STUDIO-003`).
- Production deployment administration, Git mutation, and Open Workflow 1.x authoring.
- Replacing the root execution console before equivalent Studio run and monitoring
  capabilities exist.

### Constraints

1. The Studio must be a dedicated TypeScript frontend served below `/studio/`.
2. Production must serve static compiled assets from the Quarkus application; Node.js
   must not be required at runtime.
3. The existing root console at `/` and its current execution behavior must continue to
   work unchanged during the Studio rollout.
4. Maven remains the authoritative backend build and must package the frontend into the
   Quarkus JAR and container.
5. The UI must support keyboard and screen-reader access, source diagnostics, graph
   navigation, and a textual graph alternative; inaccessible visual-only editing is not
   acceptable.
6. Dependencies must be reproducible from a committed npm lockfile once the frontend
   workspace is scaffolded.

### Assumptions

- The repository owner is the decision owner and will approve the ADR before
  `STUDIO-101` implementation begins.
- The first release is a client-rendered application and does not need SSR, SEO, or
  server components.
- The packaged Studio and the Quarkus APIs are served from the same origin, so the
  browser can use relative `/api/studio/` and `/q/` URLs in production.
- The initial target is modern evergreen browsers and useful tablet/read-only access;
  legacy browser support is not a product requirement.
- The existing Playwright E2E setup can be extended to cover `/studio/`.

### Decision owner, approver, deadline, and review triggers

| Field | Decision |
| --- | --- |
| Decision owner | Repository owner / maintainers |
| Approver | Repository owner before `STUDIO-101` scaffolding is merged |
| Decision deadline | Before production frontend implementation starts |
| Review triggers | Need for SSR/SEO, browser support below the selected baseline, source files above the performance envelope, a requirement for real-time collaboration, or inability to meet the round-trip/accessibility gates with the selected libraries |

### Recommended DAR mode

Formal mode is appropriate because this is an architectural choice with a long-lived
dependency surface, multiple implementation alternatives, and data-integrity and
accessibility consequences.

## 2. Gate criteria

The following binary gates apply to every proposed architecture. No alternative is
eliminated at the gate stage; the score matrix captures the meaningful differences.

| Gate | Must be true | Static console | React + TypeScript + Vite | Vue + TypeScript + Vite |
| --- | --- | --- | --- | --- |
| G1 | Must produce static assets that Quarkus can serve from its classpath with no Node.js runtime dependency | Pass | Pass | Pass |
| G2 | Must preserve `/` and add `/studio/` without requiring a rewrite of the existing execution console | Pass | Pass | Pass |
| G3 | Must support a reproducible dependency/build path or an explicitly dependency-free implementation | Pass | Pass | Pass |
| G4 | Must provide an accessible path for source, form, graph, diagnostics, and execution views | Fail in the target scope without building a custom UI framework | Pass | Pass |

The static-console alternative remains in the matrix to make its migration cost visible,
but it fails G4 for the required target scope and is not eligible for the recommendation.
The score below is retained as a baseline comparison, not as a viable final choice.

## 3. Alternatives considered

### A1 — Extend the current static HTML console

Continue adding imperative JavaScript, HTML, and CSS to
`src/main/resources/META-INF/resources/index.html`. Add new panels and state management
without introducing a framework or frontend build workspace.

### A2 — React + TypeScript + Vite (recommended)

Create an isolated `frontend/studio/` application using React components and TypeScript,
bundle it with Vite, serve it below `/studio/`, and keep the root console as a separate
resource until feature parity is reached.

### A3 — Vue + TypeScript + Vite

Create the same isolated frontend boundary using Vue Single-File Components, TypeScript,
and Vite. Use Vue-compatible editor and diagram adapters and the same Maven packaging
contract.

## 4. Evaluation criteria

Scores use a 0–5 scale: 0 = does not meet the criterion, 1 = poor, 2 = below average,
3 = acceptable, 4 = good, and 5 = excellent. Weights sum to 100.

| Criterion | Weight | High score | Low score |
| --- | ---: | --- | --- |
| C1. Shared multi-view document state | 25 | Forms, source, graph, issues, and execution panels can share typed state without bespoke lifecycle plumbing | Each view owns duplicated state or requires a custom framework to synchronize edits |
| C2. Editor/graph ecosystem and accessibility | 20 | Mature integrations support diagnostics, custom nodes/ports, keyboard navigation, screen readers, themes, and a textual alternative | Required capabilities need extensive custom implementation or have weak accessibility support |
| C3. Quarkus/Maven and deployment fit | 15 | Static output, base paths, API proxying, and deterministic packaging are straightforward | The runtime needs a new server, complex asset manifest handling, or an additional production process |
| C4. Developer and test experience | 15 | Fast feedback, typed refactoring, unit tests, E2E integration, and clear lint/format gates | Changes are difficult to isolate, test, refactor, or review |
| C5. Performance and browser support | 15 | Large source files and graph interactions remain responsive with a controlled bundle on the supported browsers | The architecture creates excessive baseline JavaScript or weak large-document behavior |
| C6. Migration and maintenance risk | 10 | New Studio code is isolated, incrementally adoptable, and supported by a broad ecosystem | The change creates a hard rewrite, long-term bespoke code, or uncertain maintenance burden |

The criteria are intentionally separate: C1 measures application state composition, C2
measures specialized UI capability, and C5 measures runtime/bundle behavior. They are
not duplicates even though the editor and graph affect performance and state.

## 5. Evaluation matrix

Weighted values are `weight / 100 × raw score`. Confidence is High (measured data or
direct project evidence), Medium (first-party documentation and ecosystem evidence), or
Low (expert extrapolation). The repository has not yet run the source-editor or graph
benchmark; those are implementation gates for `STUDIO-003` and `STUDIO-104`.

| Alternative | Criterion | Raw | Weighted | Rationale | Confidence |
| --- | --- | ---: | ---: | --- | --- |
| A1 Static | C1 State | 1 | 0.25 | The current page is a single imperative console; adding synchronized source/form/graph views would require a bespoke state layer. | High |
| A1 Static | C2 Ecosystem/a11y | 0 | 0.00 | It fails the accessibility gate for the target scope unless the project builds most editor and graph primitives itself. | High |
| A1 Static | C3 Packaging | 5 | 0.75 | Existing HTML is already a Quarkus classpath resource and needs no build step. | High |
| A1 Static | C4 Dev/test | 1 | 0.15 | The current inline-script shape has little isolation or typed refactoring support; E2E is the main existing safety net. | High |
| A1 Static | C5 Performance | 5 | 0.75 | The initial payload is small and has no framework runtime, although future bespoke features could erode this advantage. | Medium |
| A1 Static | C6 Maintenance | 2 | 0.20 | Short-term migration cost is lowest, but bespoke synchronization and accessibility code create high long-term risk. | Medium |
| A2 React | C1 State | 5 | 1.25 | Component composition and typed stores can represent shared document, issue, selection, and execution state cleanly. | Medium |
| A2 React | C2 Ecosystem/a11y | 5 | 1.00 | React Flow documents focusable nodes/edges, keyboard movement, ARIA labels, custom nodes, handles, controls, and minimap support; React also has mature editor integrations. | Medium |
| A2 React | C3 Packaging | 4 | 0.60 | Vite produces static assets and documents custom backend integration; the separate `/studio/` base path adds a manageable packaging contract. | High |
| A2 React | C4 Dev/test | 5 | 0.75 | React + TypeScript + Vite integrates naturally with Vitest and the repository's existing Playwright E2E suite. | Medium |
| A2 React | C5 Performance | 4 | 0.60 | Vite's optimized static build and lazy loading can keep editor/graph code out of the initial shell; bundle and large-file limits still require measurement. | Medium |
| A2 React | C6 Maintenance | 4 | 0.40 | The Studio can be isolated from the root console and has a broad ecosystem, at the cost of an additional frontend stack. | Medium |
| A3 Vue | C1 State | 5 | 1.25 | Vue's component and reactivity model can support the same typed view composition. | Medium |
| A3 Vue | C2 Ecosystem/a11y | 4 | 0.80 | Vue has first-class TypeScript and Vite support, but the selected graph/editor integrations are less directly aligned with the proposed React Flow ecosystem. | Medium |
| A3 Vue | C3 Packaging | 4 | 0.60 | Vue and Vite produce the same classpath-friendly static output and base-path contract. | High |
| A3 Vue | C4 Dev/test | 4 | 0.60 | Vue provides official TypeScript/Vite scaffolding and Vitest/Playwright paths, with an additional SFC type-checking tool. | Medium |
| A3 Vue | C5 Performance | 4 | 0.60 | Vite output and lazy loading offer the same broad performance strategy as React; actual editor/graph costs remain to be measured. | Medium |
| A3 Vue | C6 Maintenance | 4 | 0.40 | Vue is a credible, maintainable choice, but selecting it would make React-oriented graph integrations less direct for this workflow editor. | Medium |

### Totals

| Rank | Alternative | Total |
| ---: | --- | ---: |
| 1 | A2 React + TypeScript + Vite | 4.60 |
| 2 | A3 Vue + TypeScript + Vite | 4.25 |
| 3 | A1 Static console baseline | 2.30 |

The static alternative's C2 score is a gate failure; its total is shown only as a
transparent status-quo baseline.

## 6. Sensitivity check

The two highest-weight criteria are C1 (25%) and C2 (20%). The matrix was recalculated
with a ±10 percentage-point transfer between them.

| Scenario | Weights changed | React | Vue | Static | Ranking changed? |
| --- | --- | ---: | ---: | ---: | --- |
| Baseline | C1 25%, C2 20% | 4.60 | 4.25 | 2.30 | — |
| A | C1 15%, C2 30% | 4.60 | 4.15 | 2.60 | No |
| B | C1 35%, C2 10% | 4.60 | 4.35 | 2.40 | No |

The recommendation is stable under the required ±10-point perturbation. The React/Vue
gap narrows when state composition is weighted more heavily, but React remains first in
both scenarios because the editor/graph accessibility and integration evidence is more
direct for the chosen UI library set.

## 7. Recommendation, tradeoffs, and risks

### Recommendation

Choose **A2: React + TypeScript + Vite** for the Studio and keep the existing static
execution console at `/` during the migration. The recommendation is based on the
highest matrix score (4.60), stable sensitivity results, and the direct fit between
React's component model and the selected graph library's custom-node and accessibility
APIs.

React's official documentation describes both adding React to an existing page and
building a React TypeScript application with Vite, which supports an isolated `/studio/`
route without forcing a rewrite of the root console:
[React installation and integration](https://react.dev/learn/installation),
[React app from scratch with Vite](https://react.dev/learn/build-a-react-app-from-scratch),
and [React in an existing project](https://react.dev/learn/add-react-to-an-existing-project).

### Key tradeoffs

- React adds a Node/npm build toolchain and a second frontend surface to a Maven project;
  the benefit is a maintainable component boundary for the Studio's many synchronized
  views.
- Vite introduces a build step, but it provides static production output, fast HMR, and
  an explicit backend-integration pattern. Its current guide requires Node.js 20.19+
  or 22.12+ and documents base paths and backend proxying:
  [Vite Getting Started](https://vite.dev/guide/),
  [Vite backend integration](https://vite.dev/guide/backend-integration.html).
- CodeMirror 6 is lighter and more modular than Monaco, but YAML schema completion and
  source-range diagnostics must be integrated by the Studio rather than assumed to be
  built in. Monaco remains the fallback if the source-editor spike misses its gates.
- React Flow supplies keyboard and screen-reader behavior, custom nodes, handles, and a
  minimap, but automatic layout is an adapter concern; the graph model must remain
  independent of layout coordinates. See [React Flow accessibility](https://reactflow.dev/learn/advanced-use/accessibility),
  [React Flow API](https://reactflow.dev/api-reference), and
  [React Flow components](https://reactflow.dev/api-reference/components).

## 8. Selected architecture and pins

These are the initial direct dependency pins for the Studio workspace, captured on
2026-08-19. The future `frontend/studio/package-lock.json` is authoritative for
transitive versions and integrity hashes; ranges must not replace these direct pins.

| Concern | Selection | Initial pin / policy |
| --- | --- | --- |
| UI framework | React | `19.2.8` stable line; do not use canary/experimental releases |
| DOM renderer | React DOM | `19.2.8` |
| React build integration | `@vitejs/plugin-react` | `6.0.4` |
| Language | TypeScript | `5.9.3`, `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true` |
| Package manager | npm | `11.6.2`, with committed `package-lock.json` and `npm ci` in CI |
| Node.js | Node.js LTS | `24.18.0`; enforce with `.nvmrc` and `engines.node` |
| Build tool | Vite | `8.2.1`; configure `base: '/studio/'` and a production `dist` directory |
| Maven frontend integration | `frontend-maven-plugin` | `1.15.4`; fail the package when the locked frontend checks or build fail |
| Unit/component runner | Vitest | `4.1.10`; use Testing Library for DOM behavior and fast model/parser tests |
| Browser E2E | Playwright | Align the Studio workspace with the repository's existing Playwright setup; run Chromium, Firefox, and WebKit in CI as the Studio gates mature |
| Lint | ESLint flat config | `10.8.0`; TypeScript-aware rules, React hooks rules, no warnings allowed in CI |
| Format | Prettier | `3.9.6`; committed config, `npm run format:check` in CI |
| Source editor | CodeMirror 6 | `codemirror 6.0.2`, `@codemirror/lang-yaml 6.1.3`, `@codemirror/lint`, `@codemirror/search`, and `@codemirror/merge` pinned in the lockfile |
| Graph | React Flow | `@xyflow/react 12.11.2`; use custom nodes/handles, Controls, MiniMap, ARIA configuration, and a separate layout adapter |

The Node.js policy follows the project guidance to use an Active or Maintenance LTS
line rather than an EOL release. Node's release page lists the LTS policy and warns that
production applications should use Active or Maintenance LTS versions:
[Node.js releases](https://nodejs.org/en/about/previous-releases).

Playwright remains the browser E2E runner because it already exists in this repository
and its official test runner provides assertions, isolation, parallelization, reports,
and Chromium/Firefox/WebKit projects:
[Playwright installation](https://playwright.dev/docs/intro).

## 9. Source editor evaluation

| Capability | CodeMirror 6 | Monaco Editor | Decision |
| --- | --- | --- | --- |
| YAML syntax and custom diagnostics | Modular language/lint extensions; Studio owns schema and semantic diagnostics | Rich editor model and markers; YAML language/schema support requires an integration layer | CodeMirror, with a custom diagnostic adapter |
| Large-file behavior | Modular viewport and extension architecture keeps the baseline small; benchmark required | Strong editor behavior and mature models; larger baseline and worker configuration | CodeMirror for the initial bundle; benchmark before mutating features |
| Accessibility | Requires deliberate ARIA wrapper, focus management, and keyboard testing in the Studio | Built-in keyboard command palette, screen-reader strategy, and high-contrast support are documented | Both can pass; CodeMirror requires a stronger application-level test harness |
| Theming | Theme extensions can share Studio tokens | Mature editor themes and high-contrast mode | CodeMirror to keep tokens under Studio control |
| Diff/merge | `@codemirror/merge` is composable with the same document model | Built-in diff editor is mature | CodeMirror unless the diff spike shows unacceptable gaps |
| Bundle/control | Modular packages allow only YAML, lint, search, merge, and required commands | More turnkey features with higher payload/configuration cost | CodeMirror |

CodeMirror's official system guide documents its modular extension architecture and
state/update model, while its core extensions cover read-only/editable modes and editor
configuration: [CodeMirror system guide](https://codemirror.net/docs/guide/) and
[CodeMirror extensions](https://codemirror.com/docs/extensions/). Monaco's official
accessibility guide documents keyboard navigation, high contrast, tab focus behavior,
and screen-reader support: [Monaco accessibility guide](https://github.com/microsoft/monaco-editor/wiki/Monaco-Editor-Accessibility-Guide).

### Source-editor implementation gate

Before enabling source/form mutation, a spike must demonstrate:

1. YAML syntax errors and Studio semantic diagnostics map to exact line/column ranges.
2. A 10 MB representative YAML document remains usable for scrolling, search, and
   diagnostics on the supported desktop browsers.
3. Keyboard-only editing, screen-reader announcements, high contrast, and focus exit
   pass the Studio accessibility checks.
4. Source diff/merge preserves the document model's required comments, unknown fields,
   and formatting warnings.

If any gate fails, evaluate Monaco with the same acceptance tests before changing the
framework decision.

## 10. Diagram library evaluation

| Capability | React Flow (`@xyflow/react`) | Cytoscape.js | Decision |
| --- | --- | --- | --- |
| Custom state nodes | First-class custom node types with arbitrary React content | Custom visual styles and extensions, but editor controls need more integration | React Flow |
| Ports and transitions | Multiple handles, custom edges, edge labels, and connection callbacks | Possible, but less aligned to form-rich node editing | React Flow |
| Keyboard and screen reader | Focusable nodes/edges, Enter/Space selection, arrow-key movement, ARIA labels, live updates, and minimap labels are documented | Accessibility requires more application-specific work | React Flow |
| Zoom, pan, minimap, controls | Built-in controls, viewport, minimap, and auto-pan-on-focus | Strong graph rendering and navigation; UI controls are more bespoke | React Flow |
| Auto-layout | Use an adapter such as Dagre or ELK; keep coordinates UI-only | Graph algorithms are a strength; layout remains separate from the editor model | React Flow with a layout adapter |
| Performance | Suitable for the repository-scale graphs; benchmark large graphs and action-heavy nodes | Strong graph rendering options; may be better for very large read-only graphs | React Flow for the interactive authoring use case |

The graph library will never be the source of truth. It receives a projection of the
typed document model, and layout coordinates are stored as UI-only state according to
the `STUDIO-003` decision.

## 11. Maven packaging and runtime boundary

### Production build flow

```text
frontend/studio/
  npm ci
  npm run lint
  npm run typecheck
  npm run test:unit -- --run
  npm run build                         -> target/studio-dist/
        |
        v
frontend-maven-plugin (generate-resources)
  installs/uses pinned Node + npm locally
  runs npm ci and npm run build
        |
        v
maven-resources-plugin (process-resources)
  copies target/studio-dist/**
  to target/classes/META-INF/resources/studio/**
        |
        v
Quarkus package/container serves /studio/index.html and hashed assets
```

The implementation should use `com.github.eirslett:frontend-maven-plugin` with an exact
plugin version, `workingDirectory=frontend/studio`, and explicit `nodeVersion` and
`npmVersion`. The plugin's documented purpose is to install Node/npm locally and run
frontend tasks without requiring Node in the production image:
[frontend-maven-plugin](https://github.com/eirslett/frontend-maven-plugin). Maven's
resources plugin then performs the classpath copy into the build output:
[Maven resources plugin](https://maven.apache.org/plugins/maven-resources-plugin/resources-mojo.html).
Before that copy, the pinned Maven Antrun cleanup execution removes only the previous
`META-INF/resources/studio` output. This prevents incremental builds from retaining old
hashed assets or development source maps. `scripts/check-studio-bundle.sh` compares the
generated `target/studio-dist/` manifest and bytes with the packaged classpath directory and
rejects source maps or authored TypeScript files.

The final POM implementation must make the frontend build fail closed: missing npm,
failed lint/typecheck/unit tests, or a failed production build must fail `mvn package`.
Generated `target/` output is ignored; source and `package-lock.json` are committed.

### Development flow

- `npm run dev` starts Vite on `http://localhost:5173` with `base: '/studio/'`.
- Vite proxies `/api/studio`, `/q`, and workflow execution paths to Quarkus on
  `http://localhost:8080`; the proxy must not forward credentials to another host.
- `mvn quarkus:dev` runs the backend and existing root console.
- A checked-in root command, `npm run dev:studio`, starts both processes and terminates
  both on failure. The command must work on macOS/Linux CI; a small Node launcher should
  be used instead of shell-specific process syntax if Windows becomes supported.
- Production E2E uses the packaged Quarkus application, not the Vite dev server, and
  verifies that `/` remains the existing console while `/studio/` loads the compiled
  Studio.

Vite's backend-integration guidance explicitly supports a backend proxy during
development and static assets in production, which is the required split here:
[Vite backend integration](https://vite.dev/guide/backend-integration.html).

## 12. Dependency upgrade and browser-support policy

### Dependency policy

1. Commit `frontend/studio/package-lock.json`; CI uses `npm ci`, never an unconstrained
   install.
2. Direct dependencies use exact versions. Transitive updates occur only through a
   reviewed lockfile change.
3. Dependabot is enabled for `/frontend/studio`, weekly, with grouped patch/minor updates
   only where the resulting lint, unit, build, Maven package, security, and Playwright
   gates pass.
4. Major framework/editor/graph upgrades require an ADR review or an explicit update to
   this document because they can change keyboard, serialization, or bundle behavior.
5. Monthly maintenance checks review Node LTS status, browser support, license changes,
   known vulnerabilities, and bundle-size budgets.
6. CI must run `npm audit --audit-level=high` or the repository's approved equivalent;
   security exceptions require a narrowly scoped, documented rationale.

### Browser policy

The initial supported browser floor is the current Vite modern-browser baseline:
Chrome/Chromium 111+, Edge 111+, Firefox 114+, and Safari 16.4+. The exact baseline is
recorded in the frontend build configuration and tested by Playwright projects for
Chromium, Firefox, and WebKit. The Studio will not add a legacy polyfill bundle unless
real deployment evidence requires it; Vite documents `@vitejs/plugin-legacy` as the
explicit opt-in for legacy browsers: [Vite production build](https://vite.dev/guide/build.html).

The product minimum viewport is 1024×768 for authoring. At smaller widths the Studio
must provide a useful read-only/source/issue layout, but graph editing and dense form
authoring may be disabled with a clear explanation.

## 13. Decision and implementation guardrails

**Decision:** Adopt React + TypeScript + Vite, CodeMirror 6, and React Flow for the
Studio; package the static build into the Quarkus JAR through Maven; preserve the root
console as a separate surface.

Required follow-up before considering the architecture production-ready:

- `STUDIO-003` must validate the source-editor and document-model round-trip gates.
- `STUDIO-101` must create the locked frontend workspace, Maven integration, proxy, and
  one-command development path.
- `STUDIO-104` must benchmark graph layout/rendering and provide a textual graph view.
- `STUDIO-005` must validate WCAG 2.2 AA behavior across source, form, graph, issues,
  and execution panels.
- A failed editor or graph spike reopens the relevant library choice; it does not permit
  silently weakening the data-preservation or accessibility requirements.

## Appendix A — Evidence log

| Evidence | Use in decision |
| --- | --- |
| [React installation](https://react.dev/learn/installation) and [React + Vite from scratch](https://react.dev/learn/build-a-react-app-from-scratch) | Supports the framework-based TypeScript application and Vite build path |
| [React existing-project integration](https://react.dev/learn/add-react-to-an-existing-project) | Supports isolating the Studio from the current root console |
| [Vite Getting Started](https://vite.dev/guide/) and [backend integration](https://vite.dev/guide/backend-integration.html) | Supports HMR, static output, base paths, and backend proxying |
| [Node.js releases](https://nodejs.org/en/about/previous-releases) | Supports the Active/Maintenance LTS policy |
| [Playwright installation](https://playwright.dev/docs/intro) | Supports the existing browser E2E choice and multi-browser test plan |
| [CodeMirror system guide](https://codemirror.net/docs/guide/) and [extensions](https://codemirror.com/docs/extensions/) | Supports modular editor state, language, lint, search, and read-only behavior |
| [Monaco accessibility guide](https://github.com/microsoft/monaco-editor/wiki/Monaco-Editor-Accessibility-Guide) | Provides the fallback editor's accessibility comparison |
| [React Flow accessibility](https://reactflow.dev/learn/advanced-use/accessibility), [API](https://reactflow.dev/api-reference), and [components](https://reactflow.dev/api-reference/components) | Supports custom nodes, ports, minimap, keyboard, and screen-reader scoring |
| [frontend-maven-plugin](https://github.com/eirslett/frontend-maven-plugin) and [Maven resources plugin](https://maven.apache.org/plugins/maven-resources-plugin/resources-mojo.html) | Supports local Node/npm execution and classpath asset packaging |

## Appendix B — Machine-readable JSON summary

```json
{
  "documentId": "DAR-2026-08-19-studio-frontend",
  "status": "proposed",
  "mode": "formal",
  "decision": "React + TypeScript + Vite with CodeMirror 6 and React Flow",
  "weights": {
    "sharedMultiViewDocumentState": 25,
    "editorGraphEcosystemAccessibility": 20,
    "quarkusMavenDeploymentFit": 15,
    "developerTestExperience": 15,
    "performanceBrowserSupport": 15,
    "migrationMaintenanceRisk": 10
  },
  "alternatives": {
    "staticConsole": {
      "gateStatus": "fail-G4",
      "scores": [1, 0, 5, 1, 5, 2],
      "total": 2.30
    },
    "reactVite": {
      "gateStatus": "pass",
      "scores": [5, 5, 4, 5, 4, 4],
      "total": 4.60
    },
    "vueVite": {
      "gateStatus": "pass",
      "scores": [5, 4, 4, 4, 4, 4],
      "total": 4.25
    }
  },
  "sensitivity": {
    "criteria": ["sharedMultiViewDocumentState", "editorGraphEcosystemAccessibility"],
    "scenarioA": {"weights": [15, 30], "ranking": ["reactVite", "vueVite", "staticConsole"]},
    "scenarioB": {"weights": [35, 10], "ranking": ["reactVite", "vueVite", "staticConsole"]},
    "stable": true
  },
  "pins": {
    "node": "24.18.0",
    "npm": "11.6.2",
    "react": "19.2.8",
    "typescript": "5.9.3",
    "vite": "8.2.1",
    "vitest": "4.1.10",
    "eslint": "10.8.0",
    "prettier": "3.9.6",
    "codemirror": "6.0.2",
    "xyflowReact": "12.11.2"
  }
}
```
