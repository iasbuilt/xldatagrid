/**
 * PasswordConfirmCell — a password editor with mandatory re-entry confirmation
 * and a shared show/hide (eye) toggle across both inputs.
 *
 * Introduced for issue #18 sub-feature 4: transposed grids often host
 * credential forms where the user must retype the password to reduce the risk
 * of committing a typo into the system of record. This cell bundles both
 * inputs into a single editable cell so the existing
 * {@link GridModel} edit-commit pipeline does not need to coordinate
 * cross-cell validation (the confirmation never leaves the cell boundary).
 *
 * Commit contract:
 *   - `onCommit(value)` is only called when the two inputs match.
 *   - A mismatch surfaces an inline message and keeps the cell in edit mode
 *     so the user can fix the typo without losing what they typed.
 *   - Pressing Enter in either input attempts a commit.
 *   - Pressing Escape cancels and discards both drafts.
 *
 * Display mode reuses the same masked-text + eye-toggle affordance as
 * {@link PasswordCell} so the two cells are visually interchangeable when not
 * being edited.
 *
 * @module PasswordConfirmCell
 * @packageDocumentation
 */
import React, { useState, useRef, useEffect } from 'react';
import type { CellValue, ColumnDef } from '@iasbuilt/datagrid-core';
import { usePasswordInput } from '../hooks/usePasswordInput';
import * as styles from './PasswordConfirmCell.styles';

/** Unicode bullet used to mask each character of the password in display mode. */
const MASK_CHAR = '\u2022';

/** Inline error message surfaced when the two inputs differ. */
export const MISMATCH_MESSAGE = 'Passwords do not match';

/**
 * Props accepted by {@link PasswordConfirmCell}. Mirrors the built-in cell
 * contract so the cell can be dropped into `cellRendererMap` without any
 * wrapper.
 */
interface PasswordConfirmCellProps<TData = Record<string, unknown>> {
  value: CellValue;
  row: TData;
  column: ColumnDef<TData>;
  rowIndex: number;
  isEditing: boolean;
  onCommit: (value: CellValue) => void;
  onCancel: () => void;
}

/**
 * A password editor that requires the user to confirm the value before it can
 * be committed back to the grid model. Includes a single eye toggle whose
 * state is shared between both inputs so the user can visually verify the
 * match before committing.
 */
export const PasswordConfirmCell = React.memo(function PasswordConfirmCell<TData = Record<string, unknown>>({
  value,
  isEditing,
  onCommit,
  onCancel,
}: PasswordConfirmCellProps<TData>) {
  const strValue = value == null ? '' : String(value);
  // Shared show/hide toggle, autocomplete hint, and stable ids for the two
  // inputs + the mismatch alert. `confirmMode: true` picks the
  // `new-password` autocomplete token, matching the original cell.
  const {
    visible: revealed,
    toggle: toggleRevealed,
    inputType,
    autoComplete,
    primaryInputId: input1Id,
    confirmInputId: input2Id,
    describedById: mismatchId,
  } = usePasswordInput({ confirmMode: true });
  const [draft, setDraft] = useState(strValue);
  const [confirm, setConfirm] = useState(strValue);
  // `showMismatch` is only set after a commit attempt so the user doesn't see
  // the error flicker while typing the first character of the confirmation.
  const [showMismatch, setShowMismatch] = useState(false);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // When entering edit mode, reset drafts to the current value and focus the
  // primary input. Both inputs are pre-populated with the existing value so
  // the user only needs to retype if they are changing the password — this
  // matches the common "blur without changes = no-op" spreadsheet UX.
  useEffect(() => {
    if (isEditing) {
      setDraft(strValue);
      setConfirm(strValue);
      setShowMismatch(false);
      // Focus microtask: the input must be in the DOM first.
      queueMicrotask(() => firstInputRef.current?.focus());
    }
  }, [isEditing]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Display mode ---
  if (!isEditing) {
    const masked = MASK_CHAR.repeat(strValue.length);
    return (
      <span style={styles.displayContainer}>
        <span style={styles.maskedText} data-testid="password-confirm-display">
          {revealed ? strValue : masked}
        </span>
        <button
          type="button"
          aria-label={revealed ? 'Hide password' : 'Reveal password'}
          aria-pressed={revealed}
          data-testid="password-confirm-eye-display"
          onClick={toggleRevealed}
          style={styles.toggleButton}
        >
          {revealed ? '\u{1F441}' : '\u{1F441}\u2013'}
        </button>
      </span>
    );
  }

  // --- Edit mode ---
  // Gate commit on equality. Reusing a local variable avoids the subtle
  // "stale state" bug where the handler runs before React flushes the latest
  // input onChange (e.g. Enter pressed before blur).
  const attemptCommit = (nextDraft: string, nextConfirm: string) => {
    if (nextDraft !== nextConfirm) {
      setShowMismatch(true);
      return;
    }
    setShowMismatch(false);
    onCommit(nextDraft);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      attemptCommit(draft, confirm);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  // `inputType` and `autoComplete` are sourced from usePasswordInput above.
  const mismatch = showMismatch && draft !== confirm;

  return (
    <div style={styles.editContainer} data-testid="password-confirm-edit">
      <div style={styles.editInputRow}>
        <input
          ref={firstInputRef}
          id={input1Id}
          type={inputType}
          value={draft}
          autoComplete={autoComplete}
          onChange={(e) => {
            setDraft(e.target.value);
            if (showMismatch) setShowMismatch(false);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Password"
          data-testid="password-confirm-input"
          aria-invalid={mismatch || undefined}
          aria-describedby={mismatch ? mismatchId : undefined}
          style={styles.editInput}
        />
        <button
          type="button"
          aria-label={revealed ? 'Hide password' : 'Reveal password'}
          aria-pressed={revealed}
          data-testid="password-confirm-eye"
          onClick={toggleRevealed}
          style={styles.toggleButton}
        >
          {revealed ? '\u{1F441}' : '\u{1F441}\u2013'}
        </button>
      </div>
      <div style={styles.editInputRow}>
        <input
          id={input2Id}
          type={inputType}
          value={confirm}
          autoComplete={autoComplete}
          onChange={(e) => {
            setConfirm(e.target.value);
            if (showMismatch) setShowMismatch(false);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Confirm password"
          data-testid="password-confirm-input-confirm"
          aria-invalid={mismatch || undefined}
          aria-describedby={mismatch ? mismatchId : undefined}
          style={styles.editInput}
        />
        {/* Spacer keeps the two input widths identical. The eye toggle only
            needs to live in one row because it applies to both inputs. */}
        <span aria-hidden="true" style={{ ...styles.toggleButton, visibility: 'hidden' }}>
          {'\u{1F441}'}
        </span>
      </div>
      {mismatch && (
        <div
          role="alert"
          id={mismatchId}
          data-testid="password-confirm-mismatch"
          style={styles.mismatchMessage}
        >
          {MISMATCH_MESSAGE}
        </div>
      )}
    </div>
  );
}) as <TData = Record<string, unknown>>(props: PasswordConfirmCellProps<TData>) => React.ReactElement;
