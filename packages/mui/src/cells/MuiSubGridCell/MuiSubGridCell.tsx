/**
 * MUI sub-grid cell renderer for the datagrid.
 *
 * Badge + icon + count toggle rendered in cells whose column is declared
 * `cellType: 'subGrid'`. The toggle flips the row's id in the enclosing grid
 * model's `expandedSubGrids` set via `model.toggleSubGridExpansion(rowId)`.
 * The actual nested grid is mounted by the body renderer as a full-width
 * expansion row beneath the parent row.
 *
 * @module MuiSubGridCell
 * @packageDocumentation
 */
import React, { useCallback, useContext, useSyncExternalStore } from 'react';
import Chip from '@mui/material/Chip';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import CloseIcon from '@mui/icons-material/Close';
import type { CellValue } from '@iasbuilt/datagrid-core';
import type { CellRendererProps } from '@iasbuilt/datagrid-react';
import { GridContext } from '@iasbuilt/datagrid-react';

function parseRows(value: CellValue): Record<string, unknown>[] {
  if (Array.isArray(value)) return value as Record<string, unknown>[];
  return [];
}

/**
 * MUI-flavoured badge+icon+count toggle cell. The behaviour matches the
 * vanilla `SubGridCell`: click toggles the parent row's expansion and the
 * icon flips from `▶` to `×` while expanded. The numeric count is rendered
 * as a `Chip` for MUI-native styling.
 */
export const MuiSubGridCell = React.memo(function MuiSubGridCell<TData extends Record<string, unknown> = Record<string, unknown>>({
  value,
  rowIndex,
}: CellRendererProps<TData>) {
  const rows = parseRows(value);
  const ctx = useContext(GridContext);
  const model = ctx?.model ?? null;

  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!model) return () => {};
      return model.subscribe(onChange);
    },
    [model],
  );
  const getSnapshot = useCallback(() => {
    if (!model) return false;
    const rowIds = model.getRowIds();
    const id = rowIds[rowIndex];
    return id ? model.getState().expandedSubGrids.has(id) : false;
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

  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
      <IconButton
        size="small"
        onClick={onClick}
        data-testid="subgrid-toggle"
        data-expanded={isExpanded ? 'true' : 'false'}
        aria-label={isExpanded ? 'Collapse sub-grid' : 'Expand sub-grid'}
        aria-expanded={isExpanded}
        sx={{ p: 0.25 }}
      >
        {isExpanded ? (
          <CloseIcon fontSize="inherit" sx={{ fontSize: 16, color: 'error.main' }} />
        ) : (
          <KeyboardArrowRightIcon fontSize="inherit" sx={{ fontSize: 16, color: 'text.secondary' }} />
        )}
      </IconButton>
      <Chip
        label={rows.length}
        size="small"
        sx={{ fontSize: 11, fontWeight: 600, height: 20 }}
        data-testid="subgrid-count"
      />
    </Box>
  );
}) as <TData extends Record<string, unknown> = Record<string, unknown>>(
  props: CellRendererProps<TData>,
) => React.ReactElement;
