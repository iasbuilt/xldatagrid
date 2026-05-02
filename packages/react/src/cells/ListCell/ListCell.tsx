/**
 * ListCell module for the datagrid component library.
 *
 * Provides a single-select cell renderer that displays the selected option's label
 * and opens a keyboard-navigable dropdown listbox during editing. The dropdown supports
 * arrow-key navigation, Enter to select, Escape to cancel, and outside-click dismissal.
 *
 * @module ListCell
 */
import React, { useState, useRef, useEffect } from 'react';
import type { CellValue, ColumnDef } from '@iasbuilt/datagrid-core';
import * as styles from './ListCell.styles';

/**
 * Props accepted by the {@link ListCell} component.
 *
 * @typeParam TData - The shape of a single row in the datagrid. Defaults to a generic record.
 */
interface ListCellProps<TData = Record<string, unknown>> {
  /** The raw cell value representing the currently selected option value. */
  value: CellValue;
  /** The full row data object that this cell belongs to. */
  row: TData;
  /** Column definition providing `options` for the dropdown, `placeholder`, and `title`. */
  column: ColumnDef<TData>;
  /** Zero-based index of the row within the visible datagrid. */
  rowIndex: number;
  /** Whether the cell is currently in inline-edit mode. */
  isEditing: boolean;
  /** Callback to persist the newly selected option value. */
  onCommit: (value: CellValue) => void;
  /** Callback to discard changes and exit edit mode. */
  onCancel: () => void;
}

/**
 * A datagrid cell renderer for single-value selection from a dropdown list.
 *
 * Displays the label of the currently selected option (or a placeholder) in read mode.
 * In edit mode, renders an absolutely-positioned `<ul>` listbox with arrow-key navigation,
 * mouse hover highlighting, and automatic scroll-into-view for the active item.
 *
 * @typeParam TData - Row data shape, defaults to `Record<string, unknown>`.
 *
 * @param props - The component props conforming to {@link ListCellProps}.
 * @returns A React element showing the selected label and, when editing, a dropdown list.
 *
 * @example
 * ```tsx
 * <ListCell
 *   value="active"
 *   row={rowData}
 *   column={{ ...columnDef, options: [{ value: 'active', label: 'Active' }] }}
 *   rowIndex={0}
 *   isEditing={true}
 *   onCommit={handleCommit}
 *   onCancel={handleCancel}
 * />
 * ```
 */
export const ListCell = React.memo(function ListCell<TData = Record<string, unknown>>({
  value,
  column,
  isEditing,
  onCommit,
  onCancel,
}: ListCellProps<TData>) {
  // Resolve available options
  const options = column.options ?? [];
  // Draft state: tracks the selected value without exiting edit mode
  const [draft, setDraft] = useState<CellValue>(value);
  const displayLabel = options.find((o) => o.value === String(draft ?? ''))?.label ?? (draft != null ? String(draft) : '');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Sync draft when the external value changes (e.g. undo/redo)
  useEffect(() => {
    setDraft(value);
  }, [value]);

  // Open the dropdown and pre-select the current value's index when edit mode activates
  useEffect(() => {
    if (isEditing) {
      setOpen(true);
      const currentIndex = options.findIndex((o) => o.value === String(draft ?? ''));
      setActiveIndex(currentIndex >= 0 ? currentIndex : 0);
    } else {
      setOpen(false);
    }
  }, [isEditing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Commit draft and exit edit mode when the user clicks outside the container
  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onCommit(draft);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open, onCommit, draft]);

  // Keep the visually active option scrolled into view within the list container
  useEffect(() => {
    if (open && listRef.current) {
      const active = listRef.current.children[activeIndex] as HTMLElement | undefined;
      if (active && typeof active.scrollIntoView === 'function') {
        active.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [activeIndex, open]);

  /**
   * Handles keyboard navigation and selection within the dropdown.
   * ArrowDown/ArrowUp move the highlight, Enter selects, Escape cancels.
   *
   * @param e - The keyboard event from the container element.
   */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      // Clamp to the last option index
      setActiveIndex((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      // Clamp to the first option index
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      // Select the highlighted option into draft (stay in edit mode)
      const selected = options[activeIndex];
      if (activeIndex >= 0 && activeIndex < options.length && selected) {
        setDraft(selected.value);
        setOpen(false);
      }
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      onCancel();
    }
  };

  return (
    <div
      ref={containerRef}
      style={styles.container}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Display label for the selected value, with ellipsis overflow */}
      <span
        style={styles.displayLabel}
        title={displayLabel}
      >
        {displayLabel || <span style={styles.placeholder}>{column.placeholder ?? 'Select...'}</span>}
      </span>
      {/* Dropdown listbox rendered when the cell is in edit mode */}
      {open && (
        <ul
          ref={listRef}
          role="listbox"
          aria-label={column.title ?? column.field}
          style={styles.dropdown}
        >
          {options.map((opt, idx) => (
            <li
              key={opt.value}
              role="option"
              aria-selected={activeIndex === idx}
              onClick={() => { setDraft(opt.value); setOpen(false); }}
              onMouseEnter={() => setActiveIndex(idx)}
              style={styles.optionItem(activeIndex === idx, opt.value === String(value ?? ''))}
            >
              {opt.label}
            </li>
          ))}
          {/* Empty-state message when no options are configured on the column */}
          {options.length === 0 && (
            <li style={styles.emptyMessage}>No options</li>
          )}
        </ul>
      )}
    </div>
  );
}) as <TData = Record<string, unknown>>(props: ListCellProps<TData>) => React.ReactElement;
