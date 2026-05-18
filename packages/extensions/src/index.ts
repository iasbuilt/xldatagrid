/**
 * Public entry point for `@iasbuilt/datagrid-extensions`.
 *
 * Each export below is a **factory function** that returns an
 * `ExtensionDefinition` (defined in `@iasbuilt/datagrid-core`'s
 * `types.ts`). Adopters register the returned definition through
 * `model.registerExtension(ext)` (or, in the React adapter, by passing
 * the array to `<DataGrid extensions={[...]} />`); the plugin host
 * orchestrates lifecycle (`init` → hook wiring → `destroy`), enforces
 * declared dependencies, and tears down in reverse order on unmount.
 *
 * The accompanying `type` re-exports surface the per-extension config
 * and API shapes so TypeScript consumers can statically reference them
 * without reaching into deep import paths.
 *
 * Extensions shipped here:
 *
 *   - **regex-validation** — pattern-based cell validation with
 *     `error` / `warning` / `info` severities.
 *   - **cell-comments** — threaded comments on individual cells.
 *   - **column-resize** — drag-to-resize column headers with min/max
 *     clamping and pointer-capture for cross-row drag.
 *   - **export** — CSV / JSON / Excel export with per-extension
 *     header/footer + page-config customisation.
 *   - **formula-bar** — Excel-style formula-bar wiring on top of the
 *     editing lifecycle (tracks the editing cell, drives
 *     `commitEdit` / `cancelEdit`, exposes `FormulaBarApi`).
 *   - **excel-mode** — single-click edit + Excel-style
 *     commit-and-advance. Pairs with the `EditCause = 'click'` signal
 *     so the editor mount selects existing text on cell entry
 *     (closes #133's race).
 *   - **validation-tooltip** — portalled per-cell validation tooltip
 *     with severity-coloured styling.
 *
 * @packageDocumentation
 */

// Pattern-validation extension — adds `validate(value)` hooks driven
// by RegExp objects, with multi-severity surfacing.
export { createRegexValidation } from './regex-validation';

// Threaded cell-comment overlays with per-cell anchoring and storage.
export { createCellComments } from './cell-comments';

// Drag-to-resize header gutters with pointer capture so the drag
// survives the cursor leaving the original header cell.
export { createColumnResize } from './column-resize';

// Format-agnostic export pipeline: shared traversal of visible rows /
// columns, with format-specific serialisers (CSV / JSON / Excel-XML).
// Header + footer + page-config knobs let consumers brand the output.
export { createExportExtension } from './export';
export type { ExportConfig, ExportResult, ExportFormat, ExportApi, ExportPageConfig, ExportHeaderFooter } from './export';

// Excel-style formula bar wired to the editing lifecycle. The
// extension owns the bar's tracked-cell state; `FormulaBarApi` is
// surfaced for adopters that render their own bar UI.
export { createFormulaBar } from './formula-bar';
export type { FormulaBarConfig, FormulaBarState, FormulaBarApi } from './formula-bar';

// Single-click edit + commit-and-advance. The hook on `cell:click`
// threads `cause='click'` through `beginEdit` so the body's editor
// mount selects existing text (closes #133 — the same race-fix lane
// dblclick / F2 / Enter use).
export { createExcelMode } from './excel-mode';
export type { ExcelModeConfig, ExcelModeApi } from './excel-mode';

// Portalled validation tooltip with severity-coloured styling
// (red = error, amber = warning, blue = info). Adopters can opt in
// per-cell or globally; the extension lives outside `DataGridBody`'s
// per-cell render so portal/measurement costs amortise across the
// grid.
export { createValidationTooltip } from './validation-tooltip';
export type { ValidationTooltipConfig, ValidationTooltipApi, ValidationTooltipEntry } from './validation-tooltip';
