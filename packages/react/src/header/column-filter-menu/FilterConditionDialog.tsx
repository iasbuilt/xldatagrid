/**
 * Excel 365-style "Custom AutoFilter" dialog.
 *
 * Allows the user to define up to two filter conditions combined with And/Or
 * logic, matching the layout of the Excel 365 Custom AutoFilter modal.
 *
 * Accessibility
 * - The dialog exposes `role="dialog"` and `aria-modal="true"` with an
 *   `aria-label` of the form `Custom AutoFilter: <column title>`.
 * - The placeholder `-- select --` option of each operator dropdown is
 *   `disabled`, so users cannot commit an unset operator.
 * - Focus is captured from the prior `activeElement` on open, moved to the
 *   first operator select on the next tick, and restored on close.
 * - Tab/Shift+Tab are trapped inside the dialog body.
 *
 * Interaction
 * - The backdrop closes the dialog on `mousedown` (not `click`) to avoid a
 *   race where `mousedown` lands on the backdrop but `mouseup` lands on a
 *   dialog child, causing a premature close.
 * - Escape also closes the dialog.
 *
 * Validation
 * - An unset operator is skipped when building the descriptor.
 * - `between` requires both `value` and `value2`; a half-filled range is
 *   dropped from the result.
 * - If both clauses are invalid/empty, OK resolves to `onApply(null)`,
 *   telling the caller to clear the filter entirely.
 * - A single valid clause resolves to `{logic: 'and', filters: [desc]}`;
 *   two valid clauses use the And/Or radio selection.
 */
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { FilterDescriptor, FilterOperator, CompositeFilterDescriptor } from '@iasbuilt/datagrid-core';
import * as styles from './FilterConditionDialog.styles';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Props for {@link FilterConditionDialog}.
 *
 * The dialog is controlled; it owns the in-flight form state but emits the
 * final `CompositeFilterDescriptor` (or `null`) to the caller on OK.
 */
export interface FilterConditionDialogProps {
  /** Whether the dialog is mounted/visible. */
  open: boolean;
  /** Field this dialog is building a predicate for. */
  field: string;
  /** Human-readable column title, used in the dialog's `aria-label`. */
  title: string;
  /** Drives which operator list is offered and the value input type. */
  dataType: 'text' | 'number' | 'date';
  /** Current filter for this field, if any — prefills the form on open. */
  initial?: CompositeFilterDescriptor;
  /** Emits the new predicate, or `null` to signal "clear this field's filter". */
  onApply: (filter: CompositeFilterDescriptor | null) => void;
  /** Fires on Cancel, backdrop mousedown, Escape, or after OK. */
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Operator definitions
// ---------------------------------------------------------------------------

/**
 * Describes one entry in the operator dropdown.
 *
 * `noValue` suppresses the value input entirely (e.g. `isNull`), and
 * `between` reveals a second value input plus an "and" separator.
 */
interface OperatorOption {
  label: string;
  operator: FilterOperator;
  /** When true the value input is hidden (isNull / isNotNull). */
  noValue?: boolean;
  /** When true a second "between" value input is shown. */
  between?: boolean;
}

const TEXT_OPERATORS: OperatorOption[] = [
  { label: 'equals', operator: 'eq' },
  { label: 'does not equal', operator: 'neq' },
  { label: 'begins with', operator: 'startsWith' },
  { label: 'ends with', operator: 'endsWith' },
  { label: 'contains', operator: 'contains' },
  { label: 'is empty', operator: 'isNull', noValue: true },
  { label: 'is not empty', operator: 'isNotNull', noValue: true },
];

const NUMBER_OPERATORS: OperatorOption[] = [
  { label: 'equals', operator: 'eq' },
  { label: 'does not equal', operator: 'neq' },
  { label: 'is greater than', operator: 'gt' },
  { label: 'is greater than or equal to', operator: 'gte' },
  { label: 'is less than', operator: 'lt' },
  { label: 'is less than or equal to', operator: 'lte' },
  { label: 'is between', operator: 'between', between: true },
  { label: 'is empty', operator: 'isNull', noValue: true },
  { label: 'is not empty', operator: 'isNotNull', noValue: true },
];

const DATE_OPERATORS: OperatorOption[] = [
  { label: 'equals', operator: 'eq' },
  { label: 'does not equal', operator: 'neq' },
  { label: 'is after', operator: 'gt' },
  { label: 'is after or on', operator: 'gte' },
  { label: 'is before', operator: 'lt' },
  { label: 'is before or on', operator: 'lte' },
  { label: 'is between', operator: 'between', between: true },
  { label: 'is empty', operator: 'isNull', noValue: true },
  { label: 'is not empty', operator: 'isNotNull', noValue: true },
];

/** Returns the operator list appropriate for the column's data type. */
function getOperators(dataType: 'text' | 'number' | 'date'): OperatorOption[] {
  if (dataType === 'number') return NUMBER_OPERATORS;
  if (dataType === 'date') return DATE_OPERATORS;
  return TEXT_OPERATORS;
}

/** Looks up the {@link OperatorOption} metadata for a given operator value. */
function findOption(operators: OperatorOption[], operator: FilterOperator): OperatorOption | undefined {
  return operators.find((o) => o.operator === operator);
}

// ---------------------------------------------------------------------------
// Per-row local state
// ---------------------------------------------------------------------------

/**
 * Local form state for one of the two condition rows.
 *
 * An empty `operator` means the user has not picked one yet (the placeholder
 * option is selected). `value2` is only populated for `between`.
 */
interface ConditionState {
  operator: FilterOperator | '';
  value: string;
  value2: string; // only used for "between"
}

/** Default, blank form state used on open and after clearing an operator. */
const EMPTY_CONDITION: ConditionState = { operator: '', value: '', value2: '' };

/**
 * Converts a {@link FilterDescriptor} from the caller's `initial` prop into
 * the dialog's local {@link ConditionState}. Returns {@link EMPTY_CONDITION}
 * when the operator isn't part of the current data-type's list (e.g. a
 * descriptor authored against a different column type).
 */
function conditionFromDescriptor(
  desc: FilterDescriptor,
  operators: OperatorOption[],
): ConditionState {
  const opt = findOption(operators, desc.operator);
  if (!opt) return EMPTY_CONDITION;
  if (opt.between) {
    const arr = Array.isArray(desc.value) ? desc.value : [desc.value, ''];
    return { operator: desc.operator, value: String(arr[0] ?? ''), value2: String(arr[1] ?? '') };
  }
  return { operator: desc.operator, value: desc.value == null ? '' : String(desc.value), value2: '' };
}

/**
 * Builds the outgoing {@link FilterDescriptor} for one condition row. The
 * descriptor shape varies by operator kind: `isNull`/`isNotNull` emit
 * `value: null`, `between` emits `[value, value2]`, everything else emits
 * the raw scalar from the text/date input.
 */
function buildDescriptor(field: string, cond: ConditionState, opt: OperatorOption): FilterDescriptor {
  if (opt.noValue) {
    return { field, operator: opt.operator, value: null };
  }
  if (opt.between) {
    return { field, operator: opt.operator, value: [cond.value, cond.value2] };
  }
  return { field, operator: opt.operator, value: cond.value };
}

// ---------------------------------------------------------------------------
// Sub-component: one condition row
// ---------------------------------------------------------------------------

/**
 * Props for the single-row sub-component.
 *
 * `index` is used only to compose stable `data-testid` attributes
 * (`filter-cond-op-<n>`, `filter-cond-val-<n>`, etc.). `selectRef` is only
 * forwarded for row 1 so focus can be moved there when the dialog opens.
 */
interface ConditionRowProps {
  index: 1 | 2;
  dataType: 'text' | 'number' | 'date';
  operators: OperatorOption[];
  state: ConditionState;
  onChange: (next: ConditionState) => void;
  selectRef?: React.Ref<HTMLSelectElement>;
}

/**
 * Renders a single operator/value row. Clearing the operator resets both
 * value fields so a previously-typed between range can't leak into a
 * non-between operator.
 */
function ConditionRow({ index, dataType, operators, state, onChange, selectRef }: ConditionRowProps) {
  const inputType = dataType === 'date' ? 'date' : 'text';
  const selectedOpt = state.operator ? findOption(operators, state.operator as FilterOperator) : undefined;
  const hideValue = selectedOpt?.noValue === true;
  const showBetween = selectedOpt?.between === true;

  return (
    <div style={styles.conditionRow}>
      <select
        ref={selectRef}
        data-testid={`filter-cond-op-${index}`}
        style={styles.operatorSelect}
        value={state.operator}
        onChange={(e) => {
          const op = e.target.value as FilterOperator | '';
          // Reset both value inputs when the operator changes so a stale
          // `between` range cannot leak into a scalar operator.
          onChange({ ...state, operator: op, value: '', value2: '' });
        }}
      >
        {/* Placeholder option is disabled so users cannot commit an unset
            operator. The dialog treats this as "no condition on this row". */}
        <option value="" disabled>-- select --</option>
        {operators.map((o) => (
          <option key={o.operator} value={o.operator}>
            {o.label}
          </option>
        ))}
      </select>

      {!hideValue && (
        <input
          data-testid={`filter-cond-val-${index}`}
          type={inputType}
          style={styles.valueInput}
          value={state.value}
          onChange={(e) => onChange({ ...state, value: e.target.value })}
        />
      )}

      {showBetween && (
        <>
          <span style={styles.andLabel}>and</span>
          <input
            data-testid={`filter-cond-val-${index}-b`}
            type={inputType}
            style={styles.valueInput}
            value={state.value2}
            onChange={(e) => onChange({ ...state, value2: e.target.value })}
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main dialog
// ---------------------------------------------------------------------------

/** Excel 365 "Custom AutoFilter" modal. Portal-rendered to document.body. */
export function FilterConditionDialog({
  open,
  field,
  title,
  dataType,
  initial,
  onApply,
  onClose,
}: FilterConditionDialogProps): React.ReactElement | null {
  const operators = getOperators(dataType);

  const [cond1, setCond1] = useState<ConditionState>(EMPTY_CONDITION);
  const [cond2, setCond2] = useState<ConditionState>(EMPTY_CONDITION);
  const [logic, setLogic] = useState<'and' | 'or'>('and');

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const firstOpRef = useRef<HTMLSelectElement | null>(null);
  // Element that had focus at the moment the dialog opened. We restore focus
  // to it when the dialog closes so keyboard users return to their starting
  // point (typically the column header's filter button).
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // We capture `initial` in a ref so the seed effect can read the latest
  // value without listing it as a dependency. Seeding runs only on open;
  // mid-session changes to `initial` are deliberately ignored so they do
  // not clobber in-flight user edits.
  const initialRef = useRef(initial);
  initialRef.current = initial;
  const operatorsRef = useRef(operators);
  operatorsRef.current = operators;

  // When the dialog opens, preload the form from `initial` (or reset to
  // blank if no filter was active). When it closes, effects below tear
  // down focus and listeners.
  useEffect(() => {
    if (!open) return;
    const seed = initialRef.current;
    const ops = operatorsRef.current;
    if (!seed || seed.filters.length === 0) {
      setCond1(EMPTY_CONDITION);
      setCond2(EMPTY_CONDITION);
      setLogic('and');
      return;
    }
    setLogic(seed.logic);
    const [f1, f2] = seed.filters as FilterDescriptor[];
    setCond1(f1 ? conditionFromDescriptor(f1, ops) : EMPTY_CONDITION);
    setCond2(f2 ? conditionFromDescriptor(f2, ops) : EMPTY_CONDITION);
  }, [open]);

  // Focus management lifecycle: snapshot the previously focused element on
  // open, push focus into the first operator select on the next tick (the
  // portal must render first), and restore focus on close. Failures during
  // restoration are swallowed because the previous element may have been
  // detached from the DOM while the dialog was open.
  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Defer the focus call to after the portal mounts.
    const id = window.setTimeout(() => {
      firstOpRef.current?.focus();
    }, 0);
    return () => {
      window.clearTimeout(id);
      const prev = previouslyFocusedRef.current;
      if (prev && typeof prev.focus === 'function') {
        try {
          prev.focus();
        } catch {
          // ignore — element may have been removed from the DOM
        }
      }
      previouslyFocusedRef.current = null;
    };
  }, [open]);

  // Escape key dismisses the dialog. The listener is attached to document
  // so any focused control inside the dialog still triggers it.
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  // `hasCond*` tracks whether the user has picked an operator on that row;
  // an unset operator means the row contributes nothing.
  const hasCond1 = cond1.operator !== '';
  const hasCond2 = cond2.operator !== '';

  /**
   * Decides whether a row is complete enough to build a descriptor from.
   * `noValue` operators (isNull/isNotNull) need no inputs; `between`
   * requires both ends; everything else accepts any non-empty scalar.
   */
  function isConditionValid(cond: ConditionState): boolean {
    if (cond.operator === '') return false;
    const opt = findOption(operators, cond.operator as FilterOperator);
    if (!opt) return false;
    if (opt.noValue) return true;
    if (opt.between) {
      // Both sides of a between range must be filled for the clause to
      // count; a half-filled range is silently discarded in `handleOk`.
      return cond.value !== '' && cond.value2 !== '';
    }
    return true;
  }

  /**
   * Builds and emits the final composite filter. Invalid rows are skipped,
   * so a half-filled between or an un-picked operator simply drops out of
   * the result. Empty result → `onApply(null)` (caller clears this field's
   * filter). One valid row → `and`-logic wrapper with a single descriptor.
   * Two valid rows → wrapper with the user-selected `and`/`or` logic.
   */
  function handleOk() {
    const filters: FilterDescriptor[] = [];
    if (hasCond1 && isConditionValid(cond1)) {
      const opt = findOption(operators, cond1.operator as FilterOperator)!;
      filters.push(buildDescriptor(field, cond1, opt));
    }
    if (hasCond2 && isConditionValid(cond2)) {
      const opt = findOption(operators, cond2.operator as FilterOperator)!;
      filters.push(buildDescriptor(field, cond2, opt));
    }
    if (filters.length === 0) {
      onApply(null);
      return;
    }
    if (filters.length === 1) {
      onApply({ logic: 'and', filters });
    } else {
      onApply({ logic, filters });
    }
  }

  /**
   * Traps Tab/Shift+Tab inside the dialog.
   *
   * Walks a fresh list of focusables each time so rows that appear after
   * the first operator is picked (row 2, And/Or radios) are included.
   * Wraps from last→first on forward tab and first→last on reverse tab.
   */
  function handleDialogKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab') return;
    const root = dialogRef.current;
    if (!root) return;
    const focusables = root.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusables.length === 0) return;
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey) {
      if (active === first || !root.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (active === last || !root.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  return createPortal(
    <>
      {/* Backdrop — mousedown closes dialog. We use mousedown rather than
          click to avoid a race with the dialog's stopPropagation on click
          (e.g. mousedown on backdrop, mouseup inside dialog). */}
      <div
        data-testid="filter-cond-backdrop"
        style={styles.backdrop}
        onMouseDown={onClose}
      />

      {/* Dialog panel — clicks inside must not bubble to backdrop */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Custom AutoFilter: ${title}`}
        data-testid="filter-cond-dialog"
        style={styles.dialog}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={handleDialogKeyDown}
      >
        <div style={styles.heading}>Show rows where:</div>

        <ConditionRow
          index={1}
          dataType={dataType}
          operators={operators}
          state={cond1}
          onChange={setCond1}
          selectRef={firstOpRef}
        />

        {hasCond1 && (
          <>
            <div style={styles.radioRow}>
              <label>
                <input
                  type="radio"
                  data-testid="filter-cond-and"
                  name="filter-cond-logic"
                  value="and"
                  checked={logic === 'and'}
                  onChange={() => setLogic('and')}
                />
                {' And'}
              </label>
              <label>
                <input
                  type="radio"
                  data-testid="filter-cond-or"
                  name="filter-cond-logic"
                  value="or"
                  checked={logic === 'or'}
                  onChange={() => setLogic('or')}
                />
                {' Or'}
              </label>
            </div>

            <ConditionRow
              index={2}
              dataType={dataType}
              operators={operators}
              state={cond2}
              onChange={setCond2}
            />
          </>
        )}

        <div style={styles.footer}>
          <button
            data-testid="filter-cond-cancel"
            style={styles.button(false)}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            data-testid="filter-cond-ok"
            style={styles.button(true)}
            onClick={handleOk}
          >
            OK
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
