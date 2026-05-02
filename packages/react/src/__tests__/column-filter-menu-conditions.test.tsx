/**
 * Unit tests for {@link FilterConditionDialog}.
 *
 * Exercises the Excel 365 "Custom AutoFilter" modal: visibility, operator
 * lists per data type, the isNull/isNotNull and `between` special cases,
 * two-clause AND/OR composition, dismiss channels (Cancel, backdrop
 * mousedown, Escape), seeding from the caller's `initial` prop,
 * accessibility attributes, focus management, and between-clause
 * validation.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { FilterConditionDialog } from '../header/column-filter-menu/FilterConditionDialog';
import type { CompositeFilterDescriptor } from '@iasbuilt/datagrid-core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface RenderProps {
  open?: boolean;
  field?: string;
  title?: string;
  dataType?: 'text' | 'number' | 'date';
  initial?: CompositeFilterDescriptor;
  onApply?: ReturnType<typeof vi.fn>;
  onClose?: ReturnType<typeof vi.fn>;
}

function renderDialog({
  open = true,
  field = 'name',
  title = 'Name',
  dataType = 'text',
  initial,
  onApply = vi.fn(),
  onClose = vi.fn(),
}: RenderProps = {}) {
  const result = render(
    <FilterConditionDialog
      open={open}
      field={field}
      title={title}
      dataType={dataType}
      initial={initial}
      onApply={onApply}
      onClose={onClose}
    />,
  );
  return { ...result, onApply, onClose };
}

function op1() {
  return screen.getByTestId('filter-cond-op-1') as HTMLSelectElement;
}
function val1() {
  return screen.getByTestId('filter-cond-val-1') as HTMLInputElement;
}
function op2() {
  return screen.getByTestId('filter-cond-op-2') as HTMLSelectElement;
}
function val2() {
  return screen.getByTestId('filter-cond-val-2') as HTMLInputElement;
}
function okBtn() {
  return screen.getByTestId('filter-cond-ok');
}
function cancelBtn() {
  return screen.getByTestId('filter-cond-cancel');
}

// ---------------------------------------------------------------------------
// Visibility & initial state
// ---------------------------------------------------------------------------

// Visibility: the dialog is null when closed and progressively reveals
// row 2 + logic radios only after row 1 has an operator selected.
describe('FilterConditionDialog — visibility', () => {
  // Closed dialog renders nothing.
  it('returns null when open=false', () => {
    renderDialog({ open: false });
    expect(screen.queryByTestId('filter-cond-dialog')).toBeNull();
  });

  // Open dialog mounts its panel.
  it('renders the dialog when open=true', () => {
    renderDialog();
    expect(screen.getByTestId('filter-cond-dialog')).toBeTruthy();
  });

  // Row 2 and the And/Or radios stay hidden until row 1's operator is set.
  it('shows only row 1 initially; row 2 and And/Or hidden until row 1 is filled', () => {
    renderDialog();
    expect(screen.getByTestId('filter-cond-op-1')).toBeTruthy();
    expect(screen.queryByTestId('filter-cond-and')).toBeNull();
    expect(screen.queryByTestId('filter-cond-op-2')).toBeNull();
  });

  // Selecting an operator on row 1 unveils row 2 and the logic radios.
  it('reveals And/Or radios and row 2 after filling row 1', () => {
    renderDialog();
    fireEvent.change(op1(), { target: { value: 'eq' } });
    expect(screen.getByTestId('filter-cond-and')).toBeTruthy();
    expect(screen.getByTestId('filter-cond-op-2')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Portal to document.body
// ---------------------------------------------------------------------------

// Portal: dialog lives directly under document.body so it can overlay
// the entire grid without being clipped.
describe('FilterConditionDialog — portal', () => {
  // Dialog's direct parent is document.body.
  it('is portaled to document.body', () => {
    renderDialog();
    const dialog = screen.getByTestId('filter-cond-dialog');
    expect(dialog.closest('body')).toBe(document.body);
    // The dialog's direct parent should be document.body (portal root)
    expect(dialog.parentElement).toBe(document.body);
  });
});

// ---------------------------------------------------------------------------
// Text dataType operators
// ---------------------------------------------------------------------------

// Text operator list: Excel 365's text-column options.
describe('FilterConditionDialog — text operators', () => {
  // Equals/contains/begins-with present.
  it('contains "equals", "contains", "begins with" options', () => {
    renderDialog({ dataType: 'text' });
    const select = op1();
    const optionTexts = Array.from(select.options).map((o) => o.text);
    expect(optionTexts).toContain('equals');
    expect(optionTexts).toContain('contains');
    expect(optionTexts).toContain('begins with');
  });

  // Ends-with, does-not-equal, and the isNull/isNotNull pair present.
  it('contains "ends with", "does not equal", "is empty", "is not empty"', () => {
    renderDialog({ dataType: 'text' });
    const optionTexts = Array.from(op1().options).map((o) => o.text);
    expect(optionTexts).toContain('ends with');
    expect(optionTexts).toContain('does not equal');
    expect(optionTexts).toContain('is empty');
    expect(optionTexts).toContain('is not empty');
  });
});

// ---------------------------------------------------------------------------
// Number dataType operators
// ---------------------------------------------------------------------------

// Number operator list: includes comparison operators and `between`.
describe('FilterConditionDialog — number operators', () => {
  // Greater-than and between options present.
  it('contains "is greater than" and "is between"', () => {
    renderDialog({ dataType: 'number' });
    const optionTexts = Array.from(op1().options).map((o) => o.text);
    expect(optionTexts).toContain('is greater than');
    expect(optionTexts).toContain('is between');
  });

  // Picking `between` reveals a second input and an "and" separator.
  it('"is between" reveals a second value input with "and" separator', () => {
    renderDialog({ dataType: 'number' });
    fireEvent.change(op1(), { target: { value: 'between' } });
    expect(screen.getByTestId('filter-cond-val-1')).toBeTruthy();
    expect(screen.getByTestId('filter-cond-val-1-b')).toBeTruthy();
    expect(screen.getByText('and')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Date dataType operators
// ---------------------------------------------------------------------------

// Date operator list: Excel relabels comparisons as before/after.
describe('FilterConditionDialog — date operators', () => {
  // Date-specific labels are used.
  it('uses "is after", "is before", "is between" labels', () => {
    renderDialog({ dataType: 'date' });
    const optionTexts = Array.from(op1().options).map((o) => o.text);
    expect(optionTexts).toContain('is after');
    expect(optionTexts).toContain('is before');
    expect(optionTexts).toContain('is between');
  });

  // Date columns use a native date picker.
  it('value input is type="date"', () => {
    renderDialog({ dataType: 'date' });
    fireEvent.change(op1(), { target: { value: 'eq' } });
    expect(val1().type).toBe('date');
  });
});

// ---------------------------------------------------------------------------
// isNull / isNotNull — hides value input
// ---------------------------------------------------------------------------

// isNull / isNotNull: no value input; OK emits a `value: null` descriptor.
describe('FilterConditionDialog — is empty / is not empty', () => {
  // Value input disappears for noValue operators.
  it('"is empty" hides the value input', () => {
    renderDialog({ dataType: 'text' });
    fireEvent.change(op1(), { target: { value: 'isNull' } });
    expect(screen.queryByTestId('filter-cond-val-1')).toBeNull();
  });

  // Single-clause isNull emits a one-filter composite with `value: null`.
  it('"is empty" OK fires onApply with isNull descriptor', () => {
    const { onApply } = renderDialog({ dataType: 'text', field: 'name' });
    fireEvent.change(op1(), { target: { value: 'isNull' } });
    fireEvent.click(okBtn());
    expect(onApply).toHaveBeenCalledWith({
      logic: 'and',
      filters: [{ field: 'name', operator: 'isNull', value: null }],
    });
  });
});

// ---------------------------------------------------------------------------
// Two-clause AND
// ---------------------------------------------------------------------------

// Two-clause AND: default logic; both clauses are combined with `and`.
describe('FilterConditionDialog — two-clause AND', () => {
  // Composite predicate uses logic: 'and' and preserves input order.
  it('builds correct composite filter with And logic', () => {
    const { onApply } = renderDialog({ dataType: 'text', field: 'name' });

    // Row 1: contains "foo"
    fireEvent.change(op1(), { target: { value: 'contains' } });
    fireEvent.change(val1(), { target: { value: 'foo' } });

    // Row 2: equals "bar"
    fireEvent.change(op2(), { target: { value: 'eq' } });
    fireEvent.change(val2(), { target: { value: 'bar' } });

    // Ensure "And" is selected (it's the default)
    expect((screen.getByTestId('filter-cond-and') as HTMLInputElement).checked).toBe(true);

    fireEvent.click(okBtn());

    expect(onApply).toHaveBeenCalledWith({
      logic: 'and',
      filters: [
        { field: 'name', operator: 'contains', value: 'foo' },
        { field: 'name', operator: 'eq', value: 'bar' },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// Two-clause OR
// ---------------------------------------------------------------------------

// Two-clause OR: switching the radio changes the composite's `logic` field.
describe('FilterConditionDialog — two-clause OR', () => {
  // Selecting the Or radio produces a composite with logic: 'or'.
  it('builds correct composite filter with Or logic', () => {
    const { onApply } = renderDialog({ dataType: 'text', field: 'name' });

    fireEvent.change(op1(), { target: { value: 'contains' } });
    fireEvent.change(val1(), { target: { value: 'foo' } });

    fireEvent.change(op2(), { target: { value: 'eq' } });
    fireEvent.change(val2(), { target: { value: 'bar' } });

    fireEvent.click(screen.getByTestId('filter-cond-or'));

    fireEvent.click(okBtn());

    expect(onApply).toHaveBeenCalledWith({
      logic: 'or',
      filters: [
        { field: 'name', operator: 'contains', value: 'foo' },
        { field: 'name', operator: 'eq', value: 'bar' },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// OK with both rows empty → clear filter
// ---------------------------------------------------------------------------

// Clear filter: an OK click with no complete clauses resolves to null,
// signalling the caller to drop this field's predicate.
describe('FilterConditionDialog — clear filter', () => {
  // Empty form → onApply(null).
  it('calls onApply(null) when both rows are empty', () => {
    const { onApply } = renderDialog();
    fireEvent.click(okBtn());
    expect(onApply).toHaveBeenCalledWith(null);
  });
});

// ---------------------------------------------------------------------------
// Cancel
// ---------------------------------------------------------------------------

// Cancel button: closes without emitting a new predicate.
describe('FilterConditionDialog — cancel', () => {
  // Cancel fires onClose only, never onApply.
  it('calls onClose without calling onApply when Cancel is clicked', () => {
    const { onApply, onClose } = renderDialog();
    fireEvent.click(cancelBtn());
    expect(onClose).toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Backdrop click
// ---------------------------------------------------------------------------

// Backdrop: uses `onMouseDown` (not `onClick`) to avoid a race where the
// backdrop press + dialog release would fire a click that would also
// trigger close on the underlying elements.
describe('FilterConditionDialog — backdrop click', () => {
  // Mousedown on the backdrop closes.
  it('calls onClose when backdrop is mouse-pressed', () => {
    const { onClose } = renderDialog();
    fireEvent.mouseDown(screen.getByTestId('filter-cond-backdrop'));
    expect(onClose).toHaveBeenCalled();
  });

  // Mousedown inside the dialog must not dismiss it.
  it('does not call onClose when dialog body is mouse-pressed', () => {
    const { onClose } = renderDialog();
    fireEvent.mouseDown(screen.getByTestId('filter-cond-dialog'));
    expect(onClose).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Escape key
// ---------------------------------------------------------------------------

// Escape: dismiss channel matching other menus in the grid.
describe('FilterConditionDialog — escape key', () => {
  // Pressing Escape closes.
  it('calls onClose when Escape is pressed', () => {
    const { onClose } = renderDialog();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// initial prop preloads form
// ---------------------------------------------------------------------------

// Initial prop: preloads the form on open only; mid-session prop changes
// must not clobber in-flight edits (that guarantee is enforced by the
// `initialRef` pattern in the component; these tests check the seeding).
describe('FilterConditionDialog — initial prop', () => {
  // Single-clause initial populates row 1.
  it('preloads row 1 operator and value from initial', () => {
    const initial: CompositeFilterDescriptor = {
      logic: 'or',
      filters: [{ field: 'name', operator: 'eq', value: 'X' }],
    };
    renderDialog({ initial, dataType: 'text' });

    const select = op1();
    expect(select.value).toBe('eq');
    expect(val1().value).toBe('X');
  });

  // Composite `logic` drives the And/Or radio selection on open.
  it('preloads Or radio when initial.logic is "or"', () => {
    const initial: CompositeFilterDescriptor = {
      logic: 'or',
      filters: [
        { field: 'name', operator: 'eq', value: 'X' },
        { field: 'name', operator: 'contains', value: 'Y' },
      ],
    };
    renderDialog({ initial, dataType: 'text' });

    expect((screen.getByTestId('filter-cond-or') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId('filter-cond-and') as HTMLInputElement).checked).toBe(false);
  });

  // Two-clause initial populates both rows in order.
  it('preloads both rows from initial two-clause filter', () => {
    const initial: CompositeFilterDescriptor = {
      logic: 'and',
      filters: [
        { field: 'name', operator: 'startsWith', value: 'A' },
        { field: 'name', operator: 'endsWith', value: 'Z' },
      ],
    };
    renderDialog({ initial, dataType: 'text' });

    expect(op1().value).toBe('startsWith');
    expect(val1().value).toBe('A');
    expect(op2().value).toBe('endsWith');
    expect(val2().value).toBe('Z');
  });
});

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------

// Accessibility: modal ARIA attributes, the disabled placeholder option
// on the operator select, and focus lands on the first operator on open.
describe('FilterConditionDialog — accessibility', () => {
  // Dialog carries role="dialog" and aria-modal="true".
  it('marks the dialog with aria-modal="true"', () => {
    renderDialog();
    const dialog = screen.getByTestId('filter-cond-dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('role')).toBe('dialog');
  });

  // Placeholder "-- select --" is disabled so it can't be committed.
  it('disables the placeholder "-- select --" option', () => {
    renderDialog();
    const placeholder = Array.from(op1().options).find((o) => o.value === '');
    expect(placeholder).toBeTruthy();
    expect(placeholder!.disabled).toBe(true);
  });

  // Focus is pushed to the first operator select after the portal mounts
  // (the component uses a setTimeout(0) to wait for the render).
  it('focuses the first operator select when opened', async () => {
    renderDialog();
    // Focus is moved on the next tick (setTimeout 0).
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(document.activeElement).toBe(op1());
  });
});

// ---------------------------------------------------------------------------
// Between validation
// ---------------------------------------------------------------------------

// Between validation: a half-filled between range is silently dropped.
// When it is the only clause, OK emits null (clear this field's filter).
describe('FilterConditionDialog — between validation', () => {
  // Missing upper bound → clause is skipped → null is emitted.
  it('does not emit a between descriptor with an empty second value', () => {
    const { onApply } = renderDialog({ dataType: 'number', field: 'age' });

    fireEvent.change(op1(), { target: { value: 'between' } });
    fireEvent.change(val1(), { target: { value: '5' } });
    // Intentionally leave the second value empty.

    fireEvent.click(okBtn());

    // The half-filled between is invalid and should not produce a descriptor.
    // Since it was the only condition, onApply should be called with null.
    expect(onApply).toHaveBeenCalledWith(null);
    // And it must not have produced a descriptor with an empty value2.
    const calls = onApply.mock.calls;
    for (const [arg] of calls) {
      if (arg && typeof arg === 'object') {
        for (const f of arg.filters) {
          expect(f.value).not.toEqual(['5', '']);
        }
      }
    }
  });
});
