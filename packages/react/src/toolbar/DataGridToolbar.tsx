import type { ColumnDef, RowGroupConfig, RowGroup } from '@iasbuilt/datagrid-core';
import type { MenuState } from '../state';
import * as styles from './DataGridToolbar.styles';

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
    computedRowGroups,
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
