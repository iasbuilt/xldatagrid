/**
 * Public API barrel file for the `@iasbuilt/datagrid-mui` package.
 *
 * Re-exports all MUI cell renderers, the theme bridge, the convenience
 * wrapper, and the renderer map for drop-in use.
 *
 * @module index
 */

export { MuiDataGrid } from './MuiDataGrid';
export type { MuiDataGridProps } from './MuiDataGrid';
export * from './theme';
export * from './cells';
export * from './components';
