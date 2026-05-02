/**
 * DataGridHeader renders the sticky header row for the grid, including the
 * per-column header cells and the surrounding chrome (controls header cell
 * and row-number header cell). It is responsible for the user-facing header
 * interactions: column sort toggling with multi-sort priority indicators,
 * column drag-and-drop reordering (with a drop indicator sibling), column
 * resize via a drag handle (and double-click auto-fit), the filter-icon
 * trigger for the Excel 365 column filter menu, and the column-menu
 * (kebab) trigger. It also places the row-number header cell on either the
 * left (default, Excel 365 convention) or the right of the data columns,
 * mirroring the placement logic used by DataGridBody so the two stay in
 * lockstep.
 */
import React, { useCallback, useRef, useState } from 'react';
import type { ColumnDef, SortState, ControlsColumnConfig, RowNumberColumnConfig } from '@iasbuilt/datagrid-core';
import type { ColumnDragState } from '../state';
import { ChromeControlsHeaderCell, ChromeRowNumberHeaderCell } from '../chrome';
import * as styles from './DataGridHeader.styles';

/**
 * Props for {@link DataGridHeader}.
 *
 * Layout and data:
 * - `columns` and `columnWidths` drive the column-header cells and their
 *   individual widths; `headerHeight` sets the row height.
 * - `lastFieldInGroup` marks columns that end a column group so the header
 *   can render a group-boundary separator.
 *
 * Sort:
 * - `sortState` is the ordered list of active sort specs; `isSortingEnabled`
 *   globally toggles sort interaction. Individual columns may still opt out
 *   via `col.sortable === false`.
 * - `onSort(field, shiftKey)` is fired when a sortable header is clicked;
 *   the shift flag toggles multi-sort.
 *
 * Frozen columns:
 * - `getColumnFrozen`, `computeFrozenLeftOffset`, and `isLastFrozenLeft` are
 *   callbacks that describe freeze state for each column so the header can
 *   position sticky cells and draw a freeze boundary.
 *
 * Drag-and-drop column reordering:
 * - `columnDrag` is the current drag state; the header emits
 *   `onDragStart`, `onDragOver`, `onDrop`, and `onDragEnd` as the user drags
 *   a header cell across others.
 *
 * Resize / auto-fit:
 * - `onResizeStart`/`onResizeMove`/`onResizeEnd` are driven by the handle at
 *   the right edge of each cell; `onAutoFit` fires on double-click of the
 *   same handle.
 *
 * Column menu:
 * - `showColumnMenu` toggles the kebab-menu trigger; `onMenuTrigger(field)`
 *   is invoked when clicked.
 * - `onContextMenu` bubbles a right-click on any header cell up to the grid.
 *
 * Row-number and controls chrome:
 * - `rowNumberConfig`/`rowNumberWidth` enable and size the row-number header
 *   cell. `rowNumberConfig.position` places it on the left (default) or the
 *   right; on the left it sticks next to the controls column when one is
 *   present.
 * - `controlsConfig`/`controlsWidth` enable and size the controls header
 *   cell; its width feeds the row-number cell's sticky-left offset.
 * - `onSelectAll` is forwarded to the row-number header cell so clicking it
 *   can select every row.
 *
 * Filter menu (Excel 365 mode):
 * - `isFilteringEnabled` toggles the per-column filter icon.
 * - When `onFilterMenuTrigger` is provided the icon is rendered as a real
 *   `<button type="button">` with `aria-label="Filter <column>"` and
 *   `aria-haspopup="menu"`, and receives the column header's bounding rect
 *   so the menu can anchor itself. When omitted the icon is a purely
 *   decorative `<span aria-hidden="true">`.
 * - `activeFilterFields` is the set of fields with an active filter; it
 *   tags the icon with `data-active="true"` and swaps the glyph to a
 *   check-mark to indicate the column is filtered.
 */
export interface DataGridHeaderProps<TData> {
  columns: ColumnDef<TData>[];
  columnWidths: { width: number }[];
  headerHeight: number;
  sortState: SortState;
  isSortingEnabled: boolean;
  isFilteringEnabled: boolean;
  showColumnMenu: boolean;
  lastFieldInGroup: Map<string, string>;
  getColumnFrozen: (col: ColumnDef<TData>) => 'left' | 'right' | null;
  computeFrozenLeftOffset: (colIdx: number) => number;
  isLastFrozenLeft: (colIdx: number) => boolean;
  columnDrag: ColumnDragState;
  onSort: (field: string, shiftKey: boolean) => void;
  onContextMenu: (e: React.MouseEvent, rowId: string | null, field: string | null) => void;
  onDragStart: (field: string) => void;
  onDragOver: (field: string) => void;
  onDrop: (field: string) => void;
  onDragEnd: () => void;
  onMenuTrigger: (field: string) => void;
  onResizeStart: (field: string, startX: number, startWidth: number) => void;
  onResizeMove: (field: string, width: number) => void;
  onResizeEnd: (field: string, width: number) => void;
  onAutoFit: (field: string) => void;
  controlsConfig?: ControlsColumnConfig | null;
  controlsWidth?: number;
  rowNumberConfig?: RowNumberColumnConfig | null;
  rowNumberWidth?: number;
  onSelectAll?: () => void;
  /**
   * When provided, the filter icon becomes clickable and opens the Excel 365
   * column filter menu. Receives the field and the anchor rect of the header
   * cell so the menu can position itself. Used in Excel-365 mode only; when
   * omitted the filter icon remains decorative.
   */
  onFilterMenuTrigger?: (field: string, anchor: DOMRect) => void;
  /** Fields with an active filter — renders a subtle highlight on the icon. */
  activeFilterFields?: ReadonlySet<string>;
}

/**
 * Returns the active sort direction for `field`, or null if the field is
 * not part of the current sort state.
 */
function getSortDirection(sortState: SortState, field: string): 'asc' | 'desc' | null {
  return sortState.find(s => s.field === field)?.dir ?? null;
}

/**
 * Returns the 1-based multi-sort priority of `field` (its position in the
 * sort stack), or null when only a single sort is active — in which case
 * no priority badge is shown.
 */
function getSortPriority(sortState: SortState, field: string): number | null {
  if (sortState.length <= 1) return null;
  const idx = sortState.findIndex(s => s.field === field);
  return idx >= 0 ? idx + 1 : null;
}

/**
 * Per-column header cell. Extracted into its own component so each cell can
 * own a local `dropHalf` state driving the `data-drop-indicator` contract
 * (#69). The per-cell state model means the indicator is scoped to the
 * header currently under the pointer — unrelated columns stay untouched.
 *
 * HTML5 DnD in Chromium can skip the trailing `dragover` when the pointer
 * ends over a child node (e.g. the title span), so both `dragenter` and
 * `dragover` compute the pointer half and set `dropHalf`. `dragleave`
 * suppresses spurious clear events when the pointer merely crosses into
 * one of this cell's own children.
 */
interface HeaderCellProps<TData> {
  col: ColumnDef<TData>;
  colIdx: number;
  width: number;
  headerHeight: number;
  sortDir: 'asc' | 'desc' | null;
  sortPriorityVal: number | null;
  frozen: 'left' | 'right' | null;
  frozenLeftOffset: number;
  isLastFrozenLeft: boolean;
  isGroupLast: boolean;
  isSortingEnabled: boolean;
  isFilteringEnabled: boolean;
  showColumnMenu: boolean;
  columnDrag: ColumnDragState;
  onSort: (field: string, shiftKey: boolean) => void;
  onContextMenu: (e: React.MouseEvent, rowId: string | null, field: string | null) => void;
  onDragStart: (field: string) => void;
  onDragOver: (field: string) => void;
  onDrop: (field: string) => void;
  onDragEnd: () => void;
  onMenuTrigger: (field: string) => void;
  onAutoFit: (field: string) => void;
  onResizeMouseDown: (e: React.MouseEvent, field: string, width: number) => void;
  onFilterMenuTrigger?: (field: string, anchor: DOMRect) => void;
  activeFilterFields?: ReadonlySet<string>;
}

function HeaderCell<TData>(props: HeaderCellProps<TData>) {
  const {
    col,
    colIdx,
    width,
    headerHeight,
    sortDir,
    sortPriorityVal,
    frozen,
    frozenLeftOffset,
    isLastFrozenLeft,
    isGroupLast,
    isSortingEnabled,
    isFilteringEnabled,
    showColumnMenu,
    columnDrag,
    onSort,
    onContextMenu,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
    onMenuTrigger,
    onAutoFit,
    onResizeMouseDown,
    onFilterMenuTrigger,
    activeFilterFields,
  } = props;

  const cellRef = useRef<HTMLDivElement | null>(null);
  const [dropHalf, setDropHalf] = useState<'left' | 'right' | null>(null);

  const resolveHalf = useCallback((clientX: number): 'left' | 'right' => {
    const el = cellRef.current;
    if (!el) return 'left';
    const rect = el.getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    return clientX < midX ? 'left' : 'right';
  }, []);

  // Frozen columns never accept a drop indicator — they also carry
  // `data-draggable="false"` so the e2e gate finds them.
  const canAcceptDrop =
    !frozen && columnDrag.type === 'dragging' && columnDrag.field !== col.field;

  const baseCellStyle = styles.headerCell({
    width,
    height: headerHeight,
    frozen,
    frozenLeftOffset,
    isGroupLast,
    isSortable: col.sortable !== false && isSortingEnabled,
  });
  // Ensure we have a containing block for the absolutely-positioned drop bar.
  const cellStyle: React.CSSProperties = {
    ...baseCellStyle,
    position: (baseCellStyle.position as React.CSSProperties['position']) ?? 'relative',
  };

  return (
    <div
      ref={cellRef}
      style={cellStyle}
      role="columnheader"
      data-field={col.field}
      data-draggable={frozen ? 'false' : 'true'}
      aria-colindex={colIdx + 1}
      aria-sort={
        sortDir === 'asc' ? 'ascending' :
        sortDir === 'desc' ? 'descending' :
        'none'
      }
      draggable={!frozen}
      {...(col.sortable !== false && isSortingEnabled ? { 'data-sortable': 'true' } : {})}
      {...(frozen ? { 'data-frozen': frozen, 'data-frozen-border': isLastFrozenLeft ? 'true' : undefined, 'data-drop-disabled': 'true' } : {})}
      {...(isGroupLast ? { 'data-group-last': 'true' } : {})}
      {...(dropHalf && canAcceptDrop ? { 'data-drop-indicator': dropHalf } : {})}
      onClick={(e) => {
        if (col.sortable !== false && isSortingEnabled) {
          onSort(col.field, e.shiftKey);
        }
      }}
      onContextMenu={(e) => onContextMenu(e, null, col.field)}
      onDragStart={(e) => {
        if (frozen) { e.preventDefault(); return; }
        onDragStart(col.field);
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
      }}
      onDragEnter={(e) => {
        if (!canAcceptDrop) return;
        setDropHalf(resolveHalf(e.clientX));
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!canAcceptDrop) return;
        setDropHalf(resolveHalf(e.clientX));
        onDragOver(col.field);
      }}
      onDragLeave={(e) => {
        const el = cellRef.current;
        const related = e.relatedTarget as Node | null;
        if (el && related && el.contains(related)) return;
        setDropHalf(null);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDropHalf(null);
        if (columnDrag.type === 'dragging' && columnDrag.field !== col.field && !frozen) {
          onDrop(col.field);
        }
      }}
      onDragEnd={() => {
        setDropHalf(null);
        onDragEnd();
      }}
    >
      <span style={styles.headerCellTitle}>
        {col.title}
      </span>
      {sortDir && (
        <span style={styles.sortIndicator}>
          {sortDir === 'asc' ? '\u25B2' : '\u25BC'}
        </span>
      )}
      {sortPriorityVal != null && (
        <span style={styles.sortPriority}>
          {sortPriorityVal}
        </span>
      )}
      {/* Filter icon */}
      {isFilteringEnabled && (
        onFilterMenuTrigger ? (
          <button
            type="button"
            data-testid="column-filter-icon"
            data-active={activeFilterFields?.has(col.field) ? 'true' : undefined}
            aria-label={`Filter ${col.title ?? col.field}`}
            aria-haspopup="menu"
            style={styles.filterIcon}
            onClick={(e) => {
              e.stopPropagation();
              const anchor = (e.currentTarget as HTMLElement)
                .closest('[role="columnheader"]')
                ?.getBoundingClientRect();
              if (anchor) onFilterMenuTrigger(col.field, anchor);
            }}
          >
            {activeFilterFields?.has(col.field) ? '\u2714' : '\u25BC'}
          </button>
        ) : (
          <span
            data-testid="column-filter-icon"
            data-active={activeFilterFields?.has(col.field) ? 'true' : undefined}
            aria-hidden="true"
            style={styles.filterIcon}
          >
            {activeFilterFields?.has(col.field) ? '\u2714' : '\u25BC'}
          </span>
        )
      )}
      {showColumnMenu && (
        <span
          data-testid="column-menu-trigger"
          style={styles.columnMenuTrigger}
          onClick={(e) => {
            e.stopPropagation();
            onMenuTrigger(col.field);
          }}
        >
          &#8942;
        </span>
      )}
      {col.resizable !== false && (
        <div
          data-testid="column-resize-handle"
          style={styles.resizeHandle}
          onMouseDown={(e) => onResizeMouseDown(e, col.field, width)}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onAutoFit(col.field);
          }}
        />
      )}
      {dropHalf && canAcceptDrop && (
        <div
          data-column-drop-indicator
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            width: 3,
            background: 'var(--dg-column-drop-indicator-bg, #3b82f6)',
            pointerEvents: 'none',
            zIndex: 6,
            ...(dropHalf === 'left' ? { left: 0 } : { right: 0 }),
          }}
        />
      )}
    </div>
  );
}

/**
 * Renders the grid's header row. See {@link DataGridHeaderProps} for the
 * full contract. The component is a pure projection of its props: it does
 * not own sort, drag, resize, or filter state — it fires callbacks and lets
 * the parent grid update state and re-render.
 */
export function DataGridHeader<TData>(props: DataGridHeaderProps<TData>) {
  const {
    columns,
    columnWidths,
    headerHeight,
    sortState,
    isSortingEnabled,
    isFilteringEnabled,
    showColumnMenu,
    lastFieldInGroup,
    getColumnFrozen,
    computeFrozenLeftOffset,
    isLastFrozenLeft,
    columnDrag,
    onSort,
    onContextMenu,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
    onMenuTrigger,
    onResizeStart,
    onResizeMove,
    onResizeEnd,
    onAutoFit,
    controlsConfig,
    controlsWidth,
    rowNumberConfig,
    rowNumberWidth,
    onSelectAll,
    onFilterMenuTrigger,
    activeFilterFields,
  } = props;

  // Drives the live column resize. The mousedown on a resize handle seeds a
  // resize session, then window-level mousemove/mouseup listeners track the
  // cursor until release. stopPropagation/preventDefault keep the click
  // from triggering sort on the parent header cell, and a 30px floor
  // prevents the column from collapsing to zero. lastWidth is closed over
  // so onResizeEnd reports the final committed width.
  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent, field: string, width: number) => {
      e.stopPropagation();
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = width;
      let lastWidth = startWidth;

      onResizeStart(field, startX, startWidth);

      const onMouseMove = (me: MouseEvent) => {
        const delta = me.clientX - startX;
        lastWidth = Math.max(30, startWidth + delta);
        onResizeMove(field, lastWidth);
      };
      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        onResizeEnd(field, lastWidth);
      };
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [onResizeStart, onResizeMove, onResizeEnd],
  );

  // Row-number chrome column position (default: 'left' — Excel 365 convention).
  // Mirrors the logic in DataGridBody so header + body stay in lockstep.
  // When placed on the left, the row-number header sticks just past the
  // controls header cell (falling back to 40px when the controls column is
  // enabled but no explicit width is provided, and to 0 when there is no
  // controls column). When placed on the right, no sticky-left offset is
  // needed — the cell flows after the data columns.
  const rowNumberPosition: 'left' | 'right' = rowNumberConfig?.position ?? 'left';
  const rowNumberOnLeft = rowNumberPosition === 'left';
  const rowNumberHeaderStickyLeft = rowNumberOnLeft
    ? (controlsConfig ? (controlsWidth ?? 40) : 0)
    : undefined;

  // Factored out so the same cell can be rendered either before or after
  // the mapped data-column headers depending on rowNumberPosition.
  const renderRowNumberHeaderCell = () =>
    rowNumberConfig ? (
      <ChromeRowNumberHeaderCell
        key="__row-number-header__"
        width={rowNumberWidth ?? 50}
        height={headerHeight}
        stickyLeft={rowNumberHeaderStickyLeft}
        onSelectAll={onSelectAll}
      />
    ) : null;

  return (
    <>
      {/* Header */}
      <div
        style={styles.headerRow(headerHeight)}
        role="row"
      >
        {controlsConfig && (
          <ChromeControlsHeaderCell width={controlsWidth ?? 40} height={headerHeight} />
        )}
        {rowNumberOnLeft && renderRowNumberHeaderCell()}
        {/*
          Main column-header loop. For each data column we compute width,
          sort direction / priority, freeze state, and group-boundary flag,
          then render a columnheader cell that wires up: click-to-sort
          (respecting col.sortable and isSortingEnabled), context menu,
          HTML5 drag-and-drop reordering (disabled for frozen columns and
          guarded so a column cannot drop onto itself), the sort glyph and
          multi-sort priority badge, the filter icon (button vs decorative
          span — see below), the column-menu kebab trigger, and the resize
          handle with double-click auto-fit.
        */}
        {columns.map((col, colIdx) => {
          const width = columnWidths[colIdx]?.width ?? 150;
          const sortDir = getSortDirection(sortState, col.field);
          const sortPriorityVal = getSortPriority(sortState, col.field);
          const frozen = getColumnFrozen(col);
          const isGroupLast = lastFieldInGroup.has(col.field);

          return (
            <HeaderCell<TData>
              key={col.field}
              col={col}
              colIdx={colIdx}
              width={width}
              headerHeight={headerHeight}
              sortDir={sortDir}
              sortPriorityVal={sortPriorityVal}
              frozen={frozen}
              frozenLeftOffset={computeFrozenLeftOffset(colIdx)}
              isLastFrozenLeft={isLastFrozenLeft(colIdx)}
              isGroupLast={isGroupLast}
              isSortingEnabled={isSortingEnabled}
              isFilteringEnabled={isFilteringEnabled}
              showColumnMenu={showColumnMenu}
              columnDrag={columnDrag}
              onSort={onSort}
              onContextMenu={onContextMenu}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onDragEnd={onDragEnd}
              onMenuTrigger={onMenuTrigger}
              onAutoFit={onAutoFit}
              onResizeMouseDown={handleResizeMouseDown}
              onFilterMenuTrigger={onFilterMenuTrigger}
              activeFilterFields={activeFilterFields}
            />
          );
        })}
        {!rowNumberOnLeft && renderRowNumberHeaderCell()}
      </div>

      {/* Column drop indicator */}
      {/*
        Thin sibling element rendered during an active column drag once the
        pointer has entered a valid drop target. Its position is driven by
        styles.columnDropIndicator which reads from the drag state.
      */}
      {columnDrag.type === 'dragging' && columnDrag.overField && (
        <div
          data-testid="column-drop-indicator"
          style={styles.columnDropIndicator}
        />
      )}
    </>
  );
}
