import {
  createEditingState,
  beginEdit,
  updateEditValue,
  commitEdit,
  cancelEdit,
  isEditing,
  isEditingCell,
} from '../editing';
import { ColumnDef } from '../types';

const cell = { rowId: 'r1', field: 'name' };
const otherCell = { rowId: 'r2', field: 'age' };

describe('createEditingState', () => {
  it('initializes with null cell and null values', () => {
    const s = createEditingState();
    expect(s.cell).toBeNull();
    expect(s.originalValue).toBeNull();
    expect(s.currentValue).toBeNull();
    expect(s.isValid).toBe(true);
    expect(s.validationError).toBeNull();
    expect(s.cause).toBeNull();
  });
});

describe('beginEdit', () => {
  it('sets cell address and initial value', () => {
    const s = beginEdit(createEditingState(), cell, 'Alice');
    expect(s.cell).toEqual(cell);
    expect(s.originalValue).toBe('Alice');
    expect(s.currentValue).toBe('Alice');
  });

  it('clears any prior validation error', () => {
    const prior = { ...createEditingState(), validationError: { message: 'bad', severity: 'error' as const }, isValid: false };
    const s = beginEdit(prior, cell, 'new');
    expect(s.isValid).toBe(true);
    expect(s.validationError).toBeNull();
  });

  it('accepts null as initial value', () => {
    const s = beginEdit(createEditingState(), cell, null);
    expect(s.originalValue).toBeNull();
    expect(s.currentValue).toBeNull();
  });

  it('accepts numeric initial value', () => {
    const s = beginEdit(createEditingState(), cell, 42);
    expect(s.originalValue).toBe(42);
  });

  // Issue #133 — every begin-edit code-path threads its `cause` through
  // so editor mount lifecycles know whether to take over input
  // selection. `'typeToEdit'` is the only cause that opts out of
  // `DataGridBody`'s mount-time `select()`; every other cause must
  // keep the existing "highlight existing value so next keystroke
  // replaces" behaviour.
  it('defaults cause to "programmatic" when caller omits it (back-compat)', () => {
    const s = beginEdit(createEditingState(), cell, 'x');
    expect(s.cause).toBe('programmatic');
  });

  it('records the provided cause for typeToEdit (race-fix path)', () => {
    const s = beginEdit(createEditingState(), cell, 'x', 'typeToEdit');
    expect(s.cause).toBe('typeToEdit');
  });

  it('records the provided cause for dblclick', () => {
    const s = beginEdit(createEditingState(), cell, 'x', 'dblclick');
    expect(s.cause).toBe('dblclick');
  });

  it('records the provided cause for f2', () => {
    const s = beginEdit(createEditingState(), cell, 'x', 'f2');
    expect(s.cause).toBe('f2');
  });

  it('records the provided cause for enter', () => {
    const s = beginEdit(createEditingState(), cell, 'x', 'enter');
    expect(s.cause).toBe('enter');
  });

  it('records the provided cause for click (excel-mode)', () => {
    const s = beginEdit(createEditingState(), cell, 'x', 'click');
    expect(s.cause).toBe('click');
  });
});

describe('updateEditValue', () => {
  it('updates currentValue', () => {
    const s = beginEdit(createEditingState(), cell, 'Alice');
    const updated = updateEditValue(s, 'Bob');
    expect(updated.currentValue).toBe('Bob');
  });

  it('preserves originalValue', () => {
    const s = beginEdit(createEditingState(), cell, 'Alice');
    const updated = updateEditValue(s, 'Bob');
    expect(updated.originalValue).toBe('Alice');
  });

  it('runs column validation and captures error', () => {
    const col: ColumnDef = {
      id: 'c1', field: 'name', title: 'Name',
      validators: [
        {
          name: 'required',
          run: v => (v === '' ? { message: 'Required', severity: 'error' } : null),
        },
      ],
    };
    const s = beginEdit(createEditingState(), cell, 'Alice');
    const updated = updateEditValue(s, '', col);
    expect(updated.isValid).toBe(false);
    expect(updated.validationError).toEqual({ message: 'Required', severity: 'error' });
  });

  it('marks valid when validation passes', () => {
    const col: ColumnDef = {
      id: 'c1', field: 'name', title: 'Name',
      validators: [
        {
          name: 'required',
          run: v => (v === '' ? { message: 'Required', severity: 'error' } : null),
        },
      ],
    };
    const s = beginEdit(createEditingState(), cell, '');
    const withError = updateEditValue(s, '', col);
    expect(withError.isValid).toBe(false);
    const fixed = updateEditValue(withError, 'Bob', col);
    expect(fixed.isValid).toBe(true);
    expect(fixed.validationError).toBeNull();
  });

  it('treats warning-severity validation as still valid', () => {
    const col: ColumnDef = {
      id: 'c1', field: 'name', title: 'Name',
      validators: [
        {
          name: 'warn',
          run: () => ({ message: 'Watch out', severity: 'warning' }),
        },
      ],
    };
    const s = beginEdit(createEditingState(), cell, 'x');
    const updated = updateEditValue(s, 'y', col);
    expect(updated.isValid).toBe(true);
    expect(updated.validationError).toEqual({ message: 'Watch out', severity: 'warning' });
  });

  it('skips validation when no column provided', () => {
    const s = beginEdit(createEditingState(), cell, 'Alice');
    const updated = updateEditValue(s, '');
    expect(updated.isValid).toBe(true);
    expect(updated.validationError).toBeNull();
  });
});

describe('commitEdit', () => {
  it('returns cell and value when state is valid', () => {
    const s = updateEditValue(beginEdit(createEditingState(), cell, 'Alice'), 'Bob');
    const result = commitEdit(s);
    expect(result).toEqual({ value: 'Bob', cell });
  });

  it('returns null when no cell is being edited', () => {
    expect(commitEdit(createEditingState())).toBeNull();
  });

  it('returns null when state is invalid', () => {
    const col: ColumnDef = {
      id: 'c1', field: 'name', title: 'Name',
      validators: [
        {
          name: 'required',
          run: () => ({ message: 'Required', severity: 'error' }),
        },
      ],
    };
    const s = updateEditValue(beginEdit(createEditingState(), cell, 'Alice'), '', col);
    expect(commitEdit(s)).toBeNull();
  });
});

describe('cancelEdit', () => {
  it('resets state to initial empty state', () => {
    const s = beginEdit(createEditingState(), cell, 'Alice');
    const cancelled = cancelEdit(s);
    expect(cancelled.cell).toBeNull();
    expect(cancelled.currentValue).toBeNull();
    expect(cancelled.originalValue).toBeNull();
  });

  // Issue #133 regression guard — without this, a cancelled
  // `'typeToEdit'` would leak into the next edit's mount and silence
  // the body's `select()` on (e.g.) the next dblclick.
  it('clears the cause back to null so the next begin-edit starts fresh', () => {
    const s = beginEdit(createEditingState(), cell, 'Alice', 'typeToEdit');
    expect(s.cause).toBe('typeToEdit');
    const cancelled = cancelEdit(s);
    expect(cancelled.cause).toBeNull();
  });
});

describe('isEditing', () => {
  it('returns false when no cell is set', () => {
    expect(isEditing(createEditingState())).toBe(false);
  });

  it('returns true when a cell is set', () => {
    expect(isEditing(beginEdit(createEditingState(), cell, 'x'))).toBe(true);
  });
});

describe('isEditingCell', () => {
  it('returns true for the exact cell being edited', () => {
    const s = beginEdit(createEditingState(), cell, 'x');
    expect(isEditingCell(s, cell)).toBe(true);
  });

  it('returns false for a different cell', () => {
    const s = beginEdit(createEditingState(), cell, 'x');
    expect(isEditingCell(s, otherCell)).toBe(false);
  });

  it('returns false when not editing', () => {
    expect(isEditingCell(createEditingState(), cell)).toBe(false);
  });

  it('returns false when only rowId matches', () => {
    const s = beginEdit(createEditingState(), cell, 'x');
    expect(isEditingCell(s, { rowId: 'r1', field: 'age' })).toBe(false);
  });

  it('returns false when only field matches', () => {
    const s = beginEdit(createEditingState(), cell, 'x');
    expect(isEditingCell(s, { rowId: 'r2', field: 'name' })).toBe(false);
  });
});
