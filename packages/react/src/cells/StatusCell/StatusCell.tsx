/**
 * Status cell renderer for the datagrid.
 *
 * Displays the current status as a coloured badge and, in edit mode, opens a
 * keyboard-navigable dropdown listbox of available status options.  Each
 * option is defined by the column's `options` array (of type
 * {@link StatusOption}) and carries a label and an optional colour.
 *
 * @module StatusCell
 * @packageDocumentation
 */
import React, { useState, useRef, useEffect } from 'react';
import type { CellValue, ColumnDef, StatusOption } from '@iasbuilt/datagrid-core';
import * as styles from './StatusCell.styles';

/**
 * Props accepted by {@link StatusCell}.
 *
 * @typeParam TData - The row data shape, defaults to a generic record.
 */
interface StatusCellProps<TData = Record<string, unknown>> {
  /** The raw cell value matching one of the option values. */
  value: CellValue;
  /** The full row data object containing this cell. */
  row: TData;
  /** Column definition carrying the `options` array of {@link StatusOption}. */
  column: ColumnDef<TData>;
  /** Zero-based index of the row within the visible dataset. */
  rowIndex: number;
  /** Whether the cell is currently in inline-edit mode. */
  isEditing: boolean;
  /** Callback to persist the newly selected status value. */
  onCommit: (value: CellValue) => void;
  /** Callback to close the dropdown and discard the selection. */
  onCancel: () => void;
}

/**
 * Renders a status value inside the datagrid as a coloured pill badge,
 * with an accessible dropdown listbox for changing the status in edit mode.
 *
 * In display mode the current status is shown as a compact badge with an
 * optional colour dot.  Clicking the badge while in edit mode toggles the
 * dropdown open/closed.
 *
 * The dropdown supports full keyboard navigation: ArrowUp/ArrowDown move
 * the active highlight, Enter selects the highlighted option, and Escape
 * closes the dropdown without committing.  Focus is managed programmatically
 * to ensure the dropdown receives key events immediately upon opening.
 *
 * @typeParam TData - Row data shape forwarded from the grid.
 *
 * @param props - {@link StatusCellProps}
 * @returns A React element representing the status cell.
 *
 * @example
 * ```tsx
 * <StatusCell
 *   value="active"
 *   row={rowData}
 *   column={{
 *     ...colDef,
 *     options: [
 *       { value: 'active', label: 'Active', color: '#22c55e' },
 *       { value: 'inactive', label: 'Inactive', color: '#ef4444' },
 *     ],
 *   }}
 *   rowIndex={0}
 *   isEditing={true}
 *   onCommit={handleCommit}
 *   onCancel={handleCancel}
 * />
 * ```
 */
export const StatusCell = React.memo(function StatusCell<TData = Record<string, unknown>>({
  value,
  column,
  isEditing,
  onCommit,
  onCancel,
}: StatusCellProps<TData>) {
  // Resolve the available status options from the column definition
  const options: StatusOption[] = column.options ?? [];
  // Draft state: tracks the selected value without exiting edit mode
  const [draft, setDraft] = useState<CellValue>(value);
  // Find the option matching the draft value for badge rendering
  const current = options.find((o) => o.value === draft);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync draft when the external value changes (e.g. undo/redo)
  useEffect(() => {
    setDraft(value);
  }, [value]);

  // Open the dropdown automatically when entering edit mode,
  // pre-selecting the current option index for keyboard navigation.
  useEffect(() => {
    if (isEditing) {
      setOpen(true);
      const idx = options.findIndex((o) => o.value === draft);
      setActiveIndex(idx >= 0 ? idx : 0);
    } else {
      setOpen(false);
    }
  }, [isEditing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Transfer focus to the dropdown container so it can receive keyboard events
  useEffect(() => {
    if (open) {
      dropdownRef.current?.focus();
    }
  }, [open]);

  /**
   * Selects a status option: updates draft and closes the dropdown,
   * but keeps the cell in edit mode. The value is committed on blur.
   *
   * @param option - The chosen {@link StatusOption}.
   */
  const select = (option: StatusOption) => {
    setDraft(option.value);
    setOpen(false);
  };

  /**
   * Handles keyboard navigation within the dropdown listbox.
   * ArrowDown/ArrowUp move the active index, Enter selects, Escape cancels.
   */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      const opt = options[activeIndex];
      if (opt) select(opt);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      setOpen(false);
      onCancel();
    }
  };

  /**
   * Renders a status badge element with an optional colour dot and label.
   *
   * @param opt - The status option to style the badge from (may be undefined).
   * @param label - Optional override label text.
   * @returns A styled `<span>` element representing the badge.
   */
  const badge = (opt?: StatusOption, label?: string) => (
    <span style={styles.badge(opt?.color)}>
      {/* Colour indicator dot, only rendered when the option has a colour */}
      {opt?.color && (
        <span style={styles.colorDot(opt.color)} />
      )}
      {label ?? opt?.label ?? String(value ?? '')}
    </span>
  );

  return (
    <div style={styles.container}>
      {/* Clickable badge that toggles the dropdown when in edit mode */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          if (isEditing) {
            setOpen((v) => !v);
            const idx = options.findIndex((o) => o.value === value);
            setActiveIndex(idx >= 0 ? idx : 0);
          }
        }}
        style={styles.badgeButton(isEditing)}
      >
        {badge(current)}
      </div>

      {/* Dropdown listbox of status options */}
      {open && (
        <div
          ref={dropdownRef}
          role="listbox"
          aria-label="Status options"
          tabIndex={-1}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            setOpen(false);
            onCommit(draft);
          }}
          style={styles.dropdown}
        >
          {options.map((opt, i) => (
            <div
              key={opt.value}
              role="option"
              aria-selected={opt.value === value}
              data-active={i === activeIndex}
              onMouseDown={(e) => {
                // Prevent blur from firing before the selection is committed
                e.preventDefault();
                select(opt);
              }}
              style={styles.optionRow(i === activeIndex)}
            >
              {/* Colour swatch for each option */}
              {opt.color && (
                <span style={styles.optionSwatch(opt.color)} />
              )}
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}) as <TData = Record<string, unknown>>(props: StatusCellProps<TData>) => React.ReactElement;
