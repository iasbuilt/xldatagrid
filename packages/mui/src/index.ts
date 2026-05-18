/**
 * Public entry point for `@iasbuilt/datagrid-mui`.
 *
 * The package layers Material UI styling on top of the framework-
 * agnostic core. Three subsystems live here:
 *
 *   - **`<MuiDataGrid>`** — a thin wrapper around `<DataGrid>` from
 *     `@iasbuilt/datagrid-react` that pre-wires the MUI cell renderers
 *     and the theme bridge. Adopters drop it in instead of `<DataGrid>`
 *     and get an MUI-styled grid that respects their MUI theme.
 *   - **`theme/`** — the `bridgeMuiTheme(muiTheme)` mapper and the
 *     `<MuiDataGridThemeProvider>` that pipes MUI palette values into
 *     the grid's `--dg-*` CSS variables.
 *   - **`cells/`** — one MUI-styled cell renderer per `cellType`. Each
 *     renderer matches the `CellRendererProps<TData>` contract from
 *     the core package and can be used standalone (passed via
 *     `cellRenderers` on a plain `<DataGrid>`) or transitively via
 *     `<MuiDataGrid>`.
 *   - **`components/`** — shared MUI building blocks
 *     (`<EditableTextField>`, `<EditableSelect>`,
 *     `<EditableAutocomplete>`, `<DisplayTypography>`) the cell
 *     renderers compose with.
 *
 * @module index
 */

export { MuiDataGrid } from './MuiDataGrid';
export type { MuiDataGridProps } from './MuiDataGrid';
export * from './theme';
export * from './cells';
export * from './components';
