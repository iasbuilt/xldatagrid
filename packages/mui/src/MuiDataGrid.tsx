/**
 * MuiDataGrid convenience wrapper that applies MUI theme and cell renderers.
 *
 * @module MuiDataGrid
 * @packageDocumentation
 */
import React from 'react';
import { DataGrid } from '@iasbuilt/datagrid-react';
import type { DataGridProps, CellRendererProps } from '@iasbuilt/datagrid-react';
import { MuiDataGridThemeProvider, MuiThemeShape } from './theme';
import { muiCellRendererMap } from './cells';

/**
 * Props accepted by {@link MuiDataGrid}.
 *
 * Extends the base DataGridProps with an optional MUI theme for automatic
 * CSS variable bridging and optional cell renderer overrides.
 */
export interface MuiDataGridProps<TData extends Record<string, unknown> = Record<string, unknown>>
  extends Omit<DataGridProps<TData>, 'cellRenderers'> {
  /** Optional MUI theme to bridge into datagrid CSS custom properties. */
  muiTheme?: MuiThemeShape;
  /** Optional cell renderer overrides that merge with the MUI cell renderer map. */
  cellRenderers?: Record<string, React.ComponentType<CellRendererProps<TData>>>;
}

/**
 * A convenience wrapper around DataGrid that automatically applies MUI cell
 * renderers and optionally bridges a MUI theme to datagrid CSS variables.
 *
 * @param props - {@link MuiDataGridProps}
 * @returns A themed DataGrid using MUI components.
 */
export function MuiDataGrid<TData extends Record<string, unknown>>({
  muiTheme,
  cellRenderers,
  ...props
}: MuiDataGridProps<TData>) {
  const mergedRenderers = { ...muiCellRendererMap, ...cellRenderers };

  const grid = (
    <DataGrid
      {...props}
      cellRenderers={mergedRenderers as Record<string, React.ComponentType<CellRendererProps<any>>>}
    />
  );

  if (muiTheme) {
    return <MuiDataGridThemeProvider theme={muiTheme}>{grid}</MuiDataGridThemeProvider>;
  }

  return grid;
}
