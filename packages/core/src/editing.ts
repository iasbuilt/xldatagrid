/**
 * Cell editing module for the datagrid core engine.
 *
 * Manages the lifecycle of inline cell edits: beginning an edit, updating the
 * in-progress value (with optional column-level validation), committing or
 * cancelling, and querying edit state. All functions are pure and return new
 * state objects.
 *
 * @module editing
 */

import { CellAddress, CellValue, ColumnDef, ValidationResult } from './types';
import { runValidators } from './validators';

/**
 * How an edit session was started. The cause flows through `beginEdit` so
 * editor mount lifecycles can decide whether to take over the input
 * selection (e.g. dblclick / F2 / Enter / programmatic want a `select()`
 * call to highlight the existing text) or stay out of the way (e.g.
 * type-to-edit owns the cursor placement because it seeds a character).
 *
 * Closes iasbuilt/xldatagrid#133 — the flaky
 * `e2e/numeric-edit-replace-not-append.spec.ts` race was rooted in
 * `DataGridBody`'s mount-time `select()` not knowing which path opened the
 * editor; it would clobber `use-keyboard`'s type-to-edit cursor placement
 * under CPU contention.
 */
export type EditCause =
  | 'dblclick'
  | 'enter'
  | 'f2'
  | 'click'
  | 'typeToEdit'
  | 'programmatic';

/**
 * Captures the full state of an in-progress cell edit.
 *
 * @remarks
 * When no edit is active, `cell` is `null` and the remaining fields hold
 * their default (idle) values.
 */
export interface EditingState {
  /** The address of the cell currently being edited, or `null` when idle. */
  cell: CellAddress | null;
  /** The value the cell held before the edit began. */
  originalValue: CellValue;
  /** The value as modified by the user so far. */
  currentValue: CellValue;
  /** Whether the current value passes column validation. */
  isValid: boolean;
  /** Detailed validation result, or `null` when validation passes. */
  validationError: ValidationResult | null;
  /**
   * How the edit was initiated. `null` when no edit is active. Editor
   * implementations branch on this to decide whether to grab the input
   * selection on mount; see {@link EditCause}. Defaults to
   * `'programmatic'` when callers do not provide one (back-compat with
   * pre-#133 `beginEdit(cell)` signatures).
   */
  cause: EditCause | null;
}

/**
 * Creates the default (idle) editing state with no active edit.
 *
 * @returns A fresh {@link EditingState} ready for use.
 */
export function createEditingState(): EditingState {
  return {
    cell: null,
    originalValue: null,
    currentValue: null,
    isValid: true,
    validationError: null,
    cause: null,
  };
}

/**
 * Starts an edit session on the specified cell.
 *
 * Captures the cell address and its current value so the edit can be committed
 * or rolled back later.
 *
 * @param state - Current editing state (ignored; a new state is produced).
 * @param cell - The address of the cell to edit.
 * @param value - The cell's current value, which becomes both `originalValue` and `currentValue`.
 * @param cause - How the edit was initiated. Editor mounts read this to
 *   decide whether to take over input selection. Defaults to
 *   `'programmatic'` so callers that haven't been threaded yet keep the
 *   pre-#133 mount-time `select()` behaviour (which is correct for
 *   dblclick / F2 / Enter / programmatic — only `typeToEdit` needed to
 *   opt out).
 * @returns A new {@link EditingState} representing an active edit on `cell`.
 */
export function beginEdit(
  state: EditingState,
  cell: CellAddress,
  value: CellValue,
  cause: EditCause = 'programmatic',
): EditingState {
  return {
    cell,
    originalValue: value,
    currentValue: value,
    isValid: true,
    validationError: null,
    cause,
  };
}

/**
 * Updates the in-progress edit value and optionally validates it.
 *
 * If the column definition provides a `validate` function, it is invoked with
 * the new value. A validation result with severity `'error'` marks the state
 * as invalid, preventing a subsequent commit.
 *
 * @param state - Current editing state.
 * @param value - The updated cell value entered by the user.
 * @param column - Optional column definition used for validation.
 * @returns A new {@link EditingState} reflecting the updated value and validation outcome.
 */
export function updateEditValue(state: EditingState, value: CellValue, column?: ColumnDef): EditingState {
  // Run column-level validators when defined. `runValidators` preserves
  // declaration order and drops null results; the first error (if any) is
  // surfaced here so the editing state's blocking-commit flag (`isValid`)
  // remains binary.
  let validationError: ValidationResult | null = null;
  if (column?.validators && column.validators.length > 0) {
    const results = runValidators(value, column.validators, {
      row: {} as Record<string, unknown>,
      rowId: state.cell?.rowId ?? '',
      field: column.field as string,
    });
    // Surface the first result (declaration order) for
    // `EditingState.validationError`. `isValid` is driven strictly by
    // error-severity below, so a warning or info still renders the message
    // through this field without blocking commit.
    validationError = results[0] ?? null;
  }
  return {
    ...state,
    currentValue: value,
    isValid: !validationError || validationError.severity !== 'error',
    validationError,
  };
}

/**
 * Attempts to commit the current edit, returning the final value and cell address.
 *
 * The commit is rejected (returns `null`) when there is no active edit or the
 * current value has failed validation.
 *
 * @param state - Current editing state.
 * @returns An object containing the committed `value` and `cell`, or `null` if the commit was rejected.
 */
export function commitEdit(state: EditingState): { value: CellValue; cell: CellAddress } | null {
  // Reject when there is no active edit
  if (!state.cell) return null;
  // Reject when validation has flagged an error
  if (!state.isValid) return null;
  return { value: state.currentValue, cell: state.cell };
}

/**
 * Cancels the current edit session and returns to the idle state.
 *
 * The original cell value is not restored here -- callers should simply discard
 * the editing state and rely on the unchanged underlying data.
 *
 * @param _state - Current editing state (unused; a fresh idle state is returned).
 * @returns A fresh idle {@link EditingState}.
 */
export function cancelEdit(_state: EditingState): EditingState {
  return createEditingState();
}

/**
 * Checks whether any cell is currently being edited.
 *
 * @param state - Current editing state.
 * @returns `true` if an edit session is active.
 */
export function isEditing(state: EditingState): boolean {
  return state.cell !== null;
}

/**
 * Checks whether a specific cell is the one currently being edited.
 *
 * @param state - Current editing state.
 * @param cell - The cell address to test.
 * @returns `true` if the given cell matches the active edit cell.
 */
export function isEditingCell(state: EditingState, cell: CellAddress): boolean {
  return state.cell !== null && state.cell.rowId === cell.rowId && state.cell.field === cell.field;
}
