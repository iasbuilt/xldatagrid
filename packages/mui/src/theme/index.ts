/**
 * Theme bridge barrel for `@iasbuilt/datagrid-mui`.
 *
 * `bridgeMuiTheme` maps a Material UI theme object into the
 * `--dg-*` CSS-variable map the grid consumes; the
 * `<MuiDataGridThemeProvider>` component wires that mapping into the
 * React tree so adopters get a single `theme={muiTheme}` prop on
 * `<MuiDataGrid>` and the rest of the colour token plumbing happens
 * automatically.
 */
export { bridgeMuiTheme } from './theme-bridge';
export type { MuiThemeShape } from './theme-bridge';
export { MuiDataGridThemeProvider } from './MuiDataGridThemeProvider';
export type { MuiDataGridThemeProviderProps } from './MuiDataGridThemeProvider';
