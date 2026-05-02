/**
 * BooleanSelectedCell — a form-friendly boolean renderer that displays the
 * literal word "Selected" when the value is `true` and an em-dash ("—") when
 * the value is `false`. Nullish values render as an empty string.
 *
 * This cell type was introduced for issue #18 sub-feature 3 (transposed grid
 * per-row variance): form-style grids read better with a textual state label
 * than with a checkmark glyph. Clicking the label toggles the underlying
 * boolean, matching the interaction model of {@link CheckboxCell}.
 *
 * Rationale for the em-dash as the "false" affordance:
 *   - Keeps the cell visually occupied (empty cells in a form column read as
 *     "unknown" or "unset"; `false` is a deliberate state).
 *   - Unambiguous — can't be mistaken for a missing value or a render bug.
 *   - Matches Excel's convention of using em-dash for "not applicable /
 *     intentionally empty" cells.
 *
 * @module BooleanSelectedCell
 * @packageDocumentation
 */
import React from 'react';
import type { CellValue, ColumnDef } from '@iasbuilt/datagrid-core';
import * as styles from './BooleanSelectedCell.styles';

/** Label used when the underlying boolean is `true`. */
export const SELECTED_LABEL = 'Selected';

/**
 * Affordance used when the underlying boolean is `false`. An em-dash keeps the
 * cell visually occupied without reading as a rendering error.
 */
export const UNSELECTED_LABEL = '\u2014'; // em-dash "—"

/**
 * Props accepted by {@link BooleanSelectedCell}.
 *
 * @typeParam TData - Row data shape.
 */
interface BooleanSelectedCellProps<TData = Record<string, unknown>> {
  value: CellValue;
  row: TData;
  column: ColumnDef<TData>;
  rowIndex: number;
  isEditing: boolean;
  onCommit: (value: CellValue) => void;
  onCancel: () => void;
}

/**
 * Renders a boolean value as the word "Selected" when truthy, an em-dash when
 * falsy, and an empty string when nullish. Toggles the underlying boolean on
 * click when the column is editable.
 *
 * Edit mode is intentionally identical to display mode: the cell does not
 * require a separate edit affordance because the click toggles immediately
 * (matching `CheckboxCell`). This keeps the form-style layout compact.
 */
export const BooleanSelectedCell = React.memo(function BooleanSelectedCell<TData = Record<string, unknown>>({
  value,
  column,
  onCommit,
}: BooleanSelectedCellProps<TData>) {
  const isNull = value === null || value === undefined;
  const checked = Boolean(value);
  const editable = column.editable !== false;
  // Tracked on focus/blur to render a visible focus ring — jsdom does not
  // resolve `:focus-visible`, so the flag approach keeps the affordance
  // testable and framework-agnostic.
  const [focused, setFocused] = React.useState(false);

  const handleClick = () => {
    if (!editable) return;
    onCommit(!checked);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!editable) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onCommit(!checked);
    }
  };

  // A nullish value renders as an empty string so consumers can distinguish
  // "never set" from "deliberately false" at a glance. The aria-checked
  // attribute still reflects the tri-state so assistive tech remains correct.
  const label = isNull
    ? ''
    : checked
    ? SELECTED_LABEL
    : UNSELECTED_LABEL;

  return (
    <span
      role="checkbox"
      aria-checked={isNull ? 'mixed' : checked}
      aria-disabled={!editable || undefined}
      tabIndex={editable ? 0 : -1}
      data-testid="boolean-selected-cell"
      data-value={String(checked)}
      data-state={isNull ? 'mixed' : checked ? 'true' : 'false'}
      style={styles.container(editable, focused)}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onFocus={() => editable && setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <span
        data-testid="boolean-selected-label"
        style={checked ? styles.selectedText : styles.unselectedText}
      >
        {label}
      </span>
    </span>
  );
}) as <TData = Record<string, unknown>>(props: BooleanSelectedCellProps<TData>) => React.ReactElement;
