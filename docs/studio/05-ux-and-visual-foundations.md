# Studio UX and visual foundations

Status: proposed design contract for `STUDIO-005`  
Scope: the browser-based Studio at `/studio/`; the existing execution console at `/` is
preserved as a separate surface

This document defines the shared layout, semantic visual language, themes, keyboard model,
accessibility gates, and responsive behavior for OpenWorkflow Studio. The source, metadata,
and read-only graph slices are implemented; the remaining form, diagnostics, dependency, and
execution surfaces continue to use this contract. Production frontend work must verify the
gates below with automated and manual tests.

## 1. Design principles and shell

The Studio has one source model and several projections: source, form, graph, metadata,
issues, diff, and execution. Every panel must identify the active document and revision;
no panel may imply that a generated runner copy is the editable source.

The root debug console remains available at `/`. Studio routes are mounted under `/studio/`
and use the workspace API from `STUDIO-004`.

### Desktop shell

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Global bar: logo · workspace · global search · issue count · sync · help       │ 56px
├──────────────┬─────────────────────┬─────────────────────────────────────────┤
│ Primary nav  │ Explorer             │ Context header: doc · version · dirty  │
│ 224px        │ 280px                ├─────────────────────────────────────────┤
│              │ tree/list             │ View tabs: Source Form Graph Details │
│              │ filters               ├───────────────────────────────┬───────┤
│              │                       │ Main work surface              │ Info  │
│              │                       │                                │ drawer │
├──────────────┴─────────────────────┴────────────────────────────────┴───────┤
│ Issues / diff / execution dock: collapsed, expanded, or full-height route     │
└──────────────────────────────────────────────────────────────────────────────┘
```

The primary navigation is 224px wide when expanded and 64px when collapsed. The explorer
is resizable between 240px and 400px, remembers its width per workspace, and can be hidden
without losing selection. The context header remains visible while the main work surface
scrolls. Issues and execution are docks, not competing browser windows; opening one must
not destroy the current source/form/graph selection.

The shell has four landmark regions with accessible names: `nav` for primary navigation,
`aside` for the explorer, `main` for the active document view, and a labeled `aside` or
`region` for issues/execution. Only one `main` landmark exists in the DOM.

## 2. Page and panel layouts

Every route has loading, empty, no-access, parse-error, unsupported-version, offline,
read-only, dirty, and fatal-error treatments from `STUDIO-001`. Loading placeholders use
the same layout dimensions as their resolved content so selection and focus do not jump.

### Explorer

- Header: page title, Create, Import, refresh, and overflow actions.
- Filter row: search, document kind, version, validation state, and generated-sync state.
- Tree/list body: Workflows, Subflows, and Catalogs groups; nested directories remain
  data-driven rather than hard-coded to the current repository shape.
- Row content: document name, kind badge, specification version, issue count, modified
  time, and sync state. Parse failures and unsupported versions remain visible.
- Footer: result count and pagination/virtualization status for large workspaces.

The tree uses a real list/tree pattern with roving focus. Selection is separate from
expansion, and a stable deep link is updated without relying on a hover-only affordance.

### Source editor

The source view is a three-region layout: editor, optional overview/minimap, and issues
dock. The editor provides line numbers, folding, search, copy, diagnostics, and a visible
read-only reason when editing is disabled. The source header shows format, exact revision
hash, dirty state, and Save/Compare/Export actions.

The editor never silently formats a document. Proposed source patches and preservation
warnings open in Diff before Save. Diagnostics use inline markers plus an issues list;
the list is the keyboard-accessible source of truth for all markers.

### Form editor

The form view uses a section navigation rail on the left and a labeled form column in the
center. A context column on the right shows related source ranges, dependencies, and
preservation warnings. Sections are ordered by document structure: identity, metadata,
start, definitions, states/operations, transitions, errors, extensions, and unknown
fields. Unknown fields are shown in a generic read-only section unless the compatibility
profile explicitly permits safe editing.

Form controls display source-linked diagnostics beside the label, not only through color.
Changing a field selects the corresponding source range and marks the proposed patch; the
form is never a separate serialization authority.

### Graph

The graph view has a toolbar (fit, zoom, auto-layout, minimap, textual view), a pannable
canvas, and a details/selection panel. Start, state, transition, condition, callback,
operation, and terminal semantics are visible in the graph. Unknown state types use the
generic node token and retain their outgoing/incoming transitions.

The graph has two equivalent representations:

1. Visual canvas for spatial understanding and pointer interaction.
2. A structured, keyboard-navigable graph outline/table listing nodes, outgoing edges,
   conditions, targets, and terminal status.

Selecting a node or edge focuses its source range and details; selecting a source range
selects the corresponding graph element when one exists. Disconnected or unreachable
nodes show an issue badge but remain displayable.

### Details and metadata

Details is a read-only definition panel with a summary card, metadata grid, references,
dependency links, and source locations. Workflow details include ID, name, description,
version, spec version, start state, state counts, terminal states, functions, events,
errors, catalogs, and subflow references. Catalog details include OpenAPI version, title,
servers, operations, schemas, security, callbacks, and local references.

The panel uses definition lists and headings rather than visually aligned anonymous text.
Long descriptions wrap; values have copy buttons with accessible names that include the
field label.

### Issues

Issues is a filterable diagnostic surface available as a dock and full route. The toolbar
also offers conservative, draft-only quick fixes when an unambiguous repair is available.
Each fix opens a complete source diff before changing the draft; multi-location changes never
skip that review. The toolbar can export deterministic JSON or SARIF for CI and review.
filters by severity, phase, source/form/graph mapping, and current document/dependency
scope. Each issue row contains severity text/icon, rule ID, message, explanation,
suggested resolution, file, line/column, and provenance.

The selected issue has one primary focus target and any related ranges are listed as
secondary links. “Fix” is available only for a safe, source-preserving fix; otherwise the
action is Compare or Go to source. Runtime issues are visually separated from
specification validity and never invent a source range.

### Diff

Diff opens as a full-height route or modal-sized work surface depending on viewport. The
default is a side-by-side source diff with a unified toggle. A structured summary above
the source diff reports changed metadata, states, transitions, operations, references,
and preservation risks. The diff header identifies base revision, current revision,
proposed revision, and generated-sync consequence.

On narrow screens the default becomes unified diff with an accessible change list. A
stale-save conflict always exposes Reload, Compare/Merge, Save copy, and Cancel; there is
no destructive “force save” shortcut.

### Execution

Execution is a bottom dock for a selected workflow and a full route for history. It has:

- Input: structured JSON form and raw JSON editor with validation.
- Target: workflow ID/version, runner URL, and sync/async mode.
- Timeline: instance ID, state transitions, timestamps, callback suspension/resumption,
  and status.
- Output: formatted result, raw response, errors, and copy/download actions.

The panel always labels specification diagnostics, request failures, runtime failures,
and deployment/sync status as different categories. Async execution exposes correlation
IDs and suspension state without making a pending run look like a validation error.

## 3. Layout states and responsive behavior

### Desktop authoring

The target authoring viewport is **1280×800 CSS pixels or larger**. At this size the
expanded shell, explorer, context header, main editor/graph, and one dock can be used
without horizontal page scrolling. At 1024×768 the shell remains authorable with the
primary nav collapsed, explorer optionally hidden, and the context drawer converted to a
tab/drawer. This 1024×768 size is the minimum authoring viewport inherited from the
frontend architecture decision.

### Tablet and read-only

The useful tablet/read-only range is 768–1023 CSS pixels wide:

- Primary navigation becomes a drawer; explorer is a modal drawer or stacked pane.
- Source, details, issues, and execution remain fully usable in one column.
- Form editing is supported for simple fields only when the viewport has enough space;
  graph editing controls are read-only by default and the textual graph is preferred.
- Graph pan/zoom uses explicit controls as well as touch gestures; every visual action has
  a button or keyboard alternative.
- Diff uses unified mode and execution uses vertically stacked sections.

Below 768px the Studio is a useful inspection/export surface, not an authoring target.
It shows a clear “Read-only narrow layout” notice, preserves source/search/diagnostics,
and offers copy/export. No control is hidden solely because it lacks a hover state.

The layout uses CSS container queries for panels, not device detection. Text zoom to 200%
must preserve task completion without clipping or overlapping content. Long paths and
diagnostics wrap or provide an accessible expansion rather than forcing horizontal scroll.

## 4. Visual token contract

Components consume semantic tokens only. A component must not hard-code a raw color for a
state or theme. Primitive tokens can change per theme; semantic names remain stable.

### Spacing, shape, type, and motion

| Token | Value | Use |
| --- | --- | --- |
| `space-1` through `space-8` | 4, 8, 12, 16, 20, 24, 32, 40px | Insets, gaps, section rhythm |
| `radius-sm`, `radius-md`, `radius-lg` | 4, 8, 12px | Controls, cards, panels |
| `control-height` | 32px | Buttons, inputs, compact rows |
| `target-min` | 24×24px | WCAG minimum target; use 32px for primary controls |
| `text-body` | 14px / 1.5 | General UI text |
| `text-caption` | 12px / 1.4 | Metadata; never sole source of meaning |
| `text-heading` | 16–24px / 1.25 | Panel and page headings |
| `font-code` | UI monospace stack | Source, IDs, expressions, hashes |
| `motion-fast` | 120ms | Hover/focus/background changes |
| `motion-panel` | 180ms | Drawer and dock transitions |

Animations must be disabled or reduced under `prefers-reduced-motion: reduce`. State
changes must remain understandable without motion.

### Semantic color tokens

The following values are the initial palette. Text/background pairs are chosen to exceed
WCAG AA contrast for normal text; every state also has a label, icon, border, or pattern.

| Semantic token | Light value | Dark value | High-contrast fallback | Meaning |
| --- | --- | --- | --- | --- |
| `surface-canvas` | `#f8fafc` | `#0b1220` | `Canvas` | Application background |
| `surface-panel` | `#ffffff` | `#111827` | `Canvas` | Cards, editors, drawers |
| `surface-subtle` | `#f1f5f9` | `#1e293b` | `Canvas` | Secondary regions |
| `border-default` | `#64748b` | `#64748b` | `CanvasText` | Dividers and controls |
| `text-primary` | `#0f172a` | `#f8fafc` | `CanvasText` | Main text |
| `text-secondary` | `#334155` | `#cbd5e1` | `CanvasText` | Supporting text |
| `text-link` | `#075985` | `#7dd3fc` | `LinkText` | Links and navigation |
| `focus-ring` | `#7c3aed` | `#c4b5fd` | `Highlight` | Keyboard focus |
| `state-success` | `#166534` | `#86efac` | `Highlight` | Valid, synchronized, completed |
| `state-warning` | `#854d0e` | `#fde047` | `Highlight` | Warning, pending, partial |
| `state-danger` | `#b91c1c` | `#fca5a5` | `Highlight` | Error, blocked, conflict |
| `state-info` | `#0c4a6e` | `#93c5fd` | `Highlight` | Informational/runtime |
| `state-readonly` | `#475569` | `#94a3b8` | `GrayText` | Read-only/unsupported |

`forced-colors: active` uses system colors and preserves a 2px focus outline. The
application must not use `color: transparent`, background images, or color-only status
indicators. Contrast is rechecked when tokens or component surfaces change.

### Domain tokens

Domain tokens are semantic aliases, not new color families:

| Domain | Default visual | Required non-color cue |
| --- | --- | --- |
| State | `state-info` border plus type icon | Type text: Inject, Switch, Operation, Callback, Generic |
| Transition | `text-secondary` edge | Arrowhead, target label, condition/default label |
| Catalog | `state-info` badge | “Catalog” text and OpenAPI version |
| Operation | `text-link` action token | HTTP method and `operationId` text |
| Event | `state-warning` event token | Event name, wait/trigger icon, and status text |
| Error | `state-danger` token | Severity word, rule ID, icon, and source location |

State, transition, catalog, operation, event, and error tokens must be reused in explorer
rows, graph elements, metadata, issues, diff summaries, and execution timelines so the
same concept does not change meaning between panels.

## 5. Theme behavior

The default theme follows `prefers-color-scheme` on first run. A user setting can choose
System, Light, Dark, or High Contrast and persists only as a display preference; it never
changes source bytes. Theme changes update semantic tokens without remounting the editor,
losing selection, or moving focus.

Light and Dark must pass the contrast gates for text, controls, focus indicators, disabled
state treatment, diagnostic markers, graph labels, and selected/unselected surfaces.
High Contrast uses system colors, underlines links, keeps borders visible, and adds text
labels to every state badge. It is tested with Windows forced-colors behavior and browser
zoom.

## 6. Keyboard and interaction model

Shortcuts are scoped to the Studio and are enabled only when focus is inside the relevant
Studio region. The application never captures keystrokes from an input, textarea,
contenteditable, CodeMirror editor, screen-reader command layer, browser chrome, or IME
unless the shortcut is an editor-standard command and the user is not composing text.
There are no single-letter shortcuts while typing and no Alt-based global shortcuts.

| Shortcut | Scope | Action |
| --- | --- | --- |
| `Cmd/Ctrl+K` | Studio chrome, not text entry | Open command palette |
| `/` | Explorer/search context only | Focus workspace search |
| `Cmd/Ctrl+S` | Source/form editor with focus and dirty draft | Validate, open preservation diff, then save; outside editor browser behavior remains unchanged |
| `Cmd/Ctrl+Shift+S` | Active document | Open Save copy/export flow; never overwrite |
| `Cmd/Ctrl+Enter` | Validation or execution form | Run the focused action after validation |
| `Escape` | Dialog, drawer, command palette | Close the topmost transient surface and return focus |
| `Tab` / `Shift+Tab` | All surfaces | Move through the logical focus order; no positive `tabindex` |
| `Enter` / `Space` | Buttons, links, tree rows, graph outline items | Activate the focused semantic control |
| Arrow keys | Tree, tabs, listbox, graph outline | Move within the relevant composite widget |
| `Home` / `End` | Tree/list/graph outline | Move to first/last item in that widget |
| `?` | Studio chrome, not text entry | Show shortcut and accessibility help |

The command palette exposes every action with a visible label and permission/read-only
state. It is not required for any task. Context menus have button equivalents, and drag,
drop, pan, and minimap actions have keyboard alternatives.

Focus behavior is explicit: route changes focus the page heading or the first meaningful
status; issue navigation focuses the issue row and then offers “Go to source”; dialog
open moves focus inside and close returns it to the invoking control. Focus is never moved
to a hidden, disabled, or off-screen element.

## 7. WCAG 2.2 AA acceptance gates

The frontend is not accepted until the following are true on the supported browser matrix:

- All functionality is keyboard-only operable, including explorer, source diagnostics,
  form fields, graph outline, diff actions, and execution monitoring. There are no traps;
  modal focus is contained and restored.
- Landmarks, headings, labels, descriptions, table headers, tree/listbox roles, tabs,
  dialogs, and status regions are semantically exposed. Every icon-only control has an
  accessible name; every form error is associated with its field.
- Normal text reaches 4.5:1 contrast and large text reaches 3:1. Non-text controls and
  focus indicators reach 3:1 against adjacent colors. Focus has a visible 2px outline or
  equivalent area and is not obscured by sticky headers, docks, or the graph canvas.
- Errors, validation results, save completion, stale conflicts, offline transitions,
  sync status, and async execution state are announced through appropriately scoped
  `aria-live`/status regions without duplicating every editor keystroke.
- Color is never the only way to identify state, severity, selected graph elements,
  modified lines, or sync status. The textual graph alternative has the same information
  and actions as the canvas.
- Content remains usable at 200% browser zoom, reflow/one-column layouts, and with text
  spacing adjustments. No required action depends on hover, drag, animation, or color
  perception.
- Pointer targets meet at least 24×24 CSS pixels with sufficient spacing; primary buttons
  use the 32px control height. Touch and stylus alternatives do not require precision
  dragging.
- Reduced-motion, forced-colors, light/dark, and keyboard focus modes are tested. Source
  editor diagnostics are available through text, not only decorations in the editor.

Verification combines axe-style automated checks, Playwright keyboard and focus tests,
contrast assertions over computed tokens, browser zoom/reflow tests, and manual screen
reader checks on the supported desktop browsers. A failed gate blocks the related feature
from being labeled accessible in the UI.

## 8. Acceptance traceability

This note defines the eight requested work surfaces, reusable domain visual tokens,
Light/Dark/High Contrast token behavior, non-conflicting shortcuts, WCAG 2.2 AA
implementation gates, and desktop/tablet/read-only layout behavior. The token contract
and accessibility gates are prerequisites for `STUDIO-101` and the source/graph features;
they do not replace implementation or the required rendered UI tests.
