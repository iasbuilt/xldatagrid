/**
 * DataGridBody — the virtualised body renderer for the data grid.
 *
 * Responsibilities:
 *  - Drive the virtualisation loop for the non-grouped render path: compute
 *    which rows fall inside `rowRange` and absolutely-position each visible
 *    row at `rowIdx * rowHeight` inside a sized spacer.
 *  - Drive the grouped render path: walk `groupedView` and emit group header
 *    rows, optional aggregate rows, and data rows, honouring the collapsed /
 *    expanded state in `rowGroupExpanded`.
 *  - Compose the per-row chrome columns around the data cells. Each rendered
 *    row has (optionally) a `ChromeControlsCell`, a `ChromeRowNumberCell`,
 *    the data cells from `orderedVisibleColumns`, and — depending on the
 *    configured row-number `position` — the row-number cell on the left or
 *    on the right of the data cells.
 *  - Render each data cell via the `renderCell` closure, which handles cell
 *    selection, the double-click-to-edit interaction, invocation of custom
 *    `cellRenderers`, the fallback `<input>` editor, validation display,
 *    frozen-column sticky offsets, and the context-menu hook.
 *  - Integrate the `GhostRow` for the blank append-row slot, positioning it
 *    at the top or bottom of either the grouped or virtualised wrapper
 *    according to `ghostRowConfig.position`.
 *  - Forward drag/drop events from the row-number cell (row reordering) and
 *    context-menu events from the row container (row-level menu) up to the
 *    owning `DataGrid`.
 *
 * Related modules:
 *  - {@link ../DataGrid} — the owning component that wires model state,
 *    virtualisation and keyboard handling and renders this component.
 *  - {@link ../chrome/ChromeControlsCell} and
 *    {@link ../chrome/ChromeRowNumberCell} — the pinned chrome column cells.
 *  - {@link ../GhostRow} — the appendable blank row at top/bottom.
 *  - {@link ./DataGridBody.styles} — inline CSSProperties factories used
 *    across both render paths.
 */
import React, { useRef, useEffect, useLayoutEffect, useState } from 'react';
import {
  ColumnDef,
  CellAddress,
  CellValue,
  CellType,
  ValidationResult,
  RowGroupConfig,
  RowGroup,
  GroupState,
  GhostRowConfig,
  GhostRowPosition,
  GridModel,
  SelectionMode,
  RowOutlineSides,
  mostSevere,
  truncateMiddle,
  truncateEnd,
  getDefaultOverflowPolicy,
} from '@iasbuilt/datagrid-core';
import type {
  ControlsColumnConfig,
  RowNumberColumnConfig,
  RowBorderStyle,
  ChromeCellContent,
  ChromeRowResolver,
  ChromeRowResolverContext,
  OverflowPolicy,
  Density,
} from '@iasbuilt/datagrid-core';
import { CellRendererProps } from '../DataGrid';
import { ChromeControlsCell, ChromeRowNumberCell } from '../chrome';
import { GhostRow } from '../GhostRow';
import { useHoverTooltip } from '../HoverTooltip';
import * as styles from './DataGridBody.styles';

// Helper: lightweight display formatter used when no custom cell
// renderer is registered for a given cellType. The full cell-renderer
// pipeline kicks in when an entry exists in `cellRenderers`; this
// fallback covers the bare-grid case so a `<DataGrid>` with no
// `cellRenderers` prop still shows sensible defaults for the common
// primitive types (boolean check / cross, currency with $-prefix,
// dates via `toLocaleDateString`).

/**
 * Coerces a {@link CellValue} into the string the bare-grid path
 * renders inside a `<td>`. Falls through to `String(value)` for
 * unrecognised types so adopters who pass exotic shapes see at least
 * an attempt at a sensible label rather than `[object Object]`.
 */
function renderCellValue(value: CellValue, cellType: CellType): string {
  if (value == null) return '';
  if (cellType === 'boolean') return value ? '\u2611' : '\u2610';
  if (cellType === 'currency' && typeof value === 'number') return `$${value.toFixed(2)}`;
  if (value instanceof Date) return value.toLocaleDateString();
  return String(value);
}

// Helper: coerce inline-editor input strings back to the column's
// storage type. See the doc-comment on `coerceCellValueForColumn`
// for the catastrophic-drift bug this guards against.

/**
 * Coerce the raw `<input>` string value into the storage type the column
 * expects, based on `column.cellType`. Numeric/currency/number columns
 * commit numbers; boolean columns commit booleans; everything else stays
 * as a string.
 *
 * Without this coercion, editing a numeric cell stores the string `"44"`
 * instead of the number `44`, which makes downstream `sum + cell` use
 * string concatenation rather than addition — observed as catastrophic
 * "gigantic number" totals in app-side aggregates over the grid.
 */
function coerceCellValueForColumn(
  col: { cellType?: CellType },
  raw: string,
): CellValue {
  const t = col.cellType;
  if (t === 'numeric' || t === 'currency') {
    if (raw === '' || raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : raw;
  }
  if (t === 'boolean') {
    return raw === 'true' || raw === '1' || raw === 'on';
  }
  return raw;
}

/**
 * Composite map key for the per-cell validation-error store. Kept
 * standalone so the encoding lives in one place — if we ever need to
 * escape the separator (a `:` inside a field name) or switch to a
 * tuple-keyed `Map`, every consumer flows through this function.
 */
function getValidationKey(rowId: string, field: string): string {
  return `${rowId}:${field}`;
}

// ---------------------------------------------------------------------------
// Helper: resolve a column's overflow policy
// ---------------------------------------------------------------------------

/**
 * Explicit `ColumnDef.overflow` wins; otherwise we delegate to
 * `getDefaultOverflowPolicy(field)` which bakes in the field-based conventions
 * (e.g. `asset_tag` → `truncate-middle`, `description` → `clamp-2`).
 */
function resolveOverflowPolicy<TData>(col: ColumnDef<TData>): OverflowPolicy {
  return col.overflow ?? getDefaultOverflowPolicy(col.field);
}

// ---------------------------------------------------------------------------
// Helper: per-policy inline styles for the cell-text wrapper
// ---------------------------------------------------------------------------

/**
 * Returns the inline styles that realise a given overflow policy on the
 * `[data-cell-text]` wrapper. Multi-line policies require `display: -webkit-box`
 * + the vendor-prefixed `-webkit-line-clamp` family; single-line truncation
 * uses the classic `text-overflow: ellipsis` triad. Vendor-prefixed properties
 * are written through `getPropertyValue` / `setProperty` at the DOM boundary
 * because React's typed `CSSProperties` surface omits them, but tests still
 * read them via `style.getPropertyValue('-webkit-line-clamp')`.
 */
function overflowStyleFor(policy: OverflowPolicy): React.CSSProperties {
  switch (policy) {
    case 'truncate-end':
    case 'truncate-middle':
      return {
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        display: 'block',
        minWidth: 0,
      };
    case 'clamp-2':
    case 'clamp-3':
      // Line clamp is a flagrantly vendor-prefixed feature — we cannot set it
      // through the typed `CSSProperties` surface, so callers apply the
      // `-webkit-line-clamp` value via `setProperty` on the element ref.
      return {
        display: '-webkit-box',
        overflow: 'hidden',
      };
    case 'wrap':
      return {
        whiteSpace: 'normal',
        wordBreak: 'break-word',
      };
    case 'reveal-only':
      return {
        overflow: 'hidden',
        whiteSpace: 'nowrap',
      };
    default:
      return {};
  }
}

/**
 * Default maxChars for single-line truncation (`truncate-end`,
 * `truncate-middle`). Sized for the 120–280px columns that dominate the
 * DAM/CMMS workload — any text strictly longer than this budget gets a
 * DOM-level ellipsis so `textContent`-based assertions (and screen readers
 * that ignore CSS `text-overflow`) observe the truncation, not just the
 * sighted visual.
 */
const TRUNCATE_MAX_CHARS = 24;

// Helper: normalise the polymorphic `ghostRow` prop into a concrete
// `GhostRowPosition`. The prop accepts `boolean | GhostRowConfig` so
// adopters can write `ghostRow` as a shorthand for default behaviour,
// or pass a config object when they need to override position /
// defaults / validation; this resolver collapses both forms to a
// single value the renderer can consume directly.

/**
 * Resolves the `ghostRow` prop to a concrete {@link GhostRowPosition}.
 * Defaults to `'bottom'` when the prop is omitted, `true`, or supplies
 * a config without an explicit position.
 */
function resolveGhostPosition<T extends Record<string, unknown> = Record<string, unknown>>(config: boolean | GhostRowConfig<T> | undefined): GhostRowPosition {
  if (typeof config === 'object' && config.position) return config.position;
  return 'bottom';
}

// ---------------------------------------------------------------------------
// Chrome-resolver shape detection
// ---------------------------------------------------------------------------

/**
 * Detects whether a chrome row resolver was declared with the named-object
 * calling convention (a single destructured object parameter).
 *
 * The detection is a structural prefix match against the resolver's
 * stringified source — the same `Function.prototype.toString()` mechanism
 * used by popular introspection libraries (redux-toolkit's
 * `checkForBraces`, vue's props-resolution). It looks for the first
 * non-whitespace token after the opening parenthesis (or the `function`
 * keyword's paren) and returns `true` when that token is `{`.
 *
 * False-negative cases all fall through to the positional branch, which
 * is the safe default — the worst that can happen is that a consumer
 * writes `(ctx) => ctx.row` without destructuring and the grid invokes
 * them as `fn(row, rowId, rowIndex)`, so `ctx === row`. Because `TData`
 * is opaque, the consumer's code breaks loudly at the first property
 * access — never silently wrong.
 *
 * Guarded against arity-0 (`(...args)`, `() => …`) and non-function
 * inputs for safety, though neither path is reachable from the typed
 * call sites.
 */
function isNamedObjectResolver(fn: unknown): boolean {
  if (typeof fn !== 'function') return false;
  // Arity-0 callables are treated as positional — this covers the
  // documented `(...args) => …` fallback case and any accidental
  // `() => …` resolver.
  if (fn.length < 1) return false;
  // Peek at the source. `toString()` on native / bound functions may
  // yield `"function X() { [native code] }"` — the regex below does not
  // match `{` before the closing paren so native callables correctly
  // fall through to positional.
  let src: string;
  try {
    src = Function.prototype.toString.call(fn);
  } catch {
    return false;
  }
  // Locate the first opening paren (after an optional leading
  // `function` / `async function` / identifier / whitespace). Arrow
  // functions begin with `(`, so the first paren is always the
  // parameter list.
  const parenIdx = src.indexOf('(');
  if (parenIdx < 0) return false;
  // Skip whitespace after `(`. If the first non-whitespace byte is `{`,
  // the resolver destructures its first parameter.
  for (let i = parenIdx + 1; i < src.length; i++) {
    const c = src.charCodeAt(i);
    // Fast whitespace check: space (32), tab (9), LF (10), CR (13).
    if (c === 32 || c === 9 || c === 10 || c === 13) continue;
    return c === 0x7b /* `{` */;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/**
 * Props for {@link DataGridBody}.
 *
 * The body is a controlled renderer: the owning `DataGrid` owns all state
 * (selection, editing, grouping, virtualisation range, validation) and passes
 * it down through these props. The body emits user intent back via the
 * `onCellEdit`, `onValidationError`, `onContextMenu`, `onGroupToggle`,
 * `onGroupChange`, `onRowNumberClick`, `onRowDrag*`, `onRowDrop` and
 * `onRowAdd` callbacks.
 *
 * Props are grouped by concern below; the non-trivial ones:
 *  - **Virtualization** — `rowRange` defines the currently-visible slice and
 *    `totalSize` the scroll spacer. `scrollRef` / `handleScroll` let the
 *    parent observe scroll events.
 *  - **Grouping** — `groupedView` is the pre-computed flat list of group
 *    header / aggregate / data rows. When non-null the grouped render path is
 *    taken (no virtualisation).
 *  - **Chrome columns** — `controlsConfig` and `rowNumberConfig` turn the
 *    respective pinned chrome columns on; their widths and click/drag hooks
 *    are supplied separately so the body can remain agnostic of how the
 *    owning grid wires row-selection and reordering behaviour.
 *  - **Ghost row** — `ghostRowConfig` may be a boolean or a config object and
 *    its `position` (top/bottom) is resolved via `resolveGhostPosition`.
 */
export interface DataGridBodyProps<TData extends Record<string, unknown>> {
  // Data
  processedData: TData[];
  rowIds: string[];
  orderedVisibleColumns: ColumnDef<TData>[];
  columnWidths: { width: number }[];
  totalWidth: number;
  rowHeight: number;

  // Virtualization
  rowRange: { startIndex: number; endIndex: number; totalSize: number };
  scrollRef: React.RefObject<HTMLDivElement | null>;
  handleScroll: (e: React.UIEvent<HTMLDivElement>) => void;

  // State
  isSelected: (rowId: string, field: string) => boolean;
  /**
   * Returns the per-side border flags for a row-selection outline, or null
   * when the row is not fully selected. When non-null, the row container gets
   * an inset box-shadow for each active side and per-cell outlines are
   * suppressed so only one outline-level is visible.
   */
  getRowSelectionBorders?: (rowId: string) => RowOutlineSides | null;
  /**
   * Returns `true` when the cell is part of a multi-cell rectangular range.
   * Defaults to always-false if not supplied. Feeds the per-cell background
   * resolver in `renderCell`, which composes it with the chrome-column
   * presentation hooks (`getRowBackground` etc., issue #14) to paint the
   * range tint. The anchor cell keeps its outline via {@link isSelected}.
   */
  isInRange?: (rowId: string, field: string) => boolean;
  isEditingCell: (rowId: string, field: string) => boolean;
  getCellType: (column: ColumnDef<TData>, rowIndex: number) => CellType;
  getColumnFrozen: (col: ColumnDef<TData>) => 'left' | 'right' | null;
  computeFrozenLeftOffset: (colIdx: number) => number;

  // Editing
  cellRenderers?: Record<string, React.ComponentType<CellRendererProps<TData>>>;
  isReadOnly: boolean;
  model: GridModel<TData>;
  validateCell: (
    col: ColumnDef<TData>,
    value: CellValue,
    rowId: string,
    row: TData,
  ) => ValidationResult[];
  clearValidation: (rowId: string, field: string) => void;
  validationErrors: Record<string, ValidationResult[]>;
  onValidationTooltip?: (
    rowId: string,
    field: string,
    source: 'hover' | 'focus',
    active: boolean,
  ) => void;
  onCellEdit?: (rowKey: string, field: string, value: CellValue, prev: CellValue) => void;
  onValidationError?: (cell: CellAddress, error: ValidationResult) => void;

  // Context menu
  onContextMenu: (e: React.MouseEvent, rowId: string | null, field: string | null) => void;

  // Grouping
  groupedView: any[] | null;
  rowGroupExpanded: Set<string>;
  onGroupToggle: (groupKey: string) => void;
  rowGroupConfig: RowGroupConfig | null;
  computedRowGroups: RowGroup[];
  onGroupChange?: (groupState: GroupState) => void;

  // Chrome columns
  controlsConfig?: ControlsColumnConfig | null;
  controlsWidth?: number;
  rowNumberConfig?: RowNumberColumnConfig | null;
  rowNumberWidth?: number;
  onRowNumberClick?: (rowId: string, shiftKey: boolean, metaKey: boolean) => void;
  onRowDragStart?: (rowId: string, rowIndex: number) => void;
  /**
   * `dragover` on a row-number cell during a row drag. The `half` argument
   * is resolved by the cell and forwarded so the grid can render a
   * row-wide drop indicator (#68) at the same edge the cell-local bar uses.
   */
  onRowDragOver?: (rowId: string, rowIndex: number, half: 'above' | 'below') => void;
  /** `dragleave` on a row-number cell — used to clear the row-wide indicator (#68). */
  onRowDragLeave?: (rowId: string, rowIndex: number) => void;
  onRowDrop?: (rowId: string, rowIndex: number) => void;
  /** `dragend` on a row-number cell — used to clear the row-wide indicator on cancel (#68). */
  onRowDragEnd?: (rowId: string, rowIndex: number) => void;
  /**
   * Currently hovered drop target for row-drag-to-reorder (#68). When set,
   * the body adds `data-drop-indicator` to the matching row container and
   * renders a row-wide bar at the resolved edge. `null` while no drag is
   * in progress.
   */
  rowDropTarget?: { rowId: string; half: 'above' | 'below' } | null;

  // Selection mode governs how a data-cell click is interpreted. In `'row'`
  // mode, clicks on data cells (issue #15) are routed through
  // `onRowNumberClick` so the chrome column's row-selection handler is the
  // single source of truth for "select this row" — whether the click
  // originated in the row-number gutter or anywhere in the row body.
  selectionMode?: SelectionMode;

  // Chrome-level row presentation hooks (issue #14). Each is evaluated per
  // rendered row; returning nullish preserves the stock presentation.
  //
  // The resolver types are {@link ChromeRowResolver} — a union of the
  // positional `(row, rowId, rowIndex) => TResult` form and the named-object
  // `(ctx: ChromeRowResolverContext<TData>) => TResult` form. The body
  // dispatches at runtime via `fn.length` (declared arity).
  getRowBorder?: ChromeRowResolver<TData, RowBorderStyle | null | undefined>;
  getRowBackground?: ChromeRowResolver<TData, string | null | undefined>;
  getChromeCellContent?: ChromeRowResolver<TData, ChromeCellContent | null | undefined>;

  // Ghost row
  showGhostRow: boolean;
  ghostRowConfig?: boolean | GhostRowConfig<TData>;
  readOnly?: boolean;
  onRowAdd?: (data: Partial<TData>) => void;

  // Sub-grid expansion
  /**
   * Set of row ids whose sub-grid is currently expanded. For each id in this
   * set, the body renders an inline expansion row beneath the parent row
   * using `renderSubGridExpansionRow`. The depth is inferred from
   * `subGridDepth` (0 for the top-level grid) so nested grids can indent and
   * avoid re-entering themselves.
   */
  expandedSubGrids?: Set<string>;
  /**
   * Called for each expanded row to produce the React subtree rendered in
   * the expansion row. Returning `null` hides the expansion (useful when the
   * row has no sub-grid columns or the data is empty).
   */
  renderSubGridExpansionRow?: (rowId: string, row: TData) => React.ReactNode;
  /** Current nesting depth; 0 for the outer grid. */
  subGridDepth?: number;
  /**
   * Stable identifier of the owning grid, forwarded to cell renderers so they
   * can construct deterministic child-grid ARIA ids for `aria-controls` linkage.
   */
  gridId?: string;

  /**
   * Grid density, forwarded from `DataGrid`. Emitted as `data-density` on each
   * rendered row so CSS / Playwright can target the active mode, and consumed
   * by the overflow machinery in the (future) clamp-vs-density interplay. The
   * body does not compute row heights from this value — `rowHeight` is already
   * resolved by the owning `DataGrid`.
   */
  density?: Density;
}

// ---------------------------------------------------------------------------
// CellTextDisplay — renders the idle (non-editing, no custom renderer) text.
// ---------------------------------------------------------------------------
//
// Wraps the formatted cell value in a `<span data-cell-text>` carrying the
// per-policy inline styles. Vendor-prefixed CSS properties (line-clamp, box
// orientation) cannot be expressed through React's typed `style` object, so
// they are applied via `setProperty` on the ref once the element mounts — the
// stylesheet the contract tests query (`style.getPropertyValue(...)`) works
// identically against both typed and prefixed rules.
//
// For `reveal-only`, the span emits a minimal affordance marker (the U+2026
// glyph under a `data-reveal-affordance` hook) alongside the raw text so the
// user has a visible cue that the full value lives in the tooltip / editor.
// The raw text itself is intentionally rendered so screen readers still read
// it without depending on the hover tooltip.

/**
 * Props for the {@link CellTextDisplay} text-overflow renderer.
 */
interface CellTextDisplayProps {
  rawText: string;
  policy: OverflowPolicy;
}

/**
 * Per-cell text-overflow renderer. Applies the requested
 * {@link OverflowPolicy} (`truncate-end`, `truncate-middle`,
 * `clamp-2`, `clamp-3`, `wrap`, `reveal-only`, `none`) using vendor-
 * prefixed CSS line-clamp rules and DOM-level truncation; see the
 * surrounding block-comment for the design rationale and the
 * accessibility / screen-reader contract.
 */
function CellTextDisplay({ rawText, policy }: CellTextDisplayProps) {
  const ref = useRef<HTMLSpanElement | null>(null);

  // Apply vendor-prefixed line-clamp rules through `setProperty` because
  // React's typed `CSSProperties` map rejects `-webkit-line-clamp`. Keeping
  // the styles on the element (not in a stylesheet) preserves the per-cell
  // inline-style model the body uses everywhere else.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (policy === 'clamp-2' || policy === 'clamp-3') {
      const lines = policy === 'clamp-2' ? '2' : '3';
      el.style.setProperty('-webkit-line-clamp', lines);
      el.style.setProperty('-webkit-box-orient', 'vertical');
    } else {
      el.style.removeProperty('-webkit-line-clamp');
      el.style.removeProperty('-webkit-box-orient');
    }
  }, [policy]);

  const displayText =
    policy === 'truncate-middle'
      ? truncateMiddle(rawText, TRUNCATE_MAX_CHARS)
      : policy === 'truncate-end'
        ? truncateEnd(rawText, TRUNCATE_MAX_CHARS)
        : rawText;

  if (policy === 'reveal-only') {
    return (
      <span
        ref={ref}
        data-cell-text
        style={overflowStyleFor(policy)}
      >
        <span
          data-reveal-affordance
          aria-hidden="true"
          style={{ marginRight: 4, color: 'var(--dg-muted-fg, #94a3b8)' }}
        >
          {'\u2026'}
        </span>
        {rawText}
      </span>
    );
  }

  return (
    <span ref={ref} data-cell-text style={overflowStyleFor(policy)}>
      {displayText}
    </span>
  );
}

// ---------------------------------------------------------------------------
// BodyCell — per-cell wrapper that owns the hover-tooltip lifecycle.
// ---------------------------------------------------------------------------
//
// `renderCell` is invoked inside the body's virtualisation loop, so it cannot
// host React hooks directly (hooks may not live inside conditionally-called
// closures). Extracting the cell JSX into a standalone component lets each
// cell legally call `useHoverTooltip` without violating the rules-of-hooks,
// and naturally scopes the tooltip state (visible, pending timer,
// aria-describedby) per cell.
//
// The component is intentionally generic over the row shape so the resolver
// signature can match `ColumnDef<TData>['note']` precisely.

/**
 * Props for the {@link BodyCell} per-cell renderer.
 *
 * Each `<DataGridBody>` cell delegates to `<BodyCell>` so the hover-
 * tooltip hook (`useHoverTooltip`) can live at a stable position in
 * the rules-of-hooks ordering. The component is generic over `TData`
 * so the column-level `note` resolver can match
 * `ColumnDef<TData>['note']` exactly.
 */
interface BodyCellProps<TData> {
  col: ColumnDef<TData>;
  colIdx: number;
  row: TData;
  rowId: string;
  cellType: CellType;
  /** Text the default hover tooltip falls back to when `note` is absent. */
  defaultContent: string;
  /** Resolved overflow policy for this cell (explicit `col.overflow` or default). */
  overflowPolicy: OverflowPolicy;
  /** DOM-shaped props for the gridcell `<div>`. */
  cellDivProps: React.HTMLAttributes<HTMLDivElement> & {
    'data-cell-type'?: string;
    'data-field'?: string;
    'data-row-id'?: string;
    'data-raw-value'?: string;
    'data-validation-severity'?: string;
    'aria-colindex'?: number;
    'aria-selected'?: boolean;
    'aria-invalid'?: 'true' | undefined;
  };
  /** Upstream validation-tooltip handlers to compose with our hover set. */
  onValidationHoverEnter?: () => void;
  onValidationHoverLeave?: () => void;
  children: React.ReactNode;
}

/**
 * Measures whether the cell's content is clipped by comparing its
 * `scrollWidth` against its `clientWidth`. Returns:
 *
 *   - `true`  — content exceeds the cell box (classic overflow signal), OR
 *               the element has not laid out yet (both dimensions are 0); the
 *               indeterminate branch errs on the side of showing the reveal
 *               tooltip so jsdom tests without explicit stubs still fire.
 *   - `false` — content fits within the cell box.
 *
 * `wrap` cells never report truncation — multi-line wrapping IS the behaviour,
 * so a horizontal overflow measurement is meaningless in that mode.
 */
function isMeasuredTruncated(
  el: HTMLElement | null,
  policy: OverflowPolicy,
  rawText: string,
): boolean {
  if (policy === 'wrap') return false;
  // Deterministic path: when a single-line truncation policy would produce a
  // shorter string than the raw text, we know the cell is truncated without
  // touching the DOM. This is robust against renderers that hide overflow
  // inside a child element (e.g. MUI `<Typography noWrap>`) where the outer
  // cell div reports `scrollWidth === clientWidth`.
  if (
    (policy === 'truncate-end' || policy === 'truncate-middle') &&
    rawText.length > TRUNCATE_MAX_CHARS
  ) {
    return true;
  }
  if (!el) return false;
  const { scrollWidth, clientWidth } = el;
  if (scrollWidth === 0 && clientWidth === 0) {
    // Not yet laid out — assume truncation is possible so the reveal
    // affordance stays live. Consumers that wire an explicit stub in tests
    // (or real browsers after layout) override this branch.
    return true;
  }
  return scrollWidth > clientWidth;
}

/**
 * Per-cell renderer extracted from `<DataGridBody>` so each cell can
 * legally invoke React hooks (`useHoverTooltip`, the truncation
 * `useLayoutEffect`) at a stable position in the hooks ordering.
 * See {@link BodyCellProps} for the input contract and the block-
 * comment above `BodyCellProps` for the rationale of the extraction.
 */
function BodyCell<TData extends Record<string, unknown>>(
  props: BodyCellProps<TData>,
) {
  const {
    col,
    row,
    defaultContent,
    overflowPolicy,
    cellDivProps,
    onValidationHoverEnter,
    onValidationHoverLeave,
    children,
  } = props;

  const cellRef = useRef<HTMLDivElement | null>(null);
  const [truncated, setTruncated] = useState<boolean>(() => overflowPolicy !== 'wrap');

  // Measure truncation synchronously after layout so the `data-truncated`
  // attribute reflects the browser's actual scrollWidth/clientWidth before
  // any test assertion runs. Re-runs when the cell resizes (column resize,
  // density toggle, data change). `useLayoutEffect` is intentional — it
  // blocks paint so the attribute never flashes stale during a scroll.
  useLayoutEffect(() => {
    const el = cellRef.current;
    if (!el) return;
    const measure = () => {
      const next = isMeasuredTruncated(el, overflowPolicy, defaultContent);
      setTruncated((prev) => (prev === next ? prev : next));
    };
    measure();
    // Observe box resizes so a later column resize re-evaluates truncation.
    // `ResizeObserver` may be absent in very old environments; the initial
    // measurement is enough for jsdom tests.
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return () => ro.disconnect();
    }
    return undefined;
  }, [overflowPolicy, defaultContent]);

  // `reveal-only` always exposes the tooltip on hover/focus regardless of
  // measured truncation — the affordance IS the reveal contract.
  const alwaysReveal = overflowPolicy === 'reveal-only';

  // Resolve the hover-tooltip body:
  //   * `col.note` wins over the default content when provided, in either
  //     string or function form.
  //   * Otherwise, suppress the tooltip when the cell is NOT truncated —
  //     hovering a cell that already shows its full value would be noise.
  //   * `reveal-only` bypasses the measurement gate and always reveals.
  const resolveContent = React.useCallback(() => {
    const note = col.note;
    if (typeof note === 'function') return note(row);
    if (typeof note === 'string') return note;
    if (alwaysReveal) return defaultContent;
    if (!truncated) return null;
    return defaultContent;
  }, [col.note, row, defaultContent, truncated, alwaysReveal]);

  const hover = useHoverTooltip({ resolveContent });

  const composedOnMouseEnter: React.MouseEventHandler<HTMLDivElement> = (e) => {
    onValidationHoverEnter?.();
    hover.onMouseEnter(e);
    cellDivProps.onMouseEnter?.(e);
  };
  const composedOnMouseLeave: React.MouseEventHandler<HTMLDivElement> = (e) => {
    onValidationHoverLeave?.();
    hover.onMouseLeave(e);
    cellDivProps.onMouseLeave?.(e);
  };
  const composedOnFocus: React.FocusEventHandler<HTMLDivElement> = (e) => {
    hover.onFocus(e);
    cellDivProps.onFocus?.(e);
  };
  const composedOnBlur: React.FocusEventHandler<HTMLDivElement> = (e) => {
    hover.onBlur(e);
    cellDivProps.onBlur?.(e);
  };

  const {
    onMouseEnter: _ignoredEnter,
    onMouseLeave: _ignoredLeave,
    onFocus: _ignoredFocus,
    onBlur: _ignoredBlur,
    ...restDivProps
  } = cellDivProps;

  // `data-truncated` is a published contract:
  //   - 'true'  → content is clipped (or measurement pending / reveal-only).
  //   - 'false' → content fits or the policy is `wrap` (multi-line).
  const truncatedAttr =
    overflowPolicy === 'wrap' ? 'false' : truncated ? 'true' : 'false';

  return (
    <div
      {...restDivProps}
      ref={cellRef}
      // Every cell is a keyboard tab-stop so hover-reveal + focus-reveal are
      // equally reachable without a mouse. The grid consumer may still layer
      // a roving-tabindex pattern on top, but the baseline contract
      // (`[role="gridcell"]` is tabbable) keeps the overflow reveal a11y
      // story honest when no higher-level keyboard wiring is configured.
      tabIndex={0}
      data-overflow-policy={overflowPolicy}
      data-truncated={truncatedAttr}
      aria-describedby={hover.ariaDescribedBy ?? restDivProps['aria-describedby']}
      onMouseEnter={composedOnMouseEnter}
      onMouseLeave={composedOnMouseLeave}
      onFocus={composedOnFocus}
      onBlur={composedOnBlur}
    >
      {children}
      {hover.tooltipNode}
    </div>
  );
}

// Component — the load-bearing body renderer.
//
// `DataGridBody` is the largest single component in the package and
// owns the most performance-sensitive code paths (per-row rendering,
// per-cell range tinting, virtualisation slice, drag-drop overlays,
// inline editor mount/unmount). It is split into the props object,
// the helper closures defined above this comment, and the JSX tree
// the function emits below.

/**
 * Body half of the grid: renders every row × column intersection
 * inside the virtualisation window, paints range / row-selection /
 * chrome tints, hosts the inline cell editor, dispatches click /
 * keyboard / drag interactions to the parent `<DataGrid>`, and
 * surfaces validation tooltips.
 *
 * The component is **presentational with side effects** — it owns
 * very little local state (only the validation-tooltip hover/focus
 * latches and a couple of refs for editor mount); every mutation goes
 * back to the caller through the prop callbacks the parent grid
 * supplies. The canonical state stays in the {@link GridModel}.
 *
 * Editor mount lifecycle: when `isEditingCell(rowId, field)` is `true`
 * the body mounts an inline `<input>` for built-in cell types (text /
 * numeric / currency / password). The input's `ref` callback branches
 * on `editing.cause` from the grid model — see issue #133's race-fix
 * for the full rationale — so `'typeToEdit'` opts out of the
 * mount-time `el.select()` and every other cause keeps the
 * "highlight existing value so the next keystroke replaces"
 * behaviour.
 *
 * @typeParam TData - Row data shape, propagated from the parent grid.
 */
export function DataGridBody<TData extends Record<string, unknown>>(
  props: DataGridBodyProps<TData>,
) {
  const {
    processedData,
    rowIds,
    orderedVisibleColumns,
    columnWidths,
    totalWidth,
    rowHeight,
    rowRange,
    scrollRef,
    handleScroll,
    isSelected,
    getRowSelectionBorders,
    isInRange,
    isEditingCell,
    getCellType,
    getColumnFrozen,
    computeFrozenLeftOffset,
    cellRenderers,
    isReadOnly,
    model,
    validateCell,
    clearValidation,
    validationErrors,
    onValidationTooltip,
    onCellEdit,
    onValidationError,
    onContextMenu,
    groupedView,
    rowGroupExpanded,
    onGroupToggle,
    rowGroupConfig,
    computedRowGroups,
    onGroupChange,
    controlsConfig,
    controlsWidth,
    rowNumberConfig,
    rowNumberWidth,
    onRowNumberClick,
    onRowDragStart,
    onRowDragOver,
    onRowDragLeave,
    onRowDrop,
    onRowDragEnd,
    rowDropTarget,
    getRowBorder,
    getRowBackground,
    getChromeCellContent,
    selectionMode,
    showGhostRow,
    ghostRowConfig,
    readOnly,
    onRowAdd,
    expandedSubGrids,
    renderSubGridExpansionRow,
    subGridDepth = 0,
    gridId,
    density,
  } = props;

  const ghostPosition = showGhostRow ? resolveGhostPosition(ghostRowConfig) : 'bottom';
  const ghostAtTop = ghostPosition === 'top' && showGhostRow;

  // ---------------------------------------------------------------------------
  // Chrome resolver memoization
  // ---------------------------------------------------------------------------
  //
  // Chrome resolvers (`getRowBackground`, `getRowBorder`, `getChromeCellContent`)
  // are invoked once per rendered row. For a 10k-row grid with an expensive
  // consumer resolver the per-render cost dominates; worse, every unrelated
  // parent re-render (e.g. a container-prop tweak) would normally re-invoke
  // every resolver even though the row data is unchanged.
  //
  // We guard against that with a WeakMap keyed by the row object. Two
  // invariants fall out for free:
  //
  //   * Correctness — when a consumer mutates a row they create a new row
  //     reference (immutable-style updates) or swap in a new object. The new
  //     reference is absent from the WeakMap, so the resolver is invoked and
  //     the fresh value is cached under the new key. Old entries are GC'd
  //     with the row.
  //   * Performance — re-rendering the body with the same `processedData`
  //     array and the same resolver identity hits the cache on every row.
  //
  // The inner `Map` is keyed by the resolver function itself so a consumer
  // that swaps the resolver (e.g. toggles the config) transparently
  // invalidates only its own slot without touching the other resolvers'
  // caches for the same row.
  //
  // `useRef` ensures the cache survives across renders; `.current` is never
  // reassigned, only mutated.
  //
  // Typing notes:
  //   * `TData extends Record<string, unknown>` at the component level, so
  //     a row reference is already a non-primitive object — it satisfies
  //     the `WeakMap` key constraint (`WeakKey`) without any cast.
  //   * The inner `Map`'s key is a chrome-resolver function. Resolvers have
  //     distinct signatures per slot (`getRowBackground` vs `getRowBorder`
  //     vs `getChromeCellContent`), and two calling conventions
  //     (positional / named-object — see {@link ChromeRowResolver}). We
  //     only use them as map identities so a plain `Function` alias is
  //     sufficient for cache storage.
  type ChromeResolverKey = Function;
  const resolverCacheRef = useRef<WeakMap<TData, Map<ChromeResolverKey, unknown>>>(new WeakMap());

  // -------------------------------------------------------------------------
  // Chrome-resolver dispatch (positional vs named-object)
  // -------------------------------------------------------------------------
  //
  // Per PR5, chrome resolvers accept either of two backward-compatible call
  // shapes — see {@link ChromeRowResolver}:
  //
  //   (row, rowId, rowIndex)        → positional (historical; unchanged)
  //   ({ row, rowId, rowIndex, … }) → named-object (self-documenting, new)
  //
  // We pick the shape by inspecting the resolver's declared first parameter:
  // the named-object form is triggered only when the resolver destructures
  // its first parameter as an object literal (`{…}` or `{…} = default`).
  //
  // The arity alone is not a reliable discriminator — historical consumers
  // routinely write `(row) => …` (a length-1 positional resolver that
  // simply ignores `rowId` and `rowIndex`), and a blind `fn.length === 1`
  // dispatch would silently pass them a context object and break. Looking
  // at the stringified function prefix tells positional `(row) => …`
  // apart from destructured `({ row }) => …` without false positives in
  // practice:
  //
  //   * `(row) => …`                  → positional
  //   * `function (row) { … }`        → positional
  //   * `({ row }) => …`              → named-object
  //   * `function ({ row }) { … }`    → named-object
  //   * `({ row } = {}) => …`         → named-object
  //   * `(...args) => …`              → positional (arity 0)
  //
  // For runtime-untyped callers (`(...args) => …`, whose `.length` is `0`)
  // we fall back to positional. This matches the compat matrix in the PR
  // description.
  //
  // The context object is constructed lazily (only for the named-object
  // branch) to keep the hot-path allocation count identical to the pre-PR5
  // shape for positional resolvers.
  const invokeChromeResolver = <TReturn,>(
    fn: ChromeRowResolver<TData, TReturn>,
    row: TData,
    rowId: string,
    rowIndex: number,
  ): TReturn => {
    if (isNamedObjectResolver(fn)) {
      const ctx: ChromeRowResolverContext<TData> = { row, rowId, rowIndex };
      return (fn as (ctx: ChromeRowResolverContext<TData>) => TReturn)(ctx);
    }
    return (fn as (row: TData, rowId: string, rowIndex: number) => TReturn)(
      row,
      rowId,
      rowIndex,
    );
  };

  const getCachedResolverResult = <TReturn,>(
    resolver: ChromeRowResolver<TData, TReturn> | undefined,
    row: TData,
    rowId: string,
    rowIndex: number,
  ): TReturn | undefined => {
    if (!resolver) return undefined;
    let byResolver = resolverCacheRef.current.get(row);
    if (!byResolver) {
      byResolver = new Map();
      resolverCacheRef.current.set(row, byResolver);
    }
    // The cache is keyed by resolver identity (the function object itself).
    if (byResolver.has(resolver)) {
      return byResolver.get(resolver) as TReturn;
    }
    const value = invokeChromeResolver(resolver, row, rowId, rowIndex);
    byResolver.set(resolver, value);
    return value;
  };

  // Issue #11: when Esc is pressed inside the fallback inline editor, the
  // unmount that follows `model.cancelEdit()` triggers a native `blur` event
  // that would otherwise commit the draft. This ref flips to `true` in the
  // Escape handler and is consulted by `onBlur` so the cancelled draft is
  // discarded. It lives at component scope so the closure captured by the
  // input survives the unmount.
  const inlineEditCancelledRef = useRef(false);

  // Row-number chrome column position.
  //
  // Defaults to 'left' to match the Excel 365 convention: row numbers sit to
  // the left of the data cells, immediately after the (optional) controls
  // column. Consumers that want the legacy layout (row numbers pinned at the
  // far right of the row) set `rowNumberConfig.position = 'right'`.
  //
  // Render order within a row is:
  //   position: 'left'  →  [controls] [row-number] [data cells...]
  //   position: 'right' →  [controls] [data cells...] [row-number]
  //
  // `rowNumberOnLeft` is cached here because both render paths (grouped and
  // non-grouped) branch on it twice per row and we want a single source of
  // truth.
  const rowNumberPosition: 'left' | 'right' = rowNumberConfig?.position ?? 'left';
  const rowNumberOnLeft = rowNumberPosition === 'left';

  // -------------------------------------------------------------------------
  // Render helper: row-number chrome cell (shared across both body paths)
  // -------------------------------------------------------------------------

  // Horizontal offset at which the row-number cell should be `position:
  // sticky` when rendered on the left. The row-number gutter must stay
  // visible during horizontal scroll (Excel-style) *and* must not overlap the
  // controls column when one is configured. The offset therefore is:
  //
  //   - `controlsWidth ?? 40`  when a controls column is active (the default
  //                            controls-column width is 40px), so the sticky
  //                            row-number cell is pinned immediately to the
  //                            right of the controls column.
  //   - `0`                    when no controls column is configured; the
  //                            row-number cell pins to the left edge.
  //   - `undefined`            when the row number is rendered on the right;
  //                            the cell does not need sticky-left positioning
  //                            in that case (the chrome cell omits the
  //                            sticky style when `stickyLeft` is undefined).
  const rowNumberStickyLeft = rowNumberOnLeft
    ? (controlsConfig ? (controlsWidth ?? 40) : 0)
    : undefined;

  // Render the row-number chrome cell for a given row.
  //
  // Factored into a helper so the grouped and non-grouped render paths can
  // share identical props/key/offset wiring and to keep the two call sites
  // (left-of-data and right-of-data) symmetrical. Returns null when the
  // caller hasn't opted into row numbers — both the config object and a
  // click handler are required before a cell is rendered, matching the
  // pre-refactor behaviour.
  //
  // The `key="__row-number__"` is stable across re-renders and distinct from
  // any column `field` value so React can reconcile this child independently
  // of the data-cell list whose keys are `col.field`.
  const renderRowNumberCell = (row: TData | undefined, rowId: string, rowIdx: number, isSelectedRow?: boolean) => {
    if (!rowNumberConfig || !onRowNumberClick) return null;
    // Resolve optional per-row chrome-cell content override. Only invoked when
    // the consumer supplied a resolver; the row may be `undefined` during a
    // brief reconciliation window (e.g. a data swap), in which case we fall
    // back to the default digit rather than propagating `undefined` into user
    // code.
    const content = row !== undefined
      ? getCachedResolverResult(getChromeCellContent, row, rowId, rowIdx) ?? null
      : null;
    return (
      <ChromeRowNumberCell
        key="__row-number__"
        rowNumber={rowIdx + 1}
        rowId={rowId}
        width={rowNumberWidth ?? 50}
        height={rowHeight}
        isSelected={isSelectedRow}
        reorderable={rowNumberConfig.reorderable !== false}
        stickyLeft={rowNumberStickyLeft}
        contentText={content?.text}
        contentIcon={content?.icon as React.ReactNode}
        onContentClick={content?.onClick}
        onSelect={onRowNumberClick}
        onDragStart={onRowDragStart}
        onDragOver={onRowDragOver}
        onDragLeave={onRowDragLeave}
        onDrop={onRowDrop}
        onDragEnd={onRowDragEnd}
      />
    );
  };

  // -------------------------------------------------------------------------
  // Row-wide drop indicator (#68)
  //
  // Renders a 3px solid coloured bar at the top or bottom edge of the row
  // container during a row-drag gesture. The row container is the
  // containing block (the absolutely-positioned virtualised row uses
  // `position: absolute`; the in-flow grouped row falls back to the
  // outer document flow — either way the indicator's `position: absolute`
  // anchors against the nearest positioned ancestor, which is the row).
  //
  // Colour is sourced from `--dg-row-drop-indicator-bg` (mapped through
  // `styles/tokens/index.ts` from the shared header-dropIndicator token) so
  // light / dark presets resolve correctly without per-component hex.
  // `pointerEvents: none` keeps the bar from swallowing the dragover events
  // that the row-number cell needs to update its half resolution.
  // -------------------------------------------------------------------------
  const renderRowDropIndicator = (half: 'above' | 'below'): React.ReactElement => {
    const indicatorStyle: React.CSSProperties = {
      position: 'absolute',
      left: 0,
      right: 0,
      height: 3,
      background: 'var(--dg-row-drop-indicator-bg, #3584e4)',
      pointerEvents: 'none',
      zIndex: 7,
      ...(half === 'above' ? { top: 0 } : { bottom: 0 }),
    };
    return (
      <div
        data-row-drop-indicator={half}
        aria-hidden="true"
        style={indicatorStyle}
      />
    );
  };

  // -------------------------------------------------------------------------
  // Find row by ID helper
  // -------------------------------------------------------------------------

  const findRowByRowId = (rowId: string): TData | undefined => {
    for (let i = 0; i < processedData.length; i++) {
      if ((rowIds[i] ?? String(i)) === rowId) return processedData[i];
    }
    return undefined;
  };

  // -------------------------------------------------------------------------
  // renderCell
  // -------------------------------------------------------------------------

  const renderCell = (
    col: ColumnDef<TData>,
    colIdx: number,
    row: TData,
    rowId: string,
    rowIdx: number,
    suppressSelectionOutline?: boolean,
    /**
     * Consumer-supplied row background (from `chrome.getRowBackground`). When
     * non-null the row container already paints an explicit colour and cells
     * must stay transparent so that colour shows through — required by the
     * range / chrome composition contract (see the tests in
     * `range-chrome-composition.test.tsx`). When null we fall through to the
     * row-alternating token inside `styles.cell` so that `getComputedStyle`
     * resolves to a concrete colour for the #70 luminance contract.
     */
    consumerRowBg?: string | null,
  ) => {
    const width = columnWidths[colIdx]?.width ?? 150;
    const value = row[col.field as keyof TData] as CellValue;
    const editing = isEditingCell(rowId, col.field);
    const selected = isSelected(rowId, col.field);
    // Per-cell background resolution. The Shift+Arrow range tint (issue #16)
    // used to live inside the cell style factory as a hard-coded
    // `--dg-range-bg` override; it now flows through the same chrome-API
    // plumbing as consumer-supplied row backgrounds so the range visual is a
    // first-class consumer of the chrome presentation hooks (issue #14)
    // rather than a parallel CSS hack.
    //
    // Composition rule: the consumer's `getRowBackground` paints the row
    // container and shows through every non-tinted cell; the range tint is
    // applied at the cell layer *on top* using the `--dg-range-bg` token's
    // built-in alpha channel, so a consumer-authored row colour stays visible
    // underneath the range highlight rather than being replaced by it. The
    // frozen-column background is the one exception and wins over both (see
    // `styles.cell`).
    // When the row is fully covered by a row-kind selection we render a
    // single outline around the row and suppress the per-cell range tint —
    // otherwise every cell in the row repaints the blue tint and the
    // selection reads as "individual cells" rather than "one row block".
    //
    // For row-level selection (#75) we still paint a blue tint on every data
    // cell — but a darker shade than the row-number gutter so the selected
    // row reads as "data area is the focus" while the gutter stays the
    // lighter affordance. The tint is surfaced as a variable so themes can
    // override; the fallback rgba is opaque enough to register as selected
    // yet dark enough to satisfy the `luminance(data) < luminance(gutter)`
    // contract in the spec.
    const cellBackground = suppressSelectionOutline
      ? 'var(--dg-row-selected-bg, rgba(59, 130, 246, 0.28))'
      : isInRange && isInRange(rowId, col.field)
        ? 'var(--dg-range-bg, rgba(59, 130, 246, 0.12))'
        : null;
    const cellType = getCellType(col, rowIdx);
    const cellAddr: CellAddress = { rowId, field: col.field };
    const CustomRenderer = cellRenderers?.[cellType];
    const vKey = getValidationKey(rowId, col.field);
    const cellResults = validationErrors[vKey] ?? [];
    const topResult = cellResults.length > 0 ? mostSevere(cellResults) : null;
    const hasValidation = cellResults.length > 0;
    const hasError = topResult?.severity === 'error';
    const frozen = getColumnFrozen(col);

    // Click dispatch (issue #15):
    //
    // In `selectionMode === 'row'`, a click anywhere in a data cell must
    // select the entire row — the same behaviour the chrome row-number
    // gutter already provides on its own cell clicks. Rather than
    // maintaining a second code path for row selection, we fan every
    // row-level click through the same `onRowNumberClick` callback the
    // chrome column uses. That is the "one click path for 'select this
    // row'" the issue calls for: consumers (or the owning DataGrid) only
    // wire row-selection once and it handles every click source.
    //
    // For all other selection modes the pre-existing cell-level selection
    // contract is preserved verbatim — `model.select(cellAddr)` selects a
    // single cell and `onRowNumberClick`, when present, still runs
    // independently from chrome gutter clicks.
    const handleCellClick = (e: React.MouseEvent) => {
      // If a child element already handled the click (e.g. a custom renderer
      // that opens a popup), respect that and skip row/cell selection.
      if (e.defaultPrevented) return;
      if (selectionMode === 'row' && onRowNumberClick) {
        onRowNumberClick(rowId, e.shiftKey, e.metaKey || e.ctrlKey);
        return;
      }
      // Shift-click extends the current rectangular range — the Excel-style
      // convention where clicking a cell with Shift held sweeps the selection
      // from the anchor to that cell. This is what the clipboard integration
      // tests rely on to build a copyable range via `click` + `shift-click`
      // rather than a drag gesture. Without Shift, the click starts a fresh
      // single-cell selection.
      if (e.shiftKey && model.getState().selection.range) {
        model.extendTo(cellAddr);
        return;
      }
      model.select(cellAddr);
    };

    // Default hover-tooltip content — shown when `col.note` is absent.
    // Mirrors what the cell actually renders for the idle (non-editing)
    // path so the tooltip's text never disagrees with the on-screen value.
    const rawDisplayText = renderCellValue(value, cellType);

    // Resolve the column's overflow policy: explicit `col.overflow` wins,
    // otherwise the field-based default. Drives both the `data-overflow-policy`
    // attribute on the cell and the inline styles applied to the text wrapper.
    const overflowPolicy = resolveOverflowPolicy(col);

    return (
      <BodyCell<TData>
        key={col.field}
        col={col}
        colIdx={colIdx}
        row={row}
        rowId={rowId}
        cellType={cellType}
        defaultContent={rawDisplayText}
        overflowPolicy={overflowPolicy}
        onValidationHoverEnter={() => onValidationTooltip?.(rowId, col.field, 'hover', true)}
        onValidationHoverLeave={() => onValidationTooltip?.(rowId, col.field, 'hover', false)}
        cellDivProps={{
          style: styles.cell({
            width,
            height: rowHeight,
            selected,
            background: cellBackground,
            hasError,
            frozen,
            frozenLeftOffset: computeFrozenLeftOffset(colIdx),
            editable: col.editable !== false && !isReadOnly,
            suppressSelectionOutline,
            // Match the row-container's alternating fallback so data cells
            // paint a concrete colour (required by #70's luminance probe)
            // without changing the visible stripe pattern. Skip when the
            // consumer supplied a row colour — the container paints that
            // explicit colour and cells must stay transparent to let it
            // show through (see chrome/range composition contract).
            rowBackground: consumerRowBg
              ? undefined
              : rowIdx % 2 === 0
                ? 'var(--dg-row-bg, #ffffff)'
                : 'var(--dg-row-bg-alt, #f8fafc)',
          }),
          role: 'gridcell',
          'aria-colindex': colIdx + 1,
          'aria-selected': selected,
          'aria-invalid': hasValidation ? 'true' : undefined,
          'data-cell-type': cellType,
          'data-field': col.field,
          'data-row-id': rowId,
          // Full, untruncated raw text mirror (see e2e/cell-overflow.spec.ts).
          // Tests and AT tooling can read this to recover the original value
          // when `truncate-*` policies rewrite the visible text with a
          // U+2026 ellipsis (e.g. after committing a long `<input>` value).
          'data-raw-value': rawDisplayText,
          'data-validation-severity': hasValidation ? topResult?.severity : undefined,
          onClick: handleCellClick,
          onContextMenu: (e) => onContextMenu(e, rowId, col.field),
          onFocus: () => onValidationTooltip?.(rowId, col.field, 'focus', true),
          onBlur: () => onValidationTooltip?.(rowId, col.field, 'focus', false),
          onDoubleClick: () => {
            if (col.editable !== false && !readOnly) {
              // Pass cause='dblclick' so the editor mount knows to take
              // over the input selection (issue #133). Without a cause,
              // the mount-time `select()` and `use-keyboard`'s type-to-
              // edit cursor placement raced under CPU contention.
              model.beginEdit(cellAddr, 'dblclick');
            }
          },
        }}
      >
        {CustomRenderer ? (
          <CustomRenderer
            value={value}
            row={row}
            column={col}
            rowIndex={rowIdx}
            isEditing={editing}
            gridId={gridId}
            rowId={rowId}
            onCommit={(v, advance) => {
              const vResults = validateCell(col, v, rowId, row);
              const severe = mostSevere(vResults);
              if (severe && severe.severity === 'error') {
                onValidationError?.(cellAddr, severe);
                model.setCellValue(cellAddr as { rowId: string; field: Extract<keyof TData, string> }, v as TData[Extract<keyof TData, string>]);
                model.cancelEdit();
                return;
              }
              model.setCellValue(cellAddr as { rowId: string; field: Extract<keyof TData, string> }, v as TData[Extract<keyof TData, string>]);
              model.cancelEdit();
              onCellEdit?.(rowId, col.field, v, value);
              // Excel-365 commit-and-advance: Enter → DOWN, Tab → RIGHT.
              // Stay at edges rather than wrap. Matches the default inline
              // <input> path below and the unit test contract in
              // `edit-commit-nav.test.tsx`.
              if (advance === 'down') {
                const nextRowId = rowIds[rowIdx + 1];
                if (nextRowId != null) {
                  model.select({ rowId: nextRowId, field: col.field });
                }
              } else if (advance === 'right') {
                const nextCol = orderedVisibleColumns[colIdx + 1];
                if (nextCol) {
                  model.select({ rowId, field: nextCol.field });
                }
              }
            }}
            onCancel={() => model.cancelEdit()}
          />
        ) : editing ? (
          <input
            autoFocus
            defaultValue={value != null ? String(value) : ''}
            style={styles.cellInput}
            ref={(el) => {
              // Clear the cancellation flag each time a new edit input
              // mounts, so a previous Esc doesn't silence the next commit.
              if (el) inlineEditCancelledRef.current = false;
              if (!el) return;
              // Issue #133 — branch on the edit cause so we don't race
              // `use-keyboard`'s type-to-edit seed.
              //
              // For dblclick / F2 / Enter / click / programmatic the
              // editor takes over input selection so a subsequent
              // keystroke REPLACES the value rather than appending
              // (without this, `autoFocus` lands the cursor at the end
              // of "138739" and typing "77777" produces "13873977777" —
              // catastrophic drift on edit).
              //
              // For `typeToEdit`, `use-keyboard` is mid-sequence: it
              // has already scheduled a synthetic `input` event with
              // the typed character and a `setSelectionRange(len, len)`
              // cursor placement after the seed. Calling `el.select()`
              // here would clobber that cursor placement and the
              // subsequent keystroke would REPLACE the seed character
              // rather than appending to it. The pre-#133 mitigation
              // was a flaky `delay: 50` in the e2e spec; the real fix
              // is to stay out of the way when the cause is type-to-
              // edit (the seed character already drives the desired
              // "replace existing value, then append" semantic).
              const cause = model.getState().editing.cause;
              if (cause === 'typeToEdit') return;
              // For every other cause we still defer to next frame so
              // the browser's native focus/dblclick selection logic
              // (which fires synchronously on `autoFocus`) does not
              // override a sync `select()` call.
              requestAnimationFrame(() => el.select());
            }}
            onBlur={e => {
              if (inlineEditCancelledRef.current) return;
              const newVal = coerceCellValueForColumn(col, e.target.value);
              const vResults = validateCell(col, newVal, rowId, row);
              const severe = mostSevere(vResults);
              if (severe && severe.severity === 'error') {
                onValidationError?.(cellAddr, severe);
                model.cancelEdit();
                return;
              }
              model.setCellValue(cellAddr as { rowId: string; field: Extract<keyof TData, string> }, newVal as TData[Extract<keyof TData, string>]);
              model.cancelEdit();
              onCellEdit?.(rowId, col.field, newVal, value);
            }}
            onKeyDown={e => {
              // Excel-365 commit-and-advance contract:
              //   Enter  → commit draft, exit edit mode, move selection DOWN
              //            one row (stay put at the last row).
              //   Tab    → commit draft, exit edit mode, move selection RIGHT
              //            one column (stay put at the last column).
              //   Escape → discard draft, exit edit mode, selection STAYS.
              //
              // We preventDefault on Enter/Tab to suppress the browser's
              // native focus-advance and form-submit behaviours, and then
              // stopPropagation so the grid-level keyboard handler does not
              // observe a second commit/selection step for the same event.
              // All *other* keys are allowed to bubble naturally so that
              // e.g. ArrowUp/Down/Left/Right (fired on the grid root after
              // the editor has exited) continue to drive grid navigation
              // without being swallowed here.
              if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                const newVal = coerceCellValueForColumn(col, (e.target as HTMLInputElement).value);
                const vResults = validateCell(col, newVal, rowId, row);
                const severe = mostSevere(vResults);
                if (severe && severe.severity === 'error') {
                  onValidationError?.(cellAddr, severe);
                  model.setCellValue(cellAddr as { rowId: string; field: Extract<keyof TData, string> }, newVal as TData[Extract<keyof TData, string>]);
                  model.cancelEdit();
                  e.stopPropagation();
                  return;
                }
                // Warnings / infos do NOT block commit — the value is
                // accepted but validation state persists so the tooltip
                // stays visible. `validateCell` already wrote the latest
                // results; avoid clobbering them with `clearValidation`.
                model.setCellValue(cellAddr as { rowId: string; field: Extract<keyof TData, string> }, newVal as TData[Extract<keyof TData, string>]);
                model.cancelEdit();
                onCellEdit?.(rowId, col.field, newVal, value);
                // Compute the commit-and-advance target. Enter steps DOWN
                // one row within the same column; Tab steps RIGHT one
                // column within the same row. At an edge (last row for
                // Enter, last column for Tab) we stay on the current cell
                // rather than wrap — matches the Excel-365 "stop at edge"
                // feel and avoids surprising the user with a hidden jump.
                if (e.key === 'Enter') {
                  const nextRowId = rowIds[rowIdx + 1];
                  if (nextRowId != null) {
                    model.select({ rowId: nextRowId, field: col.field });
                  }
                } else {
                  const nextCol = orderedVisibleColumns[colIdx + 1];
                  if (nextCol) {
                    model.select({ rowId, field: nextCol.field });
                  }
                }
                e.stopPropagation();
                return;
              }
              if (e.key === 'Escape') {
                inlineEditCancelledRef.current = true;
                model.cancelEdit();
                e.stopPropagation();
                return;
              }
              // For every other key (arrow keys, typing, etc.) let the
              // event bubble. Don't stopPropagation by default — grids
              // depend on post-edit ArrowUp/Down/Left/Right reaching the
              // grid-level keyboard handler to navigate.
            }}
          />
        ) : (
          <CellTextDisplay
            rawText={rawDisplayText}
            policy={overflowPolicy}
          />
        )}
      </BodyCell>
    );
  };

  // -------------------------------------------------------------------------
  // Grouped body rendering
  // -------------------------------------------------------------------------

  const renderGroupedBody = () => {
    if (!groupedView) return null;

    return groupedView.map((item) => {
      if (item.type === 'group') {
        const group = item.group!;
        const isExpanded = rowGroupExpanded.has(group.key);
        return (
          <React.Fragment key={`group-${item.key}`}>
            <div
              data-testid="group-header-row"
              data-group-key={group.key}
              data-group-value={String(group.value)}
              data-group-depth={item.depth}
              role="row"
              style={styles.groupHeaderRow({ height: rowHeight, totalWidth, depth: item.depth })}
              onClick={() => {
                onGroupToggle(group.key);
                onGroupChange?.({ rowGroups: computedRowGroups, expandedGroups: rowGroupExpanded });
              }}
            >
              <span style={styles.groupExpandIcon}>{isExpanded ? '\u25BC' : '\u25B6'}</span>
              <span>{String(group.value)}</span>
              <span style={styles.groupCount}>({group.count})</span>
            </div>
            {/* Aggregate row */}
            {rowGroupConfig?.aggregates && isExpanded && (
              <div
                data-testid="group-aggregate-row"
                data-group-key={group.key}
                role="row"
                style={styles.groupAggregateRow(rowHeight, totalWidth)}
              >
                {orderedVisibleColumns.map((col, colIdx) => {
                  const w = columnWidths[colIdx]?.width ?? 150;
                  const aggValue = group.aggregates?.[col.field];
                  return (
                    <div
                      key={col.field}
                      style={styles.aggregateCell(w)}
                    >
                      {aggValue != null ? String(aggValue) : ''}
                    </div>
                  );
                })}
              </div>
            )}
          </React.Fragment>
        );
      } else {
        // Data row
        const rowId = item.key;
        const row = findRowByRowId(rowId);
        if (!row) return null;
        const rowIdx = rowIds.indexOf(rowId);
        const isExpanded = expandedSubGrids?.has(rowId) ?? false;

        // Resolve per-row presentation overrides for this data row. Results
        // are cached per-row-object via `getCachedResolverResult`, so an
        // unchanged `processedData` reference skips resolver work across
        // unrelated re-renders of the grid (e.g. container-prop tweaks).
        const rowBg = getCachedResolverResult(getRowBackground, row, rowId, rowIdx) ?? null;
        const rowBorder = getCachedResolverResult(getRowBorder, row, rowId, rowIdx) ?? null;
        const rowBorders = getRowSelectionBorders ? getRowSelectionBorders(rowId) : null;
        const rowIsFullySelected = rowBorders !== null;
        const rowDropHalf =
          rowDropTarget != null && rowDropTarget.rowId === rowId
            ? rowDropTarget.half
            : null;
        return (
          <React.Fragment key={rowId}>
            <div
              style={styles.dataRow({ height: rowHeight, totalWidth, isEven: rowIdx % 2 === 0, background: rowBg, border: rowBorder, borders: rowBorders })}
              role="row"
              aria-rowindex={rowIdx + 2}
              data-row-id={rowId}
              data-row-header="true"
              data-density={density}
              data-subgrid-expanded={isExpanded ? 'true' : undefined}
              {...(rowDropHalf ? { 'data-drop-indicator': rowDropHalf } : {})}
              onContextMenu={(e) => {
                if (e.target === e.currentTarget) {
                  onContextMenu(e, rowId, null);
                }
              }}
            >
              {controlsConfig && (
                <ChromeControlsCell
                  actions={controlsConfig.actions}
                  rowId={rowId}
                  rowIndex={rowIdx}
                  width={controlsWidth ?? 40}
                  height={rowHeight}
                />
              )}
              {rowNumberOnLeft && renderRowNumberCell(row, rowId, rowIdx, rowIsFullySelected)}
              {orderedVisibleColumns.map((col, colIdx) =>
                renderCell(col, colIdx, row, rowId, rowIdx, rowIsFullySelected, rowBg)
              )}
              {!rowNumberOnLeft && renderRowNumberCell(row, rowId, rowIdx, rowIsFullySelected)}
              {rowDropHalf && renderRowDropIndicator(rowDropHalf)}
            </div>
            {isExpanded && renderSubGridExpansionRow && (
              // The expansion row is a spanning row that holds a nested grid.
              // A bare role="grid" inside role="row" or role="grid" fails
              // aria-required-children. The fix is to wrap the nested grid
              // in a single role="gridcell" so the parent grid sees a valid
              // row→gridcell hierarchy, and the gridcell's content (the
              // nested grid) is opaque to the aria-required-children rule.
              <div
                role="row"
                data-testid={`subgrid-expansion-${rowId}`}
                data-subgrid-row-id={rowId}
                data-subgrid-depth={subGridDepth + 1}
                style={styles.subGridExpansionRow({
                  totalWidth,
                  depth: subGridDepth,
                })}
              >
                <div role="gridcell" style={styles.subGridExpansionInner}>
                  {renderSubGridExpansionRow(rowId, row)}
                </div>
              </div>
            )}
          </React.Fragment>
        );
      }
    });
  };

  // -------------------------------------------------------------------------
  // Sub-grid expansion detection
  // -------------------------------------------------------------------------
  const hasExpandedSubGrids = !!expandedSubGrids && expandedSubGrids.size > 0;

  // -------------------------------------------------------------------------
  // Non-grouped body rendering
  // -------------------------------------------------------------------------

  const renderNonGroupedBody = () => {
    if (processedData.length === 0) {
      return (
        <div style={styles.emptyState}>
          No data
        </div>
      );
    }

    // Always use the virtualised window for the row range. When sub-grids are
    // expanded we switch from absolute-positioning to in-flow layout within the
    // window (so expansion rows push subsequent rows down naturally) and prepend
    // a pixel-height spacer for the rows above the window. This preserves
    // virtualisation — only O(viewport) rows are ever in the DOM — while still
    // allowing variable-height expansion rows to flow correctly.
    const windowIndices = Array.from(
      { length: rowRange.endIndex - rowRange.startIndex + 1 },
      (_, i) => rowRange.startIndex + i,
    );

    // When rendering in flow layout (hasExpandedSubGrids), the rows are no
    // longer absolutely positioned. We need a top spacer to push the visible
    // window down to its correct scroll offset so the rows appear at the right
    // position within the oversized scroll container.
    const topSpacerHeight = hasExpandedSubGrids
      ? rowRange.startIndex * rowHeight + (ghostAtTop ? rowHeight : 0)
      : 0;

    const rowElements = windowIndices.map(rowIdx => {
      const row = processedData[rowIdx];
      if (!row) return null;
      const rowId = rowIds[rowIdx] ?? String(rowIdx);
      const isExpanded = expandedSubGrids?.has(rowId) ?? false;

      // Per-row presentation overrides (issue #14). Cached per-row-object via
      // `getCachedResolverResult` so unrelated re-renders reuse the prior
      // result; a fresh row reference (data swap) invalidates the cache slot.
      const rowBg = getCachedResolverResult(getRowBackground, row, rowId, rowIdx) ?? null;
      const rowBorder = getCachedResolverResult(getRowBorder, row, rowId, rowIdx) ?? null;
      const rowBorders = getRowSelectionBorders ? getRowSelectionBorders(rowId) : null;
      const rowIsFullySelected = rowBorders !== null;

      // When sub-grids are expanded use in-flow layout so the expansion row
      // naturally pushes subsequent rows downward. When no sub-grids are
      // expanded use absolute positioning (the original virtualised layout)
      // which is faster and avoids the reflow cost of a spacer element.
      const rowStyle = hasExpandedSubGrids
        ? styles.dataRow({ height: rowHeight, totalWidth, isEven: rowIdx % 2 === 0, background: rowBg, border: rowBorder, borders: rowBorders })
        : styles.virtualizedRow({
            height: rowHeight,
            totalWidth,
            top: rowIdx * rowHeight + (ghostAtTop ? rowHeight : 0),
            isEven: rowIdx % 2 === 0,
            background: rowBg,
            border: rowBorder,
            borders: rowBorders,
          });

      const rowDropHalf =
        rowDropTarget != null && rowDropTarget.rowId === rowId
          ? rowDropTarget.half
          : null;
      return (
        <React.Fragment key={rowId}>
          <div
            style={rowStyle}
            role="row"
            aria-rowindex={rowIdx + 2}
            data-row-id={rowId}
            data-row-header="true"
            data-density={density}
            data-subgrid-expanded={isExpanded ? 'true' : undefined}
            {...(rowDropHalf ? { 'data-drop-indicator': rowDropHalf } : {})}
            onContextMenu={(e) => {
              if (e.target === e.currentTarget) {
                onContextMenu(e, rowId, null);
              }
            }}
          >
            {controlsConfig && (
              <ChromeControlsCell
                actions={controlsConfig.actions}
                rowId={rowId}
                rowIndex={rowIdx}
                width={controlsWidth ?? 40}
                height={rowHeight}
              />
            )}
            {rowNumberOnLeft && renderRowNumberCell(row, rowId, rowIdx, rowIsFullySelected)}
            {orderedVisibleColumns.map((col, colIdx) =>
              renderCell(col, colIdx, row, rowId, rowIdx, rowIsFullySelected, rowBg)
            )}
            {!rowNumberOnLeft && renderRowNumberCell(row, rowId, rowIdx, rowIsFullySelected)}
            {rowDropHalf && renderRowDropIndicator(rowDropHalf)}
          </div>
          {isExpanded && renderSubGridExpansionRow && (
            // See companion branch above for rationale: the nested grid is
            // wrapped in a single role="gridcell" so the parent grid's
            // row→gridcell hierarchy stays valid under axe-core's
            // aria-required-children rule.
            <div
              role="row"
              data-testid={`subgrid-expansion-${rowId}`}
              data-subgrid-row-id={rowId}
              data-subgrid-depth={subGridDepth + 1}
              style={styles.subGridExpansionRow({
                totalWidth,
                depth: subGridDepth,
              })}
            >
              <div role="gridcell" style={styles.subGridExpansionInner}>
                {renderSubGridExpansionRow(rowId, row)}
              </div>
            </div>
          )}
        </React.Fragment>
      );
    });

    if (!hasExpandedSubGrids || topSpacerHeight === 0) {
      return rowElements;
    }

    // Return spacer + windowed rows as a flat array that React renders as a
    // fragment. The spacer reserves vertical space for the rows above the
    // current viewport window; the flow-layout rows then appear at the correct
    // scroll position without re-implementing absolute positioning math.
    return [
      <div
        key="__top-spacer__"
        aria-hidden="true"
        style={{ height: topSpacerHeight, flexShrink: 0 }}
      />,
      ...rowElements,
    ];
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div
      ref={scrollRef}
      style={styles.scrollableBody}
      onScroll={handleScroll}
    >
      {rowGroupConfig && groupedView ? (
        <div style={styles.groupedBodyWrapper(totalWidth)}>
          {showGhostRow && ghostRowConfig && ghostPosition === 'top' && (
            <GhostRow
              columns={orderedVisibleColumns}
              columnWidths={columnWidths}
              rowHeight={rowHeight}
              topOffset={0}
              model={model as any}
              config={ghostRowConfig}
              readOnly={readOnly}
              onRowAdd={onRowAdd}
            />
          )}
          {renderGroupedBody()}
          {showGhostRow && ghostRowConfig && ghostPosition !== 'top' && (
            <GhostRow
              columns={orderedVisibleColumns}
              columnWidths={columnWidths}
              rowHeight={rowHeight}
              topOffset={0}
              model={model as any}
              config={ghostRowConfig}
              readOnly={readOnly}
              onRowAdd={onRowAdd}
            />
          )}
        </div>
      ) : (
        <div
          style={
            // Always use the virtualised wrapper so the scroll container has
            // the correct total height and the browser renders an accurate
            // scrollbar thumb. When sub-grids are expanded we switch to flow
            // layout inside the window (via a top spacer + in-flow rows) rather
            // than absolute positioning, but the outer container height is
            // unchanged so scrolling behaviour remains correct.
            styles.virtualizedBodyWrapper(
              rowRange.totalSize + (showGhostRow ? rowHeight : 0),
              totalWidth,
            )
          }
        >
          {renderNonGroupedBody()}
          {showGhostRow && ghostRowConfig && !hasExpandedSubGrids && (
            <GhostRow
              columns={orderedVisibleColumns}
              columnWidths={columnWidths}
              rowHeight={rowHeight}
              topOffset={ghostPosition === 'top' ? 0 : processedData.length * rowHeight}
              model={model as any}
              config={ghostRowConfig}
              readOnly={readOnly}
              onRowAdd={onRowAdd}
            />
          )}
        </div>
      )}
    </div>
  );
}
