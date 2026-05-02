/**
 * SubGridCell module for the datagrid component library.
 *
 * A compact toggle affordance rendered inside the cell whose column is
 * declared as `cellType: 'subGrid'`. The cell itself no longer hosts the
 * nested grid — that is rendered as a full-width expansion row beneath the
 * parent row by `DataGridBody` (see `expandedSubGrids` in the grid model and
 * the per-row expansion handling in the body renderer).
 *
 * The toggle shows:
 *   - an arrow icon that flips between `▶` (collapsed) and `×` (expanded, acts
 *     as an affordance to close the expansion row),
 *   - a numeric badge with the row count of the nested data.
 *
 * Clicking the toggle dispatches `model.toggleSubGridExpansion(rowId)` on the
 * owning grid model, which flips the row's id in `expandedSubGrids`. This
 * single source of truth lets the body renderer mount/unmount the nested
 * grid consistently with keyboard and programmatic toggling.
 *
 * @module SubGridCell
 */
import React, { useContext, useSyncExternalStore, useCallback } from 'react';
import type { CellValue } from '@iasbuilt/datagrid-core';
import { GridContext } from '../../context';
import * as styles from './SubGridCell.styles';

/**
 * Props accepted by the {@link SubGridCell} component.
 *
 * Matches `CellRendererProps` from `DataGrid.tsx` so the cell can be used as
 * a drop-in cell renderer through the `cellRenderers` map.
 *
 * @typeParam TData - The shape of a single row in the parent datagrid.
 */
interface SubGridCellProps<TData = Record<string, unknown>> {
  /** The raw cell value, expected to be an array of nested row objects. */
  value: CellValue;
  /** The full parent row data object that this cell belongs to. */
  row: TData;
  /** Column definition (unused at runtime — kept for cell-renderer shape). */
  column: unknown;
  /** Zero-based index of the parent row within the visible datagrid. */
  rowIndex: number;
  /** Whether the cell is currently in inline-edit mode (unused). */
  isEditing: boolean;
  /** Callback to persist updates (unused). */
  onCommit: (value: CellValue) => void;
  /** Callback to discard changes (unused). */
  onCancel: () => void;
  /**
   * Stable identifier of the parent grid. Used to construct the child grid's
   * stable id (`${gridId}-row-${rowId}-subgrid`) for aria-controls linkage.
   * When not provided the aria-controls attribute is omitted.
   */
  gridId?: string;
  /**
   * Row identifier for the parent row that this cell belongs to. Combined with
   * `gridId` to build the aria-controls value pointing at the nested grid.
   */
  rowId?: string;
}

function parseRows(value: CellValue): Record<string, unknown>[] {
  if (Array.isArray(value)) return value as Record<string, unknown>[];
  return [];
}

/**
 * Badge + icon + count toggle for a sub-grid column.
 *
 * Renders a button with an arrow icon (or `×` when the row is already
 * expanded) and a pill-shaped count badge. Clicking the button dispatches
 * `toggleSubGridExpansion(rowId)` on the enclosing grid model. The nested
 * grid itself is rendered by the parent grid's body as a full-width
 * expansion row when `expandedSubGrids.has(rowId)`.
 *
 * The button stops event propagation so the cell's onClick handler (which
 * selects the cell) does not also fire, preventing an edit-mode toggle or
 * spurious selection while the user targets the affordance itself.
 *
 * @typeParam TData - Parent row data shape.
 */
export const SubGridCell = React.memo(function SubGridCell<TData extends Record<string, unknown> = Record<string, unknown>>({
  value,
  rowIndex,
  gridId,
  rowId: rowIdProp,
}: SubGridCellProps<TData>) {
  const rows = parseRows(value);
  const ctx = useContext(GridContext);
  const model = ctx?.model ?? null;

  // Subscribe to the grid model so this cell re-renders when the
  // `expandedSubGrids` set mutates. We read the resolved rowId from
  // `model.getRowIds()[rowIndex]` inside the snapshot so the subscription
  // stays narrow (a single boolean) and avoids re-rendering the cell for
  // unrelated state changes.
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!model) return () => {};
      return model.subscribe(onChange);
    },
    [model],
  );
  const getSnapshot = useCallback(() => {
    if (!model) return false;
    const state = model.getState();
    const rowIds = model.getRowIds();
    const id = rowIds[rowIndex];
    return id ? state.expandedSubGrids.has(id) : false;
  }, [model, rowIndex]);
  const getServerSnapshot = useCallback(() => false, []);

  const isExpanded = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const onClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (!model) return;
    const rowIds = model.getRowIds();
    const id = rowIds[rowIndex];
    if (!id) return;
    model.toggleSubGridExpansion(id);
  };

  // Resolve the row id: prefer the explicit prop, fall back to index-based
  // lookup so existing usages without the prop still work.
  const resolvedRowId = rowIdProp ?? (model ? model.getRowIds()[rowIndex] : undefined);

  // Stable child-grid id used for ARIA linkage. Format:
  //   `${gridId}-row-${rowId}-subgrid`
  // When either piece is unavailable the aria-controls attribute is omitted
  // so assistive-technology fallback is graceful.
  const childGridId =
    gridId && resolvedRowId ? `${gridId}-row-${resolvedRowId}-subgrid` : undefined;

  return (
    <div style={styles.container(0)}>
      <button
        type="button"
        data-testid="subgrid-toggle"
        data-expanded={isExpanded ? 'true' : 'false'}
        aria-label={isExpanded ? 'Collapse sub-grid' : 'Expand sub-grid'}
        aria-expanded={isExpanded}
        aria-controls={childGridId}
        onClick={onClick}
        style={styles.toggleButton}
      >
        <span style={styles.arrow(isExpanded)} aria-hidden="true">
          {isExpanded ? '\u00D7' : '\u25B6'}
        </span>
        <span style={styles.rowCountBadge} data-testid="subgrid-count">
          {rows.length}
        </span>
      </button>
    </div>
  );
}) as <TData extends Record<string, unknown> = Record<string, unknown>>(
  props: SubGridCellProps<TData>,
) => React.ReactElement;
