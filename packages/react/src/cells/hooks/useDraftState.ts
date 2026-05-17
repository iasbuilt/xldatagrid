/**
 * useDraftState — shared hook for text-input cell editors.
 *
 * Encapsulates the recurring pattern of: local draft state, an input ref,
 * focus-on-edit-start, and Enter / Escape / blur commit logic.
 *
 * @module useDraftState
 */
import { useState, useRef, useEffect, useCallback } from 'react';

/** Options accepted by {@link useDraftState}. */
export interface UseDraftStateOptions {
  /** The display value to initialize draft from. */
  initialValue: string;
  /** Whether the cell is currently editing. */
  isEditing: boolean;
  /**
   * Callback fired with the transformed value when the edit is confirmed.
   * Optional `advance` hints the grid to move selection DOWN (Enter) or
   * RIGHT (Tab) after committing — blur commits pass `undefined`.
   */
  onCommit: (value: unknown, advance?: 'down' | 'right') => void;
  /** Callback fired when the edit is discarded (Escape). */
  onCancel: () => void;
  /** Optional transform applied to the draft string before committing (e.g. `parseFloat`). */
  transformCommit?: (draft: string) => unknown;
  /** When true, calls `select()` on the input after focusing — useful for numeric/currency. */
  selectOnFocus?: boolean;
  /** When true, wraps the focus call in `setTimeout(..., 0)` — needed for MUI TextField. */
  deferFocus?: boolean;
}

/** Values returned by {@link useDraftState}. */
export interface UseDraftStateReturn {
  /** The current draft string shown in the input. */
  draft: string;
  /** Setter for the draft string. */
  setDraft: React.Dispatch<React.SetStateAction<string>>;
  /** Ref to attach to the underlying `<input>` or `<textarea>` element. */
  inputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  /** Keyboard handler: Enter commits, Escape cancels. */
  handleKeyDown: (e: React.KeyboardEvent) => void;
  /** Blur handler: commits the current draft. */
  handleBlur: () => void;
  /**
   * Imperative commit: pass a raw string override or falls back to current
   * draft. Optional `advance` forwards the Excel-365 commit-and-move intent
   * to the grid (Enter → 'down', Tab → 'right').
   */
  commit: (raw?: string, advance?: 'down' | 'right') => void;
}

/**
 * Manages local draft state and focus behaviour for text-based cell editors.
 *
 * On every transition into `isEditing`, the draft is reset to `initialValue`
 * and the input receives focus (optionally deferred and with text selection).
 * Provides stable `handleKeyDown`, `handleBlur`, and `commit` callbacks so
 * consumer components never need to recreate them.
 */
export function useDraftState({
  initialValue,
  isEditing,
  onCommit,
  onCancel,
  transformCommit,
  selectOnFocus = false,
  deferFocus = false,
}: UseDraftStateOptions): UseDraftStateReturn {
  const [draft, setDraft] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  // Marks the current edit as cancelled so a trailing blur (fired when the
  // input unmounts after Escape) does not turn the cancel into a commit.
  // Issue #11: Esc must revert the value, never persist the draft via blur.
  const cancelledRef = useRef(false);

  // Reset draft and focus the input whenever the cell enters edit mode.
  useEffect(() => {
    if (!isEditing) return;

    setDraft(initialValue);
    cancelledRef.current = false;

    const focusInput = () => {
      inputRef.current?.focus();
      if (selectOnFocus) {
        // Defer select() past the browser's native dblclick selection
        // logic, which would otherwise override a sync call and leave the
        // cursor at the end of the text. Without this defer, dblclick →
        // type APPENDS digits instead of replacing — catastrophic for
        // numeric / currency cells (e.g. "138739" + typing "77777" =
        // "13873977777"). Mirrors the fix in
        // packages/react/src/body/DataGridBody.tsx for the default
        // inline editor.
        requestAnimationFrame(() => inputRef.current?.select());
      }
    };

    if (deferFocus) {
      setTimeout(focusInput, 0);
    } else {
      focusInput();
    }
  }, [isEditing]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Transforms and commits a value, defaulting to the current draft. */
  const commit = useCallback(
    (raw?: string, advance?: 'down' | 'right') => {
      if (cancelledRef.current) return;
      const source = raw !== undefined ? raw : draft;
      const committed = transformCommit ? transformCommit(source) : source;
      onCommit(committed, advance);
    },
    [draft, transformCommit, onCommit],
  );

  /**
   * Commits on Enter or Tab, cancels on Escape.
   *
   * Excel-365 commit-and-advance: Enter commits and moves selection DOWN
   * one row; Tab commits and moves RIGHT one column. `preventDefault`
   * suppresses the browser's native Tab-focus-advance and any form
   * submission, and `stopPropagation` keeps the grid-level keyboard
   * handler from observing a second Enter/Tab for the same event (the
   * advance has already been applied via `onCommit`).
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        commit(undefined, 'down');
      } else if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        commit(undefined, 'right');
      } else if (e.key === 'Escape') {
        cancelledRef.current = true;
        onCancel();
      }
    },
    [commit, onCancel],
  );

  /** Commits the current draft when the input loses focus. */
  const handleBlur = useCallback(() => {
    if (cancelledRef.current) return;
    commit();
  }, [commit]);

  return { draft, setDraft, inputRef, handleKeyDown, handleBlur, commit };
}
