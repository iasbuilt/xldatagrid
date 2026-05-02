/**
 * Integration tests for the React DataGrid validation pipeline.
 *
 * This file targets the *grid-wiring* side of validation: that commits flow
 * through `ColumnDef.validators`, that error-severity results block the
 * commit from being treated as clean, and that the ghost row surfaces
 * per-column errors. The portal-tooltip rendering contract lives in
 * `validation-tooltip.test.tsx`; we reference the tooltip node only as a
 * proxy for "an invalid result was captured" here.
 *
 * The assertions use the modern tooltip-portal DOM shape: tooltips are
 * queried on `document.body` via `[role="tooltip"][data-validation-target]`
 * and messages via `[data-validation-message]`. The legacy inline
 * `[data-testid="validation-error-*"]` span has been removed from the
 * implementation; any reference to it here is intentionally a
 * `queryByTestId(...)`-style negative assertion.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { DataGrid, DataGridProps } from '../DataGrid';
import {
  ColumnDef,
  CellValue,
  ValidationResult,
  Validator,
} from '@iasbuilt/datagrid-core';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

type TestRow = { id: string; name: string; age: number; email: string };

function makeData(): TestRow[] {
  return [
    { id: '1', name: 'Alice', age: 30, email: 'alice@test.com' },
    { id: '2', name: 'Bob', age: 25, email: 'bob@test.com' },
    { id: '3', name: '', age: 35, email: '' },
  ];
}

// Validator factories returning the new `Validator<TestRow>` shape. The
// `run` signature is `(value, ctx) => ValidationResult | null`; ctx is
// unused by the length/range validators but documented for readers.

const requiredValidator: Validator<TestRow> = {
  name: 'required',
  run: (value: CellValue): ValidationResult | null => {
    if (value == null || String(value).trim() === '') {
      return { message: 'This field is required', severity: 'error' };
    }
    return null;
  },
};

function minLengthValidator(min: number): Validator<TestRow> {
  return {
    name: `minLength(${min})`,
    run: (value: CellValue): ValidationResult | null => {
      if (value != null && String(value).length < min) {
        return { message: `Minimum length is ${min}`, severity: 'error' };
      }
      return null;
    },
  };
}

function maxLengthValidator(max: number): Validator<TestRow> {
  return {
    name: `maxLength(${max})`,
    run: (value: CellValue): ValidationResult | null => {
      if (value != null && String(value).length > max) {
        return { message: `Maximum length is ${max}`, severity: 'error' };
      }
      return null;
    },
  };
}

function minValueValidator(min: number): Validator<TestRow> {
  return {
    name: `minValue(${min})`,
    run: (value: CellValue): ValidationResult | null => {
      if (value != null && Number(value) < min) {
        return { message: `Value must be at least ${min}`, severity: 'error' };
      }
      return null;
    },
  };
}

function maxValueValidator(max: number): Validator<TestRow> {
  return {
    name: `maxValue(${max})`,
    run: (value: CellValue): ValidationResult | null => {
      if (value != null && Number(value) > max) {
        return { message: `Value must be at most ${max}`, severity: 'error' };
      }
      return null;
    },
  };
}

function makeColumns(overrides: Partial<ColumnDef<TestRow>>[] = []): ColumnDef<TestRow>[] {
  const base: ColumnDef<TestRow>[] = [
    { id: 'name', field: 'name', title: 'Name' },
    { id: 'age', field: 'age', title: 'Age' },
    { id: 'email', field: 'email', title: 'Email' },
  ];
  return base.map((col, i) => ({ ...col, ...(overrides[i] ?? {}) }));
}

function renderGrid(overrides: Partial<DataGridProps<TestRow>> = {}) {
  return render(
    <DataGrid
      data={makeData()}
      columns={makeColumns()}
      rowKey="id"
      {...(overrides as any)}
    />,
  );
}

// DOM helpers. Tooltip nodes are portalled into `document.body`; their text
// content is the concatenation of every `[data-validation-message]` child,
// which is the canonical "error messaging surface" now.

function findTooltip(rowId: string, field: string): HTMLElement | null {
  return document.body.querySelector(
    `[role="tooltip"][data-validation-target="${rowId}:${field}"]`,
  ) as HTMLElement | null;
}

function tooltipMessages(rowId: string, field: string): string[] {
  const tip = findTooltip(rowId, field);
  if (!tip) return [];
  return Array.from(tip.querySelectorAll('[data-validation-message]')).map(
    (n) => n.textContent ?? '',
  );
}

// ---------------------------------------------------------------------------
// Validation Tests
// ---------------------------------------------------------------------------

describe('validation — required fields', () => {
  it('shows error tooltip on empty commit', async () => {
    const columns = makeColumns([{ validators: [requiredValidator] }]);
    render(
      <DataGrid data={makeData()} columns={columns} rowKey="id" />,
    );
    const cells = screen.getAllByRole('gridcell');
    const emptyNameCell = cells.find(
      c => c.getAttribute('data-field') === 'name' && c.getAttribute('data-row-id') === '3',
    )!;
    fireEvent.dblClick(emptyNameCell);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(findTooltip('3', 'name')).not.toBeNull();
    });
    expect(tooltipMessages('3', 'name')).toContain('This field is required');
  });

  it('allows commit with a non-empty value', () => {
    const columns = makeColumns([{ validators: [requiredValidator] }]);
    const onCellEdit = vi.fn();
    render(
      <DataGrid data={makeData()} columns={columns} rowKey="id" onCellEdit={onCellEdit} />,
    );
    const cells = screen.getAllByRole('gridcell');
    const nameCell = cells.find(
      c => c.getAttribute('data-field') === 'name' && c.getAttribute('data-row-id') === '1',
    )!;
    fireEvent.dblClick(nameCell);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'ValidName' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCellEdit).toHaveBeenCalledWith('1', 'name', 'ValidName', 'Alice');
  });
});

describe('validation — length constraints', () => {
  it('min length shows tooltip when too short', async () => {
    const columns = makeColumns([{ validators: [minLengthValidator(3)] }]);
    render(
      <DataGrid data={makeData()} columns={columns} rowKey="id" />,
    );
    const nameCell = screen.getAllByRole('gridcell').find(
      c => c.getAttribute('data-field') === 'name' && c.getAttribute('data-row-id') === '1',
    )!;
    fireEvent.dblClick(nameCell);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'AB' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(tooltipMessages('1', 'name')).toContain('Minimum length is 3');
    });
  });

  it('max length shows tooltip when too long', async () => {
    const columns = makeColumns([{ validators: [maxLengthValidator(5)] }]);
    render(
      <DataGrid data={makeData()} columns={columns} rowKey="id" />,
    );
    const nameCell = screen.getAllByRole('gridcell').find(
      c => c.getAttribute('data-field') === 'name' && c.getAttribute('data-row-id') === '1',
    )!;
    fireEvent.dblClick(nameCell);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'VeryLongName' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(tooltipMessages('1', 'name')).toContain('Maximum length is 5');
    });
  });
});

describe('validation — numeric constraints', () => {
  it('min value shows tooltip when below minimum', async () => {
    const columns = makeColumns([{}, { validators: [minValueValidator(18)] }]);
    render(
      <DataGrid data={makeData()} columns={columns} rowKey="id" />,
    );
    const ageCell = screen.getAllByRole('gridcell').find(
      c => c.getAttribute('data-field') === 'age' && c.getAttribute('data-row-id') === '1',
    )!;
    fireEvent.dblClick(ageCell);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '10' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(tooltipMessages('1', 'age')).toContain('Value must be at least 18');
    });
  });

  it('max value shows tooltip when above maximum', async () => {
    const columns = makeColumns([{}, { validators: [maxValueValidator(100)] }]);
    render(
      <DataGrid data={makeData()} columns={columns} rowKey="id" />,
    );
    const ageCell = screen.getAllByRole('gridcell').find(
      c => c.getAttribute('data-field') === 'age' && c.getAttribute('data-row-id') === '1',
    )!;
    fireEvent.dblClick(ageCell);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '150' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(tooltipMessages('1', 'age')).toContain('Value must be at most 100');
    });
  });
});

describe('validation — custom validator', () => {
  it('custom validator receives the committed value', () => {
    const runSpy = vi.fn().mockReturnValue(null);
    const customValidator: Validator<TestRow> = { name: 'custom', run: runSpy };
    const columns = makeColumns([{ validators: [customValidator] }]);
    render(
      <DataGrid data={makeData()} columns={columns} rowKey="id" />,
    );
    const nameCell = screen.getAllByRole('gridcell').find(
      c => c.getAttribute('data-field') === 'name' && c.getAttribute('data-row-id') === '1',
    )!;
    fireEvent.dblClick(nameCell);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Test' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(runSpy).toHaveBeenCalled();
    expect(runSpy.mock.calls[0]?.[0]).toBe('Test');
  });

  it('custom validator returns error message on failure', async () => {
    const customValidator: Validator<TestRow> = {
      name: 'custom',
      run: () => ({ message: 'Custom error', severity: 'error' }),
    };
    const columns = makeColumns([{ validators: [customValidator] }]);
    render(
      <DataGrid data={makeData()} columns={columns} rowKey="id" />,
    );
    const nameCell = screen.getAllByRole('gridcell').find(
      c => c.getAttribute('data-field') === 'name' && c.getAttribute('data-row-id') === '1',
    )!;
    fireEvent.dblClick(nameCell);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'bad' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(tooltipMessages('1', 'name')).toContain('Custom error');
    });
  });

  it('custom validator returning null leaves the cell clean', () => {
    const passing: Validator<TestRow> = {
      name: 'pass',
      run: () => null,
    };
    const onCellEdit = vi.fn();
    const columns = makeColumns([{ validators: [passing] }]);
    render(
      <DataGrid data={makeData()} columns={columns} rowKey="id" onCellEdit={onCellEdit} />,
    );
    const nameCell = screen.getAllByRole('gridcell').find(
      c => c.getAttribute('data-field') === 'name' && c.getAttribute('data-row-id') === '1',
    )!;
    fireEvent.dblClick(nameCell);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'GoodValue' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCellEdit).toHaveBeenCalled();
    expect(findTooltip('1', 'name')).toBeNull();
  });
});

describe('validation — multiple validators', () => {
  it('emits the first error when required precedes minLength', async () => {
    const columns = makeColumns([
      { validators: [requiredValidator, minLengthValidator(3)] },
    ]);
    render(
      <DataGrid data={makeData()} columns={columns} rowKey="id" />,
    );
    const nameCell = screen.getAllByRole('gridcell').find(
      c => c.getAttribute('data-field') === 'name' && c.getAttribute('data-row-id') === '1',
    )!;
    fireEvent.dblClick(nameCell);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(tooltipMessages('1', 'name')).toContain('This field is required');
    });
  });

  it('runs every validator in declaration order', async () => {
    const run1 = vi.fn().mockReturnValue({ message: 'Error 1', severity: 'error' });
    const run2 = vi.fn().mockReturnValue({ message: 'Error 2', severity: 'error' });
    const v1: Validator<TestRow> = { name: 'v1', run: run1 };
    const v2: Validator<TestRow> = { name: 'v2', run: run2 };
    const columns = makeColumns([{ validators: [v1, v2] }]);
    render(
      <DataGrid data={makeData()} columns={columns} rowKey="id" />,
    );
    const nameCell = screen.getAllByRole('gridcell').find(
      c => c.getAttribute('data-field') === 'name' && c.getAttribute('data-row-id') === '1',
    )!;
    fireEvent.dblClick(nameCell);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'test' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    // Both validators execute; both messages reach the tooltip.
    expect(run1).toHaveBeenCalled();
    expect(run2).toHaveBeenCalled();
    await waitFor(() => {
      expect(tooltipMessages('1', 'name')).toEqual(['Error 1', 'Error 2']);
    });
  });
});

describe('validation — error display', () => {
  it('clears the tooltip when the value is corrected', async () => {
    const columns = makeColumns([{ validators: [requiredValidator] }]);
    render(
      <DataGrid data={makeData()} columns={columns} rowKey="id" />,
    );
    const nameCell = screen.getAllByRole('gridcell').find(
      c => c.getAttribute('data-field') === 'name' && c.getAttribute('data-row-id') === '1',
    )!;
    fireEvent.dblClick(nameCell);
    let input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(findTooltip('1', 'name')).not.toBeNull());

    const invalidCell = screen.getAllByRole('gridcell').find(
      c => c.getAttribute('data-field') === 'name' && c.getAttribute('data-row-id') === '1',
    )!;
    fireEvent.dblClick(invalidCell);
    input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Fixed' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(findTooltip('1', 'name')).toBeNull());
  });

  it('marks the invalid cell aria-invalid=true', async () => {
    const columns = makeColumns([{ validators: [requiredValidator] }]);
    render(
      <DataGrid data={makeData()} columns={columns} rowKey="id" />,
    );
    const nameCell = screen.getAllByRole('gridcell').find(
      c => c.getAttribute('data-field') === 'name' && c.getAttribute('data-row-id') === '1',
    )!;
    fireEvent.dblClick(nameCell);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      const invalid = screen.getAllByRole('gridcell').find(
        c => c.getAttribute('data-field') === 'name' && c.getAttribute('data-row-id') === '1',
      )!;
      expect(invalid).toHaveAttribute('aria-invalid', 'true');
      expect(invalid).toHaveAttribute('data-validation-severity', 'error');
    });
  });
});

describe('validation — callbacks', () => {
  it('fires onValidationError on error commit', async () => {
    const onValidationError = vi.fn();
    const columns = makeColumns([{ validators: [requiredValidator] }]);
    render(
      <DataGrid
        data={makeData()}
        columns={columns}
        rowKey="id"
        {...({ onValidationError } as any)}
      />,
    );
    const nameCell = screen.getAllByRole('gridcell').find(
      c => c.getAttribute('data-field') === 'name' && c.getAttribute('data-row-id') === '1',
    )!;
    fireEvent.dblClick(nameCell);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onValidationError).toHaveBeenCalledWith(
      { rowId: '1', field: 'name' },
      expect.objectContaining({ message: 'This field is required', severity: 'error' }),
    );
  });
});

describe('validation — ghost row', () => {
  it('blocks row creation when a required ghost cell is empty', () => {
    const onRowAdd = vi.fn();
    const columns = makeColumns([{ validators: [requiredValidator] }]);
    render(
      <DataGrid
        data={makeData()}
        columns={columns}
        rowKey="id"
        ghostRow={true}
        onRowAdd={onRowAdd}
      />,
    );
    const ghostRow = screen.getByTestId('ghost-row');
    expect(ghostRow).toBeInTheDocument();
    const ghostEmailInput = screen.getByLabelText('Email ghost cell');
    fireEvent.change(ghostEmailInput, { target: { value: 'test@test.com' } });
    fireEvent.keyDown(ghostEmailInput, { key: 'Enter' });
    expect(screen.getByTestId('ghost-error-name')).toBeInTheDocument();
    expect(onRowAdd).not.toHaveBeenCalled();
  });

  it('highlights the invalid required ghost field with its message', () => {
    const columns = makeColumns([{ validators: [requiredValidator] }]);
    render(
      <DataGrid
        data={makeData()}
        columns={columns}
        rowKey="id"
        ghostRow={true}
      />,
    );
    const ghostEmailInput = screen.getByLabelText('Email ghost cell');
    fireEvent.change(ghostEmailInput, { target: { value: 'x@x.com' } });
    fireEvent.keyDown(ghostEmailInput, { key: 'Enter' });
    const errorEl = screen.getByTestId('ghost-error-name');
    expect(errorEl.textContent).toBe('This field is required');
  });
});

describe('validation — async-shaped validators', () => {
  it('rejects a taken value synchronously', async () => {
    const notTaken: Validator<TestRow> = {
      name: 'uniqueness',
      run: (value: CellValue): ValidationResult | null =>
        String(value) === 'taken'
          ? { message: 'This value is already taken', severity: 'error' }
          : null,
    };
    const columns = makeColumns([{ validators: [notTaken] }]);
    render(
      <DataGrid data={makeData()} columns={columns} rowKey="id" />,
    );
    const nameCell = screen.getAllByRole('gridcell').find(
      c => c.getAttribute('data-field') === 'name' && c.getAttribute('data-row-id') === '1',
    )!;
    fireEvent.dblClick(nameCell);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'taken' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(tooltipMessages('1', 'name')).toContain('This value is already taken');
    });
  });
});

describe('validation — column-level config', () => {
  it('column-scoped validators apply only to that column', async () => {
    const emailValidator: Validator<TestRow> = {
      name: 'email',
      run: (value: CellValue): ValidationResult | null =>
        value != null && !String(value).includes('@')
          ? { message: 'Invalid email format', severity: 'error' }
          : null,
    };
    const columns = makeColumns([{}, {}, { validators: [emailValidator] }]);
    render(
      <DataGrid data={makeData()} columns={columns} rowKey="id" />,
    );
    const emailCell = screen.getAllByRole('gridcell').find(
      c => c.getAttribute('data-field') === 'email' && c.getAttribute('data-row-id') === '1',
    )!;
    fireEvent.dblClick(emailCell);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'not-an-email' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(tooltipMessages('1', 'email')).toContain('Invalid email format');
    });
  });
});

describe('validation — paste and import', () => {
  it('validation runs when blurring the inline editor', async () => {
    const columns = makeColumns([{ validators: [requiredValidator] }]);
    render(
      <DataGrid data={makeData()} columns={columns} rowKey="id" />,
    );
    const nameCell = screen.getAllByRole('gridcell').find(
      c => c.getAttribute('data-field') === 'name' && c.getAttribute('data-row-id') === '1',
    )!;
    fireEvent.dblClick(nameCell);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    await waitFor(() => {
      expect(tooltipMessages('1', 'name')).toContain('This field is required');
    });
  });

  it('numeric validators run on blur too', async () => {
    const columns = makeColumns([{}, { validators: [minValueValidator(0)] }]);
    render(
      <DataGrid data={makeData()} columns={columns} rowKey="id" />,
    );
    const ageCell = screen.getAllByRole('gridcell').find(
      c => c.getAttribute('data-field') === 'age' && c.getAttribute('data-row-id') === '1',
    )!;
    fireEvent.dblClick(ageCell);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '-5' } });
    fireEvent.blur(input);
    await waitFor(() => {
      expect(tooltipMessages('1', 'age')).toContain('Value must be at least 0');
    });
  });
});
