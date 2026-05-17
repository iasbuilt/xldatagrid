/**
 * Numeric cell renderer for the datagrid.
 *
 * Displays numeric values right-aligned with optional thousands-separator
 * formatting, and provides an inline editor that constrains input to valid
 * decimal numbers while respecting configurable min/max bounds.
 *
 * @module NumericCell
 * @packageDocumentation
 */
import React, { useState, useRef, useEffect } from 'react';
import type { CellValue, ColumnDef } from '@iasbuilt/datagrid-core';
import { formatNumber, isNumberFormatSpec } from '@iasbuilt/datagrid-core';
import * as styles from './NumericCell.styles';

/**
 * Props accepted by {@link NumericCell}.
 *
 * @typeParam TData - The row data shape, defaults to a generic record.
 */
interface NumericCellProps<TData = Record<string, unknown>> {
  /** The raw cell value, expected to be numeric or coercible to a number. */
  value: CellValue;
  /** The full row data object containing this cell. */
  row: TData;
  /** Column definition carrying min, max, and format configuration. */
  column: ColumnDef<TData>;
  /** Zero-based index of the row within the visible dataset. */
  rowIndex: number;
  /** Whether the cell is currently in inline-edit mode. */
  isEditing: boolean;
  /** Callback to persist the edited numeric value (or `null` for empty). */
  onCommit: (value: CellValue) => void;
  /** Callback to discard the current edit and exit edit mode. */
  onCancel: () => void;
}

/**
 * Converts a cell value to a human-readable numeric string.
 *
 * Returns an empty string for null, undefined, empty-string, or NaN inputs.
 * Delegates to {@link formatNumber} when the column declares an Excel-style
 * format spec; otherwise falls back to `Number.toLocaleString()` when
 * thousands grouping is requested or a plain `String()` conversion.
 *
 * @param value  - The raw cell value to format.
 * @param format - The column's `format` field; may be a spec object,
 *                 the `'thousands'` shorthand, or any other string (in
 *                 which case it is ignored for numeric columns).
 * @returns The formatted numeric string, or `""` when the value is not a valid number.
 */
export function formatNumeric(value: CellValue, format: ColumnDef['format']): string {
  if (value === null || value === undefined || value === '') return '';
  const num = Number(value);
  if (isNaN(num)) return '';
  if (isNumberFormatSpec(format)) return formatNumber(num, format);
  return String(num);
}

/**
 * Renders a numeric value inside the datagrid with right-aligned text in
 * display mode and a constrained decimal input in edit mode.
 *
 * The component derives its thousands-separator behaviour from
 * `column.format === 'thousands'`.  During editing, arrow-up and arrow-down
 * keys increment/decrement the value by 1, respecting `column.min` and
 * `column.max` bounds.  Only characters matching a valid decimal number
 * pattern are accepted into the draft.
 *
 * @typeParam TData - Row data shape forwarded from the grid.
 *
 * @param props - {@link NumericCellProps}
 * @returns A React element representing the numeric cell.
 *
 * @example
 * ```tsx
 * <NumericCell
 *   value={42}
 *   row={rowData}
 *   column={{ ...colDef, format: 'thousands', min: 0, max: 100 }}
 *   rowIndex={0}
 *   isEditing={true}
 *   onCommit={handleCommit}
 *   onCancel={handleCancel}
 * />
 * ```
 */
export const NumericCell = React.memo(function NumericCell<TData = Record<string, unknown>>({
  value,
  column,
  isEditing,
  onCommit,
  onCancel,
}: NumericCellProps<TData>) {
  // Resolve the display string from the column's `format` spec, supporting
  // both the legacy `'thousands'` shorthand and the discriminated-union
  // {@link NumberFormatSpec} object form added for issue #92.
  const displayValue = formatNumeric(value, column.format);
  // Optional dual-unit sub-cell (issue #92): rendered below the primary
  // value when the column declares `secondaryUnit`, and only when the
  // primary value is a finite number we can run the conversion on.
  const numericValue = (() => {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  })();
  const secondary = column.secondaryUnit;
  const secondaryDisplay = secondary && numericValue !== null
    ? `${formatNumeric(secondary.conversion(numericValue), secondary.format) || String(secondary.conversion(numericValue))} ${secondary.label}`
    : null;
  const rawValue = value === null || value === undefined ? '' : String(value);
  const [draft, setDraft] = useState(rawValue);
  const inputRef = useRef<HTMLInputElement>(null);
  // Tracks an Escape-triggered cancel so the trailing blur (on unmount)
  // does not commit the in-progress draft (issue #11).
  const cancelledRef = useRef(false);

  // Reset the draft and focus the input whenever the cell enters edit mode
  useEffect(() => {
    if (isEditing) {
      setDraft(rawValue);
      cancelledRef.current = false;
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Display mode ---
  if (!isEditing) {
    if (secondaryDisplay !== null) {
      // Dual-unit sub-cell: primary value on the first line, smaller
      // muted secondary value on a second line below. The container
      // keeps the column's existing right-aligned numeric layout.
      return (
        <span style={styles.dualUnitContainer} data-testid="numeric-dual-unit">
          <span style={styles.displayValue} data-testid="numeric-primary">{displayValue}</span>
          <span style={styles.secondaryValue} data-testid="numeric-secondary">{secondaryDisplay}</span>
        </span>
      );
    }
    return (
      <span style={styles.displayValue}>
        {displayValue}
      </span>
    );
  }

  /**
   * Clamps a number between the column-defined min and max bounds.
   *
   * @param num - The number to clamp.
   * @returns The clamped result.
   */
  const clamp = (num: number): number => {
    let result = num;
    if (column.min !== undefined) result = Math.max(column.min, result);
    if (column.max !== undefined) result = Math.min(column.max, result);
    return result;
  };

  /**
   * Parses the raw draft string into a number, clamps it, and commits.
   * Empty or unparseable strings commit `null` to represent a cleared cell.
   *
   * @param raw - The draft string from the input element.
   */
  const commit = (raw: string) => {
    if (raw === '') {
      onCommit(null);
      return;
    }
    const num = parseFloat(raw);
    if (isNaN(num)) {
      onCommit(null);
    } else {
      onCommit(clamp(num));
    }
  };

  /**
   * Handles keyboard interactions inside the edit input.
   *
   * Issue #10: Enter and Tab both commit-and-stay — the draft is parsed and
   * committed, the cell exits edit mode, and selection remains on the same
   * cell. `preventDefault` suppresses the browser's Tab-focus-advance;
   * `stopPropagation` prevents the grid-level keyboard handler from
   * re-opening edit mode (Enter) or advancing selection (Tab).
   *
   * ArrowUp/ArrowDown adjust the value by +/-1 within the configured bounds.
   * Escape cancels without committing.
   */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Guard: ignore Enter/Tab while an IME candidate window is open.
    // isComposing is not in React's synthetic type but is present on the native event.
    if ((e.nativeEvent as KeyboardEvent).isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      commit(draft);
    } else if (e.key === 'Escape') {
      cancelledRef.current = true;
      onCancel();
    } else if (e.key === 'ArrowUp') {
      // Increment the current value by 1, clamping to bounds
      e.preventDefault();
      const current = parseFloat(draft) || 0;
      const next = clamp(current + 1);
      setDraft(String(next));
    } else if (e.key === 'ArrowDown') {
      // Decrement the current value by 1, clamping to bounds
      e.preventDefault();
      const current = parseFloat(draft) || 0;
      const next = clamp(current - 1);
      setDraft(String(next));
    }
  };

  /**
   * Filters input to only accept characters forming a valid decimal number:
   * optional leading minus, digits, and at most one decimal point.
   */
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Allow: digits, one leading minus, one decimal point
    if (/^-?\d*\.?\d*$/.test(raw)) {
      setDraft(raw);
    }
  };

  // --- Edit mode input ---
  // Uses type="text" with inputMode="decimal" to get a numeric soft-keyboard
  // on mobile while still allowing free-form regex-validated input.
  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      value={draft}
      min={column.min}
      max={column.max}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onBlur={() => {
        if (cancelledRef.current) return;
        commit(draft);
      }}
      style={styles.editInput}
    />
  );
}) as <TData = Record<string, unknown>>(props: NumericCellProps<TData>) => React.ReactElement;
