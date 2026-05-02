/**
 * Formula bar extension for the datagrid. Provides an editing bar above the
 * grid that displays and allows editing of the currently selected cell's value,
 * similar to Excel's formula bar.
 *
 * @packageDocumentation
 */
import { ExtensionDefinition, CellAddress, GridEvent, ExtensionContext } from '@iasbuilt/datagrid-core';

/**
 * Configuration options for the {@link createFormulaBar} extension factory.
 */
export interface FormulaBarConfig {
  /** Show cell address label (e.g., "A1") in the formula bar. Default: true */
  showCellAddress?: boolean;
  /** Show cell type indicator. Default: true */
  showCellType?: boolean;
  /** Height of the formula bar in pixels. Default: 36 */
  height?: number;
  /** Placeholder text when no cell is selected */
  placeholder?: string;
}

/**
 * Snapshot of the formula bar's current state, exposing the selected cell
 * address and its raw value for UI rendering.
 */
export interface FormulaBarState {
  /** The currently selected cell address, or `null` if nothing is selected. */
  activeCell: CellAddress | null;
  /** The raw value of the active cell, or `''` when nothing is selected. */
  value: string;
  /** Whether the formula bar input is actively being edited. */
  editing: boolean;
}

/**
 * Public API surface exposed by the formula bar extension for programmatic
 * interaction from consuming components.
 */
export interface FormulaBarApi {
  /** Returns a read-only snapshot of the current formula bar state. */
  getState(): Readonly<FormulaBarState>;
  /** Programmatically set the value displayed in the formula bar input. */
  setValue(value: string): void;
  /** Enter edit mode in the formula bar. */
  startEditing(): void;
  /** Exit edit mode, optionally committing the current value. */
  stopEditing(commit?: boolean): void;
}

/**
 * Creates an {@link ExtensionDefinition} that provides a formula bar for
 * viewing and editing the currently selected cell's value. The extension tracks
 * cell selection events and maintains internal state that a companion React
 * component can read via the exposed {@link FormulaBarApi}.
 *
 * @param config - Optional configuration for appearance and behaviour.
 * @returns An extension definition with an additional `api` property.
 *
 * @example
 * ```ts
 * const formulaBar = createFormulaBar({ height: 40 });
 * grid.registerExtension(formulaBar);
 * // Access state from a React component:
 * const state = formulaBar.api.getState();
 * ```
 */
export function createFormulaBar(
  config?: FormulaBarConfig,
): ExtensionDefinition & { api: FormulaBarApi; config: Required<FormulaBarConfig> } {
  const opts: Required<FormulaBarConfig> = {
    showCellAddress: config?.showCellAddress ?? true,
    showCellType: config?.showCellType ?? true,
    height: config?.height ?? 36,
    placeholder: config?.placeholder ?? 'Select a cell to edit...',
  };

  const state: FormulaBarState = {
    activeCell: null,
    value: '',
    editing: false,
  };

  let ctx: ExtensionContext | null = null;

  const api: FormulaBarApi = {
    getState: () => ({ ...state }),
    setValue: (value: string) => {
      state.value = value;
    },
    startEditing: () => {
      state.editing = true;
    },
    stopEditing: (commit = true) => {
      if (commit && state.activeCell && ctx) {
        // Commit the formula bar value back to the grid
        ctx.commands.setCellValue?.(state.activeCell, state.value);
      }
      state.editing = false;
    },
  };

  return {
    id: 'formula-bar',
    name: 'Formula Bar',
    version: '1.0.0',
    init: (context) => {
      ctx = context;
    },
    hooks: (_ctx: ExtensionContext) => [
      {
        event: 'cell:selectionChange' as const,
        phase: 'on' as const,
        priority: 500,
        handler: (event: GridEvent) => {
          const { range } = event.payload as { range: { anchor: CellAddress; focus: CellAddress } | null };
          if (!range) {
            state.activeCell = null;
            state.value = '';
            state.editing = false;
            return;
          }
          const cell = range.focus;
          state.activeCell = cell;
          // Read the current value from the grid state
          if (ctx) {
            const row = ctx.gridState.data?.find(
              (r: Record<string, unknown>) => String((r as any).id) === cell.rowId,
            );
            state.value = row ? String((row as any)[cell.field] ?? '') : '';
          }
          state.editing = false;
        },
      },
    ],
    destroy: () => {
      state.activeCell = null;
      state.value = '';
      state.editing = false;
      ctx = null;
    },
    api,
    config: opts,
  };
}
