/**
 * Checkbox cell renderer for the datagrid.
 *
 * Renders a native `<input type="checkbox">` that supports three visual
 * states: checked, unchecked, and indeterminate (for `null`/`undefined`
 * values).  Unlike other cell renderers, the checkbox does not distinguish
 * between display and edit modes -- toggling the checkbox immediately commits
 * the new boolean value.
 *
 * @module CheckboxCell
 * @packageDocumentation
 */
import React from 'react';
import type { CellValue, ColumnDef } from '@iasbuilt/datagrid-core';
import * as styles from './CheckboxCell.styles';

/**
 * Props accepted by {@link CheckboxCell}.
 *
 * @typeParam TData - The row data shape, defaults to a generic record.
 */
interface CheckboxCellProps<TData = Record<string, unknown>> {
  /** The current boolean-coercible cell value. `null`/`undefined` renders as indeterminate. */
  value: CellValue;
  /** The full row data object containing this cell. */
  row: TData;
  /** Column definition used to determine whether the cell is editable. */
  column: ColumnDef<TData>;
  /** Zero-based index of the row within the visible dataset. */
  rowIndex: number;
  /** Whether the cell is currently in inline-edit mode (unused for checkbox). */
  isEditing: boolean;
  /** Callback to persist the toggled boolean value. */
  onCommit: (value: CellValue) => void;
  /** Callback to discard the current edit and exit edit mode (unused for checkbox). */
  onCancel: () => void;
}

/**
 * Renders a boolean value as a native checkbox inside the datagrid.
 *
 * The checkbox supports an indeterminate visual state when the underlying
 * value is `null` or `undefined`, communicated to assistive technologies
 * via `aria-checked="mixed"`.  When the column is marked as non-editable
 * (`column.editable === false`), the checkbox is disabled and rendered with
 * a default cursor.
 *
 * Toggling the checkbox immediately invokes `onCommit` with the negated
 * boolean value, bypassing the usual edit-mode lifecycle used by text-based
 * cell renderers.
 *
 * @typeParam TData - Row data shape forwarded from the grid.
 *
 * @param props - {@link CheckboxCellProps}
 * @returns A React element representing the checkbox cell.
 *
 * @example
 * ```tsx
 * <CheckboxCell
 *   value={true}
 *   row={rowData}
 *   column={columnDef}
 *   rowIndex={0}
 *   isEditing={false}
 *   onCommit={handleCommit}
 *   onCancel={handleCancel}
 * />
 * ```
 */
export const CheckboxCell = React.memo(function CheckboxCell<TData = Record<string, unknown>>({
  value,
  column,
  onCommit,
}: CheckboxCellProps<TData>) {
  // Detect null/undefined to drive the indeterminate visual state
  const isNull = value === null || value === undefined;
  const checked = Boolean(value);
  // Default to editable unless the column explicitly opts out
  const editable = column.editable !== false;

  /** Toggles the boolean value and commits immediately when the column is editable. */
  const handleChange = () => {
    if (!editable) return;
    onCommit(!checked);
  };

  return (
    <input
      type="checkbox"
      checked={checked}
      ref={(el) => {
        // Set the DOM indeterminate property directly since it has no HTML attribute equivalent
        if (el) el.indeterminate = isNull;
      }}
      aria-checked={isNull ? 'mixed' : checked}
      disabled={!editable}
      onChange={handleChange}
      style={styles.checkbox(editable)}
    />
  );
}) as <TData = Record<string, unknown>>(props: CheckboxCellProps<TData>) => React.ReactElement;
