/**
 * ChipSelectCell module for the datagrid component library.
 *
 * Provides a multi-select cell renderer that displays selected values as compact chips
 * and opens a checkbox dropdown during editing. The dropdown is positioned absolutely
 * below the cell and auto-commits on outside click, Enter, or Escape.
 *
 * @module ChipSelectCell
 */
import React, { useState, useRef, useEffect } from 'react';
import type { CellValue, ColumnDef } from '@iasbuilt/datagrid-core';
import * as styles from './ChipSelectCell.styles';

/**
 * Props accepted by the {@link ChipSelectCell} component.
 *
 * @typeParam TData - The shape of a single row in the datagrid. Defaults to a generic record.
 */
interface ChipSelectCellProps<TData = Record<string, unknown>> {
  /** The raw cell value representing the current selection (array, JSON string, or scalar). */
  value: CellValue;
  /** The full row data object that this cell belongs to. */
  row: TData;
  /** Column definition providing `options` for the dropdown, `placeholder`, and `title`. */
  column: ColumnDef<TData>;
  /** Zero-based index of the row within the visible datagrid. */
  rowIndex: number;
  /** Whether the cell is currently in inline-edit mode. */
  isEditing: boolean;
  /** Callback to persist the updated selection array when editing completes. */
  onCommit: (value: CellValue) => void;
  /** Callback to discard changes and exit edit mode. */
  onCancel: () => void;
}

/**
 * Coerces a {@link CellValue} into a `string[]` of selected option values.
 *
 * Handles native arrays, JSON-encoded arrays (strings starting with `[`), and
 * single scalar values, returning a normalized string array.
 *
 * @param value - The raw cell value to normalize.
 * @returns An array of string values representing the current selection.
 */
function parseArray(value: CellValue): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string' && value.startsWith('[')) {
    // Attempt to deserialize a JSON-encoded array
    try { return JSON.parse(value); } catch { /* fall through */ }
  }
  // Treat a non-empty scalar as a single-item selection
  if (value != null && value !== '') return [String(value)];
  return [];
}

/**
 * A datagrid cell renderer for multi-select chip-based selection.
 *
 * In display mode, selected values appear as small colored chips. In edit mode, an
 * absolutely-positioned dropdown with checkboxes allows toggling options. Clicking
 * outside the dropdown or pressing Enter commits the selection; Escape cancels.
 *
 * @typeParam TData - Row data shape, defaults to `Record<string, unknown>`.
 *
 * @param props - The component props conforming to {@link ChipSelectCellProps}.
 * @returns A React element showing selected chips and, when editing, a checkbox dropdown.
 *
 * @example
 * ```tsx
 * <ChipSelectCell
 *   value={['option1', 'option2']}
 *   row={rowData}
 *   column={{ ...columnDef, options: [{ value: 'option1', label: 'Option 1' }] }}
 *   rowIndex={0}
 *   isEditing={true}
 *   onCommit={handleCommit}
 *   onCancel={handleCancel}
 * />
 * ```
 */
export const ChipSelectCell = React.memo(function ChipSelectCell<TData = Record<string, unknown>>({
  value,
  column,
  isEditing,
  onCommit,
  onCancel,
}: ChipSelectCellProps<TData>) {
  // Derive available options from the column definition
  const options = column.options ?? [];
  const selected = parseArray(value);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(selected);
  const containerRef = useRef<HTMLDivElement>(null);

  // Synchronize the dropdown open state and draft selection when edit mode toggles
  useEffect(() => {
    if (isEditing) {
      setOpen(true);
      setDraft(parseArray(value));
    } else {
      setOpen(false);
    }
  }, [isEditing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Commit the draft when the user clicks outside the dropdown container
  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onCommit(draft);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open, draft, onCommit]);

  /**
   * Handles keyboard shortcuts within the dropdown container.
   * Escape cancels; Enter commits the current draft.
   *
   * @param e - The keyboard event.
   */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel();
    } else if (e.key === 'Enter') {
      onCommit(draft);
    }
  };

  /**
   * Toggles a single option value in the draft selection array.
   *
   * @param val - The option value to add or remove.
   */
  const toggleOption = (val: string) => {
    setDraft((prev) =>
      prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val]
    );
  };

  /**
   * Resolves a raw option value to its human-readable label using the column's option list.
   *
   * @param val - The option value to look up.
   * @returns The matching label, or the raw value if no match is found.
   */
  const labelFor = (val: string) => options.find((o) => o.value === val)?.label ?? val;

  return (
    <div ref={containerRef} style={styles.container} onKeyDown={handleKeyDown}>
      {/* Chip display area showing the current committed selection */}
      <div style={styles.chipDisplay}>
        {selected.length === 0 ? (
          <span style={styles.placeholder}>{column.placeholder ?? 'Select...'}</span>
        ) : (
          selected.map((val) => (
            <span
              key={val}
              style={styles.selectedChip}
            >
              {labelFor(val)}
            </span>
          ))
        )}
      </div>
      {/* Dropdown panel rendered only when the cell is in edit mode */}
      {open && (
        <div
          role="dialog"
          aria-label={`Select ${column.title ?? column.field}`}
          style={styles.dropdown}
        >
          {options.map((opt) => {
            const checked = draft.includes(opt.value);
            return (
              <label
                key={opt.value}
                style={styles.optionLabel(checked)}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleOption(opt.value)}
                  style={styles.checkbox}
                />
                {opt.label}
              </label>
            );
          })}
          {/* Empty-state message when no options are configured on the column */}
          {options.length === 0 && (
            <span style={styles.emptyMessage}>
              No options
            </span>
          )}
        </div>
      )}
    </div>
  );
}) as <TData = Record<string, unknown>>(props: ChipSelectCellProps<TData>) => React.ReactElement;
