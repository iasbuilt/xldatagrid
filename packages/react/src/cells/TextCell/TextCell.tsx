/**
 * Text cell renderer for the datagrid.
 *
 * Provides a display mode that truncates overflowing text with an ellipsis and
 * an inline edit mode that renders either a single-line `<input>` or a
 * multi-line `<textarea>` depending on the column's `format` option.
 *
 * @module TextCell
 * @packageDocumentation
 */
import React, { useState, useRef, useEffect } from 'react';
import type { CellValue, ColumnDef } from '@iasbuilt/datagrid-core';
import * as styles from './TextCell.styles';

/**
 * Props accepted by {@link TextCell}.
 *
 * @typeParam TData - The row data shape, defaults to a generic record.
 */
interface TextCellProps<TData = Record<string, unknown>> {
  /** The current cell value, coerced to a string for display. */
  value: CellValue;
  /** The full row data object containing this cell. */
  row: TData;
  /** Column definition that controls placeholder text and multiline format. */
  column: ColumnDef<TData>;
  /** Zero-based index of the row within the visible dataset. */
  rowIndex: number;
  /** Whether the cell is currently in inline-edit mode. */
  isEditing: boolean;
  /**
   * Callback to persist the edited value back to the data source. Optional
   * `advance` encodes Excel-365 commit-and-move intent: `'down'` for Enter,
   * `'right'` for Tab, `undefined` for blur commits.
   */
  onCommit: (value: CellValue, advance?: 'down' | 'right') => void;
  /** Callback to discard the current edit and exit edit mode. */
  onCancel: () => void;
}

/**
 * Renders a text value inside the datagrid, toggling between a read-only
 * display span and an editable input (or textarea) based on `isEditing`.
 *
 * In display mode the value is shown as a truncated single line with a
 * native `title` tooltip.  When the column defines no value, the configured
 * `placeholder` text is rendered in a muted style.
 *
 * In edit mode the component keeps a local `draft` state so that keystrokes
 * are non-destructive until the user explicitly commits (Enter / blur) or
 * cancels (Escape).  If the column format includes `"multiline"`, a
 * `<textarea>` is rendered instead of an `<input>`.
 *
 * @typeParam TData - Row data shape forwarded from the grid.
 *
 * @param props - {@link TextCellProps}
 * @returns A React element representing the text cell.
 *
 * @example
 * ```tsx
 * <TextCell
 *   value="Hello"
 *   row={rowData}
 *   column={columnDef}
 *   rowIndex={0}
 *   isEditing={false}
 *   onCommit={handleCommit}
 *   onCancel={handleCancel}
 * />
 * ```
 */
export const TextCell = React.memo(function TextCell<TData = Record<string, unknown>>({
  value,
  column,
  isEditing,
  onCommit,
  onCancel,
}: TextCellProps<TData>) {
  // Normalise null/undefined to empty string for safe rendering
  const displayValue = value == null ? '' : String(value);
  const [draft, setDraft] = useState(displayValue);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  // Tracks whether the current edit was cancelled via Escape. Without this
  // flag the blur that fires when the input unmounts on cancel would commit
  // the partially-edited draft back to the model (issue #11).
  const cancelledRef = useRef(false);

  // Sync draft when edit mode starts
  useEffect(() => {
    if (isEditing) {
      setDraft(displayValue);
      cancelledRef.current = false;
      // Focus after render so the cursor is placed inside the input immediately
      inputRef.current?.focus();
    }
  }, [isEditing]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Display mode ---
  if (!isEditing) {
    return (
      <span
        style={styles.displayText}
        title={displayValue}
      >
        {displayValue || (
          <span style={styles.placeholder}>{column.placeholder}</span>
        )}
      </span>
    );
  }

  // --- Edit mode key handling ---

  /** Marks the edit as cancelled and notifies the grid to exit edit mode. */
  const handleCancel = () => {
    cancelledRef.current = true;
    onCancel();
  };

  /**
   * Commits on Enter (single-line only), commits on Tab, cancels on Escape.
   *
   * Excel-365 commit-and-advance: Enter commits the draft and advances
   * selection DOWN one row; Tab commits and advances RIGHT one column. At
   * the grid edge the selection stays put. `preventDefault` suppresses the
   * browser's Tab-focus-advance, and `stopPropagation` keeps the grid-level
   * keyboard handler from observing the same Enter/Tab twice (the advance
   * is already applied by the `onCommit` consumer).
   */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Guard: ignore Enter/Tab while an IME candidate window is open.
    // isComposing is not in React's synthetic type but is present on the native event.
    if ((e.nativeEvent as KeyboardEvent).isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter' && !(typeof column.format === 'string' && column.format.includes('multiline'))) {
      e.preventDefault();
      e.stopPropagation();
      onCommit(draft, 'down');
    } else if (e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      onCommit(draft, 'right');
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  /** Commits the current draft when the input loses focus, unless cancelled. */
  const handleBlur = () => {
    if (cancelledRef.current) return;
    onCommit(draft);
  };

  // --- Multiline variant ---
  // Renders a <textarea> when the column format specifies multiline,
  // allowing newlines within the cell value.
  if ((typeof column.format === 'string' && column.format.includes('multiline'))) {
    return (
      <textarea
        ref={inputRef as React.Ref<HTMLTextAreaElement>}
        value={draft}
        placeholder={column.placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          // In multiline mode Enter inserts a newline rather than committing,
          // but Tab commits and advances RIGHT one column per the Excel-365
          // contract. Escape cancels.
          if (e.key === 'Tab') {
            e.preventDefault();
            e.stopPropagation();
            onCommit(draft, 'right');
          } else if (e.key === 'Escape') {
            handleCancel();
          }
        }}
        onBlur={handleBlur}
        style={styles.editTextarea}
      />
    );
  }

  // --- Single-line variant ---
  return (
    <input
      ref={inputRef as React.Ref<HTMLInputElement>}
      type="text"
      value={draft}
      placeholder={column.placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      style={styles.editInput}
    />
  );
}) as <TData = Record<string, unknown>>(props: TextCellProps<TData>) => React.ReactElement;
