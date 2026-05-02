import { vi } from 'vitest';
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import type { ColumnDef } from '@iasbuilt/datagrid-core';
import { CheckboxCell } from '../CheckboxCell';

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

// ---------------------------------------------------------------------------
// CheckboxCell
// ---------------------------------------------------------------------------

describe('CheckboxCell', () => {
  it('renders checked when value is true', () => {
    const { container } = render(
      <CheckboxCell value={true} row={{}} column={baseColumn} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    expect((container.querySelector('input') as HTMLInputElement).checked).toBe(true);
  });

  it('renders unchecked when value is false', () => {
    const { container } = render(
      <CheckboxCell value={false} row={{}} column={baseColumn} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    expect((container.querySelector('input') as HTMLInputElement).checked).toBe(false);
  });

  it('is indeterminate when value is null', () => {
    const { container } = render(
      <CheckboxCell value={null} row={{}} column={baseColumn} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    const input = container.querySelector('input') as HTMLInputElement;
    expect(input.indeterminate).toBe(true);
  });

  it('has aria-checked="mixed" when value is null', () => {
    const { container } = render(
      <CheckboxCell value={null} row={{}} column={baseColumn} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    expect(container.querySelector('input')?.getAttribute('aria-checked')).toBe('mixed');
  });

  it('calls onCommit with !value when toggled (true -> false)', () => {
    const onCommit = vi.fn();
    const { container } = render(
      <CheckboxCell value={true} row={{}} column={baseColumn} rowIndex={0} isEditing={false} onCommit={onCommit} onCancel={noop} />
    );
    fireEvent.click(container.querySelector('input')!);
    expect(onCommit).toHaveBeenCalledWith(false);
  });

  it('calls onCommit with true when toggled from false', () => {
    const onCommit = vi.fn();
    const { container } = render(
      <CheckboxCell value={false} row={{}} column={baseColumn} rowIndex={0} isEditing={false} onCommit={onCommit} onCancel={noop} />
    );
    fireEvent.click(container.querySelector('input')!);
    expect(onCommit).toHaveBeenCalledWith(true);
  });

  it('is disabled when column.editable is false', () => {
    const col = { ...baseColumn, editable: false };
    const { container } = render(
      <CheckboxCell value={false} row={{}} column={col} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    expect((container.querySelector('input') as HTMLInputElement).disabled).toBe(true);
  });

  it('does not call onCommit when disabled', () => {
    const onCommit = vi.fn();
    const col = { ...baseColumn, editable: false };
    const { container } = render(
      <CheckboxCell value={false} row={{}} column={col} rowIndex={0} isEditing={false} onCommit={onCommit} onCancel={noop} />
    );
    fireEvent.click(container.querySelector('input')!);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('has aria-checked="true" when checked', () => {
    const { container } = render(
      <CheckboxCell value={true} row={{}} column={baseColumn} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    expect(container.querySelector('input')?.getAttribute('aria-checked')).toBe('true');
  });

  it('has aria-checked="false" when unchecked', () => {
    const { container } = render(
      <CheckboxCell value={false} row={{}} column={baseColumn} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    expect(container.querySelector('input')?.getAttribute('aria-checked')).toBe('false');
  });

  it('renders a checkbox input element', () => {
    const { container } = render(
      <CheckboxCell value={false} row={{}} column={baseColumn} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    expect(container.querySelector('input[type="checkbox"]')).toBeTruthy();
  });

  it('handles undefined value as unchecked', () => {
    const { container } = render(
      <CheckboxCell value={undefined} row={{}} column={baseColumn} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    expect((container.querySelector('input') as HTMLInputElement).checked).toBe(false);
  });

  it('toggling from null calls onCommit with true (boolean cast)', () => {
    const onCommit = vi.fn();
    const { container } = render(
      <CheckboxCell value={null} row={{}} column={baseColumn} rowIndex={0} isEditing={false} onCommit={onCommit} onCancel={noop} />
    );
    fireEvent.click(container.querySelector('input')!);
    expect(onCommit).toHaveBeenCalledWith(true);
  });

  it('is enabled (not disabled) when column.editable is true', () => {
    const { container } = render(
      <CheckboxCell value={false} row={{}} column={baseColumn} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    expect((container.querySelector('input') as HTMLInputElement).disabled).toBe(false);
  });

  it('has correct cursor style when editable', () => {
    const { container } = render(
      <CheckboxCell value={false} row={{}} column={baseColumn} rowIndex={0} isEditing={false} onCommit={noop} onCancel={noop} />
    );
    expect((container.querySelector('input') as HTMLInputElement).style.cursor).toBe('pointer');
  });
});
