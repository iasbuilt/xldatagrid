import { vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import { CompoundChipListCell } from '../CompoundChipListCell';
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
// CompoundChipListCell fixtures
// ---------------------------------------------------------------------------

const chipItems = [
  { id: 'i1', label: 'First' },
  { id: 'i2', label: 'Second' },
];

// ---------------------------------------------------------------------------
// CompoundChipListCell
// ---------------------------------------------------------------------------

describe('CompoundChipListCell', () => {
  it('renders chip labels in display mode', () => {
    render(<CompoundChipListCell {...makeProps({ value: chipItems })} />);
    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
  });

  it('renders placeholder when value is empty array', () => {
    render(<CompoundChipListCell {...makeProps({ value: [], column: { placeholder: 'No items' } })} />);
    expect(screen.getByText('No items')).toBeInTheDocument();
  });

  it('renders placeholder when value is null', () => {
    render(<CompoundChipListCell {...makeProps({ value: null })} />);
    expect(screen.getByText(/no items/i)).toBeInTheDocument();
  });

  it('shows edit controls when isEditing is true', () => {
    render(<CompoundChipListCell {...makeProps({ isEditing: true, value: chipItems })} />);
    expect(screen.getByRole('button', { name: /add item/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /done/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('renders remove buttons for each chip in edit mode', () => {
    render(<CompoundChipListCell {...makeProps({ isEditing: true, value: chipItems })} />);
    expect(screen.getAllByRole('button', { name: /remove/i })).toHaveLength(chipItems.length);
  });

  it('adds a new chip when + Add is clicked', () => {
    render(<CompoundChipListCell {...makeProps({ isEditing: true, value: chipItems })} />);
    fireEvent.click(screen.getByRole('button', { name: /add item/i }));
    expect(screen.getByDisplayValue('New item')).toBeInTheDocument();
  });

  it('removes a chip when delete button is clicked', () => {
    render(<CompoundChipListCell {...makeProps({ isEditing: true, value: chipItems })} />);
    const removeButtons = screen.getAllByRole('button', { name: /remove/i });
    fireEvent.click(removeButtons[0]!);
    expect(screen.queryByText('First')).not.toBeInTheDocument();
  });

  it('calls onCommit with remaining chips when Done is clicked', () => {
    const onCommit = vi.fn();
    render(<CompoundChipListCell {...makeProps({ isEditing: true, value: chipItems, onCommit })} />);
    fireEvent.click(screen.getByRole('button', { name: /done/i }));
    expect(onCommit).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ label: 'First' }),
    ]));
  });

  it('calls onCancel when Cancel button is clicked', () => {
    const onCancel = vi.fn();
    render(<CompoundChipListCell {...makeProps({ isEditing: true, value: chipItems, onCancel })} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('calls onCancel on Escape key', () => {
    const onCancel = vi.fn();
    const { container } = render(
      <CompoundChipListCell {...makeProps({ isEditing: true, value: chipItems, onCancel })} />
    );
    fireEvent.keyDown(container.firstChild as Element, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });

  it('enters label edit mode when chip is clicked in edit mode', () => {
    render(<CompoundChipListCell {...makeProps({ isEditing: true, value: chipItems })} />);
    fireEvent.click(screen.getByText('First'));
    expect(screen.getByDisplayValue('First')).toBeInTheDocument();
  });

  it('commits chip label edit on Enter key', () => {
    render(<CompoundChipListCell {...makeProps({ isEditing: true, value: chipItems })} />);
    fireEvent.click(screen.getByText('First'));
    const input = screen.getByDisplayValue('First');
    fireEvent.change(input, { target: { value: 'Updated' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText('Updated')).toBeInTheDocument();
  });
});
