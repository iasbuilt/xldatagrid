/**
 * Selection module for the datagrid core engine.
 *
 * Manages cell, row, and column selection through an anchor/focus range model.
 * Supports multiple selection modes (`cell`, `row`, `none`), keyboard-driven
 * navigation with boundary clamping, and Tab/Shift-Tab wrapping across rows.
 * Every function is pure -- it returns a new state object rather than mutating
 * the existing one.
 *
 * @module selection
 */

import { CellAddress, CellRange, SelectionMode, ColumnDef } from './types';

/**
 * Represents the current selection within the datagrid.
 *
 * @remarks
 * The `range` property uses an anchor/focus model identical to text selections:
 * the anchor is the cell where the selection started and the focus is the cell
 * where it currently ends. The rectangular region between the two defines the
 * selected area.
 */
export interface SelectionState {
  /** The currently selected rectangular range, or `null` when nothing is selected. */
  range: CellRange | null;
  /** Controls the granularity of selection interactions. */
  mode: SelectionMode;
  /** Multiple selected ranges for multi-range (e.g. Ctrl+click) selection. */
  ranges: CellRange[];
}

/**
 * Creates an initial, empty selection state.
 *
 * @param mode - The selection mode to use. Defaults to `'cell'`.
 * @returns A fresh {@link SelectionState} with no active range.
 */
export function createSelection(mode: SelectionMode = 'cell'): SelectionState {
  return { range: null, mode, ranges: [] };
}

/**
 * Selects a single cell by setting both anchor and focus to the same address.
 *
 * If the selection mode is `'none'`, the state is returned unchanged.
 *
 * @param state - Current selection state.
 * @param cell - The cell to select.
 * @returns Updated selection state with the given cell selected.
 */
export function selectCell(state: SelectionState, cell: CellAddress): SelectionState {
  if (state.mode === 'none') return state;
  const newRange = { anchor: cell, focus: cell };
  return { ...state, range: newRange, ranges: [newRange] };
}

/**
 * Selects an entire row by spanning from the first to the last column.
 *
 * The anchor is placed at the first column and the focus at the last column,
 * both on the given row, producing a range that covers every cell in the row.
 *
 * @param state - Current selection state.
 * @param rowId - Identifier of the row to select.
 * @param columns - Full list of column definitions (used to determine bounds).
 * @returns Updated selection state with the entire row selected.
 */
export function selectRow(state: SelectionState, rowId: string, columns: ColumnDef<any>[]): SelectionState {
  if (state.mode === 'none') return state;
  // Determine the first and last column fields
  const firstCol = columns[0]?.field ?? '';
  const lastCol = columns[columns.length - 1]?.field ?? '';
  const newRange: CellRange = {
    anchor: { rowId, field: firstCol },
    focus: { rowId, field: lastCol },
    kind: 'row',
  };
  return {
    ...state,
    range: newRange,
    ranges: [newRange],
  };
}

/**
 * Selects an entire column by spanning from the first to the last row.
 *
 * The anchor is placed on the first row and the focus on the last row,
 * both on the given field, producing a range that covers every cell in the column.
 *
 * @param state - Current selection state.
 * @param field - The column field to select.
 * @param rowIds - Ordered list of all row identifiers (used to determine bounds).
 * @returns Updated selection state with the entire column selected.
 */
export function selectColumn(state: SelectionState, field: string, rowIds: string[]): SelectionState {
  if (state.mode === 'none') return state;
  // Determine the first and last row identifiers
  const firstRow = rowIds[0] ?? '';
  const lastRow = rowIds[rowIds.length - 1] ?? '';
  const newRange = {
    anchor: { rowId: firstRow, field },
    focus: { rowId: lastRow, field },
  };
  return {
    ...state,
    range: newRange,
    ranges: [newRange],
  };
}

/**
 * Extends the current selection to a new focus cell while keeping the anchor fixed.
 *
 * This is used during Shift-click or Shift-arrow interactions to grow or shrink
 * the selected rectangular region.
 *
 * @param state - Current selection state (must have an existing range).
 * @param cell - The new focus cell.
 * @returns Updated selection state with the focus moved to `cell`.
 */
export function extendSelection(state: SelectionState, cell: CellAddress): SelectionState {
  if (state.mode === 'none' || !state.range) return state;
  // Preserve the current range's `kind` so extending a row-kind selection
  // (e.g. rowheader Shift+Arrow) yields another row-kind range rather than
  // silently degrading to a generic cell range.
  const newRange: CellRange = state.range.kind
    ? { anchor: state.range.anchor, focus: cell, kind: state.range.kind }
    : { anchor: state.range.anchor, focus: cell };
  const updatedRanges = state.ranges.length > 0
    ? [...state.ranges.slice(0, -1), newRange]
    : [newRange];
  return { ...state, range: newRange, ranges: updatedRanges };
}

/**
 * Extends the current row selection down/up to `rowId`, snapping the anchor
 * to the first column and the focus to the last column so the resulting
 * range covers every cell in the spanned rows. Tags the new range with
 * `kind: 'row'` so the renderer treats it as a row-level outline regardless
 * of the grid's `selectionMode`.
 *
 * When no prior range exists, falls back to selecting the single target row.
 */
export function extendRowSelection(
  state: SelectionState,
  rowId: string,
  columns: ColumnDef<any>[],
): SelectionState {
  if (state.mode === 'none') return state;
  const firstCol = columns[0]?.field ?? '';
  const lastCol = columns[columns.length - 1]?.field ?? '';
  if (!state.range) {
    return selectRow(state, rowId, columns);
  }
  // Anchor stays on whatever the prior selection's anchor row was, pinned to
  // the first column. Focus snaps to the target row's last column.
  const anchorRowId = state.range.anchor.rowId;
  const newRange: CellRange = {
    anchor: { rowId: anchorRowId, field: firstCol },
    focus: { rowId, field: lastCol },
    kind: 'row',
  };
  const updatedRanges = state.ranges.length > 0
    ? [...state.ranges.slice(0, -1), newRange]
    : [newRange];
  return { ...state, range: newRange, ranges: updatedRanges };
}

/**
 * Clears the active selection, resetting the range to `null`.
 *
 * @param state - Current selection state.
 * @returns Updated selection state with no active range.
 */
export function clearSelection(state: SelectionState): SelectionState {
  return { ...state, range: null, ranges: [] };
}

/**
 * Selects all cells in the grid by spanning from the top-left to the bottom-right cell.
 *
 * Returns the state unchanged when the mode is `'none'` or when the grid is empty.
 *
 * @param state - Current selection state.
 * @param columns - Full list of column definitions.
 * @param rowIds - Ordered list of all row identifiers.
 * @returns Updated selection state covering the entire grid.
 */
export function selectAll(state: SelectionState, columns: ColumnDef<any>[], rowIds: string[]): SelectionState {
  if (state.mode === 'none' || rowIds.length === 0 || columns.length === 0) return state;
  const firstRowId = rowIds[0] ?? '';
  const lastRowId = rowIds[rowIds.length - 1] ?? '';
  const firstField = columns[0]?.field ?? '';
  const lastField = columns[columns.length - 1]?.field ?? '';
  const newRange = {
    anchor: { rowId: firstRowId, field: firstField },
    focus: { rowId: lastRowId, field: lastField },
  };
  return {
    ...state,
    range: newRange,
    ranges: [newRange],
  };
}

/**
 * Tests whether a given cell falls inside a selection range.
 *
 * The range is normalised to a bounding rectangle using column and row indices
 * so that it works regardless of anchor/focus ordering.
 *
 * @param cell - The cell address to test.
 * @param range - The selection range to test against.
 * @param columns - Full list of column definitions (for index resolution).
 * @param rowIds - Ordered list of all row identifiers (for index resolution).
 * @returns `true` when the cell is within the rectangular bounds of the range.
 */
export function isCellInRange(cell: CellAddress, range: CellRange, columns: ColumnDef<any>[], rowIds: string[]): boolean {
  // Resolve column indices for the anchor, focus, and candidate cell
  const colIndices = columns.map(c => c.field);
  const anchorCol = colIndices.indexOf(range.anchor.field);
  const focusCol = colIndices.indexOf(range.focus.field);
  const cellCol = colIndices.indexOf(cell.field);
  const minCol = Math.min(anchorCol, focusCol);
  const maxCol = Math.max(anchorCol, focusCol);

  // Resolve row indices for the anchor, focus, and candidate cell
  const anchorRow = rowIds.indexOf(range.anchor.rowId);
  const focusRow = rowIds.indexOf(range.focus.rowId);
  const cellRow = rowIds.indexOf(cell.rowId);
  const minRow = Math.min(anchorRow, focusRow);
  const maxRow = Math.max(anchorRow, focusRow);

  // Check that the cell falls within the normalised bounding rectangle
  return cellCol >= minCol && cellCol <= maxCol && cellRow >= minRow && cellRow <= maxRow;
}

/**
 * Checks whether a given row is covered by any range in a list of ranges.
 *
 * A row is considered "in" a range when its index falls between the anchor
 * and focus row indices (inclusive) for that range.
 *
 * @param rowId - The row identifier to test.
 * @param ranges - The list of selection ranges to check.
 * @param columns - Full list of column definitions (for index resolution).
 * @param rowIds - Ordered list of all row identifiers (for index resolution).
 * @returns `true` when the row is within at least one range.
 */
export function isRowInRanges(rowId: string, ranges: CellRange[], columns: ColumnDef<any>[], rowIds: string[]): boolean {
  const rowIdx = rowIds.indexOf(rowId);
  if (rowIdx === -1) return false;
  for (const range of ranges) {
    const anchorRow = rowIds.indexOf(range.anchor.rowId);
    const focusRow = rowIds.indexOf(range.focus.rowId);
    const minRow = Math.min(anchorRow, focusRow);
    const maxRow = Math.max(anchorRow, focusRow);
    if (rowIdx >= minRow && rowIdx <= maxRow) return true;
  }
  return false;
}

/**
 * Toggles a row in the multi-range selection.
 *
 * If the row already has a dedicated range in `ranges` (a range where both
 * anchor and focus share the same `rowId`), that range is removed. Otherwise
 * a new full-row range is appended. The `range` property is kept in sync:
 * it points to the last range, or `null` when `ranges` becomes empty.
 *
 * @param state - Current selection state.
 * @param rowId - The row to toggle.
 * @param columns - Full list of column definitions (used to determine bounds).
 * @returns Updated selection state.
 */
export function toggleRowSelection(state: SelectionState, rowId: string, columns: ColumnDef<any>[]): SelectionState {
  if (state.mode === 'none') return state;

  const firstCol = columns[0]?.field ?? '';
  const lastCol = columns[columns.length - 1]?.field ?? '';

  // Check if the row is already represented as its own range
  const existingIdx = state.ranges.findIndex(
    r => r.anchor.rowId === rowId && r.focus.rowId === rowId
  );

  let newRanges: CellRange[];
  if (existingIdx !== -1) {
    // Remove the existing range for this row
    newRanges = [...state.ranges.slice(0, existingIdx), ...state.ranges.slice(existingIdx + 1)];
  } else {
    // Add a new full-row range. Tag it as a row-kind selection so the
    // renderer paints a row-level outline even when the grid's
    // `selectionMode` is `'cell'` or `'range'`.
    newRanges = [
      ...state.ranges,
      { anchor: { rowId, field: firstCol }, focus: { rowId, field: lastCol }, kind: 'row' as const },
    ];
  }

  const newRange = newRanges.length > 0 ? newRanges[newRanges.length - 1]! : null;
  return { ...state, range: newRange, ranges: newRanges };
}

/**
 * Computes the adjacent cell in the given direction, respecting visibility and grid bounds.
 *
 * Hidden columns are skipped. Returns `null` when movement would exceed the grid boundary.
 *
 * @param current - The starting cell address.
 * @param direction - The direction to move (`'up'`, `'down'`, `'left'`, `'right'`).
 * @param columns - Full list of column definitions (hidden columns are excluded).
 * @param rowIds - Ordered list of all row identifiers.
 * @returns The adjacent {@link CellAddress}, or `null` if at the boundary.
 */
export function getNextCell(
  current: CellAddress,
  direction: 'up' | 'down' | 'left' | 'right',
  columns: ColumnDef<any>[],
  rowIds: string[]
): CellAddress | null {
  // Filter to only visible columns so hidden ones are seamlessly skipped
  const visibleCols = columns.filter(c => c.visible !== false);
  const colIdx = visibleCols.findIndex(c => c.field === current.field);
  const rowIdx = rowIds.indexOf(current.rowId);
  if (colIdx === -1 || rowIdx === -1) return null;

  // Move one step in the requested direction, clamping at boundaries
  switch (direction) {
    case 'left': {
      const col = colIdx > 0 ? visibleCols[colIdx - 1] : undefined;
      return col ? { rowId: current.rowId, field: col.field } : null;
    }
    case 'right': {
      const col = colIdx < visibleCols.length - 1 ? visibleCols[colIdx + 1] : undefined;
      return col ? { rowId: current.rowId, field: col.field } : null;
    }
    case 'up': {
      const rowId = rowIdx > 0 ? rowIds[rowIdx - 1] : undefined;
      return rowId != null ? { rowId, field: current.field } : null;
    }
    case 'down': {
      const rowId = rowIdx < rowIds.length - 1 ? rowIds[rowIdx + 1] : undefined;
      return rowId != null ? { rowId, field: current.field } : null;
    }
  }
}

/**
 * Returns the address of the first (top-left) visible cell in the grid.
 *
 * @param columns - Full list of column definitions.
 * @param rowIds - Ordered list of all row identifiers.
 * @returns The top-left {@link CellAddress}, or `null` if the grid is empty.
 */
export function getFirstCell(columns: ColumnDef<any>[], rowIds: string[]): CellAddress | null {
  const visibleCols = columns.filter(c => c.visible !== false);
  const firstRow = rowIds[0];
  const firstCol = visibleCols[0];
  if (!firstCol || firstRow == null) return null;
  return { rowId: firstRow, field: firstCol.field };
}

/**
 * Returns the address of the last (bottom-right) visible cell in the grid.
 *
 * @param columns - Full list of column definitions.
 * @param rowIds - Ordered list of all row identifiers.
 * @returns The bottom-right {@link CellAddress}, or `null` if the grid is empty.
 */
export function getLastCell(columns: ColumnDef<any>[], rowIds: string[]): CellAddress | null {
  const visibleCols = columns.filter(c => c.visible !== false);
  const lastRow = rowIds[rowIds.length - 1];
  const lastCol = visibleCols[visibleCols.length - 1];
  if (!lastCol || lastRow == null) return null;
  return { rowId: lastRow, field: lastCol.field };
}

/**
 * Moves to the next cell in left-to-right, top-to-bottom reading order (Tab behaviour).
 *
 * When the current cell is the last in its row, the cursor wraps to the first
 * visible column of the next row.
 *
 * @param current - The starting cell address.
 * @param columns - Full list of column definitions.
 * @param rowIds - Ordered list of all row identifiers.
 * @returns The next {@link CellAddress} in reading order, or `null` at the grid's end.
 */
export function getNextCellInRow(current: CellAddress, columns: ColumnDef<any>[], rowIds: string[]): CellAddress | null {
  // Try moving right within the same row first
  const next = getNextCell(current, 'right', columns, rowIds);
  if (next) return next;
  // Wrap to first cell of next row
  const rowIdx = rowIds.indexOf(current.rowId);
  const visibleCols = columns.filter(c => c.visible !== false);
  const nextRowId = rowIdx < rowIds.length - 1 ? rowIds[rowIdx + 1] : undefined;
  const firstCol = visibleCols[0];
  if (nextRowId != null && firstCol) {
    return { rowId: nextRowId, field: firstCol.field };
  }
  return null;
}

/**
 * Moves to the previous cell in right-to-left, bottom-to-top reading order (Shift-Tab behaviour).
 *
 * When the current cell is the first in its row, the cursor wraps to the last
 * visible column of the previous row.
 *
 * @param current - The starting cell address.
 * @param columns - Full list of column definitions.
 * @param rowIds - Ordered list of all row identifiers.
 * @returns The previous {@link CellAddress} in reading order, or `null` at the grid's start.
 */
export function createSelectionChecker(
  ranges: CellRange[],
  columns: ColumnDef<any>[],
  rowIds: string[],
): (rowIndex: number, colIndex: number) => boolean {
  if (ranges.length === 0) return () => false;

  const fieldToCol = new Map<string, number>();
  for (let i = 0; i < columns.length; i++) {
    fieldToCol.set(columns[i]!.field, i);
  }
  const rowIdToRow = new Map<string, number>();
  for (let i = 0; i < rowIds.length; i++) {
    rowIdToRow.set(rowIds[i]!, i);
  }

  const bounds: { minRow: number; maxRow: number; minCol: number; maxCol: number }[] = [];
  for (const range of ranges) {
    const anchorRow = rowIdToRow.get(range.anchor.rowId) ?? -1;
    const focusRow = rowIdToRow.get(range.focus.rowId) ?? -1;
    const anchorCol = fieldToCol.get(range.anchor.field) ?? -1;
    const focusCol = fieldToCol.get(range.focus.field) ?? -1;
    if (anchorRow === -1 || focusRow === -1 || anchorCol === -1 || focusCol === -1) continue;
    bounds.push({
      minRow: Math.min(anchorRow, focusRow),
      maxRow: Math.max(anchorRow, focusRow),
      minCol: Math.min(anchorCol, focusCol),
      maxCol: Math.max(anchorCol, focusCol),
    });
  }

  if (bounds.length === 0) return () => false;

  return (rowIndex: number, colIndex: number): boolean => {
    for (const b of bounds) {
      if (rowIndex >= b.minRow && rowIndex <= b.maxRow && colIndex >= b.minCol && colIndex <= b.maxCol) {
        return true;
      }
    }
    return false;
  };
}

/**
 * Resolves the address one step counter to reading order from
 * `current` — left within the same row when a left neighbour exists,
 * otherwise wrapping to the rightmost cell of the previous row. Returns
 * `null` from the top-left corner, signalling "no further-back cell".
 *
 * Used by the Shift+Tab / reverse-direction navigation arms in
 * `use-keyboard.ts`; the mirror of {@link getNextCellInRow}.
 *
 * @param current - Address of the cell that has focus today.
 * @param columns - Full column list; the function filters to
 *   `visible !== false` internally so callers may pass the raw config.
 * @param rowIds - Ordered row identifiers, used to compute the
 *   previous-row jump when wrapping.
 */
export function getPrevCellInRow(current: CellAddress, columns: ColumnDef<any>[], rowIds: string[]): CellAddress | null {
  // Step one cell left inside the current row when possible — the
  // common Tab-back case.
  const prev = getNextCell(current, 'left', columns, rowIds);
  if (prev) return prev;
  // Edge case: at the leftmost visible column. Wrap to the rightmost
  // visible cell of the row above (matching Excel's "shift-tab off
  // column 0" behaviour). Returns null from the top-left corner.
  const rowIdx = rowIds.indexOf(current.rowId);
  const visibleCols = columns.filter(c => c.visible !== false);
  const prevRowId = rowIdx > 0 ? rowIds[rowIdx - 1] : undefined;
  const lastCol = visibleCols[visibleCols.length - 1];
  if (prevRowId != null && lastCol) {
    return { rowId: prevRowId, field: lastCol.field };
  }
  return null;
}

/**
 * Per-side border flags for a row-selection outline.
 */
export interface RowOutlineSides {
  top: boolean;
  right: boolean;
  bottom: boolean;
  left: boolean;
}

/**
 * Returns `true` when the current selection range covers every column in the
 * given row — i.e. the anchor and focus are both on `rowId` and span from the
 * first to the last column field (in either order).
 *
 * When `rowIds` is supplied the function walks every range in `state.ranges`
 * so disjoint multi-row selections (Ctrl+click) are handled correctly.
 * When `rowIds` is omitted the fast path checks only `state.range` — backward
 * compatible with all existing callers.
 *
 * @param state - Current selection state.
 * @param rowId - The row to test.
 * @param columns - Full list of column definitions.
 * @param rowIds - Optional ordered list of all row identifiers; enables multi-range walk.
 * @returns `true` when any range in the selection is a full-row selection for `rowId`.
 */
export function isRowFullySelected(
  state: SelectionState,
  rowId: string,
  columns: ColumnDef<any>[],
  rowIds?: string[],
): boolean {
  if (columns.length === 0) return false;
  const firstField = columns[0]!.field;
  const lastField = columns[columns.length - 1]!.field;

  function isFullRowRange(range: CellRange): boolean {
    const rowIdx = rowIds ? rowIds.indexOf(rowId) : -1;
    const anchorRowIdx = rowIds ? rowIds.indexOf(range.anchor.rowId) : -1;
    const focusRowIdx = rowIds ? rowIds.indexOf(range.focus.rowId) : -1;
    const minRow = Math.min(anchorRowIdx, focusRowIdx);
    const maxRow = Math.max(anchorRowIdx, focusRowIdx);
    const rowInRange = rowIds
      ? rowIdx >= minRow && rowIdx <= maxRow
      : range.anchor.rowId === rowId && range.focus.rowId === rowId;
    if (!rowInRange) return false;
    return (
      (range.anchor.field === firstField && range.focus.field === lastField) ||
      (range.anchor.field === lastField && range.focus.field === firstField)
    );
  }

  if (rowIds !== undefined) {
    return state.ranges.some(isFullRowRange);
  }

  // Legacy 3-arg fast path: only check state.range.
  if (!state.range) return false;
  const { anchor, focus } = state.range;
  if (anchor.rowId !== rowId || focus.rowId !== rowId) return false;
  return (
    (anchor.field === firstField && focus.field === lastField) ||
    (anchor.field === lastField && focus.field === firstField)
  );
}

/**
 * Returns the per-side border flags for the row-selection outline for `rowId`,
 * or `null` when the row is not covered by any full-row range.
 *
 * Contiguous multi-row ranges suppress internal horizontal borders (top on all
 * rows except the first, bottom on all rows except the last).  Disjoint
 * single-row ranges each get all four sides.
 */
export function getRowSelectionBorders(
  state: SelectionState,
  rowId: string,
  columns: ColumnDef<any>[],
  rowIds: string[],
): RowOutlineSides | null {
  if (columns.length === 0 || rowIds.length === 0) return null;
  const firstField = columns[0]!.field;
  const lastField = columns[columns.length - 1]!.field;
  const rowIdx = rowIds.indexOf(rowId);
  if (rowIdx === -1) return null;

  // A range is treated as row-covering when it was created with the row
  // intent (chrome row-number click / Shift+rowheader / Cmd+rowheader) or
  // when the grid itself is in explicit row-selection mode. Crucially, a
  // Ctrl+A select-all in cell/range mode produces a range *without*
  // `kind: 'row'` so per-cell outlines still apply there.
  const isRowMode = state.mode === 'row';

  function isFullRowCovering(range: CellRange): boolean {
    const anchorRowIdx = rowIds.indexOf(range.anchor.rowId);
    const focusRowIdx = rowIds.indexOf(range.focus.rowId);
    const minRow = Math.min(anchorRowIdx, focusRowIdx);
    const maxRow = Math.max(anchorRowIdx, focusRowIdx);
    const isRowIntent = range.kind === 'row' || isRowMode;
    // Row-intent ranges are always candidates; cell/range-intent multi-row
    // ranges are not row-covering so Ctrl+A keeps its cell-level visual.
    if (minRow !== maxRow && !isRowIntent) return false;
    if (!isRowIntent && minRow === maxRow) {
      // Singleton in cell/range mode is row-covering only when the range
      // structurally spans every column (preserves the PR #58 contract).
    }
    if (rowIdx < minRow || rowIdx > maxRow) return false;
    return (
      (range.anchor.field === firstField && range.focus.field === lastField) ||
      (range.anchor.field === lastField && range.focus.field === firstField)
    );
  }

  const covering = state.ranges.filter(isFullRowCovering);
  if (covering.length === 0) return null;

  let top = false;
  let bottom = false;

  for (const range of covering) {
    const anchorRowIdx = rowIds.indexOf(range.anchor.rowId);
    const focusRowIdx = rowIds.indexOf(range.focus.rowId);
    const minRow = Math.min(anchorRowIdx, focusRowIdx);
    const maxRow = Math.max(anchorRowIdx, focusRowIdx);
    const isSingleton = minRow === maxRow;
    if (isSingleton || rowIdx === minRow) top = true;
    if (isSingleton || rowIdx === maxRow) bottom = true;
  }

  return { top, right: true, bottom, left: true };
}

/**
 * Treats `null`, `undefined`, and the empty string as "blank" — matching the
 * convention already used by the filtering module so that Excel-style "End"
 * navigation agrees with how the rest of the grid judges emptiness.
 *
 * @param value - The cell value to classify.
 * @returns `true` when the value should be considered an empty cell.
 */
export function isCellValueEmpty(value: unknown): boolean {
  return value == null || value === '';
}

/**
 * Computes the Excel-style "End mode" destination when Ctrl+Arrow is pressed.
 *
 * Semantics mirror Excel: starting from `current`, scan in `direction` along
 * the same row or column and pick the landing cell using these rules, based on
 * whether the current cell and its immediate neighbour are empty:
 *
 * - **current empty, neighbour empty** — jump to the first non-empty cell (or
 *   the grid edge if every cell is empty).
 * - **current empty, neighbour non-empty** — stop on that neighbour (the near
 *   edge of the next populated block).
 * - **current non-empty, neighbour empty** — skip the empty gap and land on
 *   the first non-empty cell after it (or the grid edge if the run of empties
 *   reaches all the way to the edge).
 * - **current non-empty, neighbour non-empty** — continue through the current
 *   populated run and stop on its last non-empty cell.
 *
 * `getCellValue` receives a cell address and returns that cell's stored value.
 * This lets the helper stay decoupled from the storage model (processed data,
 * plain array, virtualised view, etc.) — `isCellValueEmpty` decides emptiness.
 *
 * @param current - The starting cell address.
 * @param direction - The direction to scan (`'up'`, `'down'`, `'left'`, `'right'`).
 * @param columns - Full list of column definitions (hidden columns skipped).
 * @param rowIds - Ordered list of all row identifiers.
 * @param getCellValue - Reader that returns the raw value for a given cell.
 * @returns The destination {@link CellAddress}, or `null` when no movement is possible
 *   (e.g. already at the edge).
 */
export function getEndJumpCell(
  current: CellAddress,
  direction: 'up' | 'down' | 'left' | 'right',
  columns: ColumnDef<any>[],
  rowIds: string[],
  getCellValue: (cell: CellAddress) => unknown,
): CellAddress | null {
  const visibleCols = columns.filter(c => c.visible !== false);

  // Build the ordered sequence of cells we would visit if we kept pressing the
  // plain arrow key from `current`, so the scan is direction-agnostic.
  const sequence: CellAddress[] = [];
  if (direction === 'left' || direction === 'right') {
    const colIdx = visibleCols.findIndex(c => c.field === current.field);
    if (colIdx === -1) return null;
    if (direction === 'right') {
      for (let i = colIdx + 1; i < visibleCols.length; i++) {
        sequence.push({ rowId: current.rowId, field: visibleCols[i]!.field });
      }
    } else {
      for (let i = colIdx - 1; i >= 0; i--) {
        sequence.push({ rowId: current.rowId, field: visibleCols[i]!.field });
      }
    }
  } else {
    const rowIdx = rowIds.indexOf(current.rowId);
    if (rowIdx === -1) return null;
    if (direction === 'down') {
      for (let i = rowIdx + 1; i < rowIds.length; i++) {
        sequence.push({ rowId: rowIds[i]!, field: current.field });
      }
    } else {
      for (let i = rowIdx - 1; i >= 0; i--) {
        sequence.push({ rowId: rowIds[i]!, field: current.field });
      }
    }
  }

  // Already at the edge — no cell to jump to.
  if (sequence.length === 0) return null;

  const startEmpty = isCellValueEmpty(getCellValue(current));
  const firstNeighbourEmpty = isCellValueEmpty(getCellValue(sequence[0]!));

  // Case A: current is empty → find the first non-empty cell in `sequence`.
  // If nothing is non-empty we land on the far edge. This covers both the
  // "neighbour empty" and "neighbour non-empty" sub-cases from the doc-comment
  // because `findIndex` returns 0 when the immediate neighbour is already populated.
  if (startEmpty) {
    const firstNonEmpty = sequence.findIndex(c => !isCellValueEmpty(getCellValue(c)));
    if (firstNonEmpty !== -1) return sequence[firstNonEmpty]!;
    return sequence[sequence.length - 1]!;
  }

  // Case B: current non-empty, neighbour empty → skip the empty run and land
  // on the first non-empty cell after it (or on the far edge when the empty
  // run extends all the way to the grid boundary, matching Excel).
  if (firstNeighbourEmpty) {
    for (let i = 1; i < sequence.length; i++) {
      if (!isCellValueEmpty(getCellValue(sequence[i]!))) return sequence[i]!;
    }
    return sequence[sequence.length - 1]!;
  }

  // Case C: current non-empty and neighbour non-empty → walk through the
  // populated run and stop at its last non-empty cell.
  let lastNonEmpty = sequence[0]!;
  for (let i = 1; i < sequence.length; i++) {
    if (isCellValueEmpty(getCellValue(sequence[i]!))) break;
    lastNonEmpty = sequence[i]!;
  }
  return lastNonEmpty;
}
