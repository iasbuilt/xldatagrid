/**
 * ActionsCell module for the datagrid component library.
 *
 * Provides a cell renderer that displays a row of action buttons within a datagrid cell.
 * Actions can be supplied via a typed `column.actions` extension (with click handlers,
 * dynamic disabled state, and optional tooltips) or as a fallback from `column.options`
 * (label-only buttons without click handlers). Tooltip text appears on hover, positioned
 * above each button.
 *
 * @module ActionsCell
 */
import React, { useState } from 'react';
import type { CellValue, ColumnDef, StatusOption } from '@iasbuilt/datagrid-core';
import * as styles from './ActionsCell.styles';

/**
 * Extends {@link StatusOption} with an optional disabled flag for use as a
 * fallback action button when no explicit `actions` array is provided.
 */
interface ActionOption extends StatusOption {
  /** Whether the fallback button should be rendered in a disabled state. */
  disabled?: boolean;
}

/**
 * Defines a single action button with its label, click handler, and optional
 * disabled state and tooltip text.
 */
interface ActionsDef {
  /** The visible text label rendered on the button. */
  label: string;
  /** Click handler invoked with the row data when the button is pressed. */
  onClick: (row: unknown) => void;
  /**
   * Controls whether the button is disabled.
   * A boolean value applies statically; a function receives the row and returns a boolean
   * for dynamic evaluation per row.
   */
  disabled?: boolean | ((row: unknown) => boolean);
  /** Optional tooltip text displayed on hover above the button. */
  tooltip?: string;
}

/**
 * Props accepted by the {@link ActionsCell} component.
 *
 * @typeParam TData - The shape of a single row in the datagrid. Defaults to a generic record.
 */
interface ActionsCellProps<TData = Record<string, unknown>> {
  /** The raw cell value (typically unused; actions are driven by column configuration). */
  value: CellValue;
  /** The full row data object, passed to action click handlers and disabled evaluators. */
  row: TData;
  /** Column definition, optionally extended with an `actions` array of {@link ActionsDef}. */
  column: ColumnDef<TData> & { actions?: ActionsDef[] };
  /** Zero-based index of the row within the visible datagrid. */
  rowIndex: number;
  /** Whether the cell is currently in inline-edit mode (typically unused for action cells). */
  isEditing: boolean;
  /** Callback to persist cell value changes (typically unused for action cells). */
  onCommit: (value: CellValue) => void;
  /** Callback to discard changes (typically unused for action cells). */
  onCancel: () => void;
}

/**
 * A datagrid cell renderer that displays a horizontal row of action buttons.
 *
 * Buttons are sourced from `column.actions` (preferred) which provides full click
 * handlers, dynamic disabled evaluation, and tooltip support. As a fallback,
 * `column.options` produces label-only buttons without click behavior. Each action
 * button supports a hover tooltip rendered as an absolutely-positioned element.
 *
 * @remarks
 * The `column.actions` property is a typed extension not present on the base `ColumnDef`.
 * It is accessed via a cast to `ActionsCellProps['column']` to maintain type safety
 * while supporting the extended interface.
 *
 * @typeParam TData - Row data shape, defaults to `Record<string, unknown>`.
 *
 * @param props - The component props conforming to {@link ActionsCellProps}.
 * @returns A React element containing action buttons, or `null` if no actions are configured.
 *
 * @example
 * ```tsx
 * <ActionsCell
 *   value={null}
 *   row={rowData}
 *   column={{
 *     ...columnDef,
 *     actions: [
 *       { label: 'Edit', onClick: (row) => editRow(row), tooltip: 'Edit this row' },
 *       { label: 'Delete', onClick: (row) => deleteRow(row), disabled: (row) => row.locked },
 *     ],
 *   }}
 *   rowIndex={0}
 *   isEditing={false}
 *   onCommit={handleCommit}
 *   onCancel={handleCancel}
 * />
 * ```
 */
export const ActionsCell = React.memo(function ActionsCell<TData = Record<string, unknown>>({
  row,
  column,
}: ActionsCellProps<TData>) {
  // Track which action button's tooltip is currently visible
  const [tooltip, setTooltip] = useState<{ text: string; index: number } | null>(null);

  // Extract the actions array from the typed column extension
  const actions: ActionsDef[] = (column as ActionsCellProps<TData>['column']).actions ?? [];

  // Fallback: use column.options as label-only buttons when no actions are defined
  const optionButtons: ActionOption[] = actions.length === 0 ? (column.options ?? []) : [];

  // Render nothing if neither actions nor option buttons are configured
  if (actions.length === 0 && optionButtons.length === 0) return null;

  return (
    <span style={styles.container}>
      {/* Primary action buttons with click handlers, dynamic disabled state, and tooltips */}
      {actions.map((action, i) => {
        // Evaluate the disabled state, supporting both static booleans and per-row functions
        const isDisabled =
          typeof action.disabled === 'function'
            ? action.disabled(row)
            : action.disabled === true;

        return (
          <span key={i} style={styles.actionWrapper}>
            <button
              type="button"
              disabled={isDisabled}
              aria-label={action.label}
              onClick={() => !isDisabled && action.onClick(row)}
              onMouseEnter={() =>
                action.tooltip ? setTooltip({ text: action.tooltip, index: i }) : undefined
              }
              onMouseLeave={() => setTooltip(null)}
              style={styles.actionButton(isDisabled)}
            >
              {action.label}
            </button>
            {/* Tooltip element positioned above the button, shown on hover */}
            {tooltip?.index === i && (
              <span
                role="tooltip"
                style={styles.tooltip}
              >
                {tooltip.text}
              </span>
            )}
          </span>
        );
      })}

      {/* Fallback option buttons rendered from column.options (label only, no click handler) */}
      {optionButtons.map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={opt.disabled}
          aria-label={opt.label}
          style={styles.optionButton(opt.disabled)}
        >
          {opt.label}
        </button>
      ))}
    </span>
  );
}) as <TData = Record<string, unknown>>(props: ActionsCellProps<TData>) => React.ReactElement | null;
