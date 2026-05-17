/**
 * Public entry point for the `@datagrid/core` package.
 *
 * This barrel is the single import surface consumed by downstream packages
 * (notably `@iasbuilt/datagrid-react`) and by application code embedding the
 * grid directly. It stitches together the framework-agnostic building blocks
 * of the data grid — state containers, selection and sort engines, the plugin
 * host, and the persisted search-index primitives — so that every public
 * symbol from any sub-module is reachable from a single import path:
 *
 * ```ts
 * import { EventBus, GridConfig, ColumnDef } from '@datagrid/core';
 * ```
 *
 * The re-export order is intentionally bottom-up: leaf types first, then
 * feature modules that depend on them, then cross-cutting subsystems like
 * plugins and undo/redo that observe the rest.
 *
 * Modules re-exported:
 * - **types** — shared interfaces, type aliases, and enumerations.
 * - **events** — the {@link EventBus} publish/subscribe implementation.
 * - **grid-model** — core grid state management.
 * - **column-model** — column definition resolution and helpers.
 * - **selection** — cell/range selection logic.
 * - **sorting** — sort-state management and comparators.
 * - **filtering** — filter predicate evaluation.
 * - **virtualization** — row/column virtualisation for large datasets.
 * - **editing** — cell editing lifecycle management.
 * - **clipboard** — copy/paste integration.
 * - **grouping** — row and column grouping engine.
 * - **plugin** — extension loading and lifecycle orchestration.
 * - **undo-redo** — command-based undo/redo stack.
 * - **transposed** — form-mode (field-per-row) grid configuration helpers.
 * - **search-index** — prefix trie, column-index builders, and IDB adapter.
 *
 * @module core
 */

// Foundational interfaces, enums, and type aliases that every other module below depends on.
export * from './types';
// Multi-validator API: `Validator`, `runValidators`, `mostSevere`.
export * from './validators';
// Publish/subscribe EventBus used as the spine for cross-subsystem communication.
export * from './events';
// Grid state container — rows, pagination state, row-level lifecycle.
export * from './grid-model';
// Column definition resolution, width/pin normalization, and related helpers.
export * from './column-model';
// Active cell and range selection models plus keyboard-driven selection transitions.
export * from './selection';
// Sort-state container, comparator factories, and multi-column sort coordination.
export * from './sorting';
// Filter predicate types, evaluation, and active-filter bookkeeping.
export * from './filtering';
// Viewport-aware row/column virtualization primitives for large datasets.
export * from './virtualization';
// Cell-editing lifecycle: begin/commit/cancel edits and value validation hooks.
export * from './editing';
// Clipboard serialization and parsing for copy/paste interoperability with spreadsheets.
export * from './clipboard';
// Row and column grouping engine, including aggregation scaffolding.
export * from './grouping';
// Plugin host: registration, dependency resolution, and lifecycle orchestration.
export * from './plugin';
// Command-based undo/redo stack built on top of the event bus.
export * from './undo-redo';
// Form-mode helpers that derive a standard GridConfig from a TransposedGridConfig.
export * from './transposed';
// Per-column search indexing: prefix trie, builders, and the IndexedDB persistence adapter.
export * from './search-index';
// Cell text overflow policy vocabulary + default policy resolver and middle-truncation helper.
export type { OverflowPolicy, Density, RichTextOverflowMode } from './overflow';
export {
  truncateMiddle,
  truncateEnd,
  getDefaultOverflowPolicy,
  resolveRichTextOverflow,
  DEFAULT_RICH_TEXT_OVERFLOW,
  RICH_TEXT_FIT_MIN_FONT_PX,
} from './overflow';
// Excel-style number-format presets + dual-unit sub-cell spec (issue #92).
export type { NumberFormatSpec, SecondaryUnitSpec } from './number-format';
export { formatNumber, isNumberFormatSpec } from './number-format';

// Re-exports of the causl primitives core depends on, so SPA integrators
// who want BYO-graph composition (`createGridModel({ graph })` +
// `graph.derived(...)` over `model.nodes.*`) need only one dependency:
// `@iasbuilt/datagrid-core`. The full @causl/core surface is still
// available via direct dep for power users.
export { createCausl, InvariantViolationError } from '@causl/core';
export type { Graph, Node, InputNode, DerivedNode, Commit } from '@causl/core';
