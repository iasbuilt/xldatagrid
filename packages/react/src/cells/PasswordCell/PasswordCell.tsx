/**
 * Password cell renderer for the datagrid.
 *
 * Masks the cell value with bullet characters in display mode and provides a
 * reveal/hide toggle button.  In edit mode a native `<input type="password">`
 * is rendered so the browser can apply its own masking behaviour.
 *
 * @module PasswordCell
 * @packageDocumentation
 */
import React, { useState, useRef, useEffect } from 'react';
import type { CellValue, ColumnDef } from '@iasbuilt/datagrid-core';
import { usePasswordInput } from '../hooks/usePasswordInput';
import * as styles from './PasswordCell.styles';

/**
 * Props accepted by {@link PasswordCell}.
 *
 * @typeParam TData - The row data shape, defaults to a generic record.
 */
interface PasswordCellProps<TData = Record<string, unknown>> {
  /** The raw cell value containing the password string. */
  value: CellValue;
  /** The full row data object containing this cell. */
  row: TData;
  /** Column definition (unused directly but required by the cell contract). */
  column: ColumnDef<TData>;
  /** Zero-based index of the row within the visible dataset. */
  rowIndex: number;
  /** Whether the cell is currently in inline-edit mode. */
  isEditing: boolean;
  /** Callback to persist the edited password value. */
  onCommit: (value: CellValue) => void;
  /** Callback to discard the current edit and exit edit mode. */
  onCancel: () => void;
}

/** Unicode bullet character used to mask each character of the password. */
const MASK_CHAR = '\u2022'; // bullet •

/**
 * Renders a password value inside the datagrid, masking it by default in
 * display mode and providing a Show/Hide toggle for temporary reveal.
 *
 * In display mode each character is replaced by a bullet symbol.  A small
 * inline button lets the user toggle visibility without entering edit mode.
 *
 * In edit mode the component uses a native password input so that the
 * value remains obscured while typing.  The draft is committed on Enter
 * or blur, and discarded on Escape.
 *
 * @typeParam TData - Row data shape forwarded from the grid.
 *
 * @param props - {@link PasswordCellProps}
 * @returns A React element representing the password cell.
 *
 * @example
 * ```tsx
 * <PasswordCell
 *   value="s3cret"
 *   row={rowData}
 *   column={columnDef}
 *   rowIndex={0}
 *   isEditing={false}
 *   onCommit={handleCommit}
 *   onCancel={handleCancel}
 * />
 * ```
 */
export const PasswordCell = React.memo(function PasswordCell<TData = Record<string, unknown>>({
  value,
  isEditing,
  onCommit,
  onCancel,
}: PasswordCellProps<TData>) {
  // Coerce null/undefined to an empty string for safe length calculations
  const strValue = value == null ? '' : String(value);
  // Shared show/hide toggle + stable ids; `visible` replaces the old local
  // `revealed` flag without changing any observable behaviour.
  const { visible: revealed, toggle: toggleRevealed } = usePasswordInput();
  const [draft, setDraft] = useState(strValue);
  const inputRef = useRef<HTMLInputElement>(null);
  // Prevents the unmount-blur from committing a cancelled draft (issue #11).
  const cancelledRef = useRef(false);

  // Sync draft and auto-focus when entering edit mode
  useEffect(() => {
    if (isEditing) {
      setDraft(strValue);
      cancelledRef.current = false;
      inputRef.current?.focus();
    }
  }, [isEditing]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Display mode ---
  if (!isEditing) {
    // Generate a masked string of bullets matching the password length
    const masked = MASK_CHAR.repeat(strValue.length);
    return (
      <span style={styles.displayContainer}>
        <span style={styles.maskedText}>
          {revealed ? strValue : masked}
        </span>
        {/* Toggle button for revealing or hiding the password in-place */}
        <button
          type="button"
          aria-label={revealed ? 'Hide password' : 'Reveal password'}
          onClick={toggleRevealed}
          style={styles.toggleButton}
        >
          {revealed ? 'Hide' : 'Show'}
        </button>
      </span>
    );
  }

  /**
   * Commits on Enter or Tab, cancels on Escape.
   *
   * Issue #10: Enter and Tab both commit-and-stay — the draft is committed,
   * the cell exits edit mode, and selection remains on the same cell.
   * `preventDefault` + `stopPropagation` suppress the browser's
   * Tab-focus-advance and the grid's own Enter/Tab navigation.
   */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      onCommit(draft);
    } else if (e.key === 'Escape') {
      cancelledRef.current = true;
      onCancel();
    }
  };

  // --- Edit mode ---
  // Uses type="password" to leverage native browser masking
  return (
    <input
      ref={inputRef}
      type="password"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={() => {
        if (cancelledRef.current) return;
        onCommit(draft);
      }}
      style={styles.editInput}
    />
  );
}) as <TData = Record<string, unknown>>(props: PasswordCellProps<TData>) => React.ReactElement;
