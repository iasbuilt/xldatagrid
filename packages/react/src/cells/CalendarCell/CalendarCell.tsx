/**
 * Calendar (date-picker) cell renderer for the datagrid.
 *
 * Displays a formatted date string in read mode and opens an inline calendar
 * dropdown in edit mode, allowing the user to navigate months and select a
 * day.  The selected date is committed as an ISO 8601 date string
 * (`YYYY-MM-DD`).
 *
 * @module CalendarCell
 * @packageDocumentation
 */
import React, { useState, useRef, useEffect } from 'react';
import type { CellValue, ColumnDef } from '@iasbuilt/datagrid-core';
import * as styles from './CalendarCell.styles';

/**
 * Props accepted by {@link CalendarCell}.
 *
 * @typeParam TData - The row data shape, defaults to a generic record.
 */
interface CalendarCellProps<TData = Record<string, unknown>> {
  /** The raw cell value, expected to be a Date instance or a date-parseable string. */
  value: CellValue;
  /** The full row data object containing this cell. */
  row: TData;
  /** Column definition (unused directly but required by the cell contract). */
  column: ColumnDef<TData>;
  /** Zero-based index of the row within the visible dataset. */
  rowIndex: number;
  /** Whether the cell is currently in inline-edit mode. */
  isEditing: boolean;
  /** Callback to persist the selected date as an ISO date string. */
  onCommit: (value: CellValue) => void;
  /** Callback to close the calendar and discard the selection. */
  onCancel: () => void;
}

/**
 * Safely parses a cell value into a `Date` object.
 *
 * Accepts `Date` instances and date-parseable strings.  Returns `null` for
 * falsy, invalid, or unparseable inputs.
 *
 * @param value - The raw cell value to parse.
 * @returns A valid `Date` or `null`.
 */
function parseDate(value: CellValue): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  const d = new Date(String(value));
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Formats a `Date` as a locale-appropriate short date string
 * (e.g. "Apr 14, 2026").
 *
 * @param date - The date to format, or `null`.
 * @returns The formatted string, or `""` when `date` is null.
 */
function formatDate(date: Date | null): string {
  if (!date) return '';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Returns the number of days in a given month.
 *
 * @param year - The full year (e.g. 2026).
 * @param month - The zero-based month index (0 = January).
 * @returns The day count for that month.
 */
function daysInMonth(year: number, month: number): number {
  // Passing day 0 of the next month yields the last day of the target month
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Returns the weekday index (0 = Sunday) of the first day of a given month.
 *
 * @param year - The full year.
 * @param month - The zero-based month index.
 * @returns A number from 0 (Sunday) to 6 (Saturday).
 */
function firstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

/** Ordered English month names used in the calendar header. */
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Renders a date value inside the datagrid, toggling between a formatted
 * date label and a month-view calendar dropdown for selection.
 *
 * When the cell enters edit mode, a small calendar dialog appears below the
 * cell.  The user can navigate months with previous/next buttons and click a
 * day to commit the selection.  Clicking outside the dropdown or pressing
 * Escape cancels the edit.
 *
 * The calendar grid is built by computing the number of days in the viewed
 * month and padding the first row with empty slots to align with the correct
 * weekday column.
 *
 * @typeParam TData - Row data shape forwarded from the grid.
 *
 * @param props - {@link CalendarCellProps}
 * @returns A React element representing the calendar cell.
 *
 * @example
 * ```tsx
 * <CalendarCell
 *   value="2026-04-14"
 *   row={rowData}
 *   column={columnDef}
 *   rowIndex={0}
 *   isEditing={true}
 *   onCommit={handleCommit}
 *   onCancel={handleCancel}
 * />
 * ```
 */
export const CalendarCell = React.memo(function CalendarCell<TData = Record<string, unknown>>({
  value,
  isEditing,
  onCommit,
  onCancel,
}: CalendarCellProps<TData>) {
  const date = parseDate(value);
  const now = new Date();
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(date?.getFullYear() ?? now.getFullYear());
  const [viewMonth, setViewMonth] = useState(date?.getMonth() ?? now.getMonth());
  const containerRef = useRef<HTMLDivElement>(null);

  // Open the dropdown when edit mode begins, initialising the view to the
  // currently selected date or falling back to today.
  useEffect(() => {
    if (isEditing) {
      setOpen(true);
      const d = parseDate(value);
      setViewYear(d?.getFullYear() ?? now.getFullYear());
      setViewMonth(d?.getMonth() ?? now.getMonth());
    } else {
      setOpen(false);
    }
  }, [isEditing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close the calendar and cancel the edit when a click lands outside the
  // container, using a mousedown listener for immediate feedback.
  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onCancel();
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open, onCancel]);

  /** Cancels the edit when the Escape key is pressed anywhere inside the container. */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onCancel();
  };

  /**
   * Commits the selected day by constructing an ISO date string from the
   * current view year, view month, and the chosen day number.
   *
   * @param day - The 1-based day of the month the user clicked.
   */
  const handleSelectDay = (day: number) => {
    const selected = new Date(viewYear, viewMonth, day);
    // Commit as an ISO date string (YYYY-MM-DD) for consistent serialisation
    onCommit(selected.toISOString().slice(0, 10));
  };

  /** Navigates the calendar view to the previous month, wrapping at January. */
  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  /** Navigates the calendar view to the next month, wrapping at December. */
  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  // Build the grid cells array: leading nulls align the first day to the
  // correct weekday column, followed by sequential day numbers.
  const totalDays = daysInMonth(viewYear, viewMonth);
  const startDay = firstDayOfMonth(viewYear, viewMonth);
  const cells: (number | null)[] = [
    ...Array(startDay).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];

  // Determine whether a given day matches the currently selected date
  const selectedDate = parseDate(value);
  const isSelected = (day: number) =>
    selectedDate?.getFullYear() === viewYear &&
    selectedDate?.getMonth() === viewMonth &&
    selectedDate?.getDate() === day;

  return (
    <div ref={containerRef} style={styles.container} onKeyDown={handleKeyDown}>
      {/* Read-only date label */}
      <span style={styles.dateLabel}>
        {formatDate(date) || <span style={styles.placeholder}>Pick a date</span>}
      </span>
      {/* Calendar dropdown dialog */}
      {open && (
        <div
          role="dialog"
          aria-label="Date picker"
          style={styles.dropdown}
        >
          {/* Month/year navigation header */}
          <div style={styles.navHeader}>
            <button
              type="button"
              aria-label="Previous month"
              onClick={prevMonth}
              style={styles.navButton}
            >
              {'<'}
            </button>
            <span style={styles.monthYearLabel}>
              {`${MONTH_NAMES[viewMonth] ?? ''} ${viewYear}`}
            </span>
            <button
              type="button"
              aria-label="Next month"
              onClick={nextMonth}
              style={styles.navButton}
            >
              {'>'}
            </button>
          </div>
          {/* Day-of-week headers and day buttons grid */}
          <div style={styles.dayGrid}>
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
              <span key={d} style={styles.weekdayHeader}>{d}</span>
            ))}
            {cells.map((day, i) =>
              day === null ? (
                <span key={`empty-${i}`} />
              ) : (
                <button
                  key={day}
                  type="button"
                  onClick={() => handleSelectDay(day)}
                  style={styles.dayButton(isSelected(day))}
                >
                  {day}
                </button>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}) as <TData = Record<string, unknown>>(props: CalendarCellProps<TData>) => React.ReactElement;
