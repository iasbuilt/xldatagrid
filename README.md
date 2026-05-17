# iAsBuilt - xldatagrid


<p align="center" style="background-color: white; border-radius: 15px; display: inline-block; padding: 10px;">
    <!-- simple logo -->
    <img src="https://iasbuilt.com/images/logo-negative.svg" alt="iAsBuilt Logo" width="200" />
    </br></br></br></br>
</p>


A high-performance, fully-featured datagrid component library for React 19. Built as a pnpm monorepo with a framework-agnostic core, a React rendering layer, a plugin-based extension system, and first-class Material UI integration.

---

## Table of Contents

- [Development](#development)
  - [Prerequisites](#prerequisites)
  - [Setup](#setup)
  - [NPM Commands](#npm-commands)
  - [End-to-end tests (Playwright)](#end-to-end-tests-playwright)
  - [Visual regression (Chromatic)](#visual-regression-chromatic)
  - [Branch protection](#branch-protection)
  - [Playground](#playground)
  - [Storybook](#storybook)
  - [Project Structure](#project-structure)
  - [Test Suite](#test-suite)
  - [Tech Stack](#tech-stack)
- [Packages](#packages)
- [Features](#features)
  - [Core Engine](#core-engine)
  - [React Components](#react-components)
  - [State Management (causl)](#state-management-causl)
  - [Redux DevTools (development)](#redux-devtools-development)
  - [15 Cell Types](#15-cell-types)
  - [Extensions](#extensions)
  - [MUI Theme Bridge](#mui-theme-bridge)
- [Quick Start](#quick-start)
  - [Chrome Columns](#chrome-columns)
  - [Master-Detail](#master-detail)
  - [Ghost Row](#ghost-row)
  - [Extensions](#extensions-1)
  - [MUI Integration](#mui-integration)
  - [Imperative Control via Hooks](#imperative-control-via-hooks)
  - [Fine-Grained Atom Subscriptions](#fine-grained-atom-subscriptions)
- [Configuration Reference](#configuration-reference)
  - [DataGrid Props](#datagrid-props)
  - [Event Callbacks](#event-callbacks)
  - [Column Definition](#column-definition)
  - [Grid Event Types](#grid-event-types)
  - [Writing Extensions](#writing-extensions)
- [License](#license)

---

## Development

### Prerequisites

- Node.js >= 20
- pnpm 9.x

### Setup

```bash
git clone https://github.com/iasbuilt/xldatagrid.git
cd xldatagrid
pnpm install
```

### NPM Commands

#### Root-Level Commands (run from repo root)

| Command | Description |
|---------|-------------|
| `pnpm run dev` | Start the Kitchen Sink demo (Vite dev server with all features) |
| `pnpm run build` | Build all packages (`core`, `react`, `extensions`, `mui`) with tsup |
| `pnpm test` | Run the full test suite with Vitest |
| `pnpm run test:watch` | Run tests in watch mode (re-runs on file changes) |
| `pnpm run test:coverage` | Run tests with v8 code coverage report |
| `pnpm run storybook` | Start Storybook dev server on port 6006 (all component stories with MUI) |
| `pnpm run build-storybook` | Build Storybook as a static site (serve with `npx http-server storybook-static -p 6006 -o`) |

> The Storybook showcases all grid features using MUI (Material UI) cell renderers. The Kitchen Sink demo (`pnpm run dev`) provides a single-page demo with every feature enabled simultaneously.

| `pnpm run typecheck` | Type-check all packages via `tsc -b` (project references) |
| `pnpm run lint` | Lint all files with ESLint |
| `pnpm run format` | Format all files with Prettier |
| `pnpm run validate` | Full CI validation: type-check + build all packages + run all tests |
| `pnpm run docs` | Generate API documentation with TypeDoc |
| `pnpm run docs:open` | Generate API docs and open them in the browser |
| `pnpm run test:e2e` | Run the Playwright end-to-end suite against Storybook (auto-starts Storybook) |
| `pnpm run test:e2e:install` | Install the Chromium browser binary Playwright uses (run once per machine) |
| `pnpm run chromatic` | Upload Storybook to [Chromatic](https://www.chromatic.com/) for visual-regression review (requires `CHROMATIC_PROJECT_TOKEN`) |

### End-to-end tests (Playwright)

The `e2e/` directory contains Playwright specs that drive a real browser
against the Storybook instance:

- `e2e/grid-keyboard.spec.ts` — arrow-key navigation, Enter/Tab commit,
  Escape cancel on an editable text cell.
- `e2e/grid-subgrid.spec.ts` — sub-grid expansion, `aria-labelledby`
  linkage between the nested grid and its parent cell, keyboard
  reachability.
- `e2e/grid-xss.spec.ts` — hostile RichText payloads (raw HTML and
  markdown links) must not produce live `javascript:` hrefs or inline
  event handlers.

#### Running the suite

```bash
pnpm install
pnpm run test:e2e:install   # one-off: downloads Chromium
pnpm run test:e2e            # boots Storybook and runs all specs headless
```

The Playwright config spins up `storybook dev -p 6006` as its
`webServer`, so a single `pnpm run test:e2e` invocation is sufficient —
you do not need to pre-start Storybook. When a dev server is already
running locally it is reused instead of a second being spawned.

Useful flags:

```bash
pnpm exec playwright test --headed              # open a real Chromium window
pnpm exec playwright test --debug               # step-through with the Playwright inspector
pnpm exec playwright test --ui                  # interactive time-travel UI mode
pnpm exec playwright test e2e/grid-keyboard     # target a single spec file
pnpm exec playwright test -g "commits on Enter" # filter by test title (grep)
pnpm exec playwright test --repeat-each=10      # flake hunt by running each test 10×
```

#### Viewing the HTML report

After any run Playwright writes an HTML report to `playwright-report/`.
Open it with:

```bash
pnpm exec playwright show-report
```

This launches a local server (default `http://localhost:9323`) and opens
the report in your browser. The report includes per-test traces, video,
screenshots, network logs, and console output when captured. On CI the
same directory is uploaded as an artifact on failure — download the
`playwright-report` artifact from the failed job and run `show-report`
against the unzipped directory:

```bash
pnpm exec playwright show-report ./playwright-report
```

#### Recording new tests with Claude Code + Playwright MCP

[Playwright MCP](https://github.com/microsoft/playwright-mcp) exposes
Playwright as a Model Context Protocol server so Claude Code can drive
the browser directly — navigating, clicking, typing, reading the
accessibility tree — and emit a ready-to-run spec from what it
observed. Compared to the `codegen` CLI the workflow is
conversational: describe the flow, let the agent exercise it against
a live Storybook, review the generated spec, then commit.

1. Register the MCP server with Claude Code. In the repo root, add a
   `.mcp.json` (checked in) or the project-local override at
   `.claude/settings.json` → `mcpServers`:

   ```json
   {
     "mcpServers": {
       "playwright": {
         "command": "pnpm",
         "args": ["dlx", "@playwright/mcp@latest"]
       }
     }
   }
   ```

   One-off: the first invocation downloads the Playwright browsers
   under the MCP server's cache. Re-running `pnpm run
   test:e2e:install` afterwards keeps the repo-local cache in sync.

2. Start Storybook so the MCP server has a live target:

   ```bash
   pnpm run storybook
   ```

3. In Claude Code, describe the test you want — for example:

   > Record a Playwright spec that opens
   > `http://localhost:6006/iframe.html?id=basic-grid--default`,
   > tabs into the grid, arrow-navigates to row 3 column 2, and
   > asserts the focused cell's `aria-selected` is `true`. Save it
   > to `e2e/grid-focus.spec.ts`.

   The agent drives the browser through the MCP tools, verifies each
   step against the live DOM, and writes the spec file directly into
   `e2e/`. Selectors are picked from the accessibility tree, so the
   output prefers `getByRole` / `getByLabel` / `getByTestId` by
   default.

4. Run and tighten:

   ```bash
   pnpm exec playwright test e2e/grid-focus.spec.ts
   ```

   Iterate in natural language ("prefer `getByRole` over the
   generated CSS", "add an explicit wait for the sub-grid's
   `role=grid` to mount", "replace the hard-coded port with the
   config-relative `page.goto('/iframe.html?id=…')`") until the spec
   is stable on a cold run.

Prefer role-based selectors — they survive layout refactors and
exercise the same a11y wiring `grid-subgrid.spec.ts` relies on.
Replace any absolute `localhost:6006` URLs from the initial recording
with the config-relative `page.goto('/iframe.html?id=…')` so the spec
survives port changes and CI.

#### Recording tests with the Playwright CRX Chrome extension

The [Playwright CRX](https://chrome.google.com/webstore/detail/playwright-crx) Chrome
extension is a browser-resident variant of `codegen` that records tests
against pages you open normally — useful when a deploy preview, a remote
staging build, or a live product environment is easier to exercise than
starting Storybook locally, and when you want to click through the same
flow your end users hit.

1. Install the extension from the Chrome Web Store. Pin it to the
   toolbar so the record button is always visible.
2. Navigate to the page you want to cover. For this repo that is
   typically `http://localhost:6006/iframe.html?id=<story-id>` after
   `pnpm run storybook`, or a deployed Storybook/Chromatic preview URL.
3. Click the Playwright CRX icon, then **Record**. Interact with the page
   exactly as a user would — click cells, press keys, drag handles, open
   menus. The extension panel streams the generated Playwright script in
   real time.
4. When finished, click **Copy** in the panel and paste the generated
   test into a new file under `e2e/` (e.g. `e2e/grid-my-flow.spec.ts`).
   Wrap it in the standard test harness:

   ```ts
   import { test, expect } from '@playwright/test';

   test('my recorded flow', async ({ page }) => {
     // paste codegen output here
   });
   ```

5. Run it with `pnpm exec playwright test e2e/grid-my-flow.spec.ts` and
   tighten selectors / assertions by hand where the generator chose
   something brittle (e.g. nth-child CSS). Prefer `getByRole`,
   `getByLabel`, and `getByTestId`.
6. Replace any hard-coded absolute URLs from the recorder with the
   config-relative `page.goto('/iframe.html?id=…')` so the spec survives
   port changes and CI.

Because CRX runs in the same profile as your live browser session, do
not paste cookies, auth tokens, or session storage into committed specs.
Use Playwright storage-state fixtures for anything that needs auth, and
commit only the scripted navigation.

### Visual regression (Chromatic)

`pnpm run chromatic` uploads the full Storybook to Chromatic for
per-story visual diffing. Chromatic runs with `--exit-zero-on-changes`,
so visual changes surface in the Chromatic review UI rather than
blocking the merge.

The corresponding GitHub Actions job is gated behind a repository secret
named `CHROMATIC_PROJECT_TOKEN`. Configure it under *Settings → Secrets
and variables → Actions → New repository secret*. When the secret is
absent the Chromatic job is skipped with a warning — builds never fail
for missing-token reasons.

### Branch protection

Recommended required checks on `main`:

- `verify-precommit-parity / verify` (existing)
- `E2E + Visual Regression / e2e` (added by this PR)

The `visual` job is intentionally left optional so forks without the
Chromatic token can still pass CI.

### Per-Package Commands

Each package (`core`, `react`, `extensions`, `mui`) exposes the same two scripts:

| Command | Description |
|---------|-------------|
| `pnpm run build` | Build the package with tsup (outputs ESM + CJS bundles) |
| `pnpm run dev` | Watch mode — rebuild on file changes with tsup |

To run a per-package command from the repo root:

```bash
# Build only the core package
pnpm --filter @iasbuilt/datagrid-core run build

# Watch the react package
pnpm --filter @iasbuilt/datagrid-react run dev
```

### Playground

The playground is a Vite app at `playground/` with the Kitchen Sink demo:

- **Kitchen Sink** (`/kitchen-sink/`) — Single mega-grid with every feature enabled: sorting, filtering, selection, editing, validation, ghost row, context menu, column groups, chrome columns, theming, keyboard navigation, export

### Storybook

17 story files covering every feature:

- Introduction, Basic Grid, Cell Types, Chrome Columns, Column Operations, Context Menu, Editing, Extensions, Filtering, Ghost Row, Grouping, Keyboard Navigation, Kitchen Sink, Master-Detail, Selection, Sorting, Theming

### Project Structure

```
xldatagrid/
  packages/
    core/           # Framework-agnostic grid engine
    react/          # React 19 components and hooks
    extensions/     # Plugin extensions (validation, export, comments)
    mui/            # Material UI cell renderers and theme bridge
  playground/       # Vite demo app
    kitchen-sink/   # Everything-at-once mega-grid
  stories/          # Storybook stories
```

### Test Suite

42 test files covering:

- **Core** (14 files): grid model, column model, sorting, filtering, selection, editing, clipboard, undo/redo, grouping, virtualization, events, plugins, transposed grid, sub-grid expansion
- **React** (23 files): DataGrid rendering, cell types, chrome columns, ghost row, master-detail, context menu, keyboard navigation, drag-drop, theming, validation, JSON config, pivot modes, clipboard integration, column ops, selection, sort/filter, grouping, undo/redo, sub-grid, transposed grid, grid interaction state, grid store hook
- **Extensions** (3 files): regex validation, export, cell comments
- **MUI** (2 files): theme bridge, MUI cell renderers

### Tech Stack

- **Runtime**: React 19, TypeScript 5.7
- **State**: [causl](https://www.npmjs.com/package/@causl/core) (transactional state with atomic commits, glitch-free derivations, time-travel)
- **Build**: tsup (per-package ESM + CJS bundles), Vite (playground + Storybook)
- **Test**: Vitest 3 + Testing Library + jsdom
- **Storybook**: Storybook 10 with React-Vite
- **MUI**: Material UI 9 + Emotion
- **Monorepo**: pnpm workspaces

---

## Packages

| Package | Description | Version |
|---------|-------------|---------|
| `@iasbuilt/datagrid-core` | Framework-agnostic grid engine: types, state models, sorting, filtering, selection, grouping, editing, clipboard, undo/redo, virtualization, plugin system | 0.1.0 |
| `@iasbuilt/datagrid-react` | React 19 bindings: `<DataGrid>`, hooks, 15 cell renderers, chrome columns, ghost row, master-detail, transposed grid, context menu, keyboard navigation, theming | 0.1.0 |
| `@iasbuilt/datagrid-extensions` | Drop-in extensions: regex validation, cell comments, column resize, CSV/JSON/Excel export | 0.1.0 |
| `@iasbuilt/datagrid-mui` | Material UI adapter: MUI-styled cell renderers for all 15 cell types, theme bridge, `<MuiDataGrid>` convenience wrapper | 0.1.0 |

## Features

### Core Engine

- **Sorting** — Single and multi-column sorting with custom comparators and shift-click stacking
- **Filtering** — Predicate-based column filtering with configurable debounce; composite filters with AND/OR logic; operators: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `contains`, `startsWith`, `endsWith`, `between`, `isNull`, `isNotNull`
- **Selection** — Cell, row, and range selection modes with keyboard extension (Shift/Ctrl); column/row/all selection; multi-range support
- **Grouping** — Row grouping (single/multi-level) with aggregates (sum, avg, count, min, max) and collapsible column groups
- **Editing** — Inline cell editing with lifecycle management (`beginEdit` / `commitEdit` / `cancelEdit`), validation (sync + regex with error/warning/info severity), and commit/cancel semantics
- **Clipboard** — Copy, cut, and paste integration for single cells and ranges; tab-separated text and HTML table serialization; paste from spreadsheets
- **Undo/Redo** — Command-based undo/redo stack tracking cell edits, row inserts/deletes, row moves, and batch operations; configurable max history (default 100) and auto-batching timeout (300ms)
- **Virtualization** — Row and column virtualization for datasets of 500+ rows with smooth scrolling and configurable overscan
- **Plugin System** — Extension loading and lifecycle orchestration with dependency validation, hook wiring, and reverse-order teardown
- **Event Bus** — Three-phase pub/sub event system (`before` / `on` / `after`) with priority ordering and event cancellation
- **Column Model** — Column definition resolution, width calculation (with min/max clamping), frozen columns (left/right), visibility toggling, reordering, and resizing
- **Transposed Grid** — Form-mode grid where rows are fields and columns are entities

### React Components

- **`<DataGrid>`** — Primary grid component with declarative props for all features
- **`<MasterDetail>`** — Expandable row detail panels with lazy-loading support, single-expand mode, and cache invalidation
- **`<TransposedGrid>`** — Entity-per-column form-mode grid
- **`<GhostRow>`** — Inline new-row entry with position variants (top, bottom, sticky, above-header), default values, and validation
- **Context Menu** — Right-click menu with custom items, submenus, keyboard shortcuts, danger actions, and dividers
- **Keyboard Navigation** — Full arrow-key, Tab, Enter, Escape, Home/End, Page Up/Down navigation with edit-mode entry
- **Theming** — Built-in light and dark themes plus custom CSS variable token maps
- **Chrome Columns** — Optional UI chrome: controls column (far left, action buttons per row) and row-number column (far right, click-to-select, shift/ctrl multi-select, drag-to-reorder)
- **Slots** — Composable slot components: `<Toolbar>`, `<FormulaBar>`, `<StatusBar>`, `<EmptyState>`
- **Drag & Drop** — Row reordering via drag handles on row-number cells

### State Management (causl)

All grid state — data, columns, sort, filter, selection, editing, undo/redo,
grouping, pagination, and UI interaction (menus, drag, resize) — lives in a
[**causl**](https://www.npmjs.com/package/@causl/core) graph. Each mutation
flows through `graph.commit(intent, tx => …)`, yielding atomic transitions:
subscribers see exactly one new value per user-level action, never an
intermediate state. Derived selectors (`processedData`, `rowIds`,
`visibleColumns`) are `graph.derived` nodes that lazily recompute only when
their inputs change.

**BYO-graph (Bring Your Own Graph)** — pass `config.graph` to
`useGrid` / `createGridModel` to register grid state on a graph your SPA
already owns. External derivations (a pivot panel, a chart, URL state)
can then read from grid nodes through the same graph and update atomically
inside the commit that produced the mutation. See
[`playground/spa-integration/`](./playground/spa-integration/) for a worked
example.

Hooks for consumption:
- `useGrid(config)` — Returns the imperative `GridModel`; `model.graph` and
  `model.nodes.*` give direct access to the causl substrate.
- `useGridStore(model, selector?)` — `useSyncExternalStore` wrapper. Returns
  the full `GridModelState` snapshot (no selector) or a derived slice.
- `useGridInteraction({ graph?, namespace? })` — Causl-backed interaction
  state (menus, drag, resize, column overrides). Honors the BYO-graph
  contract: pass your shared graph and the hook registers under
  `<namespace>:state` (default `'interaction'`).
- `useGridContext()` — Grab the enclosing grid's `GridModel` from React
  context.
- `useCauslDevtools(model)` — see [Redux DevTools](#redux-devtools-development)
  below.

Per-mutation typed errors (`InvariantViolationError`) surface from the engine
when a write would put state in an invalid shape (e.g. a string into a
numeric column). Catch at the dispatch boundary or rely on the typed
`setCellValue<F>(cell, value: TData[F])` signature to prevent the bug at
compile time.

### Redux DevTools (development)

The grid's causl graph speaks the Redux DevTools Extension protocol via
[`@causl/devtools-bridge`](https://www.npmjs.com/package/@causl/devtools-bridge).
Every grid mutation (`cell:setValue`, `column:sort`, `interaction:open-column-menu`,
…) appears as a Redux-style action in the DevTools timeline, with the
post-commit graph snapshot inspectable in the State panel. The extension's
**Jump-to-Action / Jump-to-State** time-travel replays against the engine's
retained snapshot history (default 50 commits, configurable on the graph).

**Zero-cost in production**: the bridge import is dynamic, the connection
short-circuits when the extension isn't installed, and the hook bails on
`process.env.NODE_ENV === 'production'`. Production bundles tree-shake the
entire dep out — verified by the bridge's `connectDevtools.zero-cost.test.ts`.

#### One-time setup per developer machine

1. **Install the Redux DevTools extension** in your browser:
   - Chrome / Edge: <https://chromewebstore.google.com/detail/redux-devtools/lmhkpmbekcpmknklioeibfkpmmfibljd>
   - Firefox: <https://addons.mozilla.org/en-US/firefox/addon/reduxdevtools/>
   - Or any Chromium-based browser that supports MV3 extensions.
2. **Add the bridge as a dev dependency** in your app:
   ```sh
   pnpm add -D @causl/devtools-bridge
   ```
   (The bridge is declared as an `optional` peer dep on `@iasbuilt/datagrid-react`,
   so it's tree-shaken from production bundles when absent.)
3. **Open the Redux tab** in the browser DevTools. The extension auto-detects
   the connection on the first commit; you'll see your grid instance(s) in
   the dropdown labeled by the `name` you pass below.

#### Use in your app

Call `useCauslDevtools(model)` inside your grid container:

```tsx
import { useGrid, useCauslDevtools } from '@iasbuilt/datagrid-react';

function EmployeesGrid({ data, columns }) {
  const model = useGrid({ data, columns, rowKey: 'id' });
  useCauslDevtools(model, { name: 'employees' });
  return <DataGrid model={model} />;
}
```

That's it. Every commit on `model.graph` (cell edits, sorts, filters, menu
opens via `useGridInteraction`, etc.) shows up in DevTools.

#### Sharing one DevTools panel across multiple grids

If multiple grids share a single causl graph (BYO-graph), call the hook
**once** at the app level rather than per-grid — the bridge keeps one
connection per graph and refcounts internally:

```tsx
import { createCausl, useCauslDevtools, useGrid } from '@iasbuilt/datagrid-react';

function App() {
  const graph = useMemo(() => createCausl({ name: 'app' }), []);
  useCauslDevtools({ graph } as any, { name: 'app' });  // wraps the shared graph
  return (
    <>
      <EmployeesGrid graph={graph} />
      <ProjectsGrid graph={graph} />
    </>
  );
}
```

(The `as any` is a pragmatic cast — the hook accepts a full `GridModel`
today; a follow-up will add a `useCauslDevtoolsForGraph(graph, options)`
overload that accepts a bare graph.)

#### What you'll see in DevTools

| Field | Source |
|---|---|
| **Action type** | The commit `intent` string — e.g. `cell:setValue`, `column:sort`, `interaction:open-column-menu`. |
| **Action payload** | `{ changedNodes: [...] }` listing which causl node ids changed in the commit. |
| **State** | The full graph snapshot: every input node's current value, keyed by id. |
| **Diff** | DevTools' built-in diff view between the prior and current snapshots. |
| **Timeline** | Every commit since the page loaded (up to the engine's `snapshotRetentionCap`). |

#### Time-travel (Jump-to-Action)

Clicking the **Jump** icon next to an action in the timeline restores the
graph to that snapshot. Subsequent grid renders reflect the historical
state. To return to the live present, click Jump on the most recent action.

The reverse-path messages supported are documented in
[`@causl/devtools-bridge`'s connect.ts](https://github.com/causljs/causl-ts/blob/main/packages/devtools-bridge/src/connect.ts):
`JUMP_TO_STATE`, `JUMP_TO_ACTION`, `PAUSE_RECORDING`, `LOCK_CHANGES`,
`IMPORT_STATE`, `COMMIT`, `ROLLBACK`, `SWEEP`, `TOGGLE_ACTION`,
`TOGGLE_PERSIST`.

### 15 Cell Types

Each cell type ships as both a standalone React component and an MUI-styled variant:

| Cell Type | Component | MUI Component | Description |
|-----------|-----------|---------------|-------------|
| Text | `TextCell` | `MuiTextCell` | Single-line text input (MUI: `TextField` standard variant) |
| Numeric | `NumericCell` | `MuiNumericCell` | Number input with min/max constraints |
| Currency | `CurrencyCell` | `MuiCurrencyCell` | Formatted currency display with locale support |
| Boolean | `CheckboxCell` | `MuiBooleanCell` | Checkbox toggle (MUI: `Checkbox` with indeterminate) |
| Calendar | `CalendarCell` | `MuiCalendarCell` | Date picker |
| Status | `StatusCell` | `MuiStatusCell` | Color-coded status badge with dropdown (MUI: `Select` + `Chip`) |
| List | `ListCell` | `MuiListCell` | Single-select dropdown (MUI: `Select` + `MenuItem`) |
| Password | `PasswordCell` | `MuiPasswordCell` | Masked input with reveal toggle |
| Tags | `TagsCell` | `MuiTagsCell` | Multi-value tag chips with suggestions and free-text entry |
| Chip Select | `ChipSelectCell` | `MuiChipSelectCell` | Multi-select chip picker (MUI: `Autocomplete` multiple) |
| Compound Chip List | `CompoundChipListCell` | `MuiCompoundChipListCell` | Structured chip objects with id/label pairs |
| Rich Text | `RichTextCell` | `MuiRichTextCell` | Bold/italic/formatted text |
| Upload | `UploadCell` | `MuiUploadCell` | File attachment display (MUI: drag-drop with `LinearProgress`) |
| Actions | `ActionsCell` | `MuiActionsCell` | Row-level action buttons (MUI: `Button`) |
| Sub-Grid | `SubGridCell` | `MuiSubGridCell` | Nested grid within a cell |

All cell renderers implement the `CellRendererProps<TData>` interface:

```typescript
interface CellRendererProps<TData> {
  value: CellValue;
  row: TData;
  column: ColumnDef<TData>;
  rowIndex: number;
  isEditing: boolean;
  onCommit: (value: CellValue) => void;
  onCancel: () => void;
}
```

### Extensions

| Extension | Factory | Description |
|-----------|---------|-------------|
| Regex Validation | `createRegexValidation()` | Pattern-based cell validation |
| Cell Comments | `createCellComments()` | Threaded comments on individual cells |
| Column Resize | `createColumnResize()` | Drag-to-resize column headers |
| Export | `createExportExtension()` | CSV, JSON, and Excel export with header/footer customization |

### MUI Theme Bridge

The MUI package bridges your MUI theme to DataGrid CSS variables automatically:

| CSS Variable | MUI Source |
|---|---|
| `--dg-primary-color` | `palette.primary.main` |
| `--dg-bg-color` | `palette.background.paper` |
| `--dg-text-color` | `palette.text.primary` |
| `--dg-border-color` | `palette.divider` |
| `--dg-hover-bg` | `palette.action.hover` |
| `--dg-error-color` | `palette.error.main` |

---

## Quick Start

```bash
# Install
pnpm add @iasbuilt/datagrid-core @iasbuilt/datagrid-react

# Or with MUI integration
pnpm add @iasbuilt/datagrid-core @iasbuilt/datagrid-react @iasbuilt/datagrid-mui
```

```tsx
import { DataGrid } from '@iasbuilt/datagrid-react';
import { TextCell } from '@iasbuilt/datagrid-react/cells/TextCell';
import { NumericCell } from '@iasbuilt/datagrid-react/cells/NumericCell';

const columns = [
  { id: 'name', field: 'name', title: 'Name', cellType: 'text', editable: true },
  { id: 'age', field: 'age', title: 'Age', cellType: 'numeric', width: 100 },
];

const data = [
  { id: '1', name: 'Alice', age: 30 },
  { id: '2', name: 'Bob', age: 25 },
];

function App() {
  return (
    <DataGrid
      data={data}
      columns={columns}
      rowKey="id"
      cellRenderers={{ text: TextCell, numeric: NumericCell }}
      sorting={{ mode: 'multi' }}
      selectionMode="range"
      keyboardNavigation
    />
  );
}
```

### Chrome Columns

Add controls and row numbers to the grid edges:

```tsx
<DataGrid
  data={data}
  columns={columns}
  rowKey="id"
  chrome={{
    controls: {
      width: 80,
      actions: [
        { key: 'edit', label: 'Edit', onClick: (rowId) => console.log('Edit', rowId) },
        { key: 'delete', label: 'Del', onClick: (rowId) => console.log('Delete', rowId) },
      ],
    },
    rowNumbers: { reorderable: true },
  }}
  onRowReorder={({ sourceRowId, targetRowId }) =>
    console.log(`Move ${sourceRowId} to ${targetRowId}`)
  }
/>
```

### Master-Detail

```tsx
import { MasterDetail } from '@iasbuilt/datagrid-react';

<MasterDetail
  data={data}
  columns={columns}
  rowKey="id"
  detailComponent={({ row }) => <div>Details for {row.name}</div>}
  singleExpand        // optional: only one row expanded at a time
  fetchDetail={async (row) => loadDetails(row.id)}  // optional: lazy-load
/>
```

### Ghost Row

```tsx
<DataGrid
  data={data}
  columns={columns}
  rowKey="id"
  ghostRow={{
    position: 'bottom',
    sticky: true,
    placeholder: 'Add new row...',
    defaultValues: { department: 'Engineering' },
    validate: (values) => (!values.name ? 'Name is required' : null),
  }}
  onRowAdd={(row) => console.log('New row:', row)}
/>
```

### Extensions

```tsx
import { createRegexValidation } from '@iasbuilt/datagrid-extensions';
import { createExportExtension } from '@iasbuilt/datagrid-extensions';

// Regex validation on email fields
const emailValidator = createRegexValidation({
  pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  message: 'Invalid email format',
});

// CSV/JSON export
const exporter = createExportExtension({ format: 'csv' });
```

### MUI Integration

```tsx
import { MuiDataGrid } from '@iasbuilt/datagrid-mui';

// Automatically uses MUI-themed cell renderers and respects your MUI theme
<MuiDataGrid
  data={data}
  columns={columns}
  rowKey="id"
  muiTheme={muiTheme}   // optional: bridges MUI theme to grid CSS vars
  sorting
  selectionMode="cell"
/>
```

### Imperative Control via Hooks

```tsx
import { useGrid } from '@iasbuilt/datagrid-react';

function MyGrid() {
  const model = useGrid({ columns, data, rowKey: 'id' });

  // Imperative API
  model.sort([{ field: 'name', dir: 'asc' }]);
  model.filter({ field: 'status', value: 'active' });
  model.setCellValue({ rowId: '1', field: 'name' }, 'Alice');
  model.undo();

  return <DataGrid model={model} />;
}
```

### Fine-Grained Subscriptions

```tsx
import { useGrid } from '@iasbuilt/datagrid-react';

function MyGrid() {
  const model = useGrid(config);

  // Subscribe to a single causl node — re-runs only when that node changes.
  React.useEffect(() => {
    return model.graph.subscribe(model.nodes.processedData, (data) => {
      console.log('processed rows changed:', data.length);
    });
  }, [model]);

  return <DataGrid model={model} />;
}
```

> The pre-`0.2.0` `useGridWithAtoms({ model, store, atoms })` bundle was
> removed; reach into `model.graph` / `model.nodes` instead.

---

## Configuration Reference

### DataGrid Props

| Prop | Type | Description |
|------|------|-------------|
| `data` | `TData[]` | Row data array |
| `columns` | `ColumnDef<TData>[]` | Column definitions |
| `rowKey` | `string \| (row: TData) => string` | Unique row identifier |
| `rowHeight` | `number` | Row height in pixels |
| `headerHeight` | `number` | Header row height in pixels |
| `theme` | `'light' \| 'dark' \| Record<string, string>` | Theme or custom CSS variable map |
| `className` | `string` | CSS class name |
| `style` | `CSSProperties` | Inline styles |
| `sorting` | `boolean \| SortConfig` | Enable sorting (`mode`: `'single'` or `'multi'`) |
| `filtering` | `boolean \| FilterConfig` | Enable filtering (`debounceMs`) |
| `selectionMode` | `'cell' \| 'row' \| 'range' \| 'none'` | Selection behavior |
| `readOnly` | `boolean` | Disable all editing |
| `pageSize` | `number` | Rows per page |
| `keyboardNavigation` | `boolean` | Enable keyboard nav |
| `cellRenderers` | `Record<string, ComponentType>` | Custom cell renderer map |
| `chrome` | `ChromeConfig` | Controls column and row numbers |
| `ghostRow` | `boolean \| GhostRowConfig` | Inline new-row entry |
| `grouping` | `boolean \| GroupingConfig` | Row/column grouping |
| `contextMenu` | `boolean \| ContextMenuConfig` | Right-click menu |
| `subGrid` | `SubGridConfig` | Nested sub-grids |
| `fileDrop` | `FileDropConfig` | File drop zones |
| `pivotMode` | `'column' \| 'row'` | Pivot orientation |
| `showColumnMenu` | `boolean` | Column header menus |
| `showColumnVisibilityMenu` | `boolean` | Column visibility picker |
| `showGroupControls` | `boolean` | Grouping UI controls |

### Event Callbacks

| Callback | Signature |
|----------|-----------|
| `onCellEdit` | `(cell: CellAddress, value: CellValue) => void` |
| `onRowAdd` | `(row: TData) => void` |
| `onRowDelete` | `(rowIds: string[]) => void` |
| `onRowReorder` | `(event: { sourceRowId, targetRowId }) => void` |
| `onSelectionChange` | `(selection: SelectionState) => void` |
| `onSortChange` | `(sort: SortState) => void` |
| `onFilterChange` | `(filter: FilterState) => void` |
| `onGroupChange` | `(group: GroupState) => void` |
| `onColumnGroupChange` | `(groups: ColumnGroupConfig[]) => void` |
| `onColumnResize` | `(field: string, width: number) => void` |
| `onColumnReorder` | `(order: string[]) => void` |
| `onColumnVisibilityChange` | `(field: string, visible: boolean) => void` |
| `onColumnFreeze` | `(field: string, position: 'left' \| 'right' \| null) => void` |

### Column Definition

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Unique column identifier |
| `field` | `string` | Data field key |
| `title` | `string` | Header display text |
| `cellType` | `CellType` | One of the 15 cell types |
| `width` / `minWidth` / `maxWidth` | `number` | Column width constraints |
| `editable` | `boolean` | Allow inline editing |
| `sortable` | `boolean` | Allow sorting |
| `filterable` | `boolean` | Allow filtering |
| `resizable` | `boolean` | Allow drag-resize |
| `reorderable` | `boolean` | Allow drag-reorder |
| `visible` | `boolean` | Column visibility |
| `frozen` | `'left' \| 'right'` | Pin to edge |
| `validate` | `(value) => ValidationResult \| null` | Cell validation function |
| `options` | `StatusOption[]` | Options for status/list/select cells |
| `suggestions` | `string[]` | Autocomplete suggestions for tags |
| `placeholder` | `string` | Input placeholder text |
| `format` | `string` | Display format string |
| `min` / `max` | `number` | Numeric constraints |

### Grid Event Types

Events dispatched through the three-phase EventBus:

| Event | Description |
|-------|-------------|
| `cell:valueChange` | Cell value was modified |
| `cell:selectionChange` | Selection changed |
| `cell:click` / `cell:doubleClick` | Cell interaction |
| `cell:validation` | Validation triggered |
| `row:insert` / `row:delete` / `row:move` | Row operations |
| `column:resize` / `column:sort` / `column:filter` | Column operations |
| `column:reorder` / `column:visibility` | Column layout changes |
| `clipboard:copy` / `clipboard:paste` | Clipboard operations |
| `contextMenu:open` | Context menu opened |
| `subGrid:expand` / `subGrid:collapse` | Sub-grid toggled |
| `grid:mount` / `grid:unmount` | Grid lifecycle |
| `grid:dataChange` / `grid:stateChange` | Data/state updates |

### Writing Extensions

```typescript
import type { ExtensionDefinition } from '@iasbuilt/datagrid-core';

const myExtension: ExtensionDefinition = {
  id: 'my-extension',
  name: 'My Extension',
  version: '1.0.0',
  dependencies: [],             // other extension IDs
  init: (ctx) => {              // called on load
    const state = ctx.gridState;
    ctx.commands.setCellValue({ rowId: '1', field: 'name' }, 'Hello');
  },
  destroy: (ctx) => { },       // called on teardown (LIFO order)
  hooks: (ctx) => [
    {
      event: 'cell:valueChange',
      phase: 'after',           // 'before' | 'on' | 'after'
      priority: 500,            // lower runs first
      handler: (event) => {
        console.log('Cell changed:', event.payload);
      },
    },
  ],
};
```

## License

MIT
