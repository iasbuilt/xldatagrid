import { vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import { ListCell } from '../ListCell';
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
// ListCell fixtures
// ---------------------------------------------------------------------------

const listOptions = [
  { value: 'a', label: 'Option A' },
  { value: 'b', label: 'Option B' },
  { value: 'c', label: 'Option C' },
];

// ---------------------------------------------------------------------------
// ListCell
// ---------------------------------------------------------------------------

describe('ListCell', () => {
  it('renders the selected option label in display mode', () => {
    render(<ListCell {...makeProps({ value: 'b', column: { options: listOptions } })} />);
    expect(screen.getByText('Option B')).toBeInTheDocument();
  });

  it('renders placeholder when value is null', () => {
    render(<ListCell {...makeProps({ value: null, column: { options: listOptions, placeholder: 'Select...' } })} />);
    expect(screen.getByText('Select...')).toBeInTheDocument();
  });

  it('does not show dropdown when not editing', () => {
    render(<ListCell {...makeProps({ value: 'a', column: { options: listOptions } })} />);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('shows dropdown when isEditing is true', () => {
    render(<ListCell {...makeProps({ isEditing: true, value: 'a', column: { options: listOptions } })} />);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('renders all options in dropdown', () => {
    render(<ListCell {...makeProps({ isEditing: true, column: { options: listOptions } })} />);
    expect(screen.getByText('Option A')).toBeInTheDocument();
    expect(screen.getByText('Option B')).toBeInTheDocument();
    expect(screen.getByText('Option C')).toBeInTheDocument();
  });

  it('shows "No options" when options array is empty', () => {
    render(<ListCell {...makeProps({ isEditing: true, column: { options: [] } })} />);
    expect(screen.getByText('No options')).toBeInTheDocument();
  });

  it('updates draft when option is clicked without committing', () => {
    const onCommit = vi.fn();
    render(<ListCell {...makeProps({ isEditing: true, column: { options: listOptions }, onCommit })} />);
    fireEvent.click(screen.getByText('Option B'));
    // Click updates draft but does NOT call onCommit (cell stays in edit mode)
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('navigates options with ArrowDown key', () => {
    render(<ListCell {...makeProps({ isEditing: true, value: 'a', column: { options: listOptions } })} />);
    const container = screen.getByRole('listbox').parentElement!;
    fireEvent.keyDown(container, { key: 'ArrowDown' });
    const options = screen.getAllByRole('option');
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
  });

  it('navigates options with ArrowUp key', () => {
    render(<ListCell {...makeProps({ isEditing: true, value: 'c', column: { options: listOptions } })} />);
    const container = screen.getByRole('listbox').parentElement!;
    fireEvent.keyDown(container, { key: 'ArrowUp' });
    const options = screen.getAllByRole('option');
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
  });

  it('updates draft on Enter and closes dropdown without committing', () => {
    const onCommit = vi.fn();
    render(<ListCell {...makeProps({ isEditing: true, value: 'a', column: { options: listOptions }, onCommit })} />);
    const container = screen.getByRole('listbox').parentElement!;
    fireEvent.keyDown(container, { key: 'Enter' });
    // Enter updates draft and closes dropdown but does NOT commit (cell stays in edit mode)
    expect(onCommit).not.toHaveBeenCalled();
    // Dropdown should be closed
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('calls onCancel on Escape key', () => {
    const onCancel = vi.fn();
    render(<ListCell {...makeProps({ isEditing: true, column: { options: listOptions }, onCancel })} />);
    const container = screen.getByRole('listbox').parentElement!;
    fireEvent.keyDown(container, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });
});
