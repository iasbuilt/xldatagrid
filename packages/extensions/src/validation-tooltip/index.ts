/**
 * Validation tooltip extension for the datagrid. Displays error, warning, and
 * info tooltips near cells that have failed validation, with configurable
 * positioning, auto-dismiss timers, and a capped visible-tooltip count.
 *
 * @packageDocumentation
 */
import { ExtensionDefinition, ExtensionContext, ValidationResult, CellAddress, GridEvent } from '@iasbuilt/datagrid-core';

/**
 * Configuration options for the {@link createValidationTooltip} extension factory.
 */
export interface ValidationTooltipConfig {
  /** Position relative to the cell. Default: 'bottom' */
  position?: 'top' | 'bottom' | 'left' | 'right';
  /** Auto-dismiss after N milliseconds. 0 = never. Default: 5000 */
  autoDismissMs?: number;
  /** Show severity icon (error/warning/info). Default: true */
  showIcon?: boolean;
  /** Maximum number of tooltips visible at once. Default: 3 */
  maxVisible?: number;
}

/**
 * A single queued tooltip entry linking a cell address to its validation result.
 */
export interface ValidationTooltipEntry {
  /** The cell that failed validation. */
  cell: CellAddress;
  /** The validation result describing the failure. */
  result: ValidationResult;
  /** Unix timestamp (ms) when this entry was created. */
  timestamp: number;
}

/**
 * Public API for managing tooltip entries programmatically.
 */
export interface ValidationTooltipApi {
  /** Returns a shallow copy of all current tooltip entries. */
  getEntries(): ValidationTooltipEntry[];
  /** Removes all tooltip entries. */
  clear(): void;
  /** Dismisses the tooltip for a specific cell, if present. */
  dismiss(cell: CellAddress): void;
}

/**
 * Creates an {@link ExtensionDefinition} that tracks validation errors and
 * exposes them as tooltip entries for UI rendering. The extension listens for
 * `cell:validationError` events and maintains a bounded queue of the most
 * recent entries (controlled by {@link ValidationTooltipConfig.maxVisible}).
 *
 * Stale entries are automatically removed after {@link ValidationTooltipConfig.autoDismissMs}
 * milliseconds unless set to `0`.
 *
 * @param config - Optional configuration for tooltip behaviour.
 * @returns An extension definition with an additional `api` property.
 *
 * @example
 * ```ts
 * const tooltips = createValidationTooltip({ position: 'top', maxVisible: 5 });
 * grid.registerExtension(tooltips);
 * // Query active tooltips:
 * tooltips.api.getEntries();
 * ```
 */
export function createValidationTooltip(
  config?: ValidationTooltipConfig,
): ExtensionDefinition & { api: ValidationTooltipApi; config: Required<ValidationTooltipConfig> } {
  const opts: Required<ValidationTooltipConfig> = {
    position: config?.position ?? 'bottom',
    autoDismissMs: config?.autoDismissMs ?? 5000,
    showIcon: config?.showIcon ?? true,
    maxVisible: config?.maxVisible ?? 3,
  };

  const entries: ValidationTooltipEntry[] = [];
  const timers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  /** Builds a composite key for a cell address. */
  const cellKey = (cell: CellAddress) => `${cell.rowId}:${cell.field}`;

  /** Schedules auto-dismiss for an entry if configured. */
  const scheduleAutoDismiss = (cell: CellAddress) => {
    if (opts.autoDismissMs <= 0) return;
    const key = cellKey(cell);
    // Clear any existing timer for this cell
    const existing = timers.get(key);
    if (existing) clearTimeout(existing);
    timers.set(
      key,
      setTimeout(() => {
        api.dismiss(cell);
        timers.delete(key);
      }, opts.autoDismissMs),
    );
  };

  const api: ValidationTooltipApi = {
    getEntries: () => [...entries],
    clear: () => {
      entries.length = 0;
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    },
    dismiss: (cell: CellAddress) => {
      const idx = entries.findIndex(
        (e) => e.cell.rowId === cell.rowId && e.cell.field === cell.field,
      );
      if (idx >= 0) entries.splice(idx, 1);
      const key = cellKey(cell);
      const timer = timers.get(key);
      if (timer) {
        clearTimeout(timer);
        timers.delete(key);
      }
    },
  };

  return {
    id: 'validation-tooltip',
    name: 'Validation Tooltip',
    version: '1.0.0',
    hooks: (_ctx: ExtensionContext) => [
      {
        event: 'cell:validation' as const,
        phase: 'on' as const,
        priority: 500,
        handler: (event: GridEvent) => {
          const { cell, result } = event.payload as {
            cell: CellAddress;
            result: ValidationResult;
          };

          // Remove existing entry for this cell (replace with fresh one)
          const existingIdx = entries.findIndex(
            (e) => e.cell.rowId === cell.rowId && e.cell.field === cell.field,
          );
          if (existingIdx >= 0) entries.splice(existingIdx, 1);

          // Add new entry
          entries.push({ cell, result, timestamp: Date.now() });

          // Trim to maxVisible (oldest entries removed first)
          while (entries.length > opts.maxVisible) {
            const removed = entries.shift()!;
            const key = cellKey(removed.cell);
            const timer = timers.get(key);
            if (timer) {
              clearTimeout(timer);
              timers.delete(key);
            }
          }

          // Schedule auto-dismiss
          scheduleAutoDismiss(cell);
        },
      },
    ],
    destroy: () => {
      entries.length = 0;
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    },
    api,
    config: opts,
  };
}
