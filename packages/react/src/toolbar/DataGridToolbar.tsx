/**
 * Toolbar above the grid header.
 *
 * Renders the column-visibility menu trigger and (when row grouping
 * is active) the expand / collapse-all controls. Two completely
 * independent feature toggles drive the toolbar's visibility — both
 * may be off, in which case the component short-circuits to `null`
 * and the grid renders with no toolbar gutter at all.
 *
 * The toolbar is presentational: every mutation goes back to the
 * parent through a callback prop so the canonical state continues
 * to live in the {@link GridModel} / `useGridInteraction` reducer.
 *
 * @module DataGridToolbar
 */
import type { ColumnDef, RowGroupConfig, RowGroup } from '@iasbuilt/datagrid-core';
import type { MenuState } from '../state';
import * as styles from './DataGridToolbar.styles';

/**
 * Props accepted by {@link DataGridToolbar}.
 *
 * The component is intentionally pull-shaped: the parent (`<DataGrid>`)
 * resolves column visibility / grouping config / menu open-state and
 * passes only the values needed to paint the toolbar. This keeps the
 * toolbar a leaf in the rendering tree and lets unit tests instantiate
 * it without spinning up a full grid model.
 *
 * @typeParam TData - Row data shape, propagated from the parent grid.
 */
export interface DataGridToolbarProps<TData> {
  showColumnVisibilityMenu: boolean;
  showGroupControls: boolean;
  visibleColumns: ColumnDef<TData>[];
  allColumns: ColumnDef<TData>[];
  hiddenColumns: Set<string>;
  menuState: MenuState;
  onToggleVisibilityMenu: () => void;
  onColumnVisibilityChange: (field: string, visible: boolean) => void;
  rowGroupConfig: RowGroupConfig | null;
  computedRowGroups: RowGroup[];
  onCollapseAll: () => void;
  onExpandAll: () => void;
}

/**
 * Header-strip toolbar component — see {@link DataGridToolbarProps} for
 * the field-by-field contract.
 */
export function DataGridToolbar<TData>(props: DataGridToolbarProps<TData>) {
  const {
    showColumnVisibilityMenu,
    showGroupControls,
    visibleColumns,
    allColumns,
    hiddenColumns,
    menuState,
    onToggleVisibilityMenu,
    onColumnVisibilityChange,
    rowGroupConfig,
    // Reserved for a future "N groups" indicator in the toolbar; declared in
    // the props contract for callers that already compute it.
    computedRowGroups: _computedRowGroups,
    onCollapseAll,
    onExpandAll,
  } = props;

  const hasGroupControls = showGroupControls && rowGroupConfig;

  if (!showColumnVisibilityMenu && !hasGroupControls) {
    return null;
  }

  const isMenuOpen = menuState.type === 'columnVisibility';

  // Build the full column list: visible columns first, then any hidden columns
  // that aren't already in the visible set.
  const allDisplayColumns = visibleColumns.concat(
    allColumns.filter(
      (c) =>
        hiddenColumns.has(c.field) &&
        !visibleColumns.some((v) => v.field === c.field),
    ),
  );

  return (
    <>
      {/* Column visibility menu */}
      {showColumnVisibilityMenu && (
        <div style={styles.columnVisibilityBar}>
          <button
            data-testid="column-visibility-toggle"
            onClick={onToggleVisibilityMenu}
            style={styles.columnVisibilityButton}
          >
            Columns
          </button>
          {isMenuOpen && (
            <div
              data-testid="column-visibility-menu"
              style={styles.columnVisibilityMenu}
            >
              {allDisplayColumns.map((col) => {
                const isHidden = hiddenColumns.has(col.field);
                return (
                  <label key={col.field} style={styles.columnVisibilityLabel}>
                    <input
                      type="checkbox"
                      checked={!isHidden}
                      onChange={() =>
                        onColumnVisibilityChange(col.field, isHidden)
                      }
                    />
                    {col.title}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Group controls */}
      {hasGroupControls && (
        <div style={styles.groupControls}>
          <button
            data-testid="collapse-all-groups"
            onClick={onCollapseAll}
          >
            Collapse All
          </button>
          <button
            data-testid="expand-all-groups"
            onClick={onExpandAll}
          >
            Expand All
          </button>
        </div>
      )}
    </>
  );
}
