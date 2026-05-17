/**
 * Core DataGrid React component module for the `@iasbuilt/datagrid-react` package.
 *
 * Thin orchestrator that composes header, body, toolbar, and context-menu
 * sub-components. Manages model wiring, keyboard navigation, virtualization,
 * drag-drop, and theme resolution. All rendering is delegated to child
 * components in the `header/`, `body/`, and `toolbar/` directories.
 *
 * Architecture overview:
 *   - The grid is structured as three visual layers stacked vertically inside a
 *     single focusable container: the **toolbar** (column visibility controls,
 *     group expand/collapse actions), the **header** (column titles, sort
 *     indicators, filter triggers, resize/reorder affordances, optional column
 *     group banner), and the **body** (virtualized rows, cell editing, row
 *     number / controls chrome columns, group summary rows).
 *   - This module owns only presentation state and event translation. The
 *     authoritative data model — rows, columns, sort/filter/group state, and
 *     edit transactions — lives in a `GridModel` from `@iasbuilt/datagrid-core`.
 *     The React tree bridges to it through {@link useGrid} (which
 *     instantiates the model) and {@link useGridStore} (which subscribes to it
 *     and produces snapshot-friendly state for rendering). All mutations flow
 *     through `model.*` methods; callbacks like `onSortChange` / `onFilterChange`
 *     fire after the model has accepted the change.
 *   - Transient UI state that the core does not need to own — menu openness,
 *     drag sessions, column visibility/width/freeze overrides, row-group
 *     expansion — is kept in React via the `useGridInteraction` reducer and
 *     local `useState` hooks.
 *
 * @module DataGrid
 */
import React, { useRef, useCallback, useState, useEffect, useId, useMemo } from 'react';
// Side-effect CSS import: the theme layer defines `--dg-*` tokens (scoped to
// `.iasbuilt-datagrid[data-theme="..."]`) plus the `data-row-selected`
// header-darken rule. Without this import the CSS lives on disk but never
// reaches the DOM, and host pages see inline-style fallbacks only.
import './styles/datagrid-theme.css';
import {
  GridConfig,
  ColumnDef,
  CellAddress,
  CellValue,
  CellRange,
  SortState,
  FilterState,
  CellType,
  RowTypeDef,
  ContextMenuConfig,
  ContextMenuItemDef,
  ValidationResult,
  ColumnGroupConfig,
  RowGroupConfig,
  GroupState,
  RowGroup,
  ControlsColumnConfig,
  RowNumberColumnConfig,
  Density,
} from '@iasbuilt/datagrid-core';
import {
  groupRows,
  getVisibleRowsWithGroups,
  isCellInRange,
  createSelectionChecker,
  getRowSelectionBorders as coreGetRowSelectionBorders,
  stripField,
  runValidators,
  mostSevere,
} from '@iasbuilt/datagrid-core';
import { ValidationTooltip } from './ValidationTooltip';
import { useGrid } from './use-grid';
import { useGridStore } from './use-grid-store';
import { useKeyboard } from './use-keyboard';
import { useVirtualization } from './use-virtualization';
import { useDragDrop } from './use-drag-drop';
import { GridContext } from './context';
import { ContextMenu, ContextMenuState, initialContextMenuState } from './ContextMenu';
import { useGridInteraction } from './state/use-grid-interaction';
import { DataGridHeader } from './header/DataGridHeader';
import { DataGridColumnMenu } from './header/DataGridColumnMenu';
import { DataGridColumnGroupHeader } from './header/DataGridColumnGroupHeader';
import { DataGridBody } from './body/DataGridBody';
import { DataGridToolbar } from './toolbar/DataGridToolbar';
import { DataGridColumnFilterMenu } from './header/column-filter-menu/DataGridColumnFilterMenu';
import { FilterConditionDialog } from './header/column-filter-menu/FilterConditionDialog';
import { useBackgroundIndexer } from './hooks/use-background-indexer';
import type { CompositeFilterDescriptor, FilterDescriptor } from '@iasbuilt/datagrid-core';
import * as styles from './DataGrid.styles';
import { lightThemeTokens, darkThemeTokens } from './styles/tokens';

/**
 * Props accepted by the {@link DataGrid} component.
 *
 * Extends `GridConfig<TData>` from `@iasbuilt/datagrid-core` with React-only
 * concerns: styling, dimension overrides, event callbacks, and UI-layer
 * toggles that have no representation inside the core model (toolbar chrome,
 * column menus, Excel-style filter menu).
 *
 * Callback props are fired after the model has accepted the corresponding
 * mutation — consumers can treat them as "committed" events. They are intended
 * for side effects such as persistence; the grid does not require a value to
 * be returned.
 *
 * @typeParam TData - Shape of a single row record. Defaults to a generic
 *   object keyed by string.
 * @see GridConfig from `@iasbuilt/datagrid-core` for the underlying data-model
 *   options (columns, rows, sorting/filtering/grouping defaults, theme, etc.).
 */
export interface DataGridProps<TData extends Record<string, unknown> = Record<string, unknown>>
  extends GridConfig<TData> {
  className?: string;
  style?: React.CSSProperties;
  rowHeight?: number;
  headerHeight?: number;
  /**
   * Grid density. `'compact'` (the default) uses a dense ~36px row height
   * tuned for scanning many rows on a single screen; `'comfortable'` pads the
   * rows out to ~48px for easier touch/reading. Surfaces as `data-density` on
   * the grid root and each row so CSS / Playwright can target the active mode.
   */
  density?: Density;
  onCellEdit?: (rowKey: string, field: string, value: CellValue, prev: CellValue) => void;
  onRowAdd?: (data: Partial<TData>) => void;
  onRowDelete?: (rowIds: string[]) => void;
  onRowReorder?: (event: { sourceRowId: string; targetRowId: string; fromIndex: number; toIndex: number }) => void;
  onSelectionChange?: (range: CellRange | null) => void;
  onSortChange?: (sort: SortState) => void;
  onFilterChange?: (filter: FilterState | null) => void;
  onGroupChange?: (groupState: GroupState) => void;
  onColumnGroupChange?: (collapsed: Set<string>) => void;
  onColumnResize?: (field: string, width: number) => void;
  onColumnReorder?: (field: string, toIndex: number) => void;
  onColumnVisibilityChange?: (field: string, visible: boolean) => void;
  onColumnFreeze?: (field: string, position: 'left' | 'right' | null) => void;
  cellRenderers?: Record<string, React.ComponentType<CellRendererProps<TData>>>;
  initialFilter?: FilterState | null;
  showGroupControls?: boolean;
  showColumnVisibilityMenu?: boolean;
  showColumnMenu?: boolean;
  /**
   * Enables the Excel 365-style column filter dropdown. When true, clicking
   * the filter icon in a header cell opens a value-list + search dropdown
   * backed by an IndexedDB-cached column index.
   */
  showFilterMenu?: boolean;
  /** Stable id used as the IndexedDB cache key prefix for the column index. */
  gridId?: string;
  /**
   * HTML `id` placed on the grid's root element. Used for ARIA linkage from
   * a parent expander's `aria-controls` to the nested grid root.
   * When omitted no `id` attribute is added to the root element.
   */
  domId?: string;
  /**
   * When set, the grid root element carries `aria-labelledby` pointing at
   * this id. Used by sub-grids to link back to the parent cell that controls
   * them, so screen readers can announce the context.
   */
  ariaLabelledBy?: string;
  groupControlRef?: string;
}

/**
 * Props passed to custom cell renderer components.
 *
 * A renderer receives both the raw value and the full row so it can compute
 * derived display (e.g. reference lookups). It is also handed the editing
 * state so a single component can render both the static and editing views;
 * commit/cancel callbacks funnel edits back through the model.
 */
export interface CellRendererProps<TData = Record<string, unknown>> {
  value: CellValue;
  row: TData;
  column: ColumnDef<TData>;
  rowIndex: number;
  isEditing: boolean;
  /**
   * Commit the edited value and exit edit mode.
   *
   * Optional second argument encodes the Excel-365 commit-and-move intent:
   *   `'down'`  → Enter  : commit and move selection DOWN one row.
   *   `'right'` → Tab    : commit and move selection RIGHT one column.
   *   `undefined`        → no advance (e.g. blur commit).
   *
   * The grid clamps at edges (last row for `'down'`, last column for `'right'`)
   * and leaves selection on the current cell rather than wrapping.
   */
  onCommit: (value: CellValue, advance?: 'down' | 'right') => void;
  onCancel: () => void;
  /**
   * Stable identifier of the owning grid, forwarded so cell renderers that
   * spawn child grids (e.g. SubGridCell) can construct deterministic ARIA ids
   * for `aria-controls` / `aria-labelledby` linkage.
   */
  gridId?: string;
  /**
   * Row identifier for the row this cell belongs to. Forwarded alongside
   * `gridId` to let SubGridCell build the stable child-grid id.
   */
  rowId?: string;
}

// ---------------------------------------------------------------------------
// Theme token helpers
//
// The palette values used by the light and dark presets are ingested from the
// organisation-wide `iasbuilt/tokens` repository (see
// `packages/react/src/styles/tokens/`). The grid does not carry its own
// hand-tuned colours any more — both theme objects are projections of the
// W3C design-token tree onto the `--dg-*` custom properties our inline styles
// consume. Run `pnpm sync:tokens` after a tokens-repo upgrade to refresh the
// snapshot under `src/styles/tokens/`.
// ---------------------------------------------------------------------------

// Theme token maps are keyed by CSS custom-property names (`--dg-*`). The
// ambient augmentation in `./styles/css-vars.d.ts` opens `csstype.Properties`
// (and therefore `React.CSSProperties`) to accept this key shape, which
// lets us drop the previous `as unknown as React.CSSProperties` double
// assertions — the structural assignment is now honest.
type CSSVariableMap = Record<`--${string}`, string>;

const LIGHT_THEME: CSSVariableMap = lightThemeTokens as CSSVariableMap;

const DARK_THEME: CSSVariableMap = darkThemeTokens as CSSVariableMap;

export function resolveThemeStyle(
  theme: 'light' | 'dark' | Record<string, string> | undefined,
): React.CSSProperties {
  if (!theme) return {};
  if (theme === 'light') return { ...LIGHT_THEME };
  if (theme === 'dark') return { ...DARK_THEME };
  // A string preset we do not recognise (e.g. `"excel365"`) is handled
  // entirely via CSS — the grid root receives `data-theme="…"` and the
  // matching stylesheet provides the tokens. Returning the string itself
  // here would cause callers to spread it as indexed character properties
  // into `style`, which React DOM then rejects with
  // `TypeError: Indexed property setter is not supported` inside
  // `setValueForStyle`. A custom token map is copied into a plain object
  // for the same reason — callers treat the result as a writable
  // `React.CSSProperties` bag and must not receive a frozen/exotic object.
  if (typeof theme === 'string') return {};
  // Consumer-supplied token maps come in as `Record<string, string>` for the
  // public API surface; we narrow to the CSS-variable keyspace at this
  // boundary. Keys not matching `--*` are simply treated as unknown CSS
  // properties by React DOM and emit the usual dev-time warning — no
  // runtime fallout.
  return { ...(theme as CSSVariableMap) };
}

export { LIGHT_THEME, DARK_THEME };

// ---------------------------------------------------------------------------
// DataGrid component
// ---------------------------------------------------------------------------

/**
 * Top-level grid component.
 *
 * Instantiates a `GridModel` from `@iasbuilt/datagrid-core`, wires it to a
 * React render tree via subscription hooks, and composes the toolbar, column
 * group banner, header, body, context menu, column menu, and (optionally) the
 * Excel-365 filter menu into a single scrolling surface.
 *
 * Lifecycle notes:
 *   - The underlying model is owned by this component; it is destroyed on
 *     unmount via a cleanup effect to release any subscriptions the core may
 *     have established.
 *   - `initialFilter` is applied exactly once on mount — subsequent changes to
 *     the prop are ignored so that controlled filter state cannot fight with
 *     the user's interactive changes.
 *
 * Usage:
 * ```tsx
 * <DataGrid
 *   columns={columns}
 *   rows={rows}
 *   showFilterMenu
 *   gridId="orders-grid"
 *   onFilterChange={setFilter}
 * />
 * ```
 *
 * @typeParam TData - Row shape; inferred from `columns`/`rows`.
 * @see GridModel and GridConfig from `@iasbuilt/datagrid-core` for the
 *   authoritative data model this component renders.
 */
export function DataGrid<TData extends Record<string, unknown>>(props: DataGridProps<TData>) {
  const {
    className,
    style,
    rowHeight: rowHeightProp,
    headerHeight = 40,
    density = 'compact',
    onCellEdit,
    onRowAdd,
    onRowDelete: _onRowDelete,
    onRowReorder,
    onSelectionChange: _onSelectionChange,
    onSortChange,
    onFilterChange: _onFilterChange,
    onGroupChange,
    onColumnGroupChange,
    onColumnResize,
    onColumnReorder,
    onColumnVisibilityChange,
    onColumnFreeze,
    cellRenderers,
    initialFilter,
    showGroupControls,
    showColumnVisibilityMenu,
    showColumnMenu,
    showFilterMenu,
    gridId,
    domId,
    ariaLabelledBy,
    groupControlRef,
    ...config
  } = props;

  // Row height defaults are density-derived. When a consumer explicitly passes
  // `rowHeight` it wins (escape hatch for bespoke sizing); otherwise compact
  // uses the historical 36px and comfortable uses 48px (the row-density test
  // asserts `style.height >= 44` when `density='comfortable'` is set).
  const rowHeight = rowHeightProp ?? (density === 'comfortable' ? 48 : 36);

  const themeStyle = resolveThemeStyle(config.theme);
  const model = useGrid(config);
  const state = useGridStore(model);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => { model.destroy(); }, [model]);

  useKeyboard(model, containerRef, config.keyboardNavigation !== false, scrollRef);

  // Apply initial filter once on mount
  const initialFilterApplied = useRef(false);
  useEffect(() => {
    if (initialFilter && !initialFilterApplied.current) {
      initialFilterApplied.current = true;
      model.filter(initialFilter);
      _onFilterChange?.(initialFilter);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dragDrop = useDragDrop(model, config.fileDrop);

  // Unified interaction state (replaces 12 separate useState calls)
  const interaction = useGridInteraction();

  // Row grouping expand/collapse — now lives on the unified interaction node
  // (issue #106). The local alias preserves call-site ergonomics while the
  // setter routes through the causl-backed `setRowGroupExpanded` helper so
  // every change is observable on the same graph as the other interaction
  // state.
  const rowGroupExpanded = interaction.state.rowGroupExpanded;
  const setRowGroupExpanded = interaction.setRowGroupExpanded;
  const [rowGroupsInitialized, setRowGroupsInitialized] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, ValidationResult[]>>({});
  // Per-cell tooltip-open state. Keyed by `${rowId}:${field}`, value is the
  // source that opened the tooltip — 'hover' or 'focus' — or undefined when
  // closed. Hover and focus are tracked as a union so leaving one source
  // does not close the tooltip while the other is still active.
  const [tooltipState, setTooltipState] = useState<Record<string, Set<'hover' | 'focus'>>>({});
  const updateTooltipState = useCallback(
    (rowId: string, field: string, source: 'hover' | 'focus', active: boolean) => {
      const key = `${rowId}:${field}`;
      setTooltipState(prev => {
        const prevSet = prev[key];
        const nextSet = new Set(prevSet ?? []);
        if (active) nextSet.add(source);
        else nextSet.delete(source);
        if (nextSet.size === 0) {
          if (!prevSet || prevSet.size === 0) return prev;
          const next = { ...prev };
          delete next[key];
          return next;
        }
        return { ...prev, [key]: nextSet };
      });
    },
    [],
  );

  // --- Context menu ---
  const contextMenuEnabled = config.contextMenu !== false && config.contextMenu !== undefined;
  const contextMenuConfig: ContextMenuConfig | null = contextMenuEnabled
    ? (typeof config.contextMenu === 'object' ? config.contextMenu : {})
    : null;

  const openContextMenu = useCallback((e: React.MouseEvent, rowId: string | null, field: string | null) => {
    if (!contextMenuEnabled && !showColumnMenu) return;
    e.preventDefault();
    if (showColumnMenu && field && !rowId) {
      interaction.openColumnMenu(field);
      return;
    }
    if (!contextMenuEnabled) return;
    interaction.openContextMenu(e.clientX, e.clientY, rowId, field);
  }, [contextMenuEnabled, showColumnMenu, interaction]);

  const closeContextMenu = useCallback(() => {
    interaction.closeMenu();
  }, [interaction]);

  // Bridge discriminated union → ContextMenuState for the ContextMenu component
  const ctxMenuState: ContextMenuState = interaction.state.menu.type === 'context'
    ? { open: true, x: interaction.state.menu.x, y: interaction.state.menu.y, rowId: interaction.state.menu.rowId, field: interaction.state.menu.field }
    : initialContextMenuState;

  const getContextMenuItems = useCallback((): ContextMenuItemDef[] => {
    const customItems = contextMenuConfig?.items ?? [];
    const builtInItems: ContextMenuItemDef[] = [];
    if (ctxMenuState.rowId) {
      builtInItems.push({
        key: '__delete-row',
        label: 'Delete Row',
        danger: true,
        onClick: (ctx) => {
          if (ctx.rowId) {
            model.deleteRows([ctx.rowId]);
            _onRowDelete?.([ctx.rowId]);
          }
        },
      });
    }
    return [...customItems, ...builtInItems];
  }, [contextMenuConfig, ctxMenuState.rowId, model, _onRowDelete]);

  // --- Columns ---
  const processedData = model.getProcessedData();
  const rowIds = model.getRowIds();
  const visibleColumns = model.getVisibleColumns();

  // Apply column group collapse
  const columnGroupConfig = config.grouping && typeof config.grouping === 'object'
    && config.grouping.columns && typeof config.grouping.columns === 'object'
    ? config.grouping.columns as ColumnGroupConfig
    : null;

  const hiddenByColumnGroup = new Set<string>();
  if (columnGroupConfig) {
    for (const group of columnGroupConfig.groups) {
      if (interaction.state.collapsedColumnGroups.has(group.id) && group.columns.length > 1) {
        for (let i = 1; i < group.columns.length; i++) {
          const colField = group.columns[i];
          if (colField) hiddenByColumnGroup.add(colField);
        }
      }
    }
  }

  const effectiveVisibleColumns = visibleColumns.filter(
    (c) => !hiddenByColumnGroup.has(c.field) && !interaction.state.hiddenColumns.has(c.field)
  );

  const effectiveGroupOrder = interaction.state.columnGroupOrder ?? (columnGroupConfig?.groups.map(g => g.id) ?? []);

  // Apply column group reorder
  let orderedVisibleColumns = effectiveVisibleColumns;
  if (columnGroupConfig && interaction.state.columnGroupOrder) {
    const orderedColumns: ColumnDef<TData>[] = [];
    for (const groupId of effectiveGroupOrder) {
      const group = columnGroupConfig.groups.find(g => g.id === groupId);
      if (group) {
        for (const field of group.columns) {
          const col = effectiveVisibleColumns.find(c => c.field === field);
          if (col) orderedColumns.push(col);
        }
      }
    }
    for (const col of effectiveVisibleColumns) {
      if (!orderedColumns.includes(col)) orderedColumns.push(col);
    }
    orderedVisibleColumns = orderedColumns;
  }

  // Apply column reorder override
  if (interaction.state.columnOrderOverride) {
    const reordered: ColumnDef<TData>[] = [];
    for (const field of interaction.state.columnOrderOverride) {
      const col = orderedVisibleColumns.find(c => c.field === field);
      if (col) reordered.push(col);
    }
    for (const col of orderedVisibleColumns) {
      if (!reordered.includes(col)) reordered.push(col);
    }
    orderedVisibleColumns = reordered;
  }

  // Frozen column resolution
  const getColumnFrozen = useCallback((col: ColumnDef<TData>): 'left' | 'right' | null => {
    if (col.field in interaction.state.frozenOverrides) {
      return interaction.state.frozenOverrides[col.field] ?? null;
    }
    return col.frozen ?? null;
  }, [interaction.state.frozenOverrides]);

  // Last field per column group (for border rendering)
  const lastFieldInGroup = new Map<string, string>();
  if (columnGroupConfig) {
    for (const group of columnGroupConfig.groups) {
      const visibleInGroup = group.columns.filter(
        (f) => orderedVisibleColumns.some((c) => c.field === f)
      );
      if (visibleInGroup.length > 0) {
        const lastField = visibleInGroup[visibleInGroup.length - 1];
        if (lastField) lastFieldInGroup.set(lastField, 'true');
      }
    }
  }

  // Column widths
  const columnWidths = orderedVisibleColumns.map(c => ({
    width: interaction.state.columnWidthOverrides[c.field] ?? state.columns.widths[c.field] ?? c.width ?? 150,
  }));

  // Virtualization
  const { rowRange, colRange: _colRange, handleScroll } = useVirtualization({
    totalRows: processedData.length,
    rowHeight,
    columns: columnWidths,
    containerRef: scrollRef,
  });

  // Cell type resolution
  const getCellType = useCallback((column: ColumnDef<TData>, rowIndex: number): CellType => {
    if (config.pivotMode === 'row' && config.rowTypes) {
      const rowType = (config.rowTypes as RowTypeDef[]).find(rt => rt.index === rowIndex);
      if (rowType) return rowType.cellType;
    }
    return column.cellType ?? 'text';
  }, [config.pivotMode, config.rowTypes]);

  const selectionChecker = useMemo(
    () => createSelectionChecker(state.selection.ranges, orderedVisibleColumns, rowIds),
    [state.selection.ranges, orderedVisibleColumns, rowIds],
  );

  const isSelected = useCallback((rowId: string, field: string): boolean => {
    const rowIdx = rowIds.indexOf(rowId);
    const colIdx = orderedVisibleColumns.findIndex(c => c.field === field);
    if (rowIdx === -1 || colIdx === -1) return false;
    return selectionChecker(rowIdx, colIdx);
  }, [selectionChecker, rowIds, orderedVisibleColumns]);

  // Determine whether the active selection spans more than one cell so the
  // body can apply a range-tint background (in addition to the per-cell
  // outline) to the non-anchor cells. A single-cell selection keeps the
  // plain outline-only appearance.
  const hasMultiCellRange = useMemo(() => {
    for (const r of state.selection.ranges) {
      if (r.anchor.rowId !== r.focus.rowId || r.anchor.field !== r.focus.field) return true;
    }
    return false;
  }, [state.selection.ranges]);

  const isInRange = useCallback((rowId: string, field: string): boolean => {
    if (!hasMultiCellRange) return false;
    const rowIdx = rowIds.indexOf(rowId);
    const colIdx = orderedVisibleColumns.findIndex(c => c.field === field);
    if (rowIdx === -1 || colIdx === -1) return false;
    return selectionChecker(rowIdx, colIdx);
  }, [hasMultiCellRange, selectionChecker, rowIds, orderedVisibleColumns]);

  const getRowSelectionBorders = useCallback(
    (rowId: string) => coreGetRowSelectionBorders(state.selection, rowId, orderedVisibleColumns, rowIds),
    [state.selection, orderedVisibleColumns, rowIds],
  );

  // Grid-level "any row is fully selected?" signal. When true, the root
  // element is tagged `data-row-selected="true"` so CSS can darken column
  // headers (#75) and surfaces outside the body can react without threading
  // selection state through every child. A range counts as row-level when
  // it is tagged `kind: 'row'` OR when it spans every visible column
  // (fallback for `selectionMode: 'row'` cell clicks that widen the range).
  const hasRowSelection = useMemo(() => {
    if (orderedVisibleColumns.length === 0) return false;
    for (const r of state.selection.ranges) {
      if (r.kind === 'row') return true;
      // Fallback: a range that covers from the first visible column's field
      // to the last visible column's field, regardless of row span.
      const firstField = orderedVisibleColumns[0]?.field;
      const lastField = orderedVisibleColumns[orderedVisibleColumns.length - 1]?.field;
      if (firstField === undefined || lastField === undefined) continue;
      const fields = new Set([r.anchor.field, r.focus.field]);
      if (fields.has(firstField) && fields.has(lastField)) return true;
    }
    return false;
  }, [state.selection.ranges, orderedVisibleColumns]);

  const isEditingCell = useCallback((rowId: string, field: string): boolean => {
    const cell = state.editing.cell;
    return cell !== null && cell.rowId === rowId && cell.field === field;
  }, [state.editing.cell]);

  const isSortingEnabled = config.sorting !== false;
  const isFilteringEnabled = config.filtering !== false && config.filtering !== undefined;

  // Chrome columns
  const chromeConfig = config.chrome;
  const controlsConfig = chromeConfig?.controls;
  const rowNumberConfig = chromeConfig?.rowNumbers;
  const resolvedControlsConfig: ControlsColumnConfig | null =
    controlsConfig === true ? { actions: [], width: 40 }
    : controlsConfig ? controlsConfig
    : null;
  const resolvedRowNumberConfig: RowNumberColumnConfig | null =
    rowNumberConfig === true ? { width: 50, widthMode: 'fixed', reorderable: true, position: 'left' }
    : rowNumberConfig ? { position: 'left', ...rowNumberConfig }
    : null;
  const controlsWidth = resolvedControlsConfig?.width ?? 40;
  const rowNumberWidth = resolvedRowNumberConfig?.width ?? 50;
  const dataColumnsWidth = columnWidths.reduce((sum, c) => sum + c.width, 0);
  const totalWidth = (resolvedControlsConfig ? controlsWidth : 0) + dataColumnsWidth + (resolvedRowNumberConfig ? rowNumberWidth : 0);

  const showGhostRow = !!config.ghostRow && !config.readOnly;
  const isReadOnly = config.readOnly === true;
  const fileDropEnabled = typeof config.fileDrop === 'object' && config.fileDrop.enabled;
  const groupingEnabled = config.grouping !== undefined && config.grouping !== null;
  const themeId = typeof config.theme === 'string' ? config.theme : (config.theme ? 'custom' : undefined);

  // Frozen column helpers
  const computeFrozenLeftOffset = useCallback((colIdx: number): number => {
    let offset = resolvedControlsConfig ? controlsWidth : 0;
    for (let i = 0; i < colIdx; i++) {
      const col = orderedVisibleColumns[i];
      if (col && getColumnFrozen(col) === 'left') {
        offset += columnWidths[i]?.width ?? 150;
      }
    }
    return offset;
  }, [orderedVisibleColumns, columnWidths, getColumnFrozen]);

  const isLastFrozenLeft = useCallback((colIdx: number): boolean => {
    const col = orderedVisibleColumns[colIdx];
    if (!col || getColumnFrozen(col) !== 'left') return false;
    const next = orderedVisibleColumns[colIdx + 1];
    if (!next) return true;
    return getColumnFrozen(next) !== 'left';
  }, [orderedVisibleColumns, getColumnFrozen]);

  // Row grouping
  const rowGroupConfig = config.grouping && typeof config.grouping === 'object'
    && config.grouping.rows && typeof config.grouping.rows === 'object'
    ? config.grouping.rows as RowGroupConfig
    : null;

  const computedRowGroups = rowGroupConfig
    ? groupRows(processedData as Record<string, unknown>[], processedData.map((_, i) => rowIds[i] ?? String(i)), rowGroupConfig)
    : [];

  useEffect(() => {
    if (rowGroupConfig && computedRowGroups.length > 0 && !rowGroupsInitialized) {
      setRowGroupsInitialized(true);
      if (groupControlRef === 'collapse-all') {
        setRowGroupExpanded(new Set());
      } else {
        const allKeys = new Set<string>();
        function collectKeys(groups: typeof computedRowGroups) {
          for (const g of groups) {
            allKeys.add(g.key);
            if (g.subGroups) collectKeys(g.subGroups);
          }
        }
        collectKeys(computedRowGroups);
        setRowGroupExpanded(allKeys);
      }
    }
  }, [rowGroupConfig, computedRowGroups.length, rowGroupsInitialized, groupControlRef]);

  const groupedView = rowGroupConfig ? getVisibleRowsWithGroups({
    rowGroups: computedRowGroups,
    expandedGroups: rowGroupExpanded,
  }, false) : null;

  // Validation — runs every `col.validators` entry and stores the resulting
  // array under `${rowId}:${field}`. An empty array means "no results" and is
  // equivalent to valid; callers can check `.length > 0` to decide whether to
  // surface the tooltip or block a commit on error severity.
  const validateCell = useCallback(
    (col: ColumnDef<TData>, value: CellValue, rowId: string, row: TData): ValidationResult[] => {
      const key = `${rowId}:${col.field}`;
      if (!col.validators || col.validators.length === 0) {
        setValidationErrors(prev => {
          if (!prev[key] || prev[key].length === 0) return prev;
          const next = { ...prev };
          delete next[key];
          return next;
        });
        return [];
      }
      const results = runValidators(value, col.validators, {
        row,
        rowId,
        field: col.field,
      });
      setValidationErrors(prev => {
        const existing = prev[key];
        if (results.length === 0) {
          if (!existing || existing.length === 0) return prev;
          const next = { ...prev };
          delete next[key];
          return next;
        }
        return { ...prev, [key]: results };
      });
      // Reset tooltip-open state for this cell so the tooltip appears
      // initially closed after a commit. The edit input's focus / hover
      // session is unrelated to whether the *cell* is currently being
      // interacted with; the user re-engaging (hover/focus) flips it back
      // to open via the cell's own listeners.
      setTooltipState(prev => {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return results;
    },
    [],
  );

  const clearValidation = useCallback((rowId: string, field: string) => {
    const key = `${rowId}:${field}`;
    setValidationErrors(prev => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const onValidationError = (props as any).onValidationError as
    | ((cell: CellAddress, error: ValidationResult) => void)
    | undefined;

  // --- Column menu action handlers ---
  const getColumnFrozenByField = useCallback((field: string): 'left' | 'right' | null => {
    const col = orderedVisibleColumns.find(c => c.field === field);
    if (!col) return null;
    return getColumnFrozen(col);
  }, [orderedVisibleColumns, getColumnFrozen]);

  const handleColumnMenuSortAsc = useCallback((field: string) => {
    model.sort([{ field, dir: 'asc' }]);
    onSortChange?.(model.getState().sort);
  }, [model, onSortChange]);

  const handleColumnMenuSortDesc = useCallback((field: string) => {
    model.sort([{ field, dir: 'desc' }]);
    onSortChange?.(model.getState().sort);
  }, [model, onSortChange]);

  const handleColumnMenuHide = useCallback((field: string) => {
    interaction.hideColumn(field);
    onColumnVisibilityChange?.(field, false);
  }, [interaction, onColumnVisibilityChange]);

  const handleColumnMenuFreeze = useCallback((field: string) => {
    interaction.freezeColumn(field, 'left');
    onColumnFreeze?.(field, 'left');
  }, [interaction, onColumnFreeze]);

  const handleColumnMenuUnfreeze = useCallback((field: string) => {
    interaction.unfreezeColumn(field);
    onColumnFreeze?.(field, null);
  }, [interaction, onColumnFreeze]);

  // --- Header handlers ---
  const handleSort = useCallback((field: string, shiftKey: boolean) => {
    model.toggleColumnSort(field, shiftKey);
    onSortChange?.(model.getState().sort);
  }, [model, onSortChange]);

  const handleHeaderDragStart = useCallback((field: string) => {
    interaction.startColumnDrag(field);
  }, [interaction]);

  const handleHeaderDragOver = useCallback((field: string) => {
    interaction.updateColumnDragOver(field);
  }, [interaction]);

  const handleHeaderDrop = useCallback((targetField: string) => {
    if (interaction.state.columnDrag.type !== 'dragging') return;
    const dragging = interaction.state.columnDrag.field;
    if (dragging === targetField) return;
    // Compute new order using remove-then-insert-at-original-index
    const currentOrder = interaction.state.columnOrderOverride ?? orderedVisibleColumns.map(c => c.field);
    const fromIdx = currentOrder.indexOf(dragging);
    const toIdx = currentOrder.indexOf(targetField);
    if (fromIdx >= 0 && toIdx >= 0) {
      const newOrder = [...currentOrder];
      newOrder.splice(fromIdx, 1);
      newOrder.splice(toIdx, 0, dragging);
      interaction.setColumnOrder(newOrder);
      onColumnReorder?.(dragging, toIdx);
    }
    interaction.endColumnDrag();
  }, [interaction, orderedVisibleColumns, onColumnReorder]);

  const handleHeaderDragEnd = useCallback(() => {
    interaction.endColumnDrag();
  }, [interaction]);

  const handleResizeMove = useCallback((field: string, width: number) => {
    interaction.setColumnWidth(field, width);
  }, [interaction]);

  const handleResizeEnd = useCallback((field: string, finalWidth: number) => {
    onColumnResize?.(field, finalWidth);
  }, [onColumnResize]);

  const handleAutoFit = useCallback((field: string) => {
    const col = orderedVisibleColumns.find(c => c.field === field);
    const autoWidth = Math.max(60, (col?.title?.length ?? 5) * 10 + 40);
    interaction.setColumnWidth(field, autoWidth);
    onColumnResize?.(field, autoWidth);
  }, [interaction, orderedVisibleColumns, onColumnResize]);

  // --- Column group handlers ---
  const handleGroupDragStart = useCallback((groupId: string) => {
    interaction.startColumnGroupDrag(groupId);
  }, [interaction]);

  const handleGroupDragOver = useCallback((groupId: string) => {
    interaction.updateColumnGroupDragOver(groupId);
  }, [interaction]);

  const handleGroupDrop = useCallback((targetGroupId: string) => {
    if (interaction.state.columnGroupDrag.type !== 'dragging') return;
    const dragging = interaction.state.columnGroupDrag.groupId;
    if (dragging === targetGroupId) {
      interaction.endColumnGroupDrag();
      return;
    }
    // Compute new order using the same remove-then-insert-at-original-index logic
    const currentOrder = interaction.state.columnGroupOrder ?? (columnGroupConfig?.groups.map(g => g.id) ?? []);
    const fromIdx = currentOrder.indexOf(dragging);
    const toIdx = currentOrder.indexOf(targetGroupId);
    if (fromIdx >= 0 && toIdx >= 0) {
      const newOrder = [...currentOrder];
      newOrder.splice(fromIdx, 1);
      newOrder.splice(toIdx, 0, dragging);
      interaction.dispatch({ type: 'set-column-group-order', order: newOrder });
    }
    interaction.endColumnGroupDrag();
  }, [interaction, columnGroupConfig]);

  const handleGroupDragEnd = useCallback(() => {
    interaction.endColumnGroupDrag();
  }, [interaction]);

  const handleGroupCollapseToggle = useCallback((groupId: string) => {
    interaction.toggleColumnGroupCollapse(groupId);
    const next = new Set(interaction.state.collapsedColumnGroups);
    if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
    onColumnGroupChange?.(next);
  }, [interaction, onColumnGroupChange]);

  // --- Toolbar handlers ---
  const handleToggleVisibilityMenu = useCallback(() => {
    if (interaction.state.menu.type === 'columnVisibility') {
      interaction.closeMenu();
    } else {
      interaction.openColumnVisibilityMenu();
    }
  }, [interaction]);

  const handleColumnVisibilityChange = useCallback((field: string, visible: boolean) => {
    if (visible) {
      interaction.showColumn(field);
      onColumnVisibilityChange?.(field, true);
    } else {
      interaction.hideColumn(field);
      onColumnVisibilityChange?.(field, false);
    }
  }, [interaction, onColumnVisibilityChange]);

  const handleCollapseAll = useCallback(() => {
    setRowGroupExpanded(new Set());
    onGroupChange?.({ rowGroups: computedRowGroups, expandedGroups: new Set() });
  }, [computedRowGroups, onGroupChange]);

  const handleExpandAll = useCallback(() => {
    const allKeys = new Set<string>();
    function collectKeys(groups: RowGroup[]) {
      for (const g of groups) {
        allKeys.add(g.key);
        if (g.subGroups) collectKeys(g.subGroups);
      }
    }
    collectKeys(computedRowGroups);
    setRowGroupExpanded(allKeys);
    onGroupChange?.({ rowGroups: computedRowGroups, expandedGroups: allKeys });
  }, [computedRowGroups, onGroupChange]);

  // --- Body handlers ---
  const handleGroupToggle = useCallback((groupKey: string) => {
    interaction.toggleRowGroup(groupKey);
  }, [interaction]);

  // ---------------------------------------------------------------------------
  // Chrome column handlers
  // ---------------------------------------------------------------------------

  const handleRowNumberClick = useCallback((rowId: string, shiftKey: boolean, metaKey: boolean) => {
    if (metaKey) {
      // Cmd/Ctrl+click toggles a disjoint row selection.
      model.toggleRowSelect(rowId);
    } else if (shiftKey) {
      // Shift+click extends the selection to a contiguous row range. Route
      // through `extendRowSelection` (rather than generic `extendTo`) so the
      // resulting range is tagged `kind: 'row'` and renders as a single
      // row-level outline regardless of the grid's `selectionMode`.
      model.extendRowSelection(rowId);
    } else {
      model.selectRowByKey(rowId);
    }
    // Refocus the grid container so the keyboard handler's scope guard
    // (`container.contains(e.target)`) passes on the next keystroke — without
    // this, pressing Escape after a row-number click is a no-op because the
    // click target (the chrome cell) is inside the container but focus never
    // moves there; keystrokes land on `<body>` and are discarded.
    containerRef.current?.focus({ preventScroll: true });
  }, [model]);

  // Row drag session is now part of the unified interaction node (issue #106).
  const rowDragState = interaction.state.rowDrag;

  const handleRowDragStart = useCallback((rowId: string, rowIndex: number) => {
    interaction.startRowDrag(rowId, rowIndex);
  }, [interaction]);

  const handleRowDragOver = useCallback((_rowId: string, _rowIndex: number) => {
    // Visual indicator could be added here in the future
  }, []);

  const handleRowDrop = useCallback((targetRowId: string, rowIndex: number) => {
    if (rowDragState.type === 'dragging') {
      model.moveRow(rowDragState.sourceIndex, rowIndex);
      onRowReorder?.({
        sourceRowId: rowDragState.sourceRowId,
        targetRowId,
        fromIndex: rowDragState.sourceIndex,
        toIndex: rowIndex,
      });
      interaction.endRowDrag();
    }
  }, [model, rowDragState, onRowReorder, interaction]);

  const handleSelectAll = useCallback(() => {
    model.selectAllCells();
  }, [model]);

  // ---------------------------------------------------------------------------
  // Excel 365 column filter menu integration
  //
  // Opting into `showFilterMenu` swaps the per-column header filter icon from
  // the legacy input/predicate UI to the Excel-style dropdown, which combines
  // a search box, a distinct-values checklist, and an entry point to a more
  // powerful conditional filter dialog. The flow is:
  //   1. The header emits `onFilterMenuTrigger(field, DOMRect)` on icon click.
  //   2. A background indexer streams distinct values for each filterable
  //      field into IndexedDB; the dropdown pulls from that cache.
  //   3. Selections are converted back to a `CompositeFilterDescriptor` and
  //      passed to `model.filter()` — the exact same channel the legacy UI
  //      uses, so downstream filter handling remains shared.
  // ---------------------------------------------------------------------------

  const filterMenuEnabled = showFilterMenu === true;

  // The Excel dropdown is only offered for columns that declare themselves
  // filterable (the default) and are currently visible in the header. When the
  // feature is off we short-circuit to an empty array so the indexer has no
  // work to do.
  const filterableFields = useMemo<string[]>(() => {
    if (!filterMenuEnabled) return [];
    return orderedVisibleColumns
      .filter((c) => c.filterable !== false)
      .map((c) => c.field);
  }, [filterMenuEnabled, orderedVisibleColumns]);

  // The background indexer persists distinct-value indexes to IndexedDB keyed
  // by `gridId`. Rendering multiple grids on the same page without distinct
  // ids would otherwise have them all collide on a shared namespace and
  // overwrite each other's indexes. `useId()` gives us a stable, render-safe
  // identifier per React instance so the common "two grids, no explicit id"
  // case still stores each grid under its own IDB namespace. Consumers who
  // want the cache to survive remounts should pass an explicit `gridId`.
  const autoGridId = useId();
  const resolvedGridId = gridId ?? `auto-${autoGridId}`;

  // The indexer hook is invoked unconditionally so that toggling
  // `filterMenuEnabled` at runtime does not violate the Rules of Hooks; when
  // the feature is off it runs in a disabled, no-op state so no IDB writes or
  // computation happens.
  const indexerState = useBackgroundIndexer({
    gridId: resolvedGridId,
    data: processedData as ReadonlyArray<Record<string, unknown>>,
    rowIds,
    fields: filterableFields,
    disabled: !filterMenuEnabled,
  });

  // The Excel filter dropdown and the "Custom filter…" condition dialog both
  // live on the unified interaction node (issue #106). Local discriminants
  // capture the "open with field X (anchored at rect Y)" shape; we materialise
  // them here as plain values for the JSX below so call sites stay readable.
  const filterMenuOpen =
    interaction.state.filterMenu.type === 'open' ? interaction.state.filterMenu : null;
  const conditionDialogOpen =
    interaction.state.conditionDialog.type === 'open' ? interaction.state.conditionDialog : null;

  // Opening the Excel dropdown must force the legacy column menu closed so
  // they never overlap visually or compete for keyboard focus. The anchor
  // rect is captured here (rather than stored as a live DOMRect) to decouple
  // the popup from the header button's layout lifecycle.
  const handleFilterMenuTrigger = useCallback((field: string, anchor: DOMRect) => {
    // Mutual exclusion: close the legacy column menu when the Excel filter menu opens.
    interaction.closeMenu();
    interaction.openFilterMenu(field, {
      top: anchor.top,
      left: anchor.left,
      bottom: anchor.bottom,
      right: anchor.right,
    });
  }, [interaction]);

  const closeFilterMenu = useCallback(() => interaction.closeFilterMenu(), [interaction]);

  // Mirror of the mutual-exclusion rule on the other side: when the legacy
  // column menu is opened (from the header's caret button), the Excel filter
  // dropdown is dismissed so only one menu is visible per column at a time.
  const handleColumnMenuTrigger = useCallback((field: string) => {
    // Mutual exclusion: close the Excel filter menu when the legacy column menu opens.
    interaction.closeFilterMenu();
    interaction.openColumnMenu(field);
  }, [interaction]);

  // Derives the set of fields that currently have *any* filter predicate
  // attached so the header can paint the filter icon in its "active" state.
  // The composite filter tree is nestable (`logic` nodes containing more
  // composites), so a recursive walk is needed to collect every leaf's
  // `field` regardless of grouping depth.
  const activeFilterFields = useMemo<Set<string>>(() => {
    const set = new Set<string>();
    const fs = state.filter;
    if (!fs) return set;
    function visit(node: CompositeFilterDescriptor | FilterDescriptor) {
      if ('filters' in node) {
        for (const child of node.filters) visit(child);
      } else {
        set.add(node.field);
      }
    }
    visit(fs);
    return set;
  }, [state.filter]);

  // The Excel dropdown's checklist only has a meaningful "checked subset" when
  // the field is filtered by a single `in`-operator predicate (the shape the
  // dropdown itself produces). Any other predicate — a range, a text contains,
  // a nested composite — is treated as opaque: we return `undefined` so the
  // checklist renders every value as selected, signalling that clearing it
  // will drop the entire predicate on this field.
  const selectedValuesByField = useMemo<Record<string, Set<string> | undefined>>(() => {
    const out: Record<string, Set<string> | undefined> = {};
    const fs = state.filter;
    if (!fs) return out;
    for (const child of fs.filters) {
      if ('field' in child && child.operator === 'in' && Array.isArray(child.value)) {
        out[child.field] = new Set(child.value.map(String));
      }
    }
    return out;
  }, [state.filter]);

  // Central mutation helper used by every Excel-menu action. It edits the
  // filter tree as a field-scoped replace: predicates belonging to the named
  // field are dropped, the replacement (if any) is appended, and an empty
  // result collapses back to `null` so the grid reports "no filter". Logic
  // (`and`/`or`) is preserved from the existing tree or defaults to `and` for
  // a fresh tree.
  //
  // Pruning walks the tree recursively so nested composites emitted by the
  // "Custom Filter…" dialog (shape: { logic, filters: [...leaves on field] })
  // are removed along with plain leaves. A composite whose entire subtree
  // only targeted `field` collapses to an empty list and is dropped; a mixed
  // composite loses its `field`-matching branches but stays in the tree.
  const replaceFieldFilter = useCallback(
    (field: string, replacement: FilterDescriptor | CompositeFilterDescriptor | null) => {
      const prev = state.filter;

      const otherFilters: Array<FilterDescriptor | CompositeFilterDescriptor> = [];
      if (prev) {
        for (const child of prev.filters) {
          const pruned = stripField(child, field);
          if (pruned !== null) otherFilters.push(pruned);
        }
      }
      const nextChildren = replacement ? [...otherFilters, replacement] : otherFilters;
      const next: CompositeFilterDescriptor | null =
        nextChildren.length > 0 ? { logic: prev?.logic ?? 'and', filters: nextChildren } : null;
      model.filter(next);
      _onFilterChange?.(next);
    },
    [state.filter, model, _onFilterChange],
  );

  // Applied when the user commits the checklist: a defined `values` set turns
  // into an `in` predicate; an undefined set means "no restriction", which is
  // equivalent to clearing any existing filter on this field.
  const handleApplyValueFilter = useCallback(
    (field: string, values: Set<string> | undefined) => {
      if (!values) {
        replaceFieldFilter(field, null);
        return;
      }
      replaceFieldFilter(field, {
        field,
        operator: 'in',
        value: [...values],
      });
    },
    [replaceFieldFilter],
  );

  // Invoked from the dropdown's "Clear filter from <column>" entry. Removes
  // the field-scoped predicate regardless of its operator.
  const handleClearFieldFilter = useCallback(
    (field: string) => replaceFieldFilter(field, null),
    [replaceFieldFilter],
  );

  // The dropdown's "Custom filter…" entry hands off to a dedicated modal that
  // builds richer predicates (between / starts-with / and-or chains). Opening
  // the dialog simply records which field it should target.
  const handleOpenConditionDialog = useCallback((field: string) => {
    interaction.openConditionDialog(field);
  }, [interaction]);

  // Receives the composite predicate produced by the condition dialog and
  // routes it through the same field-scoped replace helper so the behaviour
  // stays consistent with the checklist path.
  const handleApplyConditionFilter = useCallback(
    (field: string, composite: CompositeFilterDescriptor | null) => {
      replaceFieldFilter(field, composite);
    },
    [replaceFieldFilter],
  );

  // Maps column `cellType` values onto the three data-type families the
  // Excel menu understands. This normalisation lets the menu pick the right
  // operator set, value formatter, and input widget without knowing about
  // every granular cell type the grid supports.
  const resolveColumnDataType = useCallback(
    (field: string): 'text' | 'number' | 'date' => {
      const col = orderedVisibleColumns.find((c) => c.field === field);
      const t = col?.cellType as string | undefined;
      if (t === 'numeric' || t === 'number' || t === 'currency') return 'number';
      if (t === 'calendar' || t === 'date' || t === 'datetime') return 'date';
      return 'text';
    },
    [orderedVisibleColumns],
  );

  // Looks up a human-readable column label for the dropdown and dialog
  // headings. Falls back to the field key so the UI never renders blank.
  const resolveColumnTitle = useCallback(
    (field: string): string => {
      const col = orderedVisibleColumns.find((c) => c.field === field);
      return (col?.title as string | undefined) ?? field;
    },
    [orderedVisibleColumns],
  );

  // ---------------------------------------------------------------------------
  // Sub-grid expansion rendering
  // ---------------------------------------------------------------------------
  //
  // Each parent row that has `cellType: 'subGrid'` columns can render an
  // inline expansion row beneath itself that hosts a fully independent nested
  // grid. Recursion is handled by re-entering `<DataGrid>` with the parent
  // cell's array value as its `data` and the parent column's `subGridColumns`
  // as its `columns`. Every nested level receives its own `GridModel` via
  // `useGrid` so sort state, drag sessions, selection, and keyboard
  // focus are scoped to that level.
  //
  // Depth tracking:
  //   - `subGridDepth` increments by 1 for each nested grid; the outer grid
  //     starts at 0.
  //   - `config.subGrid?.maxDepth` caps recursion. When the current depth is
  //     >= maxDepth, the toggle still renders but the expansion row is not
  //     mounted. The minimum supported depth is 2 (parent → subgrid →
  //     subgrid-within-subgrid).

  const subGridDepth = config.subGrid?.nestingLevel ?? 0;
  const subGridMaxDepth = config.subGrid?.maxDepth ?? 3;

  // Resolve the first `subGrid` column on the parent row; the nested grid
  // draws its data and columns from that column's configuration. Rows with
  // more than one sub-grid column are rare — document the restriction in
  // the PR and keep the common case simple.
  const getSubGridColumnForRow = useCallback((): ColumnDef<TData> | null => {
    for (const col of orderedVisibleColumns) {
      if (col.cellType === 'subGrid') return col;
    }
    return null;
  }, [orderedVisibleColumns]);

  const renderSubGridExpansionRow = useCallback(
    (rowId: string, row: TData): React.ReactNode => {
      // Honour maxDepth: once we've reached the cap, skip mounting the nested
      // grid. The toggle remains clickable; users see an empty expansion slot
      // so the "tried to go deeper than supported" outcome is still visible.
      if (subGridDepth >= subGridMaxDepth) return null;

      const subCol = getSubGridColumnForRow();
      if (!subCol) return null;

      const rawValue = row[subCol.field as keyof TData];
      const nestedData = Array.isArray(rawValue)
        ? (rawValue as Record<string, unknown>[])
        : [];
      const nestedColumns = (subCol.subGridColumns ?? []) as ColumnDef<Record<string, unknown>>[];
      const nestedRowKey = (subCol.subGridRowKey ?? 'id') as keyof Record<string, unknown>;

      if (nestedColumns.length === 0) return null;

      // Stable ids for ARIA linkage:
      //   - childGridId:   placed on the nested grid's root <div> as `id`
      //   - parentCellId:  placed on the parent row's cell as `id` so the
      //                    nested grid can point at it with aria-labelledby
      const childGridId = `${resolvedGridId}-row-${rowId}-subgrid`;
      const parentCellId = `${resolvedGridId}-row-${rowId}-cell-${subCol.field}`;

      return (
        <DataGrid<Record<string, unknown>>
          key={`${rowId}-subgrid`}
          data={nestedData}
          columns={nestedColumns}
          rowKey={nestedRowKey}
          cellRenderers={cellRenderers as any}
          keyboardNavigation={config.keyboardNavigation !== false}
          selectionMode={config.selectionMode ?? 'cell'}
          theme={config.theme}
          subGrid={{
            ...(config.subGrid ?? {}),
            nestingLevel: subGridDepth + 1,
            maxDepth: subGridMaxDepth,
            isSubGrid: true,
          }}
          rowHeight={rowHeight}
          headerHeight={headerHeight}
          domId={childGridId}
          ariaLabelledBy={parentCellId}
        />
      );
    },
    [
      subGridDepth,
      subGridMaxDepth,
      getSubGridColumnForRow,
      cellRenderers,
      config.keyboardNavigation,
      config.selectionMode,
      config.theme,
      config.subGrid,
      rowHeight,
      headerHeight,
      resolvedGridId,
    ],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <GridContext.Provider value={{ model } as any}>
      <div
        ref={containerRef}
        id={domId}
        className={`iasbuilt-datagrid${className ? ` ${className}` : ''}`}
        style={styles.gridContainer(!!config.theme, themeStyle, style)}
        tabIndex={0}
        role="grid"
        aria-rowcount={processedData.length}
        aria-colcount={visibleColumns.length}
        aria-readonly={isReadOnly || undefined}
        aria-labelledby={ariaLabelledBy}
        data-density={density}
        {...(themeId ? { 'data-theme': themeId } : {})}
        {...(hasRowSelection ? { 'data-row-selected': 'true' } : {})}
        {...(isReadOnly ? { 'data-readonly': 'true' } : {})}
        {...(showGhostRow ? { 'data-ghost-row': 'true' } : {})}
        {...(fileDropEnabled ? { 'data-file-drop': 'true' } : {})}
        {...(groupingEnabled ? { 'data-grouping': 'true' } : {})}
        onDragEnter={dragDrop.handlers.onDragEnter}
        onDragOver={dragDrop.handlers.onDragOver}
        onDragLeave={dragDrop.handlers.onDragLeave}
        onDrop={dragDrop.handlers.onDrop}
        onKeyDown={dragDrop.handlers.onKeyDown}
      >
        {/* Drop overlay */}
        {dragDrop.state.isDragging && (
          <div
            data-testid="drop-overlay"
            data-drop-target={dragDrop.state.dropTarget?.type ?? 'grid'}
            data-drop-field={dragDrop.state.dropTarget?.field}
            data-drop-row={dragDrop.state.dropTarget?.rowId}
            style={styles.dropOverlay}
          >
            Drop files here
          </div>
        )}
        {/* Drop errors */}
        {dragDrop.state.errors.length > 0 && (
          <div data-testid="drop-errors" role="alert">
            {dragDrop.state.errors.map((err, i) => (
              <div key={i} data-testid="drop-error">{err.reason}</div>
            ))}
          </div>
        )}

        <DataGridToolbar
          showColumnVisibilityMenu={!!showColumnVisibilityMenu}
          showGroupControls={!!showGroupControls}
          visibleColumns={visibleColumns}
          allColumns={config.columns ?? []}
          hiddenColumns={interaction.state.hiddenColumns}
          menuState={interaction.state.menu}
          onToggleVisibilityMenu={handleToggleVisibilityMenu}
          onColumnVisibilityChange={handleColumnVisibilityChange}
          rowGroupConfig={rowGroupConfig}
          computedRowGroups={computedRowGroups}
          onCollapseAll={handleCollapseAll}
          onExpandAll={handleExpandAll}
        />

        {columnGroupConfig && (
          <DataGridColumnGroupHeader
            columnGroupConfig={columnGroupConfig}
            effectiveGroupOrder={effectiveGroupOrder}
            orderedVisibleColumns={orderedVisibleColumns}
            columnWidths={columnWidths}
            collapsedColumnGroups={interaction.state.collapsedColumnGroups}
            columnGroupDrag={interaction.state.columnGroupDrag}
            onDragStart={handleGroupDragStart}
            onDragOver={handleGroupDragOver}
            onDrop={handleGroupDrop}
            onDragEnd={handleGroupDragEnd}
            onCollapseToggle={handleGroupCollapseToggle}
          />
        )}

        {/*
         * The header hosts the two menu entry points: the caret-style column
         * menu (always routed through `handleColumnMenuTrigger`) and the Excel
         * filter-icon trigger (wired only when `filterMenuEnabled`, otherwise
         * left `undefined` so the header suppresses the icon entirely).
         * `activeFilterFields` tells the header which icons to paint in the
         * filtered state; it is likewise only supplied when the Excel menu is
         * enabled so the legacy path keeps its pre-existing styling.
         */}
        <DataGridHeader
          columns={orderedVisibleColumns}
          columnWidths={columnWidths}
          headerHeight={headerHeight}
          sortState={state.sort}
          isSortingEnabled={isSortingEnabled}
          isFilteringEnabled={isFilteringEnabled}
          showColumnMenu={!!showColumnMenu}
          lastFieldInGroup={lastFieldInGroup}
          getColumnFrozen={getColumnFrozen}
          computeFrozenLeftOffset={computeFrozenLeftOffset}
          isLastFrozenLeft={isLastFrozenLeft}
          columnDrag={interaction.state.columnDrag}
          onSort={handleSort}
          onContextMenu={openContextMenu}
          onDragStart={handleHeaderDragStart}
          onDragOver={handleHeaderDragOver}
          onDrop={handleHeaderDrop}
          onDragEnd={handleHeaderDragEnd}
          onMenuTrigger={handleColumnMenuTrigger}
          onResizeStart={() => {}}
          onResizeMove={handleResizeMove}
          onResizeEnd={handleResizeEnd}
          onAutoFit={handleAutoFit}
          controlsConfig={resolvedControlsConfig}
          controlsWidth={controlsWidth}
          rowNumberConfig={resolvedRowNumberConfig}
          rowNumberWidth={rowNumberWidth}
          onSelectAll={handleSelectAll}
          onFilterMenuTrigger={filterMenuEnabled ? handleFilterMenuTrigger : undefined}
          activeFilterFields={filterMenuEnabled ? activeFilterFields : undefined}
        />

        {/*
         * The Excel filter dropdown is rendered inline in the grid subtree (as
         * a positioned popup) only while a field is open. The conditional
         * mount both avoids paying the render cost when closed and ensures
         * the component fully re-initialises per open — no stale checklist
         * state between columns.
         */}
        {filterMenuEnabled && filterMenuOpen && (
          <DataGridColumnFilterMenu
            open={true}
            field={filterMenuOpen.field}
            title={resolveColumnTitle(filterMenuOpen.field)}
            dataType={resolveColumnDataType(filterMenuOpen.field)}
            anchor={filterMenuOpen.anchor}
            distinctValues={indexerState.indexes[filterMenuOpen.field]?.distinctValues}
            selectedValues={selectedValuesByField[filterMenuOpen.field]}
            hasActiveFilter={activeFilterFields.has(filterMenuOpen.field)}
            sortDir={state.sort.find((s) => s.field === filterMenuOpen.field)?.dir ?? null}
            onSortAsc={() => handleColumnMenuSortAsc(filterMenuOpen.field)}
            onSortDesc={() => handleColumnMenuSortDesc(filterMenuOpen.field)}
            onClearFilter={() => handleClearFieldFilter(filterMenuOpen.field)}
            onApplyValueFilter={(values) => handleApplyValueFilter(filterMenuOpen.field, values)}
            onOpenCustomFilter={() => handleOpenConditionDialog(filterMenuOpen.field)}
            onClose={closeFilterMenu}
          />
        )}

        {/*
         * The custom-filter condition dialog is a separate modal launched
         * from the Excel dropdown's "Custom filter…" entry. Applying it both
         * commits the composite predicate and dismisses the dialog in a
         * single callback so the flow feels atomic to the user.
         */}
        {filterMenuEnabled && conditionDialogOpen && (
          <FilterConditionDialog
            open={true}
            field={conditionDialogOpen.field}
            title={resolveColumnTitle(conditionDialogOpen.field)}
            dataType={resolveColumnDataType(conditionDialogOpen.field)}
            onApply={(filter) => {
              handleApplyConditionFilter(conditionDialogOpen.field, filter);
              interaction.closeConditionDialog();
            }}
            onClose={() => interaction.closeConditionDialog()}
          />
        )}

        {/*
         * The legacy column menu (hide, freeze) continues to mount
         * unconditionally — it coexists with the Excel dropdown rather than
         * being replaced by it. Visibility is driven by the interaction
         * reducer's `menu` discriminant, so rendering the component while no
         * column-menu session is active is effectively free.
         */}
        <DataGridColumnMenu
          menuState={interaction.state.menu}
          headerHeight={headerHeight}
          hasColumnGroups={!!columnGroupConfig}
          getColumnFrozen={getColumnFrozenByField}
          onHide={handleColumnMenuHide}
          onFreeze={handleColumnMenuFreeze}
          onUnfreeze={handleColumnMenuUnfreeze}
          onClose={closeContextMenu}
        />

        <DataGridBody
          processedData={processedData}
          rowIds={rowIds}
          orderedVisibleColumns={orderedVisibleColumns}
          columnWidths={columnWidths}
          totalWidth={totalWidth}
          rowHeight={rowHeight}
          rowRange={rowRange}
          scrollRef={scrollRef}
          handleScroll={handleScroll}
          isSelected={isSelected}
          getRowSelectionBorders={getRowSelectionBorders}
          isInRange={isInRange}
          isEditingCell={isEditingCell}
          getCellType={getCellType}
          getColumnFrozen={getColumnFrozen}
          computeFrozenLeftOffset={computeFrozenLeftOffset}
          cellRenderers={cellRenderers}
          isReadOnly={isReadOnly}
          model={model}
          validateCell={validateCell}
          clearValidation={clearValidation}
          validationErrors={validationErrors}
          onValidationTooltip={updateTooltipState}
          onCellEdit={onCellEdit}
          onValidationError={onValidationError}
          onContextMenu={openContextMenu}
          groupedView={groupedView}
          rowGroupExpanded={rowGroupExpanded}
          onGroupToggle={handleGroupToggle}
          rowGroupConfig={rowGroupConfig}
          computedRowGroups={computedRowGroups}
          onGroupChange={onGroupChange}
          showGhostRow={showGhostRow}
          ghostRowConfig={config.ghostRow}
          readOnly={config.readOnly}
          onRowAdd={onRowAdd}
          controlsConfig={resolvedControlsConfig}
          controlsWidth={controlsWidth}
          rowNumberConfig={resolvedRowNumberConfig}
          rowNumberWidth={rowNumberWidth}
          onRowNumberClick={handleRowNumberClick}
          onRowDragStart={handleRowDragStart}
          onRowDragOver={handleRowDragOver}
          onRowDrop={handleRowDrop}
          getRowBorder={chromeConfig?.getRowBorder}
          getRowBackground={chromeConfig?.getRowBackground}
          getChromeCellContent={chromeConfig?.getChromeCellContent}
          selectionMode={config.selectionMode}
          expandedSubGrids={state.expandedSubGrids}
          subGridDepth={subGridDepth}
          renderSubGridExpansionRow={renderSubGridExpansionRow}
          gridId={resolvedGridId}
          density={density}
        />

        {contextMenuEnabled && (
          <ContextMenu
            state={ctxMenuState}
            items={getContextMenuItems()}
            onClose={closeContextMenu}
          />
        )}
      </div>
      {/*
       * Portal-based validation tooltips. One per validated cell; the
       * component mounts into `document.body` so the overlay escapes any
       * grid-level clipping / z-index stacking. Results are sorted
       * severity-first (errors → warnings → infos) before rendering so the
       * tooltip lists blocking issues first. See the header comment in
       * `ValidationTooltip.tsx` for the full contract.
       */}
      {Object.entries(validationErrors).map(([key, results]) => {
        if (!results || results.length === 0) return null;
        const splitIdx = key.indexOf(':');
        if (splitIdx < 0) return null;
        const rowId = key.slice(0, splitIdx);
        const field = key.slice(splitIdx + 1);
        const ordered = orderResults(results);
        const top = mostSevere(results);
        const open = (tooltipState[key]?.size ?? 0) > 0;
        return (
          <ValidationTooltip
            key={key}
            rowId={rowId}
            field={field}
            results={ordered}
            open={open}
            severity={top?.severity ?? null}
          />
        );
      })}
    </GridContext.Provider>
  );
}

// Orders a validation-results array by severity priority — errors first,
// then warnings, then infos — preserving declaration order within the same
// severity. This is the ordering the tooltip surfaces to the user: blocking
// issues are read first so they can be addressed before advisory feedback.
function orderResults(results: ValidationResult[]): ValidationResult[] {
  const errs: ValidationResult[] = [];
  const warns: ValidationResult[] = [];
  const infos: ValidationResult[] = [];
  for (const r of results) {
    if (r.severity === 'error') errs.push(r);
    else if (r.severity === 'warning') warns.push(r);
    else infos.push(r);
  }
  return [...errs, ...warns, ...infos];
}

/**
 * Formats a raw cell value into a display string based on the column's cell type.
 */
function renderCellValue(value: CellValue, cellType: CellType): string {
  if (value == null) return '';
  if (cellType === 'boolean') return value ? '\u2611' : '\u2610';
  if (cellType === 'currency' && typeof value === 'number') return `$${value.toFixed(2)}`;
  if (value instanceof Date) return value.toLocaleDateString();
  return String(value);
}
