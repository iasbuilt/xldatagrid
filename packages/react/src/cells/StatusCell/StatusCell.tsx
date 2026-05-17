/**
 * Status cell renderer for the datagrid.
 *
 * Displays the current status as a coloured badge and, in edit mode, opens a
 * keyboard-navigable dropdown listbox of available status options.  Each
 * option is defined by the column's `options` array (of type
 * {@link StatusOption}) and carries a label and an optional colour.
 *
 * Editable option list (see GitHub #93)
 * --------------------------------------
 * When the column definition supplies `onAddOption`, the dropdown surfaces
 * an inline "Add new…" text input at the bottom of the listbox — typing
 * a label and pressing Enter (or clicking the "Add" affordance) appends
 * a new option to the list via the callback.
 *
 * When `canDeleteOption` returns `true` for a given option, that option's
 * row exposes a per-row delete (×) button (and answers the keyboard
 * `Delete` shortcut). The callback may be sync or async; while a permission
 * check is in flight, the × button stays hidden — there is no flicker
 * because resolutions are cached per render. `onDeleteOption` is invoked
 * when the user confirms; the option is removed from the visible list
 * only after the returned promise resolves.
 *
 * The auth contract is intentionally generic. Consumers wire arbitrary
 * permission logic (e.g. a GraphQL user-type lookup cached for the
 * session) inside `canDeleteOption` — the grid never reads user identity
 * directly.
 *
 * @module StatusCell
 * @packageDocumentation
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
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
 *     onAddOption: async (label) => ({ value: label, label }),
 *     canDeleteOption: (opt) => currentUser.role === 'admin',
 *     onDeleteOption: async (opt) => api.deleteEnum(opt.value),
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
  // Resolve the available status options from the column definition.
  // We mirror them into local state so add/delete callbacks can mutate the
  // visible list while the dropdown is open without forcing the parent to
  // re-render the column definition synchronously.
  const initialOptions: StatusOption[] = column.options ?? [];
  const [options, setOptions] = useState<StatusOption[]>(initialOptions);
  // When the column's option list changes externally (e.g. parent commits a
  // new server-side enum), pick it up — but skip the no-op identity case so
  // local add/delete mutations are not clobbered mid-edit.
  useEffect(() => {
    setOptions(column.options ?? []);
    // We intentionally depend on the column.options reference: parents that
    // truly want to override mid-edit must hand us a new array.
  }, [column.options]);

  // Draft state: tracks the selected value without exiting edit mode
  const [draft, setDraft] = useState<CellValue>(value);
  // Find the option matching the draft value for badge rendering
  const current = options.find((o) => o.value === draft);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ---- Editable dropdown state (#93) -----------------------------------
  // Editable-list callbacks. These may be absent — the cell falls back to
  // the original read-only dropdown when none are provided.
  const onAddOption = column.onAddOption;
  const canDeleteOption = column.canDeleteOption;
  const onDeleteOption = column.onDeleteOption;
  // Text input value for the "Add new…" affordance.
  const [newLabel, setNewLabel] = useState<string>('');
  // Tracks which option values the consumer authorises the user to delete.
  // Keyed by option value; missing entries are treated as "not yet known"
  // and render with the × button hidden until the permission check
  // resolves (avoiding a flicker on async checks).
  const [deletePerms, setDeletePerms] = useState<Record<string, boolean>>({});
  // Suppress the blur-commit when an internal action (Add input focus,
  // delete button click) is briefly stealing focus from the listbox.
  const suppressBlurRef = useRef(false);

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

  // Resolve delete permissions for the currently visible options. We
  // re-evaluate whenever the options list changes (add/delete) so that
  // freshly added options pick up their permission state.
  useEffect(() => {
    if (!canDeleteOption) {
      setDeletePerms({});
      return;
    }
    let cancelled = false;
    const next: Record<string, boolean> = {};
    Promise.all(
      options.map(async (opt) => {
        try {
          const allowed = await Promise.resolve(canDeleteOption(opt));
          next[opt.value] = !!allowed;
        } catch {
          // A failed permission check defaults to "not allowed" — fail-safe.
          next[opt.value] = false;
        }
      }),
    ).then(() => {
      if (!cancelled) setDeletePerms(next);
    });
    return () => {
      cancelled = true;
    };
  }, [options, canDeleteOption]);

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
   * Adds a new option via the `onAddOption` callback and appends it to
   * the visible list. Empty / whitespace-only labels are rejected silently.
   */
  const addOption = useCallback(async () => {
    const label = newLabel.trim();
    if (!label || !onAddOption) return;
    try {
      const created = await Promise.resolve(onAddOption(label));
      setOptions((prev) => {
        // Deduplicate by value — if the consumer hands back an existing
        // option we leave the list untouched.
        if (prev.some((o) => o.value === created.value)) return prev;
        return [...prev, created];
      });
      setNewLabel('');
      // Return focus to the listbox so keyboard nav resumes naturally.
      dropdownRef.current?.focus();
    } catch {
      // Swallow — consumers surface errors via their own UI.
    }
  }, [newLabel, onAddOption]);

  /**
   * Deletes an option via the `onDeleteOption` callback and removes it
   * from the visible list once the promise resolves.
   */
  const deleteOption = useCallback(
    async (opt: StatusOption) => {
      if (!onDeleteOption) return;
      try {
        await Promise.resolve(onDeleteOption(opt));
        setOptions((prev) => prev.filter((o) => o.value !== opt.value));
      } catch {
        // Same fail-soft contract as add.
      }
    },
    [onDeleteOption],
  );

  /**
   * Handles keyboard navigation within the dropdown listbox.
   * ArrowDown/ArrowUp move the active index, Enter selects, Escape cancels.
   * Delete removes the active option when the consumer authorises it.
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
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      const opt = options[activeIndex];
      if (opt && onDeleteOption && deletePerms[opt.value]) {
        e.preventDefault();
        e.stopPropagation();
        void deleteOption(opt);
      }
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
          onBlur={(e) => {
            // Internal focus shuffles (Add input, × button) must NOT trigger
            // the blur-commit. The flag is raised by those handlers via
            // onMouseDown / onFocus before the blur fires; we additionally
            // inspect `relatedTarget` to catch programmatic focus moves
            // (Playwright's `locator.fill` focuses via JS without firing
            // mousedown first, so the flag alone is not enough).
            const next = e.relatedTarget as Node | null;
            if (next && dropdownRef.current?.contains(next)) {
              return;
            }
            if (suppressBlurRef.current) {
              suppressBlurRef.current = false;
              return;
            }
            setOpen(false);
            onCommit(draft);
          }}
          style={styles.dropdown}
        >
          {options.map((opt, i) => {
            const canDelete = onDeleteOption && deletePerms[opt.value] === true;
            return (
              <div
                key={opt.value}
                role="option"
                aria-selected={opt.value === value}
                data-active={i === activeIndex}
                data-option-value={opt.value}
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
                <span style={{ flex: 1 }}>{opt.label}</span>
                {canDelete ? (
                  <button
                    type="button"
                    aria-label={`Delete option ${opt.label}`}
                    data-testid={`delete-option-${opt.value}`}
                    onMouseDown={(e) => {
                      // Stop the parent row's mouseDown (which would commit
                      // a selection) and keep focus on the listbox.
                      e.preventDefault();
                      e.stopPropagation();
                      suppressBlurRef.current = true;
                      void deleteOption(opt);
                    }}
                    style={styles.deleteButton}
                  >
                    {'×'}
                  </button>
                ) : null}
              </div>
            );
          })}
          {onAddOption ? (
            <div style={styles.addRow}>
              <input
                type="text"
                value={newLabel}
                placeholder="Add new…"
                aria-label="Add new option"
                data-testid="add-option-input"
                onChange={(e) => setNewLabel(e.target.value)}
                onFocus={() => {
                  // Prevent the listbox-blur handler from committing while
                  // the user is typing a new option.
                  suppressBlurRef.current = true;
                }}
                onMouseDown={() => {
                  suppressBlurRef.current = true;
                }}
                onKeyDown={(e) => {
                  // Localise keyboard inside the input — don't let the
                  // parent listbox handler interpret Enter as "select".
                  e.stopPropagation();
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void addOption();
                  } else if (e.key === 'Escape') {
                    setNewLabel('');
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                style={styles.addInput}
              />
              <button
                type="button"
                data-testid="add-option-submit"
                onMouseDown={(e) => {
                  e.preventDefault();
                  suppressBlurRef.current = true;
                  void addOption();
                }}
                disabled={!newLabel.trim()}
                style={styles.addButton(!!newLabel.trim())}
              >
                Add
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}) as <TData = Record<string, unknown>>(props: StatusCellProps<TData>) => React.ReactElement;
