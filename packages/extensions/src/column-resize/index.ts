/**
 * Column-resize extension for the datagrid. Intercepts resize events and enforces
 * configurable minimum and maximum width constraints, cancelling any resize attempt
 * that falls outside the allowed range.
 *
 * @packageDocumentation
 */
import { ExtensionDefinition, GridEvent } from '@iasbuilt/datagrid-core';

/**
 * Configuration options for the {@link createColumnResize} extension factory.
 */
export interface ColumnResizeConfig {
  /**
   * The minimum allowed column width in pixels.
   *
   * @defaultValue `50`
   */
  minWidth?: number;

  /**
   * The maximum allowed column width in pixels.
   *
   * @defaultValue `2000`
   */
  maxWidth?: number;

  /**
   * When `true`, double-clicking a column's resize handle will auto-fit the
   * column width to its content.
   */
  doubleClickAutoFit?: boolean;
}

/**
 * Creates an {@link ExtensionDefinition} that constrains column resize operations
 * within a configurable width range. The extension registers a `before`-phase hook
 * on the `column:resize` event; if the proposed width is outside `[minWidth, maxWidth]`,
 * the event is cancelled, preventing the resize from taking effect.
 *
 * @param config - Optional configuration specifying width bounds and behaviour.
 * @returns An extension definition ready to register with the datagrid.
 *
 * @example
 * ```ts
 * const resize = createColumnResize({ minWidth: 80, maxWidth: 500 });
 * grid.registerExtension(resize);
 * ```
 */
export function createColumnResize(config: ColumnResizeConfig = {}): ExtensionDefinition {
  return {
    id: 'column-resize',
    name: 'Column Resize',
    version: '0.1.0',
    hooks(ctx) {
      return [{
        event: 'column:resize',
        phase: 'before',
        handler(event: GridEvent) {
          const { width } = event.payload as { width: number };

          // Resolve effective bounds, falling back to sensible defaults
          const min = config.minWidth ?? 50;
          const max = config.maxWidth ?? 2000;

          // Cancel the resize if the proposed width violates the constraints
          if (width < min || width > max) {
            event.cancel?.();
            return false;
          }
        },
      }];
    },
  };
}
