import { vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import { ChipSelectCell } from '../ChipSelectCell';
import type { ColumnDef, CellValue } from '@iasbuilt/datagrid-core';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeColumn(overrides: Partial<ColumnDef> = {}): ColumnDef {
  return { id: 'col1', field: 'col1', title: 'Column 1', ...overrides };
}

function makeProps(overrides: {
  value?: CellValue;
  column?: Partial<ColumnDef>;
  isEditing?: boolean;
  onCommit?: (v: CellValue) => void;
  onCancel?: () => void;
}) {
  return {
    value: overrides.value ?? null,
    row: {},
    column: makeColumn(overrides.column),
    rowIndex: 0,
    isEditing: overrides.isEditing ?? false,
    onCommit: overrides.onCommit ?? vi.fn(),
    onCancel: overrides.onCancel ?? vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// ChipSelectCell fixtures
// ---------------------------------------------------------------------------

const chipOptions = [
  { value: 'red', label: 'Red' },
  { value: 'green', label: 'Green' },
  { value: 'blue', label: 'Blue' },
];

// ---------------------------------------------------------------------------
// ChipSelectCell
// ---------------------------------------------------------------------------

describe('ChipSelectCell', () => {
  it('renders chips for selected values in display mode', () => {
    render(<ChipSelectCell {...makeProps({ value: ['red', 'blue'], column: { options: chipOptions } })} />);
    expect(screen.getByText('Red')).toBeInTheDocument();
    expect(screen.getByText('Blue')).toBeInTheDocument();
  });

  it('renders placeholder when value is empty array', () => {
    render(<ChipSelectCell {...makeProps({ value: [], column: { options: chipOptions, placeholder: 'Pick colors' } })} />);
    expect(screen.getByText('Pick colors')).toBeInTheDocument();
  });

  it('renders placeholder when value is null', () => {
    render(<ChipSelectCell {...makeProps({ value: null, column: { options: chipOptions } })} />);
    expect(screen.getByText(/select/i)).toBeInTheDocument();
  });

  it('does not show dropdown when not editing', () => {
    render(<ChipSelectCell {...makeProps({ value: ['red'], column: { options: chipOptions } })} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows dropdown with checkboxes when editing', () => {
    render(<ChipSelectCell {...makeProps({ isEditing: true, value: ['red'], column: { options: chipOptions } })} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(chipOptions.length);
  });

  it('shows checked state for already selected options', () => {
    render(<ChipSelectCell {...makeProps({ isEditing: true, value: ['green'], column: { options: chipOptions } })} />);
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[1]).toBeChecked(); // green is index 1
    expect(checkboxes[0]).not.toBeChecked();
  });

  it('shows "No options" when options are empty', () => {
    render(<ChipSelectCell {...makeProps({ isEditing: true, value: [], column: { options: [] } })} />);
    expect(screen.getByText('No options')).toBeInTheDocument();
  });

  it('toggles option on checkbox click', () => {
    render(<ChipSelectCell {...makeProps({ isEditing: true, value: ['red'], column: { options: chipOptions } })} />);
    const checkboxes = screen.getAllByRole('checkbox');
    // Toggle green on
    fireEvent.click(checkboxes[1]!);
    expect(checkboxes[1]).toBeChecked();
  });

  it('calls onCommit on Enter key with current selection', () => {
    const onCommit = vi.fn();
    render(<ChipSelectCell {...makeProps({ isEditing: true, value: ['red'], column: { options: chipOptions }, onCommit })} />);
    fireEvent.keyDown(screen.getByRole('dialog').parentElement!, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith(expect.arrayContaining(['red']));
  });

  it('calls onCancel on Escape key', () => {
    const onCancel = vi.fn();
    render(<ChipSelectCell {...makeProps({ isEditing: true, value: [], column: { options: chipOptions }, onCancel })} />);
    fireEvent.keyDown(screen.getByRole('dialog').parentElement!, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });

  it('parses JSON array string as value', () => {
    render(<ChipSelectCell {...makeProps({ value: '["red","blue"]', column: { options: chipOptions } })} />);
    expect(screen.getByText('Red')).toBeInTheDocument();
    expect(screen.getByText('Blue')).toBeInTheDocument();
  });
});
