/**
 * Public API barrel file for the `@iasbuilt/datagrid-react` package.
 *
 * Re-exports all user-facing components, hooks, factory functions, type
 * aliases, and slot components so consumers can import everything from
 * a single entry point.
 *
 * @module index
 */

export { DataGrid } from './DataGrid';
export type { DataGridProps, CellRendererProps } from './DataGrid';
export { resolveThemeStyle, LIGHT_THEME, DARK_THEME } from './DataGrid';
export { lightThemeTokens, darkThemeTokens, toDatagridThemeTokens } from './styles/tokens';
export { GhostRow } from './GhostRow';
export { MasterDetail } from './MasterDetail';
export type { MasterDetailProps, DetailComponentProps } from './MasterDetail';
export { useGrid } from './use-grid';
export { useCauslDevtools, useCauslDevtoolsForGraph } from './use-causl-devtools';
export type { UseCauslDevtoolsOptions } from './use-causl-devtools';
export { useGridStore } from './use-grid-store';
export { GridContext, useGridContext } from './context';
export type { GridContextValue } from './context';
// Phase 3: Jotai shadow layer removed. createAtomicGridModel,
// AtomicGridBundle, AtomicStore, and the GridAtomSystem/BaseAtoms/
// DerivedAtoms/ActionAtoms type bundle are gone. Use createGridModel
// from @iasbuilt/datagrid-core directly; for fine-grained per-node
// subscriptions, reach into model.graph / model.nodes (causl).
export { TransposedGrid } from './TransposedGrid';
export type { TransposedGridProps } from './TransposedGrid';
export { useDragDrop } from './use-drag-drop';
export type { DragDropState, UseDragDropResult } from './use-drag-drop';

// State models
export { useGridInteraction } from './state/use-grid-interaction';
export type { UseGridInteractionReturn } from './state/use-grid-interaction';
export type {
  GridInteractionState,
  GridInteractionAction,
  MenuState,
  ColumnDragState,
  ColumnGroupDragState,
  ResizeState,
} from './state';

// Chrome columns
export { ChromeControlsCell } from './chrome';
export type { ChromeControlsCellProps } from './chrome';
export { ChromeRowNumberCell } from './chrome';
export type { ChromeRowNumberCellProps } from './chrome';
export { ChromeControlsHeaderCell, ChromeRowNumberHeaderCell } from './chrome';
export type { ChromeControlsHeaderCellProps, ChromeRowNumberHeaderCellProps } from './chrome';

// Shared cell editor hooks
export * from './cells/hooks';

// Issue #18 — transposed-grid-friendly cell renderers
export {
  BooleanSelectedCell,
  SELECTED_LABEL,
  UNSELECTED_LABEL,
} from './cells/BooleanSelectedCell';
export { PasswordConfirmCell, MISMATCH_MESSAGE } from './cells/PasswordConfirmCell';

// Issue #91 — file-upload cell so consumers can pass it via the
// `cellRenderers` prop without having to assemble it themselves.
export { UploadCell } from './cells/UploadCell';

// Migration helper for consumers upgrading from the HTML-backed RichTextCell.
export { htmlToMarkdown } from './cells/RichTextCell';

// Default cell renderer registry. Consumers can use this as a starting point
// when supplying a custom `cellRenderers` prop to {@link DataGrid}.
// `StatusCell` (issue #93) carries the new onAddOption / canDeleteOption /
// onDeleteOption contract for the editable-dropdown picker.
export { cellRendererMap, TagsCell } from './cells';
export { StatusCell } from './cells/StatusCell';

// Issue #95 — compound-chip color picker primitives reused by the MUI variant
// and available to consumers building custom chip-styled cells.
export {
  ColorPickerPopover,
  applyCustomColorToPalette,
  createInMemoryPaletteAdapter,
  normalizeHex,
  DEFAULT_THEME_COLORS,
  PALETTE_MAX,
} from './cells/CompoundChipListCell';
export type {
  ColorPickerPopoverProps,
  ChipItem,
} from './cells/CompoundChipListCell';

// Sub-components
export { DataGridHeader } from './header';
export type { DataGridHeaderProps } from './header';
export { DataGridColumnMenu } from './header';
export type { DataGridColumnMenuProps } from './header';
export { DataGridColumnGroupHeader } from './header';
export type { DataGridColumnGroupHeaderProps } from './header';
export { DataGridBody } from './body';
export type { DataGridBodyProps } from './body';
export { DataGridToolbar } from './toolbar';
export type { DataGridToolbarProps } from './toolbar';

// Slot components
export { Toolbar } from './slots/Toolbar';
export type { ToolbarProps } from './slots/Toolbar';
export { FormulaBar } from './slots/FormulaBar';
export type { FormulaBarProps } from './slots/FormulaBar';
export { StatusBar } from './slots/StatusBar';
export type { StatusBarProps } from './slots/StatusBar';
export { EmptyState } from './slots/EmptyState';
export type { EmptyStateProps } from './slots/EmptyState';
