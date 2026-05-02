/**
 * Currency cell renderer for the datagrid.
 *
 * Displays monetary values with a configurable currency symbol, two-decimal
 * fixed formatting, and optional red colouring for negative amounts.  In edit
 * mode, the raw numeric value is exposed in a decimal-constrained input field.
 *
 * @module CurrencyCell
 * @packageDocumentation
 */
import React, { useState, useRef, useEffect } from 'react';
import type { CellValue, ColumnDef } from '@iasbuilt/datagrid-core';
import * as styles from './CurrencyCell.styles';

/**
 * Props accepted by {@link CurrencyCell}.
 *
 * @typeParam TData - The row data shape, defaults to a generic record.
 */
interface CurrencyCellProps<TData = Record<string, unknown>> {
  /** The raw numeric cell value representing the monetary amount. */
  value: CellValue;
  /** The full row data object containing this cell. */
  row: TData;
  /** Column definition carrying the currency format string. */
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
 * Parses the column `format` string to extract the currency symbol and the
 * negative-red preference.
 *
 * The format follows the pattern `"CODE:SYMBOL"` (e.g. `"EUR:&#8364;"`).
 * If the format contains `"no-red"`, negative values will not be coloured.
 * Defaults to `"$"` with red negatives when no format is provided.
 *
 * @param format - The raw column format string.
 * @returns An object containing the resolved `symbol` and `negativeRed` flag.
 */
function parseCurrencyFormat(format?: string): { symbol: string; negativeRed: boolean } {
  if (!format) return { symbol: '$', negativeRed: true };
  // Split on the colon delimiter; the second segment is the display symbol
  const parts = format.split(':');
  const code = parts[0];
  const sym = parts[1];
  return {
    symbol: sym ?? code ?? '$',
    negativeRed: !format.includes('no-red'),
  };
}

/**
 * Formats a cell value as a currency string with two decimal places and
 * locale-based thousands grouping.
 *
 * Negative values are prefixed with a minus sign before the symbol.
 * Returns an empty string for null, undefined, empty, or NaN inputs.
 *
 * @param value - The raw cell value.
 * @param symbol - The currency symbol to prepend.
 * @returns The formatted currency string, or `""` when the value is invalid.
 */
function formatDisplay(value: CellValue, symbol: string): string {
  if (value === null || value === undefined || value === '') return '';
  const num = Number(value);
  if (isNaN(num)) return '';
  // Format the absolute value with exactly two decimal places
  const abs = Math.abs(num).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return num < 0 ? `-${symbol}${abs}` : `${symbol}${abs}`;
}

/**
 * Renders a monetary value inside the datagrid, toggling between a
 * formatted display and a raw decimal input for editing.
 *
 * In display mode the cell is right-aligned and shows the currency symbol
 * alongside a two-decimal formatted number.  Negative values are optionally
 * rendered in red based on the column's format configuration.
 *
 * In edit mode the raw numeric value is presented in a text input that
 * restricts keystrokes to valid decimal characters.  Committing an empty
 * or non-numeric draft yields `null`.
 *
 * @typeParam TData - Row data shape forwarded from the grid.
 *
 * @param props - {@link CurrencyCellProps}
 * @returns A React element representing the currency cell.
 *
 * @example
 * ```tsx
 * <CurrencyCell
 *   value={-1234.5}
 *   row={rowData}
 *   column={{ ...colDef, format: 'EUR:€' }}
 *   rowIndex={0}
 *   isEditing={false}
 *   onCommit={handleCommit}
 *   onCancel={handleCancel}
 * />
 * ```
 */
export const CurrencyCell = React.memo(function CurrencyCell<TData = Record<string, unknown>>({
  value,
  column,
  isEditing,
  onCommit,
  onCancel,
}: CurrencyCellProps<TData>) {
  // Extract symbol and negative-red preference from the column format string
  const { symbol, negativeRed } = parseCurrencyFormat(column.format);
  const numericValue = value === null || value === undefined ? '' : String(value);
  const [draft, setDraft] = useState(numericValue);
  const inputRef = useRef<HTMLInputElement>(null);
  // Prevents the unmount-blur from committing a cancelled draft (issue #11).
  const cancelledRef = useRef(false);

  // Reset draft and auto-focus/select when entering edit mode
  useEffect(() => {
    if (isEditing) {
      setDraft(numericValue);
      cancelledRef.current = false;
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Display mode ---
  if (!isEditing) {
    const num = Number(value);
    const isNegative = !isNaN(num) && num < 0;
    const display = formatDisplay(value, symbol);
    return (
      <span
        style={styles.displayValue(isNegative && negativeRed)}
      >
        {display}
      </span>
    );
  }

  /**
   * Restricts the draft to characters that form a valid decimal number,
   * preventing non-numeric input from entering the field.
   */
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (/^-?\d*\.?\d*$/.test(raw)) setDraft(raw);
  };

  /**
   * Parses the draft string and commits the resulting number, or `null`
   * when the draft is empty, a lone minus sign, or otherwise unparseable.
   */
  const commit = () => {
    if (cancelledRef.current) return;
    if (draft === '' || draft === '-') {
      onCommit(null);
      return;
    }
    const num = parseFloat(draft);
    onCommit(isNaN(num) ? null : num);
  };

  /**
   * Commits on Enter or Tab, cancels on Escape.
   *
   * Issue #10: Enter and Tab both commit-and-stay — the parsed amount is
   * committed, the cell exits edit mode, and selection remains on the same
   * cell. `preventDefault` + `stopPropagation` suppress the browser's
   * Tab-focus-advance and the grid's own Enter/Tab navigation.
   */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      commit();
    } else if (e.key === 'Escape') {
      cancelledRef.current = true;
      onCancel();
    }
  };

  // --- Edit mode input ---
  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      value={draft}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onBlur={commit}
      style={styles.editInput}
    />
  );
}) as <TData = Record<string, unknown>>(props: CurrencyCellProps<TData>) => React.ReactElement;
