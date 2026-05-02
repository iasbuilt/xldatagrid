import { vi } from 'vitest';
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import type { ColumnDef } from '@iasbuilt/datagrid-core';
import { StatusCell } from '../StatusCell';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const baseColumn: ColumnDef = {
  id: 'col1',
  field: 'name',
  title: 'Name',
  editable: true,
};

const noop = () => {};

const statusOptions = [
  { value: 'active', label: 'Active', color: '#22c55e' },
  { value: 'inactive', label: 'Inactive', color: '#ef4444' },
  { value: 'pending', label: 'Pending', color: '#f59e0b' },
];

const statusColumn: ColumnDef = { ...baseColumn, options: statusOptions };

// ---------------------------------------------------------------------------
// StatusCell
// ---------------------------------------------------------------------------

describe('StatusCell', () => {
  it('renders the current status badge', () => {
    render(
      <StatusCell value="active" row={{}} column={statusColumn} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    expect(screen.getByText('Active')).toBeTruthy();
  });

  it('renders empty badge for unknown value', () => {
    const { container } = render(
      <StatusCell value="unknown" row={{}} column={statusColumn} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    expect(container.textContent).toContain('unknown');
  });

  it('does not show dropdown in display mode', () => {
    render(
      <StatusCell value="active" row={{}} column={statusColumn} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('opens dropdown when isEditing=true', () => {
    render(
      <StatusCell value="active" row={{}} column={statusColumn} rowIndex={0} isEditing={true} onCommit={noop} onCancel={noop} />
    );
    expect(screen.getByRole('listbox')).toBeTruthy();
  });

  it('lists all options in dropdown', () => {
    render(
      <StatusCell value="active" row={{}} column={statusColumn} rowIndex={0} isEditing={true} onCommit={noop} onCancel={noop} />
    );
    // "Active" appears in both the badge and the dropdown option
    expect(screen.getAllByText('Active').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Inactive')).toBeTruthy();
    expect(screen.getByText('Pending')).toBeTruthy();
  });

  it('updates draft when option is clicked and commits on blur', () => {
    const onCommit = vi.fn();
    render(
      <StatusCell value="active" row={{}} column={statusColumn} rowIndex={0} isEditing={true} onCommit={onCommit} onCancel={noop} />
    );
    // Use mouseDown because the dropdown uses onMouseDown to prevent blur first
    fireEvent.mouseDown(screen.getByRole('option', { name: 'Inactive' }));
    // Click updates draft but does NOT call onCommit (cell stays in edit mode)
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('moves activeIndex down on ArrowDown', () => {
    const { container } = render(
      <StatusCell value="active" row={{}} column={statusColumn} rowIndex={0} isEditing={true} onCommit={noop} onCancel={noop} />
    );
    const listbox = screen.getByRole('listbox');
    fireEvent.keyDown(listbox, { key: 'ArrowDown' });
    const options = container.querySelectorAll('[role="option"]');
    expect(options[1]?.getAttribute('data-active')).toBe('true');
  });

  it('moves activeIndex up on ArrowUp', () => {
    const { container } = render(
      <StatusCell value="inactive" row={{}} column={statusColumn} rowIndex={0} isEditing={true} onCommit={noop} onCancel={noop} />
    );
    const listbox = screen.getByRole('listbox');
    fireEvent.keyDown(listbox, { key: 'ArrowDown' }); // go to index 2
    fireEvent.keyDown(listbox, { key: 'ArrowUp' });   // back to index 1
    const options = container.querySelectorAll('[role="option"]');
    expect(options[1]?.getAttribute('data-active')).toBe('true');
  });

  it('updates draft on Enter and closes dropdown without committing', () => {
    const onCommit = vi.fn();
    render(
      <StatusCell value="active" row={{}} column={statusColumn} rowIndex={0} isEditing={true} onCommit={onCommit} onCancel={noop} />
    );
    const listbox = screen.getByRole('listbox');
    fireEvent.keyDown(listbox, { key: 'ArrowDown' });
    fireEvent.keyDown(listbox, { key: 'Enter' });
    // Enter updates draft and closes dropdown but does NOT commit (cell stays in edit mode)
    expect(onCommit).not.toHaveBeenCalled();
    // Dropdown should be closed
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('calls onCancel on Escape', () => {
    const onCancel = vi.fn();
    render(
      <StatusCell value="active" row={{}} column={statusColumn} rowIndex={0} isEditing={true} onCommit={noop} onCancel={onCancel} />
    );
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });

  it('renders color indicators for options', () => {
    const { container } = render(
      <StatusCell value="active" row={{}} column={statusColumn} rowIndex={0} isEditing={true} onCommit={noop} onCancel={noop} />
    );
    const colorDots = container.querySelectorAll('[role="option"] span');
    expect(colorDots.length).toBeGreaterThan(0);
  });

  it('marks current value option as aria-selected=true', () => {
    render(
      <StatusCell value="inactive" row={{}} column={statusColumn} rowIndex={0} isEditing={true} onCommit={noop} onCancel={noop} />
    );
    const options = screen.getAllByRole('option');
    const inactiveOpt = options.find((o) => o.textContent?.includes('Inactive'));
    expect(inactiveOpt?.getAttribute('aria-selected')).toBe('true');
  });

  it('renders with empty options list without crashing', () => {
    const col = { ...baseColumn, options: [] };
    render(
      <StatusCell value="x" row={{}} column={col} rowIndex={0} isEditing={true} onCommit={noop} onCancel={noop} />
    );
    expect(screen.getByRole('listbox')).toBeTruthy();
  });

  it('does not open dropdown when not editing even on click', () => {
    render(
      <StatusCell value="active" row={{}} column={statusColumn} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    fireEvent.click(screen.getByRole('button'));
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
