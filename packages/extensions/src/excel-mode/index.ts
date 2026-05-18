/**
 * Excel-style tab-through editing extension for the datagrid. Enables
 * spreadsheet-like navigation where Tab and Enter auto-save the current cell
 * and advance focus to the next cell, with optional keystroke-triggered editing.
 *
 * @packageDocumentation
 */
import { ExtensionDefinition, CellAddress, GridEvent, ExtensionContext } from '@iasbuilt/datagrid-core';

/**
 * Configuration options for the {@link createExcelMode} extension factory.
 */
export interface ExcelModeConfig {
  /** Auto-save on cell navigation (Tab, Enter, arrow keys). Default: true */
  autoSave?: boolean;
  /** Enter key direction: 'down' moves down, 'right' moves right. Default: 'down' */
  enterDirection?: 'down' | 'right';
  /** Tab wraps to next row at end of row. Default: true */
  tabWrap?: boolean;
  /** Start editing on any keypress (not just F2/Enter). Default: true */
  editOnKeypress?: boolean;
}

/**
 * Public API for programmatic control of Excel mode behaviour at runtime.
 */
export interface ExcelModeApi {
  /** Returns the resolved (merged with defaults) configuration. */
  getConfig(): Readonly<Required<ExcelModeConfig>>;
  /** Temporarily enable or disable auto-save at runtime. */
  setAutoSave(enabled: boolean): void;
  /** Change the Enter key direction at runtime. */
  setEnterDirection(direction: 'down' | 'right'): void;
}

/**
 * Creates an {@link ExtensionDefinition} that enables Excel-style cell
 * navigation and editing. The extension intercepts keyboard events to provide
 * automatic cell value committing on Tab/Enter, configurable navigation
 * direction, tab-wrapping, and keystroke-initiated editing.
 *
 * @param config - Optional configuration overriding default behaviour.
 * @returns An extension definition with an additional `api` property.
 *
 * @example
 * ```ts
 * const excelMode = createExcelMode({ enterDirection: 'right', tabWrap: true });
 * grid.registerExtension(excelMode);
 * ```
 */
export function createExcelMode(
  config?: ExcelModeConfig,
): ExtensionDefinition & { api: ExcelModeApi; config: Required<ExcelModeConfig> } {
  const opts: Required<ExcelModeConfig> = {
    autoSave: config?.autoSave ?? true,
    enterDirection: config?.enterDirection ?? 'down',
    tabWrap: config?.tabWrap ?? true,
    editOnKeypress: config?.editOnKeypress ?? true,
  };

  let ctx: ExtensionContext | null = null;

  const api: ExcelModeApi = {
    getConfig: () => ({ ...opts }),
    setAutoSave: (enabled: boolean) => {
      opts.autoSave = enabled;
    },
    setEnterDirection: (direction: 'down' | 'right') => {
      opts.enterDirection = direction;
    },
  };

  return {
    id: 'excel-mode',
    name: 'Excel Mode',
    version: '1.0.0',
    init: (context) => {
      ctx = context;
    },
    hooks: (_ctx: ExtensionContext) => [
      {
        event: 'cell:valueChange' as const,
        phase: 'on' as const,
        priority: 500,
        handler: (_event: GridEvent) => {
          if (!opts.autoSave || !ctx) return;
          // When a cell value changes via edit, auto-commit is already handled
          // by the grid. This hook is a placeholder for extensions that need
          // post-save side effects (e.g., logging, syncing).
        },
      },
      {
        event: 'cell:click' as const,
        phase: 'on' as const,
        priority: 100,
        handler: (event: GridEvent) => {
          if (!ctx || !opts.editOnKeypress) return;
          // On cell click, begin editing immediately in excel mode
          const { cell } = event.payload as { cell: CellAddress };
          if (cell) {
            // cause='click' — excel-mode opts cells into edit on
            // single-click. Editor mount selects existing text so a
            // subsequent keystroke REPLACES the value (#133).
            ctx.commands.beginEdit(cell, 'click');
          }
        },
      },
      {
        event: 'cell:doubleClick' as const,
        phase: 'before' as const,
        priority: 100,
        handler: (_event: GridEvent) => {
          // In excel mode, single-click already starts editing, so double-click
          // is a no-op override to prevent default double-click behaviour.
          if (opts.editOnKeypress) {
            return false;
          }
        },
      },
    ],
    destroy: () => {
      ctx = null;
    },
    api,
    config: opts,
  };
}
